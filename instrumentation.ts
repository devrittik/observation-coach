/** Server boot log and per-request error hook (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build')
    return;
  // Only import Edge-safe modules here: instrumentation is bundled for Edge too.
  const { info } = await import('@/lib/log');
  const { appEnvironment, envFlag } = await import('@/lib/env');
  info('boot', 'observation coach server started', {
    appEnv: appEnvironment(),
    nodeEnv: process.env.NODE_ENV,
    accessLog: envFlag('LOG_HTTP') ?? appEnvironment() === 'hosted',
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
