# Match persistence foundation

The live 1v1 engine remains authoritative in `src/services/match.service.ts` and Socket.IO remains the live-state transport. The repository boundary only records a terminal summary after the engine reaches `RESULTS`, `FORFEIT`, `ABANDONED`, or `EXPIRED`; a database write never blocks a round or changes a live result.

## Local and server configuration

Without both `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, the backend selects `InMemoryMatchRepository`. This is the default for local development and CI, so no Supabase project or network access is required.

When both values are present, the backend wraps `SupabaseMatchRepository` in a durable local outbox. Failed terminal writes remain in `.fe-arena-match-outbox` and are retried on a schedule and when the process restarts. `SUPABASE_SECRET_KEY` is a server-only Supabase secret API key: keep it out of frontend environment files, client events, logs, browser bundles, and committed example files. This pass does not need a `SUPABASE_PUBLISHABLE_KEY` because the frontend does not access Supabase directly.

The migrations are intentionally not deployed by this change. Apply them only in a separate, explicit Supabase deployment step.

## Durable data boundary

The server sends only opaque guest-session owner identifiers (a hash of the server-issued reconnect token), username snapshots, score/correctness/timing summaries, question IDs, and version fields. It does not persist raw answers, answer keys, copied exam text, or chat. The terminal RPC is the single SQL transaction boundary and the immutable match ID/idempotency key makes repeats safe.

All four tables have RLS enabled with no anonymous or authenticated policies. The server-only API-key path is the only intended write path today. A future account-backed ownership policy can use `player_identities.auth_user_id` without inventing an account product in this slice.

Socket.IO is intentionally retained. A separate, explicitly scoped transport migration should evaluate whether it can eventually be removed; durable persistence is not that migration.
