# FE Arena frontend

React/Vite client for the FE Arena unofficial computer science study tool. Run `npm install && npm run dev` from this directory. For backend startup, `VITE_SOCKET_URL`, and connection troubleshooting, see the root [`Local development`](../README.md#local-development) guide.

The client renders public question views and server state; it does not select questions, grade submissions, or calculate scores for live matches. The separate `/practice/c` route compiles and runs reviewed C fixtures locally in a shared prewarmed timed Web Worker without uploading code; the root README documents its unmeasured phases and retry behavior. Room recovery uses a session-scoped reconnect token stored by the Zustand-backed session store.
