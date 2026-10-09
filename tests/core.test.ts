import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { hashPassword, verifyPassword } from '../lib/auth';
import {
  emptyScores,
  emptyProgress,
  updateScores,
  levelFor,
  chooseExercise,
} from '../lib/observation/progression';
import { llmService, providerConfig } from '../lib/llm/provider';
import { exercises, sampleObservation } from '../lib/data/exercises';
import { feedbackSchema } from '../lib/llm/schemas';

test('scrypt uses salts and verifies passwords without accepting wrong input', async () => {
  const first = await hashPassword('a private password');
  const second = await hashPassword('a private password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a private password', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword('anything', 'malformed'), false);
});
test('skill gains are bounded and levels advance gradually', () => {
  let s = emptyScores();
  assert.equal(levelFor(s), 1);
  s = updateScores(s, {
    attention: 5,
    description: 3,
    comparison: 0,
    change: 0,
    inference: 0,
    curiosity: 2,
  });
  assert.equal(s.attention, 10);
  assert.equal(s.description, 6);
  assert.equal(s.comparison, 0);
  for (let i = 0; i < 20; i++)
    s = updateScores(s, {
      attention: 5,
      description: 5,
      comparison: 5,
      change: 5,
      inference: 5,
      curiosity: 5,
    });
  assert.equal(s.attention, 100);
  assert.equal(levelFor(s), 6);
});
test('deterministic exercise selection avoids recent repetition and respects levels', () => {
  const p = emptyProgress();
  const first = chooseExercise(p);
  assert.equal(first.id, 'overlooked');
  const second = chooseExercise(p, [first.id]);
  assert.notEqual(first.id, second.id);
  assert.ok(second.level <= p.level + 1);
  assert.equal(chooseExercise(p, [], 'description').skill, 'description');
});
test('demo coaching uses direct text evidence and exactly one question', async () => {
  const result = await llmService.analyzeObservation('demo', sampleObservation, exercises[0]);
  assert.ok(feedbackSchema.safeParse(result).success);
  assert.equal(result.scores.comparison, 3);
  assert.equal(result.scores.change, 0);
  for (const quote of Object.values(result.evidence)) assert.ok(sampleObservation.includes(quote!));
  assert.equal((llmService.generateFollowUp(result).match(/\?/g) || []).length, 1);
  const short = await llmService.analyzeObservation('demo', 'hi', exercises[0]);
  assert.equal(short.scores.attention, 0);
});
test('missing local or hosted configuration fails clearly rather than using a fallback', async () => {
  const old = { ...process.env };
  delete process.env.LOCAL_LLM_BASE_URL;
  delete process.env.LOCAL_LLM_MODEL;
  delete process.env.HOSTED_LLM_API_KEY;
  process.env.LLM_PROVIDER = 'hosted';
  assert.equal(providerConfig().configured, false);
  await assert.rejects(
    () => llmService.analyzeObservation('local', 'A green leaf', exercises[0]),
    /needs setup/,
  );
  await assert.rejects(
    () => llmService.analyzeObservation('hosted', 'A green leaf', exercises[0]),
    /needs setup/,
  );
  Object.assign(process.env, old);
});
test('local and hosted adapters use compatible requests, validate responses, and strip unsupported evidence', async () => {
  const original = { ...process.env };
  let payload: any;
  let authorization = '';
  let mode = 'feedback';
  const response = {
    reflection: 'You described a texture.',
    question: 'What made it stand out?',
    evidence: { attention: 'I noticed', description: 'rough bark', comparison: 'invented quote' },
    scores: { attention: 2, description: 3, comparison: 5, change: 0, inference: 0, curiosity: 0 },
    nextFocus: 'comparison',
  };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      payload = JSON.parse(raw);
      authorization = req.headers.authorization || '';
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'http-error') {
        res.statusCode = 500;
        res.end('{}');
        return;
      }
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  mode === 'malformed'
                    ? 'not json'
                    : JSON.stringify(mode === 'exercise' ? exercises[4] : response),
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/v1`;
  try {
    process.env.LOCAL_LLM_BASE_URL = base;
    process.env.LOCAL_LLM_MODEL = 'test-local';
    process.env.HOSTED_LLM_BASE_URL = base;
    process.env.HOSTED_LLM_MODEL = 'test-hosted';
    process.env.HOSTED_LLM_API_KEY = 'not-a-real-secret';
    const result = await llmService.analyzeObservation(
      'local',
      'I noticed rough bark',
      exercises[0],
    );
    assert.equal(payload.model, 'test-local');
    assert.equal(result.scores.comparison, 0);
    assert.equal(result.evidence.comparison, undefined);
    assert.equal(result.scores.description, 3);
    await llmService.analyzeObservation('hosted', 'I noticed rough bark', exercises[0]);
    assert.equal(authorization, 'Bearer not-a-real-secret');
    assert.equal(payload.model, 'test-hosted');
    mode = 'exercise';
    const next = await llmService.generateNextExercise(
      'hosted',
      { ...emptyProgress(), level: 2 },
      [],
      result,
      'I noticed rough bark',
      'It was darker nearby',
    );
    assert.equal(next.id, 'similar');
    assert.ok(payload.messages[1].content.includes('It was darker nearby'));
    mode = 'malformed';
    await assert.rejects(
      () => llmService.analyzeObservation('local', 'anything', exercises[0]),
      /valid response/,
    );
    mode = 'http-error';
    await assert.rejects(
      () => llmService.analyzeObservation('hosted', 'anything', exercises[0]),
      /error \(500\)/,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test('hosted MongoDB fails clearly without a URI and never falls back locally', async () => {
  const { databaseConfig } = await import('../lib/db/config');
  const original = { ...process.env };
  try {
    process.env.APP_ENV = 'hosted';
    delete process.env.MONGODB_URI;
    assert.throws(() => databaseConfig(), /Atlas connection string/);
    process.env.APP_ENV = 'local';
    assert.match(databaseConfig().uri, /^mongodb:\/\/127\.0\.0\.1:27017/);
    process.env.MONGODB_URI = 'not-a-mongodb-uri';
    assert.throws(() => databaseConfig(), /connection string/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});
