# FE Arena deployment preparation

This document prepares deployable artifacts; it does **not** deploy FE Arena, apply Supabase migrations, configure Auth, or handle production credentials.

## Automated code preparation

1. Build the static client: `cd frontend && npm ci && npm run lint && npm run build`.
2. Install and start the API with Node.js 20+: `cd backend && npm ci && npm start`.
3. Serve `frontend/dist` from a static host. The backend is a long-running Node process and must not be replaced by a static function: live rooms, queues, reconnects, and matches remain in memory for this MVP.
4. Configure the backend health checks as `GET /healthz` (process liveness) and `GET /readyz` (persistence readiness). `/readyz` reports a safe `fallback` state when Supabase is intentionally omitted and returns HTTP 503 in production for that degraded configuration.

The browser C practice route requires cross-origin isolation for the Wasmer SDK. The frontend static host must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on frontend responses, including the HTML, JavaScript, and WebAssembly assets. Vite dev and preview servers set these headers automatically, and `frontend/public/_headers` supplies them for static hosts that support the `_headers` convention. Configure equivalent response headers for other hosts and verify `window.crossOriginIsolated === true` before enabling `/practice/c` traffic. Keep cross-origin API and Wasmer registry responses CORS-compatible with the frontend origin.

No secret is needed for a guest-only local or CI run. Backend startup prints only non-secret mode, configured frontend origins, port, proxy, persistence mode, guest-gameplay, and Auth diagnostics.

## Backend environment

Copy `backend/.env.example` into the hosting platform's secret/environment configuration (never commit a populated file):

- `NODE_ENV=production`
- `PORT` set to the platform-provided port
- `FRONTEND_ORIGINS` as comma-separated exact `https://` browser origins; wildcard and HTTP origins are rejected in production
- `TRUST_PROXY` set deliberately to the hosting proxy's boolean or hop count
- Optional, but required together for persistence/question loading: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
- Optional Auth verification: `SUPABASE_PUBLISHABLE_KEY` with `SUPABASE_URL`

`SUPABASE_SECRET_KEY` is server-only. It must never be put in `frontend/.env`, a `VITE_*` variable, browser storage, a client event, a log, or a public health response.

## Reverse proxy and WebSockets

Forward both HTTP and WebSocket upgrade traffic to the same backend process and preserve the `Origin` header. Use the frontend origin in `FRONTEND_ORIGINS`, not the proxy's internal address. Keep connection affinity/stickiness if the platform runs more than one backend: live state is in process memory and this MVP has no shared Socket.IO adapter. Forward `X-Forwarded-For` only through a trusted proxy and set `TRUST_PROXY` to match that topology; an incorrect value weakens IP-based rate controls.

The existing Socket.IO transport and path are unchanged. A proxy must allow `GET`/`POST` requests and `Upgrade: websocket` for Socket.IO polling/websocket traffic. Do not cache `/healthz`, `/readyz`, API responses, or Socket.IO traffic.

## Captain-owned production steps (not performed by this PR)

The captain/hosting owner must, after review and merge:

1. Create the hosting projects, choose regions/resources, configure the static frontend and Node start command, and set DNS/TLS certificates.
2. Store environment secrets in the hosting provider's secret manager and rotate them according to the provider's policy. Verify logs redact environment values.
3. Create/select the Supabase project, apply the ordered migrations in `supabase/migrations/` (including account history), and run the reviewed question seed through the approved production migration workflow.
4. Configure Supabase Auth providers and Site URL/redirect URL allowlists for the deployed frontend. Guest play needs no Auth provider.
5. Configure uptime checks for `/healthz` and `/readyz`, alerting, log retention/redaction, resource limits, restart policy, and WebSocket/connection metrics.
6. Perform a staged smoke test for guest private rooms, public queue, solo practice, reconnect, and optional authenticated history before opening traffic.

This branch performs none of those hosting, DNS, TLS, credential, provider, migration, seed, login, or production-monitoring actions.
