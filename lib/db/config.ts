import { appEnvironment } from '@/lib/env';
/** APP_ENV is explicit so a local production build can still use local MongoDB. */
export class DatabaseSetupError extends Error {
  name = 'DatabaseSetupError';
}
export class DatabaseUnavailableError extends Error {
  name = 'DatabaseUnavailableError';
}
export function databaseConfig() {
  const environment = appEnvironment();
  if (environment !== 'local' && environment !== 'hosted') {
    throw new DatabaseSetupError('APP_ENV must be local or hosted.');
  }
  const uri =
    process.env.MONGODB_URI?.trim() ||
    (environment === 'local'
      ? 'mongodb://127.0.0.1:27017/observation_coach?replicaSet=rs0&directConnection=true'
      : '');
  if (!uri)
    throw new DatabaseSetupError(
      'Hosted database setup is required. Set MONGODB_URI to your MongoDB Atlas connection string on the server. No local fallback was used.',
    );
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new DatabaseSetupError('MONGODB_URI must be a MongoDB connection string.');
  const name = process.env.MONGODB_DB_NAME?.trim() || 'observation_coach';
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(name))
    throw new DatabaseSetupError(
      'MONGODB_DB_NAME must contain 1–63 letters, numbers, underscores, or hyphens.',
    );
  return { environment, uri, name };
}
