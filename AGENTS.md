# AGENTS.md

## Project Snapshot

Guess the OST is a two-player real-time music guessing game.

- `frontend/`: React + Vite + TypeScript, Tailwind CSS, shadcn-style UI, Zustand, Socket.io client.
- `backend/`: Node + TypeScript + Express + Socket.io.
- Current playable mode is `anime`; `video-game` is intentionally blocked in the UI.
- Runtime room, game, and queue state is in memory on the backend.

## Common Commands

Run commands from the matching package directory:

- Frontend dev: `cd frontend && npm run dev`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build/typecheck: `cd frontend && npm run build`
- Backend dev: `cd backend && npm run dev`
- Backend typecheck: `cd backend && npx tsc --noEmit`

The frontend defaults to `http://localhost:5173`.
The backend defaults to `http://localhost:3001`.
Set `VITE_SOCKET_URL` for the frontend if the Socket.io server is elsewhere.

## Important Flows

- Private lobby:
  - Home creates a generated room code through `room:create-private`.
  - The creator selects anime title IDs.
  - Joiners enter the room code and inherit the host's selected anime pool.
- Public queue:
  - Home emits `queue:join`.
  - Backend matches the first two live players per mode.
  - Queue matches use the full catalog for the selected mode.
- Room/game:
  - `/room/:id` joins the socket room with `room:join`.
  - Both players must ready up before the game starts.
  - Countdown and round timers are server-authoritative.

## Files Worth Checking First

- Frontend home flow: `frontend/src/pages/Home.tsx`
- Room/game UI: `frontend/src/pages/Room.tsx`
- Socket singleton: `frontend/src/lib/socket.ts`
- Room socket hook: `frontend/src/hooks/useSocket.ts`
- Backend room events: `backend/src/sockets/room.handlers.ts`
- Backend room state: `backend/src/services/room.service.ts`
- Backend queue state: `backend/src/services/queue.service.ts`
- Backend game state: `backend/src/services/game.service.ts`
- Catalog data: `frontend/src/data/catalog.ts` and `backend/src/data/catalog.ts`
- Shared local types: `frontend/src/types/index.ts` and `backend/src/types/index.ts`

## Notes For Future Agents

- Prefer keeping frontend and backend catalog IDs in sync.
- Do not reintroduce implicit room creation from `room:join`; private rooms should be created explicitly.
- Be careful with the shared frontend socket. React StrictMode can mount/unmount effects twice in dev, so delayed disconnect behavior is intentional.
- Keep comments sparse and useful. The codebase is small; avoid broad refactors unless the task requires them.
