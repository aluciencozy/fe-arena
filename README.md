# FE Arena

FE Arena is an unofficial UCF Computer Science Foundation Exam study tool. It is an original study experience, not an official UCF product and not affiliated with or endorsed by UCF. It does not reproduce exam questions or answer keys.

## MVP

- Private host-configured two-seat rooms with a stable guest seat and refresh recovery.
- Public random-player queue with a five-minute maximum wait and five-minute question timer.
- Five-round server-authoritative matches, explicit confirmed leave/forfeit, 30-second disconnect pause, rematch, and current-run results.
- Solo practice using the same question repository, normalization, grading, and scoring functions.
- Original reviewed prompts across twelve topic families and five domain question types: multiple choice, numeric, normalized short answer, C output tracing, and ordered sequence.
- Collapsible room chat limited to one message per second.

## Local development

Requirements: Node.js `^20.19.0 || >=22.12.0` and npm.

```bash
(cd shared && npm install)
(cd backend && npm install && npm run dev)
# in another terminal
(cd frontend && npm install && npm run dev)
```

The frontend runs at `http://localhost:5173`; the backend runs at `http://localhost:3001`. Copy `.env.example` files when changing those defaults:

- `frontend/.env.example`: `VITE_SOCKET_URL`
- `backend/.env.example`: `PORT`, `FRONTEND_ORIGIN`

## Architecture

- `shared/domain.ts` is the framework-free domain boundary. It defines discriminated question types, stable topic IDs, Zod schemas, normalization, grading, seeded selection, score calculation, and tie-breakers.
- `backend/src/data/questions.ts` is the reviewed file-backed source. `question-bank.service.ts` is the repository boundary intended to be replaced by an account-backed database later without changing match orchestration.
- `backend/src/services/match.service.ts` owns the explicit state machine and absolute deadlines. The server selects questions, accepts exactly one submission per seat, grades privately, and calculates timing and scores.
- `backend/src/services/room.service.ts` owns stable guest seats, reconnect tokens, and room isolation. `queue.service.ts` owns FIFO public matching and expiry. `solo.service.ts` reuses the repository and grading engine without durable history.
- `backend/src/sockets/handlers.ts` is the validated Socket.IO contract for room, queue, match, chat, reconnect, state-request, solo, and error events. Incoming payloads are parsed with Zod before services run.
- `frontend/` contains the responsive React/Vite UI and a small Zustand cache. It never selects a question, grades an answer, or supplies a score.

### Synchronization and safety

Match states carry absolute `questionStartedAt`, `questionEndsAt`, and countdown deadlines. A temporary disconnect changes the match to `PAUSED`, clears timers, and extends the saved deadline by the actual pause duration on reconnect. Expiry becomes an explicit `EXPIRED` outcome; an intentional leave becomes `FORFEIT`. A reconnect token restores the same seat rather than creating a new guest.

The server emits a public question view without answer, explanation, assumptions, provenance, or opponent answers. Reveal and results are the first phases that include solution fields. Late, duplicate, wrong-question, malformed, and client-invented submissions are rejected. C prompts are text-traced against reviewed expected output; FE Arena never executes arbitrary submitted code.

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

Every item carries an answer, explanation, assumptions, and provenance. Content is validated at module load and in tests for schema shape, unique IDs, option/sequence references, and complete type coverage. New content requires normal PR review plus validation. The public UCF index and supplied reference PDFs are provenance anchors for topic planning only: https://www.cs.ucf.edu/registration/exm/. They are not a license to copy, and FE Arena does not claim to match any future exam format.

## Verification

```bash
cd backend && npm run typecheck && npm test
cd ../frontend && npm run lint && npm test && npm run build
```

The backend tests cover normalization, all five question types, seeded selection, score boundaries, hidden answers, ready/countdown transitions, duplicate-safe service behavior, queue expiry/cancellation, room isolation, and reconnect seat restoration. Production hosting needs a Node process for the backend and a static host/reverse proxy for the Vite build; runtime match state is intentionally in memory for this MVP.

## Explicit exclusions

No accounts, database, durable history, rankings, payments, public profiles, AI grading, invasive anti-cheat, or arbitrary code execution are included in this pass.
