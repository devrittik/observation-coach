# MongoDB setup: persistent local storage and Atlas hosting

The application now uses the official MongoDB Node.js driver for users, login sessions, observations, progress, and rate limits. SQLite is no longer used by application code.

**Database selection is independent of the LLM provider.** This change does not enable Ollama or alter model settings.

## 1. Local environment (Windows, macOS, Linux)

Two equivalent ways to run MongoDB locally — **Docker is optional**:

- **A. Already have MongoDB installed?** Use it — no Docker at all. Jump to [section 2](#2-use-your-installed-mongodb--no-docker).
- **B. Prefer a self-contained database?** Use the supplied Docker Compose service (needs Node.js 20.9+ and Docker Desktop / Engine with Compose v2).

With Docker (option B):

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

**Installed MongoDB instead of Docker:** a single-node replica set is just a mode your existing `mongod` runs in — same data folder, same records, no container. Section 2 below (and `scripts/mongodb-enable-replicaset`) does it in one step. Avoid running Docker and your own mongod on the same port at the same time.

The supplied URI assumes Next.js runs on your host machine. If you also containerize Next.js, use a MongoDB replica-set hostname reachable from that container; `127.0.0.1` inside a container is not the Docker host.

### Local production build

```powershell
npm run build
npm start
```

Keep `APP_ENV=local` in `.env.local`. A production Next.js build does not by itself mean the database should be hosted. `COOKIE_SECURE=false` is only for local HTTP; enable it for HTTPS.

## 2. Use your installed MongoDB — no Docker

If `mongod` is already installed (Windows MSI, macOS Homebrew, apt, tarball), Docker is **not** required. The app needs a **single-node replica set** — a normal mode for `mongod` that adds transaction support while keeping your existing data directory and records exactly where they are.

**The symptom this fixes:**

```text
DatabaseSetupError: MongoDB must run as a replica set to preserve atomic account and progress updates...
```

That message means the app _reached_ your MongoDB successfully — the server is simply running as a standalone. Two small changes switch it over; nothing is migrated or deleted.

### Windows — one command (recommended)

Run in an **Administrator PowerShell**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mongodb-enable-replicaset.ps1
```

The script backs up `mongod.cfg`, adds `replication.replSetName=rs0`, restarts the MongoDB service, runs `rs.initiate()` once, and waits for PRIMARY. Your data is untouched. Then start the app:

```powershell
npm run dev
```

### Windows — manual steps (same thing)

1. Find the config path shown by `sc.exe qc MongoDB` (typically `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg`). Keep a backup copy.
2. Add this **top-level** section to `mongod.cfg` (keep `storage.dbPath` as-is):

```yaml
replication:
  replSetName: rs0
```

3. Restart MongoDB from an Administrator PowerShell: `Restart-Service MongoDB`
4. Initialize the replica set once:

```powershell
mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
mongosh --eval "rs.status().myState"   # 1 = PRIMARY
```

If `mongosh` is not on PATH, use `mongosh.exe` inside the server's `bin` folder.

### macOS / Linux

```bash
sudo bash scripts/mongodb-enable-replicaset.sh
```

Or manually: add the same `replication:` block to `/etc/mongod.conf` (or your Homebrew config), `sudo systemctl restart mongod`, then run the same `rs.initiate()` with `mongosh`.

### Started mongod by hand?

Stop it and start it again with the **same `--dbpath`** plus `--replSet rs0`, then run the same `rs.initiate()` step:

```bash
mongod --dbpath /path/to/your/data --replSet rs0
```

### Confirm it worked

```powershell
mongosh --eval "db.adminCommand({hello:1}).setName"   # prints: rs0
```

Then `npm run dev`. The default `MONGODB_URI` in `.env.example` already targets `127.0.0.1:27017` with `replicaSet=rs0&directConnection=true` — no URI change needed for defaults. Enabling the replica set **does not migrate, rewrite, or delete records**; the app picks up where it left off.

### Troubleshooting

- **Edited the config but nothing changed:** confirm it is the file the service actually loads (`sc.exe qc MongoDB` → executable path; the config lives next to `mongod.exe` or in the server root).
- **`AlreadyInitialized` from rs.initiate:** fine — the replica set exists; check `db.adminCommand({hello:1}).setName` matches `replicaSet=` in `MONGODB_URI`.
- **Different setName (e.g. `rs1`):** either keep it and update `MONGODB_URI`'s `replicaSet=`, or reconfigure mongod to `rs0`.
- **App still says "not a replica set":** the app reached _some other_ MongoDB — check the port in `MONGODB_URI` versus what `mongod` actually listens on, and that you restarted after the config change.
- **`mongosh` missing:** install the MongoDB Shell from mongodb.com, or use the `mongosh.exe` bundled in the server's `bin` directory.
- **Non-default data folder or port:** that is fine — the script accepts `-Port` and `-ConfigPath`; the app only cares that `MONGODB_URI` points at the right address and `replicaSet` name.

## 3. Hosted environment: MongoDB Atlas

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

## 4. Existing SQLite data

Your old `storage/coach.sqlite` and related files are **not deleted, overwritten, or automatically uploaded**. `DATABASE_PATH` is no longer used. The new MongoDB database starts with its own accounts and history.

**Existing SQLite accounts/history are not automatically migrated.** Keep a consistent backup of the SQLite database (including its WAL state or use SQLite's backup API) if you need those records. Moving them to local MongoDB or Atlas is a separate, explicit data migration. No migration has been run as part of this change.

## 5. Checks and troubleshooting

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
