# MongoDB setup: persistent local storage and Atlas hosting

The application now uses the official MongoDB Node.js driver for users, login sessions, observations, progress, and rate limits. SQLite is no longer used by application code.

**Database selection is independent of the LLM provider.** This change does not enable Ollama or alter model settings.

## 1. Local environment (Windows, macOS, Linux)

Install Node.js 20.9+ and Docker Desktop / Docker Engine with Compose v2. Start Docker before running these commands from the project folder.

```powershell
npm ci
# Only for a NEW environment file:
Copy-Item .env.example .env.local

docker compose up -d --wait
npm run dev
```

Windows Command Prompt: use `copy .env.example .env.local`. macOS/Linux: use `cp .env.example .env.local`.

**If `.env.local` already exists, keep it and merge only these database settings rather than overwriting your model credentials:**

```dotenv
APP_ENV=local
MONGODB_URI=mongodb://127.0.0.1:27017/observation_coach?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=observation_coach
COOKIE_SECURE=false
COOKIE_EMBEDDED=false
```

Open `http://localhost:3000`. All npm launch scripts retain the Windows-compatible `cross-env` fix.

### What makes this persistent?

`compose.yaml` runs MongoDB with the named volume `observation_mongo_data`, mounted at `/data/db`. Accounts and observations are written to disk, not to application memory or browser storage. Docker prefixes the volume name with the Compose project name.

- `docker compose restart` restarts MongoDB without deleting records.
- `docker compose down` stops/removes the container but **keeps the named volume**.
- `docker compose up -d --wait` reuses that volume and restores access to the same data.
- **Do not run `docker compose down -v` unless you intentionally want to delete the database.**
- Keep the same Compose project name/folder, or explicitly reuse the original named volume if moving the project. A different project name creates a different volume.
- A volume is not a backup. Use MongoDB backup tooling and protect the host disk appropriately.

The local container publishes MongoDB only on `127.0.0.1:27017`. It is an unauthenticated **development-only** setup. Do not expose it publicly or use it as an unsecured hosted database.

### Why a replica set?

The app uses MongoDB transactions so completing an observation and awarding progress happen together, and account deletion cannot leave newly created child records behind. Transactions require a replica set or sharded deployment.

The Compose health check automatically initializes the single-node replica set `rs0` and waits for a writable primary. You do not have to configure this manually. **An existing standalone `mongod` will be rejected with a setup message**, rather than silently disabling transactions.

If MongoDB is already installed locally, configure it as a replica set, start it with `--replSet rs0`, initialize it with `mongosh`, and use the URI above. Back up an existing installation before changing its configuration. Avoid running it and Docker on the same port.

The supplied URI assumes Next.js runs on your host machine. If you also containerize Next.js, use a MongoDB replica-set hostname reachable from that container; `127.0.0.1` inside a container is not the Docker host.

### Local production build

```powershell
npm run build
npm start
```

Keep `APP_ENV=local` in `.env.local`. A production Next.js build does not by itself mean the database should be hosted. `COOKIE_SECURE=false` is only for local HTTP; enable it for HTTPS.

## 2. Hosted environment: MongoDB Atlas

1. Create an Atlas deployment and an application database user. Grant only the required permissions (typically `readWrite` on the chosen application database, including index creation).
2. Allow the application's outbound network address or configure a private connection. Do not default to unrestricted public network access.
3. Obtain the Atlas **driver connection string**.
4. Add these values to the hosting platform's server-side environment/secret settings:

```dotenv
APP_ENV=hosted
MONGODB_URI=mongodb+srv://USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=observation_coach
COOKIE_SECURE=true
COOKIE_EMBEDDED=false
```

`.env.hosted.example` is a reference template, not a loaded secret file. Next.js does not automatically read a file named `.env.hosted`.

Never prefix the URI with `NEXT_PUBLIC_`, commit real credentials, or put the URI in browser code. URL-encode reserved characters in the password. Retain Atlas's recommended TLS settings; the SRV connection format enables TLS by default.

Set `COOKIE_EMBEDDED=true` only for HTTPS deployments embedded in a cross-site iframe. Configure `LLM_PROVIDER` separately using the existing model settings.

Restart/redeploy the application after changing secrets. Atlas supplies the replica-set/sharded capabilities needed for transactions. There is **no local fallback** if hosted configuration is missing or the Atlas connection fails.

### Environment selection

| Configuration                | Behavior                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| `APP_ENV=local`              | Uses `MONGODB_URI` if supplied; otherwise the local replica-set URI         |
| `APP_ENV=hosted`             | Requires `MONGODB_URI`; intended for the Atlas URI supplied by the operator |
| `APP_ENV` unset, development | Defaults to local                                                           |
| `APP_ENV` unset, production  | Defaults to hosted; missing URI is a setup error                            |

`MONGODB_DB_NAME` selects the database explicitly; it defaults to `observation_coach`. Use different database names/clusters for development, tests, and production.

The same repository and indexes are used in both environments. No connection string or password is exposed in the UI. A configuration change requires an application restart; hot reload does not silently switch databases.

## 3. Existing SQLite data

Your old `storage/coach.sqlite` and related files are **not deleted, overwritten, or automatically uploaded**. `DATABASE_PATH` is no longer used. The new MongoDB database starts with its own accounts and history.

**Existing SQLite accounts/history are not automatically migrated.** Keep a consistent backup of the SQLite database (including its WAL state or use SQLite's backup API) if you need those records. Moving them to local MongoDB or Atlas is a separate, explicit data migration. No migration has been run as part of this change.

## 4. Checks and troubleshooting

```powershell
docker compose ps
docker compose logs mongo
npm run typecheck
npm test
npm run test:db
```

`test:db` starts a disposable real MongoDB replica set through `mongodb-memory-server`. It does not use or erase your configured application database. The first run may download a MongoDB binary. Tests cover indexes, token rotation/expiry, isolation, concurrent creates/completions, rate limiting, account deletion, disk persistence across database restart, and connection failures.

For browser/API tests, run the application in demo mode against a **separate test database**, install Playwright's Chromium browser, then run `npm run test:e2e`. The helper `tests/helpers/serve-mongo.mjs` is an intentionally disposable test fixture—not a production or persistent local substitute for Compose.

Common issues:

- **Connection refused:** MongoDB/Docker is not running or another service is using the port.
- **Replica-set setup error:** start the supplied Compose configuration, or configure your own replica set.
- **Atlas selection timeout:** check network access rules, cluster availability, DNS, TLS, and hosting egress.
- **Atlas authentication/index error:** check database user permissions and URL-encoded credentials.
- **Different/empty database:** verify `MONGODB_URI`, `MONGODB_DB_NAME`, and the Docker volume/project name. Do not delete storage to troubleshoot.
- **Demo data still physically present just after 24 hours:** TTL cleanup is asynchronous. Authentication rejects expired demo users immediately even while background deletion is pending.

## Verification boundary

The local repository and restart persistence were tested against a real MongoDB replica set, and the app's existing browser/API flow was rerun against MongoDB. Docker Compose configuration was supplied but Docker itself is unavailable in this sandbox. No Atlas credentials were supplied, so an actual Atlas connection/deployment remains unverified.
