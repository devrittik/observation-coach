/**
 * Small leveled logger shared by server and browser code.
 *
 * LOG_LEVEL: debug | info | warn | error | silent. Defaults to debug for local work
 * and info on hosted servers (browser code always defaults to debug; console.debug
 * stays out of the way until devtools is opened).
 *
 * Never log secrets: field values are redacted by key name as a safety net, and
 * unknown error messages are dropped because driver/bundler messages can embed
 * connection strings. Curated error classes keep their hand-written messages.
 */
import { appEnvironment } from './env';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const LEVELS = Object.keys(RANK) as LogLevel[];
export type LogFields = Record<string, unknown>;
const SECRET_KEY =
  /(pass|secret|token|credential|authorization|cookie|api[-_]?key|bearer|uri|email|salt|hash)/i;
/** Error classes whose messages are hand-written and safe to show to operators. */
const SAFE_ERROR_NAMES = new Set([
  'DatabaseSetupError',
  'DatabaseUnavailableError',
  'MissingUserError',
  'CoachError',
  'HttpError',
]);
export function currentLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase() as LogLevel | undefined;
  if (raw && LEVELS.includes(raw)) return raw;
  if (typeof window !== 'undefined') return 'debug';
  return appEnvironment() === 'hosted' ? 'info' : 'debug';
}
export function levelEnabled(level: LogLevel): boolean {
  return RANK[level] >= RANK[currentLevel()];
}
/** Deep-redact values whose key names suggest secrets. Structural safety net only. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: LogFields = {};
  for (const [key, item] of Object.entries(value as LogFields))
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(item, depth + 1);
  return out;
}
/**
 * Operator-safe error fields. Only curated error classes keep their message; every
 * other error contributes its name and primitive code (e.g. MongoServerError 11000).
 */
export function errorInfo(error: unknown): LogFields {
  if (!(error instanceof Error)) return { failure: 'non-error', type: typeof error };
  // Custom Error subclasses leave `name` at "Error"; fall back to the constructor,
  // which our classes keep stable via an explicit instance `name` (minifier-proof).
  const name =
    error.name && error.name !== 'Error' ? error.name : error.constructor?.name || error.name;
  const info: LogFields = { error: name };
  if (SAFE_ERROR_NAMES.has(name)) info.message = error.message;
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'number' || typeof code === 'string') info.code = code;
  return info;
}
function write(
  level: Exclude<LogLevel, 'silent'>,
  source: string,
  message: string,
  fields?: LogFields,
) {
  if (!levelEnabled(level)) return;
  const extra = fields && Object.keys(fields).length ? ' ' + JSON.stringify(redact(fields)) : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${source}] ${message}${extra}`;
  if (typeof window !== 'undefined') {
    if (level === 'debug') console.debug(line);
    else if (level === 'info') console.info(line);
    else if (level === 'warn') console.warn(line);
    else console.error(line);
    return;
  }
  if (level === 'warn' || level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}
export const debug = (source: string, message: string, fields?: LogFields) =>
  write('debug', source, message, fields);
export const info = (source: string, message: string, fields?: LogFields) =>
  write('info', source, message, fields);
export const warn = (source: string, message: string, fields?: LogFields) =>
  write('warn', source, message, fields);
export const error = (source: string, message: string, fields?: LogFields) =>
  write('error', source, message, fields);
