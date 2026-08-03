# FE Arena frontend

React/Vite client for the FE Arena unofficial computer science study tool. Run `npm install && npm run dev` from this directory. In another terminal from this directory, run `cd ../backend && npm run dev` before using Solo practice or Public queue. Set `VITE_SOCKET_URL` when the Socket.IO backend is not at `http://localhost:3001`; the app reports an actionable connection error if the backend is unavailable.

The client renders public question views and server state; it does not select questions, grade submissions, or calculate scores for live matches. The separate `/practice/c` route compiles and runs reviewed C fixtures locally in a fresh timed Web Worker without uploading code. Room recovery uses a session-scoped reconnect token stored by the Zustand-backed session store.
