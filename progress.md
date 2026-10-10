# Observation Coach — development progress

Updated: **2026-10-08**. Status: functional MVP and guided demo; live inference configuration and verification still pending.

## Completed

### Phase 1 — Foundation

- [x] Next.js 16 App Router, React 19, TypeScript, Tailwind v4. No Vite.
- [x] Centralized theme, component styling, UI variants, and deterministic data.
- [x] MongoDB collections, unique/TTL indexes, per-user progress and session records (replaces SQLite).
- [x] Registration, login, logout, protected routes, opaque session cookies.
- [x] Salted scrypt password hashes and hashed login tokens.
- [x] Origin checks, request validation, basic authentication/inference rate limits.
- [x] Transactional account deletion and explicit removal of app-owned records.
- [x] Cross-user session access rejected and tested.

### Phase 2 — Core observation loop

- [x] Duration selection: 5, 10, 20, and 30 minutes.
- [x] One exercise per session, from centralized exercise data in demo mode.
- [x] Phone-away screen with no navigation, feed, or countdown.
- [x] Return, observation, one follow-up, completion, and next invitation.
- [x] Persisted stage recovery; same-tab draft recovery after refresh.
- [x] Isolated guided demo with optional sample observation and explicit deterministic labels.
- [x] Calm responsive interface, local fonts, generated nature image with disclosure.
- [x] Explicit embedded-preview cookie configuration for HTTPS cross-site iframe authentication.

### Phase 3 — AI integration implementation

- [x] Shared local / hosted / deterministic provider abstraction.
- [x] All inference and credentials stay behind server-side API routes.
- [x] Centralized prompts and Zod response schemas.
- [x] Exercise generation, observation analysis, follow-up extraction, and next-exercise methods.
- [x] Reject malformed responses and overly advanced exercise levels.
- [x] Require literal user-text evidence before awarding a skill signal.
- [x] Actionable errors; no silent provider switching.
- [x] Persist submitted reflections and follow-ups before model calls.
- [x] Local and hosted adapters tested against a simulated compatible endpoint.
- [ ] Test an actual local open-weight model (no local model provided).
- [ ] Configure and test an actual hosted model (no provider credentials supplied).

### Phase 4 — Adaptive coaching

- [x] Six underlying skill signals and six progression chapters.
- [x] Bounded gains, actual awarded deltas, and gradually increasing exercise eligibility.
- [x] Demo selection considers recent exercises, eligible focus, and weaker skills.
- [x] Live-model next-exercise context includes the observation and follow-up answer.
- [x] Duplicate completion does not duplicate progress credit.
- [ ] Evaluate real-model coaching quality and calibrate progression with users.

### Phase 5 — Progress and history

- [x] User-specific skill visualization, chapter, and completed-moment count.
- [x] Saved field notes and full observation/follow-up revisit.
- [x] Resume an unfinished observation.
- [x] No streaks, leaderboard, notifications, or engagement tracking.

### Phase 6 — Optional voice

- [x] SpeechInput and SpeechOutput service interfaces.
- [x] Optional browser STT with disclosure, permission-error handling, and typing fallback.
- [x] Explicit browser read-aloud and stop controls; no autoplay.
- [x] Clean up speech when leaving a screen.
- [ ] Real microphone/speaker tests across supported devices.
- [ ] Local open-source speech implementations (future enhancement, not included).

### Phase 7 — Polish and tests

- [x] Desktop and 390px mobile rendering inspected; horizontal overflow checks pass.
- [x] Keyboard focus styles, form labels, landmarks, reduced-motion support.
- [x] Contrast adjustments following automated accessibility checks.
- [x] 7 unit / adapter / configuration tests pass.
- [x] 9 real MongoDB integration tests pass, including concurrent operations and disk persistence after database restart.
- [x] 5 browser / API integration tests pass.
- [x] TypeScript check passes.
- [x] Optimized production build passes; the 5 browser/API tests also pass against the production server.
- [x] Additional simulated HTTPS iframe smoke test verifies demo login, protected practice, secure cross-site cookie headers, and logout.
- [x] Accurate README, architecture document, and this development log.

## Verification detail

| Area                         | Result                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account lifecycle            | Registration, wrong password, correct login, logout, deletion tested in browser                                                                                                            |
| Protection and isolation     | Anonymous API rejection, protected-page redirect, cross-user read/write rejection tested                                                                                                   |
| Complete observation         | Demo exercise → outside → reflection → follow-up → completion → growth → history tested                                                                                                    |
| Refresh                      | Outside-stage recovery and same-tab reflection draft recovery tested                                                                                                                       |
| Input boundaries             | Empty, whitespace-only, very long input, invalid duration, invalid stage tested; very short demo analysis covered                                                                          |
| Duplicate writes             | Repeated session start resumes; repeated completion does not award twice                                                                                                                   |
| Model adapters               | Real HTTP requests to simulated local/hosted compatible endpoint; exact messages/authentication and invalid responses tested                                                               |
| Missing model setup          | Local/hosted setup failures tested; no fallback                                                                                                                                            |
| Database failure             | Initialization failure surfaced without replacing/resetting storage                                                                                                                        |
| Mobile                       | 390px home and registration overflow checks; screenshots inspected                                                                                                                         |
| Accessibility                | Automated WCAG A/AA checks on public pages and selected exercise/completion screens; no detected violations in checked states                                                              |
| Offline assets               | Public screens load with all non-app origins blocked; no external asset requests observed                                                                                                  |
| Real inference               | **Not verified** — no model/credentials supplied                                                                                                                                           |
| Real voice                   | Dictation state machine covered by unit tests (stop, 5-second silence, duplicate results, browser restarts); real microphone/audio behavior **not verified** — needs target-device testing |
| Complete offline local stack | **Not verified with an actual model**; architecture has no required WAN assets                                                                                                             |

## Technical decisions

- Centralized Tailwind v4 theme/component styles and shared `lib/data`; no duplicated per-page styling system.
- Local MongoDB + scrypt + opaque sessions avoids dependence on a cloud auth provider; Atlas supplies hosted database storage.
- Node runtime with a cached connection pool; persistent local MongoDB volume or remote Atlas database, independent of the app filesystem.
- OpenAI-compatible protocol for both local and hosted adapters, without a provider-specific SDK.
- Combine feedback and one question in one model response, reducing latency and screen time.
- Keep a session's provider fixed and disclose each mode; guided-demo accounts always use deterministic rules.
- Use tab-local draft storage while writing and server persistence on submission. No sensitive drafts in URLs.
- Use transactions for completion/progression and recheck state after inference to avoid duplicate awards.
- Deploy all image/font assets locally. Disable Next.js telemetry in npm scripts.
- Optional voice is explicitly separate from core observation, and never activates automatically.

## Known issues / production limitations

- Live hosted/local coaching is not enabled or verified in the delivered preview; deterministic demo mode is the active default.
- Model output validation and literal evidence checks do not guarantee correct, safe, or insightful coaching. Live evaluation remains necessary.
- Browser STT/TTS availability and vendor processing vary; local voice engines are not included.
- No email verification, password recovery, MFA, or external security review.
- The local development MongoDB volume needs disk security and backups; Atlas credentials, network access, and live connectivity remain to be configured/verified.
- Demo records use MongoDB TTL cleanup, which is asynchronous; access expiry is checked explicitly.
- History UI shows the latest 100 sessions; pagination is not implemented.
- Drafts not yet submitted do not follow the user to another device/browser tab.
- Account creation does not migrate demo notes (disclosed on the registration screen).
- There is no service worker or disconnected browser-only mode; a local app/model server must remain reachable.
- Automated checks do not replace manual assistive-technology or real outdoor usability testing.
- No versioned schema migrations or automatic SQLite-to-MongoDB import. Transactions and rate limits are now database-backed across application instances; hosting-specific scaling still requires testing.

## Next actions

1. Configure `HOSTED_LLM_BASE_URL`, `HOSTED_LLM_MODEL`, and `HOSTED_LLM_API_KEY` in server secrets, set `LLM_PROVIDER=hosted`, and restart.
2. Validate real hosted feedback, retry behavior, latency, costs, and privacy requirements.
3. Repeat with a local model and no WAN access.
4. Test optional speech on target mobile browsers; evaluate observation exercises with real users.
5. Harden authentication, deployment, backups, and recovery before opening public registration broadly.

## Build checkpoints

1. Foundation and data services implemented first.
2. Deterministic session state machine and provider contracts added.
3. Responsive screens connected to persisted API flow.
4. Initial browser journey, authentication, isolation, and production compilation verified.
5. Added accessibility fixes, explicit speech controls, bounded exercise difficulty, documentation, and failure/asset tests.

## MongoDB replacement checkpoint

- [x] Remove SQLite runtime and type dependencies; add the official MongoDB driver.
- [x] Refactor authentication, layouts, APIs, progress, and sessions to asynchronous repositories.
- [x] Use cached connections and initialize unique/TTL indexes.
- [x] Preserve atomic completion/progress and account deletion with transactions.
- [x] Use a per-user revision write to serialize account deletion against concurrent child writes.
- [x] Add persistent single-node replica-set Docker Compose configuration and local environment settings.
- [x] Add hosted Atlas environment template; hosted mode fails clearly without its URI.
- [x] Keep the Windows `cross-env` fix and LLM settings unchanged.
- [x] Preserve old SQLite files; do not automatically migrate or upload them.
- [x] Run the 7 unit/config tests, 9 database integration tests, 5 browser/API tests, typecheck, and production build with the MongoDB repository.
- [x] Update DATABASE.md, README, architecture, and privacy/setup copy.
- [ ] Verify deployment against an actual Atlas cluster once credentials/network access are supplied.
- [ ] Run Docker Compose on the user's target machine (Docker is unavailable in this sandbox; MongoDB itself was tested through a real temporary replica set).
- [ ] Migrate legacy SQLite accounts/history if requested; not performed by this change.

The sandbox browser checks use a disposable test replica set, not Atlas. The persistent local deployment is the Docker named-volume setup. No live Atlas connection is claimed.

## Voice dictation checkpoint

- [x] Dictation continues until the user stops it or 5 seconds pass without new speech results (short pauses do not end the session).
- [x] The recognition adapter rebuilds its transcript in place from the browser's cumulative result list and emits the complete transcript on every update; the UI replaces rather than appends it, so re-fired/revised browser results cannot repeat phrases.
- [x] The browser closing recognition on its own is restarted transparently without losing or duplicating committed text.
- [x] A manual edit of the text ends dictation instead of letting late results overwrite typed words.
- [x] Silence auto-stop, manual stop idempotence, restart, duplicate results, and fatal-error behavior covered in `tests/voice.test.ts`.
- [ ] Real microphone and speaker behavior on target mobile browsers remains unverified in this environment.

## Logging checkpoint

- [x] `lib/log.ts` leveled logger (debug/info/warn/error/silent via `LOG_LEVEL`) with recursive key-based redaction and curated `errorInfo` sanitization.
- [x] Debug logs across the codebase: MongoDB connection/transactions/rate limits, auth and token lifecycle, API request outcomes, LLM adapter calls (metadata only — no prompts/reflections), voice dictation state.
- [x] morgan Apache “combined” access logs for hosted environments (`APP_ENV=hosted`, `LOG_HTTP` override) via `proxy.ts` for pages and the API route handler for `/api` (final status + content length + duration debug line).
- [x] `instrumentation.ts` boot summary and `onRequestError` capture.
- [x] `.env.example` / `.env.hosted.example`, README, and architecture document the settings and privacy rules.
- [x] Unit tests for level filtering, redaction, error sanitization, hosted gating, and combined-format output.

## Installed-MongoDB (no Docker) checkpoint

- [x] Reproduced the standalone `DatabaseSetupError` and verified the no-Docker switch end to end: the same data directory started with `--replSet rs0` + `rs.initiate` becomes a writable primary and **keeps all existing records**.
- [x] Error text now leads with the no-Docker fix (replSet in mongod.cfg + `rs.initiate`) instead of suggesting only Docker/Atlas.
- [x] `scripts/mongodb-enable-replicaset.ps1` (Windows, Administrator PowerShell) and `scripts/mongodb-enable-replicaset.sh` (macOS/Linux): back up config, enable `replication.replSetName=rs0`, restart the service, initialize once, verify PRIMARY. Idempotent and explicit about already-initialized/foreign replica sets.
- [x] DATABASE.md section 2 documents manual Windows steps, hand-run `mongod --replSet`, verification, and troubleshooting; README and Settings/global-error copy point to it.
