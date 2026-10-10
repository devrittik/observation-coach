/** Shared environment resolution. APP_ENV is explicit so a local production build stays local. */
export function appEnvironment(): string {
  return process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'hosted' : 'local');
}
/** True/false from an env flag, or undefined when unset or not a boolean literal. */
export function envFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
