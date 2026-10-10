import { MongoClient, MongoServerError, type ClientSession, type Db } from 'mongodb';
import type {
  User,
  Progress,
  ObservationSession,
  SessionStatus,
  Feedback,
  Exercise,
} from '@/lib/types';
import { emptyProgress, levelFor, updateScores } from '@/lib/observation/progression';
import { databaseConfig, DatabaseSetupError, DatabaseUnavailableError } from './config';
import { debug, info, warn, errorInfo } from '@/lib/log';
export { DatabaseSetupError, DatabaseUnavailableError } from './config';

export type UserDocument = {
  _id: string;
  name: string;
  email: string;
  password: string;
  isDemo: boolean;
  createdAt: Date;
  expiresAt?: Date;
  revision: number;
};
type AuthDocument = { _id: string; userId: string; expiresAt: Date };
type ObservationDocument = {
  _id: string;
  userId: string;
  active: boolean;
  data: ObservationSession;
  createdAt: Date;
  expiresAt?: Date;
};
type ProgressDocument = { _id: string; data: Progress; expiresAt?: Date };
type RateDocument = { _id: string; count: number; expiresAt: Date };
type Connection = { client: MongoClient; database: Db };
const globalDb = globalThis as unknown as {
  coachMongo?: { key: string; promise: Promise<Connection> };
};
export class MissingUserError extends Error {
  name = 'MissingUserError';
}
export const isDuplicateKey = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

async function initialize(): Promise<Connection> {
  const config = databaseConfig();
  const key = config.uri + '\n' + config.name;
  if (globalDb.coachMongo?.key === key) return globalDb.coachMongo.promise;
  if (globalDb.coachMongo)
    throw new DatabaseSetupError(
      'Database configuration changed. Restart the application to use the new connection.',
    );
  const promise = (async () => {
    let client: MongoClient | undefined;
    try {
      debug('db', 'connecting to MongoDB', {
        environment: config.environment,
        database: config.name,
        configSource: process.env.MONGODB_URI?.trim() ? 'MONGODB_URI' : 'default',
      });
      client = new MongoClient(config.uri, {
        maxPoolSize: 10,
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await client.connect();
      const database = client.db(config.name);
      const hello = await database.command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') {
        warn('db', 'MongoDB server is not a replica set');
        throw new DatabaseSetupError(
          'MongoDB must run as a replica set to keep account and progress updates atomic. No Docker needed: in your installed MongoDB, set replication.replSetName=rs0 (mongod.cfg), restart it, and run rs.initiate() once — scripts/mongodb-enable-replicaset and DATABASE.md walk through it. The Docker Compose service or MongoDB Atlas also work.',
        );
      }
      await Promise.all([
        database
          .collection<UserDocument>('users')
          .createIndex({ email: 1 }, { unique: true, name: 'unique_email' }),
        database
          .collection<UserDocument>('users')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database
          .collection<AuthDocument>('auth_sessions')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database.collection<AuthDocument>('auth_sessions').createIndex({ userId: 1 }),
        database
          .collection<ObservationDocument>('observations')
          .createIndex({ userId: 1, createdAt: -1 }),
        database.collection<ObservationDocument>('observations').createIndex(
          { userId: 1 },
          {
            unique: true,
            partialFilterExpression: { active: true },
            name: 'one_active_session_per_user',
          },
        ),
        database
          .collection<ObservationDocument>('observations')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database
          .collection<ProgressDocument>('progress')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database
          .collection<RateDocument>('rate_limits')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);
      debug('db', 'indexes ready', { environment: config.environment, database: config.name });
      info('db', 'connected to MongoDB', {
        environment: config.environment,
        database: config.name,
        poolSize: 10,
      });
      return { client, database };
    } catch (error) {
      await client?.close().catch(() => {});
      if (error instanceof DatabaseSetupError) {
        warn('db', 'database setup problem', errorInfo(error));
        throw error;
      }
      // Never expose driver messages: they may contain hostnames, credentials, or a URI.
      warn('db', 'MongoDB connection failed', errorInfo(error));
      throw new DatabaseUnavailableError(
        config.environment === 'local'
          ? 'Local MongoDB is unavailable. Start the persistent MongoDB replica set and check MONGODB_URI. Your existing data has not been reset.'
          : 'MongoDB Atlas is unavailable. Check the server connection string, database credentials, and Atlas network access settings. No local fallback was used.',
      );
    }
  })();
  globalDb.coachMongo = { key, promise };
  try {
    return await promise;
  } catch (error) {
    if (globalDb.coachMongo?.promise === promise) delete globalDb.coachMongo;
    throw error;
  }
}
export async function db(): Promise<Db> {
  return (await initialize()).database;
}
export async function closeDatabase() {
  debug('db', 'closing MongoDB connection');
  const cached = globalDb.coachMongo;
  delete globalDb.coachMongo;
  if (cached) await cached.promise.then((c) => c.client.close()).catch(() => {});
}
const alive = () => ({
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
});
export function publicUser(row: UserDocument): User {
  return { id: row._id, name: row.name, email: row.email, isDemo: row.isDemo };
}
export async function createUser(user: Omit<UserDocument, 'revision'>) {
  await (await db()).collection<UserDocument>('users').insertOne({ ...user, revision: 0 });
  debug('db', 'user created', { userId: user._id, demo: user.isDemo });
}
export async function findUserByEmail(email: string) {
  return (await db())
    .collection<UserDocument>('users')
    .findOne({ email, isDemo: false, ...alive() });
}
export async function findUserByToken(tokenHash: string): Promise<User | null> {
  const d = await db();
  const auth = await d
    .collection<AuthDocument>('auth_sessions')
    .findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } });
  if (!auth) return null;
  const user = await d.collection<UserDocument>('users').findOne({ _id: auth.userId, ...alive() });
  debug('db', 'session lookup', { userId: auth.userId, found: !!user });
  return user ? publicUser(user) : null;
}
/** Touch the owner in every write transaction, serializing mutations with account deletion. */
async function withUser<T>(
  uid: string,
  operation: (d: Db, session: ClientSession, user: UserDocument) => Promise<T>,
): Promise<T> {
  const { client, database } = await initialize();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const user = await database
          .collection<UserDocument>('users')
          .findOneAndUpdate(
            { _id: uid, ...alive() },
            { $inc: { revision: 1 } },
            { session, returnDocument: 'after' },
          );
        if (!user)
          throw new MissingUserError(
            'Your account is unavailable or has expired. Please log in again.',
          );
        return operation(database, session, user);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } finally {
    await session.endSession();
  }
}
export async function saveLogin(
  uid: string,
  tokenHash: string,
  expiresAt: Date,
  previousHash?: string,
) {
  return withUser(uid, async (d, session) => {
    if (previousHash)
      await d
        .collection<AuthDocument>('auth_sessions')
        .deleteOne({ _id: previousHash }, { session });
    await d
      .collection<AuthDocument>('auth_sessions')
      .insertOne({ _id: tokenHash, userId: uid, expiresAt }, { session });
    debug('db', 'login token stored', {
      userId: uid,
      rotated: !!previousHash,
      expiresAt: expiresAt.toISOString(),
    });
  });
}
export async function deleteLogin(hash: string) {
  await (await db()).collection<AuthDocument>('auth_sessions').deleteOne({ _id: hash });
  debug('db', 'login token revoked');
}
export async function deleteAccount(uid: string) {
  return withUser(uid, async (d, session) => {
    // Operations inside a MongoDB transaction must run sequentially.
    await d.collection<AuthDocument>('auth_sessions').deleteMany({ userId: uid }, { session });
    await d
      .collection<ObservationDocument>('observations')
      .deleteMany({ userId: uid }, { session });
    await d.collection<ProgressDocument>('progress').deleteOne({ _id: uid }, { session });
    await d
      .collection<RateDocument>('rate_limits')
      .deleteMany({ _id: { $in: [`session:${uid}`, `coach:${uid}`] } }, { session });
    await d.collection<UserDocument>('users').deleteOne({ _id: uid }, { session });
  }).then((result) => {
    info('db', 'account deleted', { userId: uid });
    return result;
  });
}
export async function getProgress(uid: string): Promise<Progress> {
  return (
    (await (await db()).collection<ProgressDocument>('progress').findOne({ _id: uid }))?.data ??
    emptyProgress()
  );
}
export async function getSessions(uid: string): Promise<ObservationSession[]> {
  const rows = await (
    await db()
  )
    .collection<ObservationDocument>('observations')
    .find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return rows.map((row) => row.data);
}
export async function getSession(uid: string, id: string): Promise<ObservationSession | null> {
  return (
    (
      await (
        await db()
      )
        .collection<ObservationDocument>('observations')
        .findOne({ _id: id, userId: uid })
    )?.data ?? null
  );
}
export async function createOrResumeSession(
  uid: string,
  data: ObservationSession,
): Promise<ObservationSession> {
  return withUser(uid, async (d, session, user) => {
    const collection = d.collection<ObservationDocument>('observations');
    const active = await collection.findOne({ userId: uid, active: true }, { session });
    if (active) {
      debug('db', 'active session resumed', { userId: uid, sessionId: active.data.id });
      return active.data;
    }
    await collection.insertOne(
      {
        _id: data.id,
        userId: uid,
        active: true,
        data,
        createdAt: new Date(data.startedAt),
        ...(user.expiresAt ? { expiresAt: user.expiresAt } : {}),
      },
      { session },
    );
    debug('db', 'session created', {
      userId: uid,
      sessionId: data.id,
      duration: data.duration,
      provider: data.provider,
    });
    return data;
  });
}
export async function patchSession(
  uid: string,
  id: string,
  expected: SessionStatus,
  patch: Partial<ObservationSession>,
): Promise<ObservationSession | null> {
  return withUser(uid, async (d, session) => {
    const collection = d.collection<ObservationDocument>('observations');
    const row = await collection.findOne({ _id: id, userId: uid }, { session });
    if (!row) {
      debug('db', 'session patch skipped: not found', { userId: uid, sessionId: id });
      return null;
    }
    if (row.data.status !== expected) {
      debug('db', 'session patch skipped: stage moved on', {
        userId: uid,
        sessionId: id,
        expected,
        status: row.data.status,
      });
      return row.data;
    }
    const data = { ...row.data, ...patch, id: row.data.id };
    await collection.updateOne(
      { _id: id, userId: uid },
      { $set: { data, active: data.status !== 'complete' } },
      { session },
    );
    debug('db', 'session updated', { userId: uid, sessionId: id, expected, status: data.status });
    return data;
  });
}
export async function saveFeedback(
  uid: string,
  id: string,
  observation: string,
  feedback: Feedback,
) {
  return patchSession(uid, id, 'reflection', { observation, feedback, status: 'feedback' });
}
export async function completeSession(
  uid: string,
  id: string,
  followup: string,
  nextExercise: Exercise,
) {
  return withUser(uid, async (d, session, user) => {
    const observations = d.collection<ObservationDocument>('observations');
    const row = await observations.findOne({ _id: id, userId: uid }, { session });
    if (!row) {
      debug('db', 'completion skipped: not found', { userId: uid, sessionId: id });
      return null;
    }
    if (row.data.status !== 'feedback' || !row.data.feedback) {
      debug('db', 'completion skipped: not awaiting completion', {
        userId: uid,
        sessionId: id,
        status: row.data.status,
      });
      return row.data;
    }
    const progressCollection = d.collection<ProgressDocument>('progress');
    const current =
      (await progressCollection.findOne({ _id: uid }, { session }))?.data ?? emptyProgress();
    const scores = updateScores(current.scores, row.data.feedback.scores);
    const updated = { scores, level: levelFor(scores), total: current.total + 1 };
    const data: ObservationSession = {
      ...row.data,
      followup,
      nextExercise,
      status: 'complete',
      completedAt: new Date().toISOString(),
      skillGains: Object.fromEntries(
        Object.entries(scores).map(([key, value]) => [
          key,
          value - current.scores[key as keyof typeof scores],
        ]),
      ) as typeof scores,
    };
    await observations.updateOne(
      { _id: id, userId: uid },
      { $set: { data, active: false } },
      { session },
    );
    await progressCollection.updateOne(
      { _id: uid },
      { $set: { data: updated, ...(user.expiresAt ? { expiresAt: user.expiresAt } : {}) } },
      { upsert: true, session },
    );
    debug('db', 'session completed with progress', {
      userId: uid,
      sessionId: id,
      total: updated.total,
      level: updated.level,
    });
    return data;
  });
}
export async function rateLimit(key: string, max = 20, windowMs = 600000): Promise<boolean> {
  const collection = (await db()).collection<RateDocument>('rate_limits');
  const now = new Date();
  const expired = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, now] };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await collection.findOneAndUpdate(
        { _id: key },
        [
          {
            $set: {
              count: { $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
              expiresAt: { $cond: [expired, new Date(now.getTime() + windowMs), '$expiresAt'] },
            },
          },
        ],
        { upsert: true, returnDocument: 'after' },
      );
      const allowed = !!row && row.count <= max;
      if (!allowed) debug('db', 'rate limit reached', { key });
      return allowed;
    } catch (error) {
      if (!isDuplicateKey(error) || attempt === 2) throw error;
      debug('db', 'rate limit upsert retried', { key });
    }
  }
  return false;
}
