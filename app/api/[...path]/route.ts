import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { currentUser, createLogin, hashPassword, verifyPassword, logout } from '@/lib/auth';
import {
  publicUser,
  rateLimit,
  getProgress,
  getSessions,
  getSession,
  createUser,
  findUserByEmail,
  deleteAccount,
  createOrResumeSession,
  patchSession,
  saveFeedback,
  completeSession,
  isDuplicateKey,
  DatabaseSetupError,
  DatabaseUnavailableError,
  MissingUserError,
} from '@/lib/db';
import { emptyProgress, levelFor, updateScores } from '@/lib/observation/progression';
import { llmService, providerConfig, CoachError } from '@/lib/llm/provider';
import { debug, info, warn, error as logError, errorInfo } from '@/lib/log';
import { logAccess } from '@/lib/server/http-log';
import type { ObservationSession } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
class HttpError extends Error {
  name = 'HttpError';
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Length': String(Buffer.byteLength(JSON.stringify(data))),
    },
  });
function ensureOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  const forwarded = req.headers.get('x-forwarded-host');
  if (!origin || ![host, forwarded].includes(new URL(origin).host))
    throw new HttpError('This request could not be verified. Refresh and try again.', 403);
}
async function body(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 16000) throw new HttpError('That request is too large.', 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError('Please send a valid request.');
  }
}
async function handleRequest(req: NextRequest, path: string) {
  try {
    if (req.method !== 'GET') ensureOrigin(req);
    if (path === 'bootstrap' && req.method === 'GET') {
      const user = await currentUser();
      return json({
        user,
        progress: user ? await getProgress(user.id) : emptyProgress(),
        sessions: user ? await getSessions(user.id) : [],
        ...providerConfig(),
      });
    }
    if (req.method === 'POST' && ['auth/register', 'auth/login', 'auth/demo'].includes(path)) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
      if (!(await rateLimit(`auth:${ip}`, 30)))
        throw new HttpError('Too many attempts. Please wait ten minutes before trying again.', 429);
      if (path === 'auth/demo') {
        const id = randomUUID();
        await createUser({
          _id: id,
          name: 'Explorer',
          email: `demo-${id}@local.invalid`,
          password: 'disabled',
          isDemo: true,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        });
        await createLogin(id, true);
        info('auth', 'demo account created', { userId: id });
        return json({ ok: true });
      }
      const input = z
        .object({
          name: z.string().trim().min(1).max(60).optional(),
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(10, 'Use at least 10 characters for your password.').max(128),
        })
        .parse(await body(req));
      const row = await findUserByEmail(input.email);
      if (path === 'auth/register') {
        if (!input.name) throw new HttpError('Please enter your name.');
        if (row)
          throw new HttpError(
            'An account could not be created with those details. Try logging in or use a different email.',
          );
        const id = randomUUID();
        const hashed = await hashPassword(input.password);
        try {
          await createUser({
            _id: id,
            name: input.name,
            email: input.email,
            password: hashed,
            isDemo: false,
            createdAt: new Date(),
          });
        } catch (error) {
          if (isDuplicateKey(error))
            throw new HttpError(
              'An account could not be created with those details. Try logging in or use a different email.',
            );
          throw error;
        }
        await createLogin(id);
        info('auth', 'account created', { userId: id });
        return json({ ok: true }, 201);
      }
      // Hash even for unknown accounts to reduce account enumeration via timing.
      const valid = await verifyPassword(
        input.password,
        row ? String(row.password) : '00000000000000000000000000000000:' + '0'.repeat(128),
      );
      if (!row || !valid) {
        debug('auth', 'login rejected');
        throw new HttpError('The email or password is not correct.', 401);
      }
      await createLogin(publicUser(row).id);
      debug('auth', 'login ok', { userId: publicUser(row).id });
      return json({ ok: true });
    }
    const user = await currentUser();
    if (!user) throw new HttpError('Please log in to continue.', 401);
    if (path === 'auth/logout' && req.method === 'POST') {
      await logout();
      return json({ ok: true });
    }
    if (path === 'account' && req.method === 'DELETE') {
      await deleteAccount(user.id);
      await logout();
      return json({ ok: true });
    }
    if (path === 'sessions' && req.method === 'POST') {
      if (!(await rateLimit(`session:${user.id}`, 30)))
        throw new HttpError('Please take a little time between sessions.', 429);
      const input = z
        .object({ duration: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)]) })
        .parse(await body(req));
      debug('api', 'session start requested', { userId: user.id, duration: input.duration });
      const active = (await getSessions(user.id)).find((s) => s.status !== 'complete');
      if (active) return json({ session: active });
      const provider = user.isDemo ? 'demo' : providerConfig().provider;
      const history = await getSessions(user.id);
      const previous = history.find((s) => s.nextExercise);
      const exercise =
        previous?.nextExercise ||
        (await llmService.generateObservationExercise(
          provider,
          await getProgress(user.id),
          history.map((s) => s.exercise.id),
          input.duration,
        ));
      const s: ObservationSession = {
        id: randomUUID(),
        duration: input.duration,
        status: 'exercise',
        exercise,
        observation: null,
        feedback: null,
        followup: null,
        nextExercise: null,
        provider,
        startedAt: new Date().toISOString(),
        outsideAt: null,
        completedAt: null,
      };
      const result = await createOrResumeSession(user.id, s);
      return json({ session: result }, 201);
    }
    const match = path.match(/^sessions\/([^/]+)(?:\/(outside|return|draft|reflect|complete))?$/);
    if (match) {
      const [, id, action] = match;
      const s = await getSession(user.id, id);
      if (!s) throw new HttpError('That observation session was not found.', 404);
      if (req.method === 'GET' && !action) return json({ session: s });
      if (req.method !== 'POST') throw new HttpError('Method not allowed.', 405);
      if (action === 'outside') {
        return json({
          session: await patchSession(user.id, id, 'exercise', {
            status: 'outside',
            outsideAt: new Date().toISOString(),
          }),
        });
      }
      if (action === 'return') {
        return json({
          session: await patchSession(user.id, id, 'outside', { status: 'reflection' }),
        });
      }
      if (action === 'draft') {
        const input = z.object({ observation: z.string().max(5000) }).parse(await body(req));
        const fresh = await patchSession(user.id, id, 'reflection', {
          observation: input.observation,
        });
        if (!fresh || fresh.status !== 'reflection')
          throw new HttpError('This reflection is no longer editable.', 409);
        return json({ ok: true });
      }
      if (action === 'reflect') {
        if (['feedback', 'complete'].includes(s.status)) return json({ session: s });
        if (s.status !== 'reflection')
          throw new HttpError('Return from your observation first.', 409);
        const { observation } = z
          .object({
            observation: z
              .string()
              .trim()
              .min(2, 'Write at least a few words about what you noticed.')
              .max(5000),
          })
          .parse(await body(req));
        if (!(await rateLimit(`coach:${user.id}`, 20)))
          throw new HttpError(
            'The coach has received too many requests. Try again in a few minutes.',
            429,
          );
        const saved = await patchSession(user.id, id, 'reflection', { observation });
        if (!saved) throw new HttpError('That observation session was not found.', 404);
        if (saved.status !== 'reflection') return json({ session: saved });
        debug('api', 'reflect submitted', {
          userId: user.id,
          sessionId: id,
          provider: s.provider,
          length: observation.length,
        });
        const feedback = await llmService.analyzeObservation(s.provider, observation, s.exercise);
        feedback.question = llmService.generateFollowUp(feedback);
        const result = await saveFeedback(user.id, id, observation, feedback);
        return json({ session: result });
      }
      if (action === 'complete') {
        if (s.status === 'complete') return json({ session: s });
        if (s.status !== 'feedback' || !s.feedback)
          throw new HttpError('Complete your reflection first.', 409);
        const { followup } = z
          .object({
            followup: z
              .string()
              .trim()
              .min(2, 'Add a short response to the coach’s question.')
              .max(2000),
          })
          .parse(await body(req));
        if (!(await rateLimit(`coach:${user.id}`, 20)))
          throw new HttpError('Please wait a few minutes before retrying.', 429);
        const saved = await patchSession(user.id, id, 'feedback', { followup });
        if (!saved) throw new HttpError('That observation session was not found.', 404);
        if (saved.status !== 'feedback') return json({ session: saved });
        const progress = await getProgress(user.id);
        const scores = updateScores(progress.scores, s.feedback.scores);
        const updated = { scores, level: levelFor(scores), total: progress.total + 1 };
        const next = await llmService.generateNextExercise(
          s.provider,
          updated,
          (await getSessions(user.id)).map((x) => x.exercise.id),
          s.feedback,
          s.observation || '',
          followup,
        );
        debug('api', 'complete submitted', { userId: user.id, sessionId: id });
        const result = await completeSession(user.id, id, followup, next);
        return json({ session: result });
      }
    }
    throw new HttpError('Not found.', 404);
  } catch (e) {
    if (e instanceof HttpError) {
      const log = e.status === 429 || e.status >= 500 ? warn : debug;
      log('api', 'request rejected', { path, status: e.status, message: e.message });
      return json({ error: e.message }, e.status);
    }
    if (e instanceof z.ZodError) {
      debug('api', 'invalid input', { path, issue: e.issues[0]?.message || 'invalid' });
      return json({ error: e.issues[0]?.message || 'Please check your input.' }, 400);
    }
    if (
      e instanceof CoachError ||
      e instanceof DatabaseSetupError ||
      e instanceof DatabaseUnavailableError
    ) {
      warn('api', 'dependency unavailable', { path, ...errorInfo(e) });
      return json({ error: e.message }, 503);
    }
    if (e instanceof MissingUserError) {
      warn('api', 'account unavailable', { path, ...errorInfo(e) });
      return json({ error: e.message }, 401);
    }
    // Sanitized on purpose: unknown error messages may quote credentials or input.
    logError('api', 'request failed', { path, ...errorInfo(e) });
    return json(
      {
        error: 'We could not save that change. Please try again. Your account has not been reset.',
      },
      500,
    );
  }
}
async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const started = Date.now();
  const path = (await params).path.join('/');
  let response: NextResponse;
  try {
    response = await handleRequest(req, path);
  } catch (e) {
    // handleRequest converts known failures to responses; anything reaching here is a bug.
    logError('api', 'request crashed', { path, ...errorInfo(e) });
    response = json(
      {
        error: 'We could not save that change. Please try again. Your account has not been reset.',
      },
      500,
    );
  }
  const url = new URL(req.url);
  logAccess({
    method: req.method,
    url: url.pathname + url.search,
    status: response.status,
    contentLength: response.headers.get('content-length') || undefined,
    ip:
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      undefined,
    userAgent: req.headers.get('user-agent') || undefined,
    referer: req.headers.get('referer') || undefined,
  });
  debug('http', 'api request', {
    method: req.method,
    path,
    status: response.status,
    ms: Date.now() - started,
  });
  return response;
}
export { handle as GET, handle as POST, handle as DELETE };
