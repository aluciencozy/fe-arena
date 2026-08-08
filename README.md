# FE Arena

FE Arena is an unofficial UCF Computer Science Foundation Exam study tool. It is an original study experience, not an official UCF product and not affiliated with or endorsed by UCF. It does not reproduce exam questions or answer keys.

## MVP

- Private host-configured two-seat rooms with a stable guest seat and refresh recovery.
- Public random-player queue with a five-minute maximum wait and five-minute question timer.
- Five-round server-authoritative matches, explicit confirmed leave/forfeit, 30-second disconnect pause, up-to-30-second answer reveals with per-seat skip, two-player rematches with fresh question selection, and current-run topic feedback.
- Solo practice using the same question repository, normalization, grading, and scoring functions, with guest-first current-run feedback. Optional signed-in 1v1 matches provide private account history/progress.
- Original reviewed prompts across twelve topic families and seven domain question types: multiple choice, numeric, normalized short answer, curated C output tracing, ordered sequence, graph reasoning, and browser-only C practice.
- Collapsible room chat limited to one message per second.

## Local development

Requirements: Node.js 20+ and npm.

```bash
(cd shared && npm install)
(cd backend && npm install && npm run dev)
# in another terminal
(cd frontend && npm install && npm run dev)
```

The frontend runs at `http://localhost:5173`; the backend runs at `http://localhost:3001` and must be running to start Solo practice or Public queue. If it is unavailable, the affected screen shows an actionable error and retry path. Copy `.env.example` files when changing those defaults:

- `frontend/.env.example`: `VITE_SOCKET_URL`, and optional `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY` for Auth only
- `backend/.env.example`: `NODE_ENV`, `PORT`, exact `FRONTEND_ORIGINS`, `TRUST_PROXY`, optional `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` for server-side question-bank/loading and persistence, and optional `SUPABASE_PUBLISHABLE_KEY` for server-side Auth token verification

If the frontend reports that it cannot connect, verify the backend is reachable with `curl http://localhost:3001/healthz`. Check that `VITE_SOCKET_URL` points to that backend and that `FRONTEND_ORIGINS` exactly matches the browser origin (for example, `http://localhost:5173`).

### Local connection diagnosis

- Expected behavior: a guest who clicks Solo practice or Public queue connects to the backend, receives a Solo question or queue state, and can continue when the server is available.
- Setup: run the frontend at `http://localhost:5173` and the backend at `http://localhost:3001` with the documented development commands; the backend uses the guest in-memory fallback when server-only persistence variables are absent.
- Initiating trigger: click Solo practice or Public queue while the frontend attempts its first Socket.IO connection.
- Observed behavior before the fix: with no backend process listening on `localhost:3001`, `curl http://localhost:3001/healthz` returned connection refused and the browser surfaced a WebSocket connection error instead of completing the action.
- Visible symptom: the requested Solo or queue flow could not begin, and the unavailable backend was not actionable from the affected screen.
- Repeatability: this reproduced consistently whenever the backend was stopped before the guest action.
- Masking conditions: with the documented backend running, startup diagnostics showed port 3001 listening, `http://localhost:5173` allowlisted, and successful health and Socket.IO polling requests. A `127.0.0.1:5173` origin was correctly rejected, so the documented localhost path was not a CORS failure. A temporary proxy that blocked WebSocket upgrades but allowed polling reproduced the transport-specific failure; WebSocket-first connection now falls back to polling.

## Architecture

- `shared/domain.ts` is the framework-free domain boundary. It defines discriminated question types, stable topic IDs, Zod schemas, normalization, grading, seeded selection, score calculation, and tie-breakers.
- `backend/src/data/questions.ts` is the reviewed in-memory fallback. `question-bank.service.ts` loads the same validated content from the server-only Supabase `question_bank` repository when configured, without changing match orchestration.
- `backend/src/services/match.service.ts` owns the explicit state machine and absolute deadlines. The server selects questions, accepts exactly one submission per seat, grades privately, and calculates timing and scores.
- `backend/src/services/room.service.ts` owns stable guest seats, reconnect tokens, and room isolation. `queue.service.ts` owns FIFO public matching and expiry. `solo.service.ts` reuses the repository and grading engine for current-run-only practice; socket disconnect or terminal completion clears the in-memory Solo session, so Solo is not resumable or persisted.
- `backend/src/sockets/handlers.ts` is the validated Socket.IO contract for room, queue, match, chat, reconnect, state-request, solo, and error events. Incoming payloads are parsed with Zod before services run.
- `frontend/` contains the responsive React/Vite UI and a small Zustand cache. It never selects a live-match question, grades a live answer, or supplies a live score. `/practice/c` uses Monaco plus a shared prewarmed Web Worker and public WASM C toolchain for local-only execution. Mixed coding rounds use the same browser runner and send no source or compiler traffic to the server. Optional Supabase Auth uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the frontend never receives or bundles `SUPABASE_SECRET_KEY`.

### Synchronization and safety

Match states carry absolute question, countdown, and reveal deadlines. Private matches use the selected question timer for both coding and non-coding rounds; the public queue uses its fixed five-minute question timer. A temporary disconnect changes the match to `PAUSED`, clears timers, and extends the saved deadline by the actual pause duration on reconnect. Each reveal can last up to 30 seconds while both seats review the answer and reasoning; either seat can skip, but the next round starts early only after both seats skip. A rematch keeps both seats on the results screen until both request it, then returns both to ready-up with a fresh server-selected question pool that avoids earlier questions when enough eligible questions exist. Expiry becomes an explicit `EXPIRED` outcome; an intentional leave becomes `FORFEIT`. A reconnect token restores the same seat rather than creating a new guest.

The server emits a public question view without answer, explanation, assumptions, provenance, or opponent answers. After the round answer phase, participant-only reveal and terminal result views show the correct answer, each player's submitted answer, and each player's correctness; coding answers use the question-type-specific pass/outcome contract without exposing server secrets. Current-run summaries include per-topic attempts, correctness, accuracy, score, and response timing. Late, duplicate, wrong-question, malformed, and client-invented submissions for server-graded questions are rejected. C prompts show a reviewed, syntax-preserving code block and are graded against curated expected output; FE Arena never compiles or executes arbitrary submitted code on the server. The `/practice/c` route is a temporary standalone lab that joins a reviewed prefix, locked signature, browser-edited body, and test harness, then compiles/runs only inside a timed WebAssembly worker. The browser reports unmeasured worker, SDK, runtime, compiler, compilation, and execution phases, and compile, runtime, and timeout failures remain retryable. Solo, public queue, and private mixed coding rounds reuse that worker contract, prewarm it before the round, require runtime capability and worker readiness, and send only typed progress and completion results; browser-reported outcomes have no anti-cheat guarantee. Standard private quiz rooms remain usable without the coding capability, while coding-enabled private rooms require both players to report readiness. Graph prompts show a deterministic unweighted directed or undirected diagram; BFS/DFS use preorder and displayed node-order neighbor traversal, adjacency returns direct neighbors in displayed node order, reachability follows arrows, and shortest paths count unit-weight edges.

Scores are `1,000` correctness points plus a maximum `300` speed bonus. A wrong answer is zero. Correct count wins; ties compare server-computed total score, then aggregate response time, then remain a draw.

## Content and provenance

The bank covers:

1. Arrays and C memory
2. Singly linked lists
3. Stacks
4. Queues
5. Binary trees and BSTs
6. AVL trees
7. Heaps and priority queues
8. Hash tables
9. Tries
10. Sorting
11. Recursion
12. Algorithm analysis and representation

Every server-graded bank item carries an answer, explanation, assumptions, and provenance; browser coding fixtures are separately defined in `shared/coding-problems.ts` with a locked signature and deterministic harness. Content is validated at module load and in tests for schema shape, unique IDs, option/sequence/graph references, coding fixtures, and complete type coverage. Apply migrations in order through `supabase/migrations/202603080007_question_bank_publishing_policy.sql`, then run `cd backend && npm run seed:questions` to idempotently upsert the reviewed bank when the server-only variables are configured. The seed preserves legacy `q-fe-*` rows for history but retires them from play, so the live bank matches the structured repository bank. The reviewed bank retains its earlier content and now includes expanded graph and browser coding coverage. See [`backend/src/data/QUESTION_BANK_POLICY.md`](backend/src/data/QUESTION_BANK_POLICY.md) for difficulty tiers and non-destructive publication and retirement rules. Graph questions and coding questions are eligible in public queue, private multiplayer, and solo runs. Coding-enabled modes require a supported runtime capability and successful browser-worker prewarm; standard private quiz rooms remain available without it. The server selects and announces coding rounds, controls the deadline and completion ordering, and receives only typed progress/results over Socket.IO. Browser-reported coding results are accepted without an anti-cheat guarantee. Existing C rows without a stored code remain loadable through the compatibility mapper; new C rows always include curated code. Graph content is presentation-only: users cannot edit graphs or submit graph code. If either server-side question-bank variable is absent, local development and tests use the in-memory fallback. New content requires normal PR review plus validation. The public UCF index and supplied reference PDFs are provenance anchors for topic planning only: https://www.cs.ucf.edu/registration/exm/. They are not a license to copy, and FE Arena does not claim to match any future exam format.

## Production preparation

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for platform-neutral static frontend/API build and start commands, production configuration validation, health/readiness checks, reverse-proxy/WebSocket requirements, and the explicit captain-owned hosting, TLS, Auth, secret, migration, and monitoring steps. No production deployment or credential configuration is performed by this repository workflow.

## Verification

Run the single CI-equivalent repository gate with:

```bash
npm run ci
```

It runs backend typecheck/tests followed by frontend lint/tests/build. For formatting, run the repository-wide Prettier pass (dependency, build, and secret files are ignored) with:

```bash
prettier --write --ignore-unknown .
prettier --check --ignore-unknown .
```

The SQL migrations are reviewed as SQL text because the repository's Prettier installation has no SQL parser.

```bash
cd backend && npm run typecheck && npm test
cd ../frontend && npm run lint && npm test && npm run build
```

The backend tests cover normalization, all seven question types, Supabase row compatibility, seeded selection, score boundaries, hidden answers, answer privacy and authorization, reveal deadlines and skips, two-sided rematch coordination, fresh question selection, topic summaries, solo deadline handling, disconnect cleanup and non-resumability, ready/countdown transitions, graph/C lifecycle submissions, duplicate-safe service behavior, queue expiry/cancellation, room isolation, reconnect seat restoration and rematch races, Auth token verification, private history authorization and isolation, account progress aggregation, guest fallback, production configuration validation, exact HTTP/Socket.IO origin checks, security headers, request-size and API/Socket.IO abuse limits, health/readiness responses, and runtime shutdown. Focused frontend tests cover Socket.IO transport fallback, actionable connection and retry messages, source generation, machine-readable result parsing, shared worker prewarm status, worker failures, and timeout termination. The closest browser smoke was attempted with `chrome-devtools-axi`, but this environment closed the browser target before a page snapshot; no browser success is claimed. Production hosting needs a Node process for the backend and a static host/reverse proxy for the Vite build; see [`DEPLOYMENT.md`](DEPLOYMENT.md) for those requirements. Live room and match state are intentionally in memory for this MVP. Supabase question loading and terminal persistence use the server-only secret key. Authenticated terminal summaries use server-verified Auth IDs, while local development without Supabase uses an in-memory history fallback.

## Optional Supabase Auth and account history

Guest play is the default and does not require any Supabase variable. When configured, the frontend signs users in with email/password through Supabase Auth and sends the resulting access token through the existing Socket.IO handshake and the authenticated history HTTP request. The backend verifies that token with Supabase before associating the verified `auth_user_id` with the opaque reconnect-derived guest identity; client-supplied user IDs are ignored.

Manual captain setup is not performed by this task. See [`DEPLOYMENT.md`](DEPLOYMENT.md#captain-owned-production-steps) for the owner-run hosting, DNS/TLS, Supabase Auth, environment-secret, migration, and monitoring steps. Guest play needs no Auth provider or Supabase configuration.

Account history is private and server-authorized. See [`backend/PERSISTENCE.md`](backend/PERSISTENCE.md) for its persisted fields, excluded content, in-memory fallback, and RLS boundary.

## Explicit exclusions

No profiles, rankings, social sharing, payments, broad account settings, AI grading, invasive anti-cheat, or arbitrary server-side code execution are included in this pass.
