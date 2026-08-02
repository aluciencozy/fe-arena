# AGENTS.md

## Project snapshot

FE Arena is an unofficial UCF Computer Science Foundation Exam study tool. It is an original black/dark-grey/gold React/Vite + Node/Express + Socket.IO application; it is not affiliated with UCF. Live room, match, queue, solo, and reconnect state is in memory for the MVP; optional signed-in account history/progress has a server-backed path with an in-memory fallback.

## Common commands

Run from the matching package directory:

- Frontend dev: `cd frontend && npm run dev`
- Frontend lint/build: `cd frontend && npm run lint && npm run build`
- Backend dev: `cd backend && npm run dev`
- Backend typecheck/tests: `cd backend && npm run typecheck && npm test`

Defaults are frontend `http://localhost:5173` and backend `http://localhost:3001`; see `frontend/.env.example` and `backend/.env.example`.

## Authoritative boundaries

- Domain contracts and pure grading: `shared/domain.ts`.
- Reviewed question content, schema checks, and Supabase loader/fallback: `backend/src/data/questions.ts`, `backend/src/services/question-bank.service.ts`, and the ordered question-bank migrations in `supabase/migrations/`.
- Match state machine/deadlines/scoring: `backend/src/services/match.service.ts`.
- Stable seats/reconnect tokens: `backend/src/services/room.service.ts`.
- FIFO public queue and five-minute expiry: `backend/src/services/queue.service.ts`.
- Validated Socket.IO event surface and server-verified Auth seat linking: `backend/src/sockets/handlers.ts`, `backend/src/services/auth.service.ts`, and `backend/src/services/room.service.ts`.
- Optional account history/progress persistence and aggregation: `backend/src/persistence/account-history.ts`, `backend/src/services/account-history.service.ts`, and `supabase/migrations/202603080005_account_history.sql`.
- Responsive product UI: `frontend/src/pages/Home.tsx`, `frontend/src/pages/Room.tsx`, `frontend/src/pages/Solo.tsx`, browser C practice `frontend/src/pages/CPractice.tsx`, and optional account view `frontend/src/pages/Account.tsx`.

## Durable implementation notes

- The server is the authority for question selection, grading, submission locks, timers, and scores. Public question payloads omit solutions until reveal/results.
- Reconnect restores the same guest seat with the session token. Active matches pause both seats for 30 seconds and safely resolve to expiry if the seat does not return.
- Private match configuration and mixed coding-round behavior: `README.md`, `shared/domain.ts`, and `backend/src/services/match.service.ts`. Public queue uses all reviewed topics, five rounds, and a five-minute question timer.
- Add server-graded content only with answer, explanation, assumptions, provenance, schema validation, and tests. Graph fixtures are deterministic presentation-only diagrams with bounded BFS/DFS/adjacency/reachability/shortest-path semantics. Browser coding fixtures live in `shared/coding-problems.ts`, use locked signatures and deterministic harnesses, and execute only in a timed WebAssembly worker; no user code runs on the server. Reference materials inform topic planning only; never copy exam text or answer keys.
- Seed Supabase content with `cd backend && npm run seed:questions` when both server-only Supabase variables are configured.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file, command, or document instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
