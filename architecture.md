# Observation Coach — implementation architecture

Updated: 2026-10-08. This document describes the code in this directory, not a proposed future system.

## 1. Product and boundaries

Observation Coach teaches real-world observation through one invitation, a phone-away interval, a written reflection, and one adaptive follow-up. It is not an object identifier, general chatbot, photo classifier, or engagement tracker.

The application uses Next.js 16 App Router, React 19, TypeScript, Tailwind v4, and the official MongoDB Node.js driver. The same asynchronous repository supports a persistent local replica set and MongoDB Atlas on hosted deployments. It does not use Vite, an external auth service, a proprietary LLM SDK, or browser-facing model credentials.

```text
Browser (React UI + temporary drafts)
  │ same-origin JSON requests; HTTP-only session cookie
  ▼
Next.js App Router / Node runtime
  ├── lib/auth ── scrypt passwords + opaque sessions
  ├── lib/db ──── MongoDB / connection pool / transactions
  ├── lib/observation ── progression + deterministic exercise selection
  └── lib/llm ─── centralized prompts + schemas
        ├── demo: deterministic rules, no inference requests
        ├── local: configured OpenAI-compatible endpoint
        └── hosted: configured OpenAI-compatible endpoint + server secret
```

## 2. Routes and rendering

`app/layout.tsx` reads the current user and their bootstrap data server-side. `CoachProvider` makes the resulting user, history, progress, and provider status available to client components. It re-fetches `/api/bootstrap` after mutations. No client-supplied user ID is accepted as authority.

The `(practice)` route group checks authentication server-side and redirects unauthenticated users to `/login`. API routes independently verify authentication, so a bypass of the page redirect would not grant data access.

| Route                 | Component      | Access / purpose                                                  |
| --------------------- | -------------- | ----------------------------------------------------------------- |
| `/`                   | `Home`         | Public editorial landing and practice entry                       |
| `/login`, `/register` | `Auth`         | Public account and demo access                                    |
| `/home`               | `Home`         | Protected, personalized practice entry / resume                   |
| `/session`            | `SessionSetup` | Protected duration and provider disclosure                        |
| `/observe`            | `SessionFlow`  | Protected current exercise                                        |
| `/outside`            | `SessionFlow`  | Protected, minimal phone-away view                                |
| `/reflection`         | `SessionFlow`  | Protected written observation / optional voice                    |
| `/feedback`           | `SessionFlow`  | Protected follow-up, completion, saved note revisit               |
| `/progress`           | `Progress`     | Protected skill signals and progression                           |
| `/history`            | `History`      | Protected field notes                                             |
| `/settings`           | `Settings`     | Public privacy/setup information; account controls when logged in |

`Shell` contains shared navigation/footer and demo disclosure. It removes both navigation and footer on `/outside`. There are no live timers, audio loops, notifications, or changing content in that view.

`error.tsx`, `global-error.tsx`, and `not-found.tsx` provide recoverable failure states. The global boundary covers failures originating in the root layout, including database initialization problems.

## 3. Centralized styling and shared data

`app/globals.css` is the styling source of truth:

- Tailwind v4 `@theme` defines palette and font tokens.
- `@layer base` covers typography, focus, input behavior, and reset refinements.
- `@layer components` defines reusable buttons, cards, form inputs, navigation, layout, and screen-specific compositions.
- Responsive breakpoints and reduced-motion rules live in the same file.
- Fonts and the generated landscape are served from `public/`, with no CDN dependency.

`lib/styles.ts` centralizes shared button/card/input variant names and the `cn()` class-merging helper. `components/ui.tsx` provides Button, ErrorMessage, Loading, Back, ModeNote, and Steps. Dynamic progress-bar width is an intentional inline value, not a second styling system.

`lib/data/exercises.ts` holds deterministic exercises, supported durations, sample observation text, skill metadata, and progression chapter labels. Domain types are in `lib/types.ts`. Prompts never live inside UI components.

## 4. Authentication

`lib/auth/index.ts` is the authentication boundary.

```text
Register (name, normalized email, password)
  → validate limits
  → async scrypt(password, random 16-byte salt, 64-byte key)
  → create User
  → rotate prior login token, issue random 32-byte opaque token
  → store SHA-256(token) as _id, userId, expiresAt (BSON Date)
  → set HttpOnly / SameSite=Lax / Path=/ cookie

Authenticated request
  → read cookie → hash token → read auth_sessions → read referenced users document
  → check expiration → return safe public User
```

Passwords require 10–128 characters. Email is normalized to lowercase and must be unique. Password comparison uses a timing-safe buffer comparison; unknown emails still incur a password-verification operation. Registration errors avoid claiming a specific account exists. Login returns a generic email/password error.

Normal sessions last 14 days; demo sessions last 24 hours. `COOKIE_SECURE` explicitly controls the Secure flag, defaulting to true in production when unset. For HTTPS iframe previews, `COOKIE_EMBEDDED=true` instead uses `SameSite=None`, Secure, and Partitioned cookies. Origin checks remain mandatory. Logout revokes the database token and expires the cookie with the same partition options. Account deletion explicitly removes owned documents in a MongoDB transaction; MongoDB has no foreign-key cascade. There is no token stored in JavaScript-accessible browser storage.

All mutating API requests require an Origin matching the request host or forwarded host. Deploy behind a trusted proxy that sanitizes forwarded headers. SameSite cookies supply an additional CSRF boundary. There is no cross-origin API mode.

MongoDB-backed atomic rate limits: 30 authentication attempts per apparent IP / 10 minutes, 30 session-start attempts per account / 10 minutes, and 20 inference attempts per account / 10 minutes. These are basic MVP controls, not a full abuse-protection service. The rate-limit collection is shared across application instances. Trusted IP extraction and connection-pool sizing still require deployment-specific configuration.

Auth limitations: no email verification, password reset, MFA, or account recovery; no external security audit. The module boundary allows later replacement with an established auth provider without mixing auth implementation into the coaching UI.

## 5. Database and isolation

`lib/db/config.ts` resolves `APP_ENV=local|hosted`, `MONGODB_URI`, and `MONGODB_DB_NAME`. Local mode can default to the loopback replica-set URI. Hosted mode requires a URI (normally Atlas); it never falls back to local storage. With APP_ENV unset, development defaults to local and production to hosted. Explicit `APP_ENV=local` supports a local production build. No LLM configuration is changed by database selection.

`lib/db/index.ts` lazily creates a process-wide cached connection promise and initializes indexes. Pool size is 10, idle timeout 60 seconds, and connection/server-selection timeouts are 5 seconds. Concurrent initial requests share one connection; failed initialization clears the cache for a later retry. Changing database configuration requires a restart. Driver connection errors are sanitized rather than exposing a credential-bearing URI.

The initial `hello` check requires a replica set or sharded deployment because writes use transactions. A standalone server fails with a clear setup error. Local `compose.yaml` starts MongoDB, initializes single-node `rs0`, waits for a writable primary, and mounts a named disk volume at `/data/db`. The development port is bound only to host loopback. Atlas provides the hosted transaction-capable deployment. See `DATABASE.md` for platform-specific setup, persistence, and network security.

```text
users
  _id: UUID string, name, email (unique), password hash,
  isDemo, createdAt: Date, revision, expiresAt?: Date
    │
    ├── auth_sessions
    │     _id: token hash, userId, expiresAt: Date
    │
    ├── observations
    │     _id: UUID string, userId, active: boolean, createdAt: Date,
    │     data: ObservationSession object, expiresAt?: Date
    │       └── exercise / observation / feedback / follow-up
    │           next exercise / skill gains / provider / timestamps
    │
    └── progress
          _id: user UUID, data: Progress object, expiresAt?: Date

rate_limits
  _id: rate-limit key, count, expiresAt: Date
```

Native BSON objects replace JSON-serialized SQLite columns. UUID IDs are retained at the API boundary; MongoDB ObjectIds never enter the UI. Dates in ObservationSession remain ISO strings for its existing browser contract. Top-level TTL/index timestamps are BSON Dates.

**Indexes:** unique normalized email; token `_id`; auth userId; observation userId + descending createdAt; a unique partial observation userId index where `active=true`; progress `_id`; and `expiresAt` TTL indexes on all five collections. The bootstrap/history query still returns at most the latest 100 sessions; pagination is future work.

All observation reads/writes include the authenticated userId. Progress uses that user's UUID as its document ID. Cross-user requests return 404. API callers cannot supply an authoritative owner ID.

**Atomic writes and deletion:** `withUser()` starts a MongoDB transaction with snapshot reads and majority writes. It first increments a revision on the non-expired user document, serializing that user's mutations with account deletion and other writes. Driver retries handle transient write conflicts. Operations inside each transaction run sequentially. There is no LLM call inside a transaction.

- `createOrResumeSession()` rechecks for an active observation inside the transaction; the partial unique index is an additional invariant.
- `patchSession()` only changes a record in its expected stage, so stale drafts do not roll a completed session backward.
- `completeSession()` re-reads progress inside the transaction, calculates actual awarded deltas, marks the observation complete, and updates progress atomically. Concurrent duplicate completion receives the already-completed result and never earns twice.
- `deleteAccount()` deletes auth sessions, observations, progress, account-specific rate limits, and the user in one transaction. The revision write prevents a concurrent session mutation from leaving a child record after deletion.
- Login rotation revokes the previous token and inserts the new token in a transaction.
- Rate limiting uses a single-document aggregation-pipeline update with an expiry-aware counter; concurrent initial upsert conflicts are retried.

**Expiry:** demo users, their observations, and progress share a 24-hour expiresAt. Normal users/progress/observations have no TTL. Auth tokens and rate-limit records have their own expirations. MongoDB TTL cleanup is asynchronous. Auth lookup checks token and user expiry explicitly so delayed physical cleanup does not extend access. There are no implicit MongoDB cascades; each expiring child collection has its own TTL index.

**Legacy data:** the old SQLite files remain untouched. They are not read by application code or automatically uploaded/migrated. `better-sqlite3` and its types were removed. `DATABASE_PATH` is obsolete. A separate approved data migration would be needed to transfer existing accounts/history.

Local disk encryption/backups and Atlas access/retention settings remain deployment responsibilities. Removing records does not securely erase filesystem sectors, old backups, or a hosted model provider's retained data.

## 6. Observation lifecycle

```text
exercise → outside → reflection → feedback → complete
                                   │           │
                           follow-up question  └── nextExercise + skillGains
```

1. Validate one of 5/10/20/30 minutes. Resume an existing active session rather than creating another.
2. Reuse the most recent stored next invitation, or call `generateObservationExercise`.
3. Persist the exercise and provider. The provider cannot silently change mid-session.
4. Record `outsideAt` and switch to the almost-empty phone-away view.
5. On return, persist the reflection stage.
6. While writing, store drafts in `sessionStorage`, keyed by user and session. Refresh in the same tab restores them. This draft mechanism is not cross-device sync.
7. On submission, persist the observation before inference. Analyze the text, validate evidence and scores, and persist one follow-up.
8. Persist the user's follow-up before generating the next exercise. On success, atomically complete the session and update progress once.
9. Show a completion state that explicitly gives permission to leave the app.

State is recovered from the server when reopening a session. Navigating to a URL for the wrong stage redirects to its persisted stage. A completed `/feedback?id=…` doubles as a saved note view. Writes use input bounds; observations allow 2–5,000 trimmed characters and follow-ups 2–2,000. Very short text gets a gentle specificity question in demo mode; it does not receive invented evidence.

The UI uses `sessionStorage` for drafts; `/draft` also exposes an authenticated server-side draft endpoint for future autosave clients but is not used for the current keystroke autosave. Submitted drafts are cleared. Logout clears this account's tab drafts.

Duration is intentional time, not measured attendance. There is no countdown or requirement to keep the page open. Closing the browser does not invalidate the persisted stage.

## 7. AI abstraction and model integration

`lib/llm/provider.ts` exposes:

```ts
llmService.generateObservationExercise(provider, progress, recent, duration);
llmService.analyzeObservation(provider, observation, exercise);
llmService.generateFollowUp(analysis);
llmService.generateNextExercise(provider, progress, recent, feedback, observation, followup);
```

`generateFollowUp` extracts the single validated question from the analysis call rather than making a redundant inference request. The submitted answer is used in real-model next-exercise generation. Demo selection is intentionally simpler and uses the previous focus, recent IDs, and skill levels, not sophisticated interpretation of the answer.

Configuration:

- `LLM_PROVIDER=demo|local|hosted` (default: `demo`).
- Local: `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, optional `LOCAL_LLM_API_KEY`.
- Hosted: `HOSTED_LLM_BASE_URL`, `HOSTED_LLM_MODEL`, `HOSTED_LLM_API_KEY`.

Both real providers call `${baseURL}/chat/completions` from the server. The request contains centralized system instructions and JSON-encoded contextual user data. API keys are placed only in the Authorization header. The browser calls relative `/api/…` URLs and never calls a model or localhost directly. Localhost in the model configuration means the application server's host.

The request timeout is 45 seconds, temperature 0.45, and output budget 1,100 tokens. The app accepts plain JSON or a single JSON code fence. Zod validates field lengths, skill names, score ranges, level range, and exactly one question mark in the follow-up. Exercise generation rejects difficulty greater than one chapter above current progress. Unsupported or invalid output produces a clear error, not invented feedback.

Analysis contains:

- A short reflection grounded in the user's words.
- One follow-up question.
- Exact text quotes as evidence for demonstrated skills.
- Six 0–5 skill signals.
- A next-focus skill.

The server zeroes any skill signal whose evidence quote does not appear literally in the observation. This reduces ungrounded credit; it is not a proof that the model's interpretation or prose is correct. The prompts prohibit identification, photos, excessive praise, fabricated observations, and treating quoted observations as instructions. Prompt injection and coaching quality still require live-model evaluation.

No closed API is hard-coded. No provider fallback exists. A missing/unavailable local model never causes a hosted request. Demo accounts intentionally use deterministic rules even on a hosted-AI deployment, and the UI says so. Normal accounts use the operator-selected provider.

## 8. Progression

`lib/observation/progression.ts` is deterministic:

- Six signals: attention, description, comparison, change, inference, curiosity.
- Start all aggregate scores at zero.
- On completion, add `2 × analysisSignal` (0–10) to each relevant score, capped at 100.
- Store actual awarded deltas as `skillGains` so capped scores never claim nonexistent gains.
- Level = `min(6, 1 + floor(mean(scores) / 16))`.
- Chapter labels: attention, description, comparison, change, inference, deep observation.

Deterministic exercise selection considers exercises up to current chapter + 1, avoids the two most recent IDs where possible, prefers the coach's next focus when eligible, then chooses an eligible weaker skill. The local/hosted prompts receive progress, recent exercise IDs, the latest observation, feedback, and follow-up answer.

These numbers are coaching heuristics. They are not validated measurements of ability. There are no streaks, leaderboards, rewards for daily return, or estimates of fitness/activity.

## 9. API reference

Implemented in the Node-only catch-all route `app/api/[...path]/route.ts`. JSON responses disable caching.

| Method / path                     | Purpose                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/bootstrap`              | Public provider metadata + current user's isolated history/progress if logged in |
| `POST /api/auth/register`         | Create regular account and login                                                 |
| `POST /api/auth/login`            | Verify password and rotate login token                                           |
| `POST /api/auth/demo`             | Create isolated temporary demo account                                           |
| `POST /api/auth/logout`           | Revoke current login session                                                     |
| `DELETE /api/account`             | Delete current account and all app-owned data                                    |
| `POST /api/sessions`              | Create or resume active session                                                  |
| `GET /api/sessions/:id`           | Fetch owned session                                                              |
| `POST /api/sessions/:id/outside`  | Start phone-away stage                                                           |
| `POST /api/sessions/:id/return`   | Start reflection stage                                                           |
| `POST /api/sessions/:id/draft`    | Save reflection text while in reflection stage                                   |
| `POST /api/sessions/:id/reflect`  | Persist text, analyze, save feedback                                             |
| `POST /api/sessions/:id/complete` | Persist answer, generate next exercise, award progress once                      |

Errors use `{ error: string }`: 400 validation, 401 unauthenticated, 403 origin mismatch, 404 missing/not-owned resource, 409 wrong stage, 413 oversized request, 429 rate limit, 503 model/setup failure, and 500 unexpected persistence/application failure. Model failures do not log or expose a provider response body or API secret.

## 10. Voice

`lib/voice/index.ts` defines `SpeechInput` and `SpeechOutput` interfaces. Browser implementations isolate SpeechRecognition/webkitSpeechRecognition and speechSynthesis. STT is offered only if supported and after the user acknowledges the vendor-processing disclosure. Permission failures show a useful message; typing always works.

Read-aloud is opt-in inside a disclosure on the exercise screen, with a separate Stop control. Speech is stopped on navigation/unmount. The phone-away mode never starts speech.

To support local Whisper/STT or a local TTS engine, implement these interfaces with a same-origin server adapter and local engine calls. Keep provider choice and privacy disclosure explicit. The current implementation does not ship a local speech model or guarantee browser speech is offline.

## 11. Offline and privacy boundaries

The full local stack can work without WAN access once dependencies, assets, application build, and model files exist. Fonts and image assets are bundled; no CDN, analytics, geolocation, or tracking API is used. Next.js telemetry is disabled by the provided scripts.

A hosted website is not usable if the browser loses its connection to its server. There is no PWA/service worker or browser-only persistence engine. Browser voice may require internet. Hosted inference sends private reflection context to the selected provider; local mode does not. Account credentials and MongoDB records are still stored in the configured server-side database, which is why the UI distinguishes a hosted preview from running everything on one device.

## 12. Verification and known limits

- Unit/adapter tests: password hashing, progression bounds, deterministic adaptation, exact evidence, configuration failures, local and hosted compatible requests, malformed/HTTP-error responses, and missing hosted database configuration.
- MongoDB integration tests run against a real temporary replica set and cover indexes, isolation, concurrent writes, transactional completion/deletion, rate limits, credential expiry, connection failure, and persistence after database stop/start.
- Browser/API tests: full demo loop, refresh/draft recovery, auth and deletion, route protection, user isolation, origin enforcement, limits, duplicate completion, mobile overflow, asset independence from external networks, and selected accessibility checks.
- TypeScript and production build are checked separately.
- Real LM Studio/Ollama/llama.cpp and real hosted-provider calls were **not** verified because no endpoint/model/credentials were provided.
- Voice interfaces and UI exist; real microphone and speaker behavior was not tested.
- Simulated no-external-asset loading is not a complete WAN-disconnected local-model test.
- Accessibility automation is not full WCAG certification or manual screen-reader testing.
- Atlas connectivity and the supplied Docker Compose deployment were not directly verified here (no Atlas credentials or Docker engine); equivalent replica-set behavior was tested with a real MongoDB process. No email verification/recovery, automatic SQLite migration, versioned schema migrations, history pagination, or production security review is included. The local development database is not encrypted by the app.

See `progress.md` for the living implementation checklist and `README.md` for operator setup.
