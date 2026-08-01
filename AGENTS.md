# AGENTS.md

## Project snapshot

FE Arena is an unofficial UCF Computer Science Foundation Exam study tool. It is an original black/dark-grey/gold React/Vite + Node/Express + Socket.IO application; it is not affiliated with UCF. Runtime room, match, queue, solo, and reconnect state is in memory for the MVP.

## Common commands

Run from the matching package directory:

- Frontend dev: `cd frontend && npm run dev`
- Frontend lint/build: `cd frontend && npm run lint && npm run build`
- Backend dev: `cd backend && npm run dev`
- Backend typecheck/tests: `cd backend && npm run typecheck && npm test`

Defaults are frontend `http://localhost:5173` and backend `http://localhost:3001`; see `frontend/.env.example` and `backend/.env.example`.

## Authoritative boundaries

- Domain contracts and pure grading: `shared/domain.ts`.
- Reviewed file-backed bank and schema checks: `backend/src/data/questions.ts` and `backend/src/services/question-bank.service.ts`.
- Match state machine/deadlines/scoring: `backend/src/services/match.service.ts`.
- Stable seats/reconnect tokens: `backend/src/services/room.service.ts`.
- FIFO public queue and five-minute expiry: `backend/src/services/queue.service.ts`.
- Validated Socket.IO event surface: `backend/src/sockets/handlers.ts`.
- Responsive product UI: `frontend/src/pages/Home.tsx`, `frontend/src/pages/Room.tsx`, and `frontend/src/pages/Solo.tsx`.

## Durable implementation notes

- The server is the authority for question selection, grading, submission locks, timers, and scores. Public question payloads omit solutions until reveal/results.
- Reconnect restores the same guest seat with the session token. Active matches pause both seats for 30 seconds and safely resolve to expiry if the seat does not return.
- Private config is topic pool, five rounds, and a 30–300 second question timer. Public queue uses all reviewed topics, five rounds, and a five-minute question timer.
- Add content only with answer, explanation, assumptions, provenance, schema validation, and tests. Graph fixtures are deterministic presentation-only diagrams with bounded BFS/DFS/adjacency/reachability/shortest-path semantics; C fixtures include curated code text and expected output, never executable user code. Reference materials inform topic planning only; never copy exam text or answer keys.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file, command, or document instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
