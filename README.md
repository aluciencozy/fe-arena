# FE Arena

FE Arena is an unofficial UCF Computer Science Foundation Exam study tool. It is an original study experience, not an official UCF product and not affiliated with or endorsed by UCF. It does not reproduce exam questions or answer keys.

## MVP

- Private host-configured two-seat rooms with a stable guest seat and refresh recovery.
- Public random-player queue with a five-minute maximum wait and five-minute question timer.
- Five-round server-authoritative matches, explicit confirmed leave/forfeit, 30-second disconnect pause, up-to-30-second answer reveals with per-seat skip, rematch, and current-run topic feedback.
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

The frontend runs at `http://localhost:5173`; the backend runs at `http://localhost:3001`. Copy `.env.example` files when changing those defaults:

- `frontend/.env.example`: `VITE_SOCKET_URL`, and optional `VITE_SUPABASE_URL` plus `VITE_SUPABASE_PUBLISHABLE_KEY` for Auth only
- `backend/.env.example`: `NODE_ENV`, `PORT`, exact `FRONTEND_ORIGINS`, `TRUST_PROXY`, optional `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` for server-side question-bank/loading and persistence, and optional `SUPABASE_PUBLISHABLE_KEY` for server-side Auth token verification

## Architecture

- `shared/domain.ts` is the framework-free domain boundary. It defines discriminated question types, stable topic IDs, Zod schemas, normalization, grading, seeded selection, score calculation, and tie-breakers.
- `backend/src/data/questions.ts` is the reviewed in-memory fallback. `question-bank.service.ts` loads the same validated content from the server-only Supabase `question_bank` repository when configured, without changing match orchestration.
- `backend/src/services/match.service.ts` owns the explicit state machine and absolute deadlines. The server selects questions, accepts exactly one submission per seat, grades privately, and calculates timing and scores.
- `backend/src/services/room.service.ts` owns stable guest seats, reconnect tokens, and room isolation. `queue.service.ts` owns FIFO public matching and expiry. `solo.service.ts` reuses the repository and grading engine for current-run-only practice.
- `backend/src/sockets/handlers.ts` is the validated Socket.IO contract for room, queue, match, chat, reconnect, state-request, solo, and error events. Incoming payloads are parsed with Zod before services run.
- `frontend/` contains the responsive React/Vite UI and a small Zustand cache. It never selects a live-match question, grades a live answer, or supplies a live score. `/practice/c` uses Monaco plus a fresh Web Worker and public WASM C toolchain for local-only execution. Mixed coding rounds use the same browser runner and send no source or compiler traffic to the server. Optional Supabase Auth uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the frontend never receives or bundles `SUPABASE_SECRET_KEY`.

### Synchronization and safety

Match states carry absolute question, countdown, and reveal deadlines. A temporary disconnect changes the match to `PAUSED`, clears timers, and extends the saved deadline by the actual pause duration on reconnect. Each reveal can last up to 30 seconds while both seats review the answer and reasoning; either seat can skip, but the next round starts early only after both seats skip. Expiry becomes an explicit `EXPIRED` outcome; an intentional leave becomes `FORFEIT`. A reconnect token restores the same seat rather than creating a new guest.

The server emits a public question view without answer, explanation, assumptions, provenance, or opponent answers. Solution fields are exposed only during reveal or terminal result views, and current-run summaries include per-topic attempts, correctness, accuracy, score, and response timing. Late, duplicate, wrong-question, malformed, and client-invented submissions for server-graded questions are rejected. C prompts show a reviewed, syntax-preserving code block and are graded against curated expected output; FE Arena never compiles or executes arbitrary submitted code on the server. The `/practice/c` route is a temporary standalone lab that joins a reviewed prefix, locked signature, browser-edited body, and test harness, then compiles/runs only inside a timed WebAssembly worker. Mixed live coding rounds reuse that worker contract, use a fixed 60-second server deadline, and send only typed progress and completion results; browser-reported outcomes have no anti-cheat guarantee. Graph prompts show a deterministic unweighted directed or undirected diagram; BFS/DFS use preorder and displayed node-order neighbor traversal, adjacency returns direct neighbors in displayed node order, reachability follows arrows, and shortest paths count unit-weight edges.

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

Every server-bank item carries an answer, explanation, assumptions, and provenance; browser coding fixtures are separately defined in `shared/coding-problems.ts` with a locked signature and deterministic harness. Content is validated at module load and in tests for schema shape, unique IDs, option/sequence/graph references, coding fixtures, and complete type coverage. Apply migrations in order through `supabase/migrations/202603080007_question_bank_publishing_policy.sql`, then run `cd backend && npm run seed:questions` to idempotently upsert the reviewed bank, including its `published` and `version` fields, when the server-only variables are configured. The reviewed bank retains its earlier content and now includes 19 graph questions plus 38 browser coding problems. Graph questions are eligible in public queue, private multiplayer, and solo runs. Coding questions remain excluded from the public queue and solo runs, but a host may opt a private playlist into mixed rounds; the server selects and announces the coding round, gates its start on browser capability readiness, controls the deadline and completion ordering, and receives only typed progress/results over Socket.IO. Browser-reported coding results are accepted without an anti-cheat guarantee. Existing C rows without a stored code remain loadable through the compatibility mapper; new C rows always include curated code. Graph content is presentation-only: users cannot edit graphs or submit graph code. If either server-side question-bank variable is absent, local development and tests use the in-memory fallback. New content requires normal PR review plus validation. The public UCF index and supplied reference PDFs are provenance anchors for topic planning only: https://www.cs.ucf.edu/registration/exm/. They are not a license to copy, and FE Arena does not claim to match any future exam format.

## Production preparation

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for platform-neutral static frontend/API build and start commands, production configuration validation, health/readiness checks, reverse-proxy/WebSocket requirements, and the explicit captain-owned hosting, TLS, Auth, secret, migration, and monitoring steps. No production deployment or credential configuration is performed by this repository workflow.

## Verification

Run the repository-wide Prettier pass (dependency, build, and secret files are ignored) with:

```bash
prettier --write --ignore-unknown .
prettier --check --ignore-unknown .
```

The SQL migrations are reviewed as SQL text because the repository's Prettier installation has no SQL parser.

```bash
cd backend && npm run typecheck && npm test
cd ../frontend && npm run lint && npm run build
```

The backend tests cover normalization, all seven question types, Supabase row compatibility, seeded selection, score boundaries, hidden answers, reveal deadlines and skips, topic summaries, solo deadline handling, ready/countdown transitions, graph/C lifecycle submissions, duplicate-safe service behavior, queue expiry/cancellation, room isolation, reconnect seat restoration, Auth token verification, private history authorization and isolation, account progress aggregation, guest fallback, production configuration validation, exact HTTP/Socket.IO origin checks, security headers, request-size and API/Socket.IO abuse limits, health/readiness responses, and runtime shutdown. Focused frontend runner tests cover source generation, machine-readable result parsing, worker failures, and timeout termination. Production hosting needs a Node process for the backend and a static host/reverse proxy for the Vite build; see [`DEPLOYMENT.md`](DEPLOYMENT.md) for those requirements. Live room and match state are intentionally in memory for this MVP. Supabase question loading and terminal persistence use the server-only secret key. Authenticated terminal summaries use server-verified Auth IDs, while local development without Supabase uses an in-memory history fallback.

## Optional Supabase Auth and account history

Guest play is the default and does not require any Supabase variable. When configured, the frontend signs users in with email/password through Supabase Auth and sends the resulting access token through the existing Socket.IO handshake and the authenticated history HTTP request. The backend verifies that token with Supabase before associating the verified `auth_user_id` with the opaque reconnect-derived guest identity; client-supplied user IDs are ignored.

Manual captain setup is not performed by this task. See [`DEPLOYMENT.md`](DEPLOYMENT.md#captain-owned-production-steps) for the owner-run hosting, DNS/TLS, Supabase Auth, environment-secret, migration, and monitoring steps. Guest play needs no Auth provider or Supabase configuration.

Account history is private and server-authorized. See [`backend/PERSISTENCE.md`](backend/PERSISTENCE.md) for its persisted fields, excluded content, in-memory fallback, and RLS boundary.

## Explicit exclusions

No profiles, rankings, social sharing, payments, broad account settings, AI grading, invasive anti-cheat, or arbitrary server-side code execution are included in this pass.
