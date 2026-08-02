# Match persistence foundation

The live 1v1 engine remains authoritative in `src/services/match.service.ts` and Socket.IO remains the live-state transport. The repository boundary only records a terminal summary after the engine reaches `RESULTS`, `FORFEIT`, `ABANDONED`, or `EXPIRED`; a database write never blocks a round or changes a live result.

## Local and server configuration

Without both `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, the backend selects `InMemoryMatchRepository`. This is the default for local development and CI, so no Supabase project or network access is required.

When both values are present, the backend wraps `SupabaseMatchRepository` in a durable local outbox. Failed terminal writes remain in `.fe-arena-match-outbox` and are retried on a schedule and when the process restarts. `SUPABASE_SECRET_KEY` is a server-only Supabase secret API key: keep it out of frontend environment files, client events, logs, browser bundles, and committed example files. Optional Auth token verification uses backend `SUPABASE_PUBLISHABLE_KEY` when present (with the existing server-only secret as a compatibility fallback). The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Auth; it never receives the secret key.

The SQL migrations are committed but are not applied automatically. Apply the ordered files in `supabase/migrations/` in a separate, explicit Supabase deployment step.

## Durable data boundary

The server sends opaque guest-session owner identifiers (a hash of the server-issued reconnect token), username snapshots, score/correctness/timing summaries, question IDs, and version fields. It sends an `auth_user_id` only after Supabase verifies the access token. It does not persist raw answers, answer keys, copied exam text, arbitrary code, or chat. For terminal match persistence, the RPC is the single SQL transaction boundary and the immutable match ID/idempotency key makes repeats safe.

All tables have RLS enabled with no anonymous or authenticated policies. The server-only API-key path is the only intended write path today. Authenticated terminal summaries are linked only when the server has verified the Supabase access token. `account_match_history` and `account_topic_progress` are read through a server-only RPC scoped by the verified Auth user ID; browser roles remain denied by RLS. Missing Supabase configuration uses the in-memory repository, including private account-history fallback for local development.

Socket.IO is intentionally retained. A separate, explicitly scoped transport migration should evaluate whether it can eventually be removed; durable persistence is not that migration.
