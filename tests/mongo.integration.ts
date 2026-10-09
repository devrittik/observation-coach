import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  createUser,
  findUserByEmail,
  findUserByToken,
  saveLogin,
  deleteLogin,
  deleteAccount,
  db,
  closeDatabase,
  getProgress,
  getSession,
  getSessions,
  createOrResumeSession,
  patchSession,
  saveFeedback,
  completeSession,
  rateLimit,
  MissingUserError,
  DatabaseUnavailableError,
  isDuplicateKey,
} from '../lib/db';
import { exercises, sampleObservation } from '../lib/data/exercises';
import { llmService } from '../lib/llm/provider';
import type { ObservationSession } from '../lib/types';

let mongo: MongoMemoryReplSet;
let directory: string;
const original = { ...process.env };
const alice = randomUUID(),
  bob = randomUUID();
const makeUser = (id: string, expiresAt?: Date) => ({
  _id: id,
  name: id,
  email: `${id}@example.test`,
  password: 'already-hashed-test-placeholder',
  isDemo: !!expiresAt,
  createdAt: new Date(),
  ...(expiresAt ? { expiresAt } : {}),
});
const makeSession = (): ObservationSession => ({
  id: randomUUID(),
  duration: 5,
  status: 'exercise',
  exercise: exercises[0],
  observation: null,
  feedback: null,
  followup: null,
  nextExercise: null,
  provider: 'demo',
  startedAt: new Date().toISOString(),
  outsideAt: null,
  completedAt: null,
});
before(
  async () => {
    directory = await mkdtemp(join(tmpdir(), 'coach-mongo-test-'));
    mongo = await MongoMemoryReplSet.create({
      instanceOpts: [{ dbPath: directory }],
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    process.env.APP_ENV = 'local';
    process.env.MONGODB_URI = mongo.getUri();
    process.env.MONGODB_DB_NAME = 'coach_integration';
    await createUser(makeUser(alice));
    await createUser(makeUser(bob));
  },
  { timeout: 180000 },
);
after(async () => {
  await closeDatabase();
  if (mongo) await mongo.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

test('Mongo indexes enforce unique email, active session ownership, and TTL expiration', async () => {
  await assert.rejects(
    () => createUser({ ...makeUser(randomUUID()), email: `${alice}@example.test` }),
    isDuplicateKey,
  );
  const d = await db();
  assert.ok(
    (await d.collection('observations').indexes()).some(
      (i) => i.name === 'one_active_session_per_user' && i.unique,
    ),
  );
  for (const collection of ['users', 'auth_sessions', 'observations', 'progress', 'rate_limits']) {
    assert.ok((await d.collection(collection).indexes()).some((i) => i.expireAfterSeconds === 0));
  }
});
test('authentication tokens rotate, revoke, and deny expired demo users before TTL cleanup', async () => {
  await saveLogin(alice, 'first-token-hash', new Date(Date.now() + 60000));
  assert.equal((await findUserByToken('first-token-hash'))?.id, alice);
  await saveLogin(alice, 'second-token-hash', new Date(Date.now() + 60000), 'first-token-hash');
  assert.equal(await findUserByToken('first-token-hash'), null);
  await deleteLogin('second-token-hash');
  assert.equal(await findUserByToken('second-token-hash'), null);
  const expired = randomUUID();
  await createUser(makeUser(expired, new Date(Date.now() - 1000)));
  await assert.rejects(
    () => saveLogin(expired, 'expired', new Date(Date.now() + 60000)),
    MissingUserError,
  );
});
test('concurrent creates resume one session, cross-user queries and writes stay isolated', async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () => createOrResumeSession(alice, makeSession())),
  );
  assert.equal(new Set(results.map((s) => s.id)).size, 1);
  const id = results[0].id;
  assert.equal(await getSession(bob, id), null);
  assert.equal(await patchSession(bob, id, 'exercise', { status: 'outside' }), null);
  assert.equal((await getSession(alice, id))?.status, 'exercise');
  assert.equal((await getSessions(alice)).length, 1);
  assert.equal((await getSessions(bob)).length, 0);
});
test('atomic completion awards progress exactly once under concurrent duplicate calls', async () => {
  const s = (await getSessions(alice))[0];
  await patchSession(alice, s.id, 'exercise', { status: 'outside' });
  await patchSession(alice, s.id, 'outside', { status: 'reflection' });
  const feedback = await llmService.analyzeObservation('demo', sampleObservation, s.exercise);
  await saveFeedback(alice, s.id, sampleObservation, feedback);
  await Promise.all(
    Array.from({ length: 4 }, () =>
      completeSession(alice, s.id, 'I noticed the shadow.', exercises[1]),
    ),
  );
  assert.equal((await getProgress(alice)).total, 1);
  assert.equal((await getProgress(alice)).scores.comparison, 6);
  assert.equal((await getProgress(bob)).total, 0);
  assert.equal((await getSession(alice, s.id))?.status, 'complete');
  await patchSession(alice, s.id, 'reflection', { observation: 'stale draft' });
  assert.equal((await getSession(alice, s.id))?.observation, sampleObservation);
});
test('atomic rate limiting remains bounded under concurrency and resets after expiry', async () => {
  const key = randomUUID();
  const allowed = await Promise.all(Array.from({ length: 12 }, () => rateLimit(key, 3, 60000)));
  assert.equal(allowed.filter(Boolean).length, 3);
  await (
    await db()
  )
    .collection('rate_limits')
    .updateOne({ _id: key as never }, { $set: { expiresAt: new Date(0) } });
  assert.equal(await rateLimit(key, 3, 60000), true);
});
test('a failed progress write rolls back observation completion atomically', async () => {
  const uid = randomUUID();
  await createUser(makeUser(uid));
  const session = await createOrResumeSession(uid, makeSession());
  await patchSession(uid, session.id, 'exercise', { status: 'outside' });
  await patchSession(uid, session.id, 'outside', { status: 'reflection' });
  const feedback = await llmService.analyzeObservation('demo', sampleObservation, session.exercise);
  await saveFeedback(uid, session.id, sampleObservation, feedback);
  const database = await db();
  await database.command({
    collMod: 'progress',
    validator: { 'data.total': { $lte: 0 } },
    validationLevel: 'strict',
  });
  try {
    await assert.rejects(() => completeSession(uid, session.id, 'A detail.', exercises[1]));
    assert.equal((await getSession(uid, session.id))?.status, 'feedback');
    assert.equal((await getProgress(uid)).total, 0);
  } finally {
    await database.command({ collMod: 'progress', validator: {} });
    await deleteAccount(uid);
  }
});
test('account deletion removes dependent records and serializes against new writes', async () => {
  const uid = randomUUID();
  await createUser(makeUser(uid));
  await saveLogin(uid, 'delete-token', new Date(Date.now() + 60000));
  const session = await createOrResumeSession(uid, makeSession());
  await patchSession(uid, session.id, 'exercise', { status: 'outside' });
  await patchSession(uid, session.id, 'outside', { status: 'reflection' });
  const feedback = await llmService.analyzeObservation('demo', sampleObservation, session.exercise);
  await saveFeedback(uid, session.id, sampleObservation, feedback);
  await completeSession(uid, session.id, 'I noticed the light.', exercises[1]);
  assert.equal((await getProgress(uid)).total, 1);
  await Promise.allSettled([deleteAccount(uid), createOrResumeSession(uid, makeSession())]);
  assert.equal(await findUserByEmail(`${uid}@example.test`), null);
  assert.equal(await findUserByToken('delete-token'), null);
  assert.deepEqual(await getSessions(uid), []);
  assert.equal((await getProgress(uid)).total, 0);
  await assert.rejects(() => createOrResumeSession(uid, makeSession()), MissingUserError);
});
test(
  'persisted users and progress survive MongoDB stop/start on the same disk',
  { timeout: 60000 },
  async () => {
    await closeDatabase();
    await mongo.stop({ doCleanup: false });
    await mongo.start();
    process.env.MONGODB_URI = mongo.getUri();
    assert.equal((await findUserByEmail(`${alice}@example.test`))?._id, alice);
    assert.equal((await getProgress(alice)).total, 1);
  },
);
test('connection failure is actionable and never falls back to another database', async () => {
  await closeDatabase();
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/?replicaSet=rs0&directConnection=true';
  await assert.rejects(db, DatabaseUnavailableError);
  process.env.MONGODB_URI = mongo.getUri();
  assert.equal((await getProgress(alice)).total, 1);
});
