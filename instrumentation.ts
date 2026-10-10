/** Server boot log and per-request error hook (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build')
    return;
  const { info } = await import('@/lib/log');
  const { appEnvironment } = await import('@/lib/env');
  const { httpLogEnabled } = await import('@/lib/server/http-log');
  info('boot', 'observation coach server started', {
    appEnv: appEnvironment(),
    nodeEnv: process.env.NODE_ENV,
    accessLog: httpLogEnabled(),
    logLevel: process.env.LOG_LEVEL || 'default',
  });
}
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string } | undefined,
) {
  const { error: logError, errorInfo } = await import('@/lib/log');
  logError('request', 'unhandled server error', {
    ...errorInfo(error),
    path: request?.path,
    method: request?.method,
  });
}
