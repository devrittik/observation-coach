import test from 'node:test';
import assert from 'node:assert/strict';
import { debug, error, errorInfo, info, redact, warn } from '../lib/log';
import { formatAccessLine, httpLogEnabled } from '../lib/server/http-log';

function capture(fn: () => void) {
  const out: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return out.join('');
}

test('logger respects LOG_LEVEL and tags lines with level and source', () => {
  const before = process.env.LOG_LEVEL;
  try {
    process.env.LOG_LEVEL = 'info';
    let output = capture(() => {
      debug('db', 'hidden detail');
      info('db', 'connected', { database: 'coach' });
    });
    assert.ok(!output.includes('hidden detail'));
    assert.match(output, / INFO {2}\[db\] connected .*"database":"coach"/);
    assert.match(output.split('\n')[0], /^\d{4}-\d{2}-\d{2}T/);

    process.env.LOG_LEVEL = 'error';
    output = capture(() => {
      info('api', 'nope');
      warn('api', 'careful');
      error('api', 'boom');
    });
    assert.ok(!output.includes('nope'));
    assert.ok(!output.includes('careful'));
    assert.match(output, / ERROR \[api\] boom/);

    process.env.LOG_LEVEL = 'silent';
    assert.equal(
      capture(() => error('api', 'muted')),
      '',
    );
  } finally {
    if (before === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = before;
  }
});

test('redaction hides secret-bearing fields at any depth', () => {
  const safe = redact({
    userId: 'u-1',
    password: 'hunter2',
    nested: { tokenHash: 'abc', apiKey: 'k', uri: 'mongodb://user:pass@host', email: 'a@b.c' },
    list: [{ secret: 's' }, { level: 3 }],
  }) as Record<string, unknown>;
  assert.equal(safe.userId, 'u-1');
  assert.equal(safe.password, '[redacted]');
  const nested = safe.nested as Record<string, unknown>;
  assert.equal(nested.tokenHash, '[redacted]');
  assert.equal(nested.apiKey, '[redacted]');
  assert.equal(nested.uri, '[redacted]');
  assert.equal(nested.email, '[redacted]');
  const list = safe.list as Record<string, unknown>[];
  assert.equal(list[0].secret, '[redacted]');
  assert.equal(list[1].level, 3);
});

test('errorInfo keeps only curated messages and primitive codes', () => {
  class DatabaseSetupError extends Error {}
  class MongoServerError extends Error {}
  const curated = new DatabaseSetupError('Start the supplied Docker Compose service.');
  assert.deepEqual(errorInfo(curated), {
    error: 'DatabaseSetupError',
    message: 'Start the supplied Docker Compose service.',
  });
  const driver = new MongoServerError('connect ECONNREFUSED mongodb://user:pass@db');
  (driver as { code?: number }).code = 11000;
  assert.deepEqual(errorInfo(driver), { error: 'MongoServerError', code: 11000 });
  assert.deepEqual(errorInfo('plain failure'), { failure: 'non-error', type: 'string' });
});

test('access logging is on for hosted and off for local, overridable by LOG_HTTP', () => {
  const had = { APP_ENV: process.env.APP_ENV, LOG_HTTP: process.env.LOG_HTTP };
  const set = (key: 'APP_ENV' | 'LOG_HTTP', value?: string) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    set('APP_ENV', 'hosted');
    set('LOG_HTTP', undefined);
    assert.equal(httpLogEnabled(), true);
    set('APP_ENV', 'local');
    assert.equal(httpLogEnabled(), false);
    set('LOG_HTTP', 'true');
    assert.equal(httpLogEnabled(), true);
    set('APP_ENV', 'hosted');
    set('LOG_HTTP', 'false');
    assert.equal(httpLogEnabled(), false);
  } finally {
    set('APP_ENV', had.APP_ENV);
    set('LOG_HTTP', had.LOG_HTTP);
  }
});

test('access lines use the morgan combined format with safe dashes for missing facts', () => {
  const line = formatAccessLine({
    method: 'GET',
    url: '/home?tour=1',
    status: 200,
    ip: '203.0.113.9',
    userAgent: 'AgentX/1.0',
    referer: 'https://example.org/start',
    contentLength: 1234,
  });
  assert.match(
    line,
    /^203\.0\.113\.9 - - \[\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4}\] "GET \/home\?tour=1 HTTP\/1\.1" 200 1234 "https:\/\/example\.org\/start" "AgentX\/1\.0"$/,
  );
  const bare = formatAccessLine({ method: 'POST', url: '/api/auth/login', status: 401 });
  assert.match(bare, /^- - - \[.*\] "POST \/api\/auth\/login HTTP\/1\.1" 401 - "-" "-"$/);
});
