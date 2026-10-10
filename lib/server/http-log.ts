/**
 * HTTP access logging in Apache "combined" format (the standard morgan `combined`
 * format line). Enabled by default on hosted deployments; LOG_HTTP=true|false
 * overrides the default. Lines are written raw to stdout so log aggregators can
 * parse them the way they parse classic web-server access logs.
 */
import morgan from 'morgan';
import { appEnvironment, envFlag } from '@/lib/env';
import { levelEnabled } from '@/lib/log';
export type AccessLogInput = {
  method: string;
  /** Request target, e.g. `/home?tour=1` (query strings included, as with morgan). */
  url: string;
  status: number;
  httpVersion?: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  referer?: string | undefined;
  contentLength?: string | number | undefined;
};
type Formatter = (tokens: unknown, req: unknown, res: unknown) => string | null | undefined;
type MorganWithFormat = {
  /** morgan registers the combined format string as a property of the module. */
  combined: string;
  compile: (format: string) => Formatter;
};
const combinedFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
const morganFormat = morgan as unknown as MorganWithFormat;
const formatLine = morganFormat.compile(morganFormat.combined || combinedFormat);
export function httpLogEnabled(): boolean {
  return envFlag('LOG_HTTP') ?? appEnvironment() === 'hosted';
}
/** Render one morgan combined line from request/response facts. Pure; used in tests. */
export function formatAccessLine(input: AccessLogInput): string {
  // Minimal req/res shims carrying exactly the fields morgan's combined tokens read.
  const [httpVersionMajor, httpVersionMinor] = (input.httpVersion || '1.1').split('.');
  const req = {
    method: input.method,
    url: input.url,
    httpVersion: input.httpVersion || '1.1',
    httpVersionMajor,
    httpVersionMinor,
    headers: {
      'user-agent': input.userAgent || undefined,
      referer: input.referer || undefined,
    },
    ip: input.ip || undefined,
  };
  const res = {
    statusCode: input.status,
    headersSent: true,
    getHeader(field: string) {
      return field === 'content-length' ? input.contentLength || undefined : undefined;
    },
  };
  return formatLine(morgan, req, res) || '-';
}
export function logAccess(input: AccessLogInput): void {
  if (!httpLogEnabled() || !levelEnabled('info')) return;
  process.stdout.write(formatAccessLine(input) + '\n');
}
