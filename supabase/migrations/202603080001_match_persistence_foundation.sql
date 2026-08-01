-- FE Arena persistence foundation, schema version 1.
-- Assumptions: the backend is the only writer in this slice; guest_session_owner is
-- a server-derived opaque value; account linking is a future product seam.
-- Deliberately absent: raw answers, answer keys, copied question text, and chat.

create table if not exists public.player_identities (
  id uuid primary key default gen_random_uuid(),
  guest_session_owner text not null unique,
  chosen_username text not null,
  auth_user_id uuid null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_identities_username_length check (char_length(chosen_username) between 1 and 24)
);

create unique index if not exists player_identities_chosen_username_ci
  on public.player_identities (lower(chosen_username));

comment on column public.player_identities.guest_session_owner is
  'Opaque server-derived guest owner; do not store the reconnect token itself.';
comment on column public.player_identities.auth_user_id is
  'Nullable future account reference; no account product or foreign key is assumed here.';

create table if not exists public.matches (
  id uuid primary key,
  idempotency_key uuid not null unique,
  mode text not null,
  source text not null,
  terminal_outcome text not null,
  winner_seat_id uuid null,
  topic_ids text[] not null,
  round_count integer not null,
  question_timer_seconds integer not null,
  question_bank_version text not null,
  schema_version integer not null,
  question_ids text[] not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint matches_mode check (mode in ('1v1')),
  constraint matches_source check (source in ('private', 'public')),
  constraint matches_terminal_outcome check (terminal_outcome in ('completed', 'draw', 'forfeit', 'abandoned', 'expired')),
  constraint matches_round_count check (round_count between 1 and 5),
  constraint matches_timer check (question_timer_seconds between 30 and 300)
);

comment on table public.matches is
  'Terminal 1v1 summaries only; live phases and grading remain in the backend engine.';

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  seat_id uuid not null,
  player_identity_id uuid not null references public.player_identities(id),
  username_snapshot text not null,
  score_total integer not null default 0,
  correct_count integer not null default 0,
  response_ms_total bigint not null default 0,
  is_winner boolean not null default false,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  primary key (match_id, seat_id),
  constraint match_players_score_nonnegative check (score_total >= 0),
  constraint match_players_correct_nonnegative check (correct_count >= 0),
  constraint match_players_timing_nonnegative check (response_ms_total >= 0)
);

create table if not exists public.match_rounds (
  match_id uuid not null references public.matches(id) on delete cascade,
  round_number integer not null,
  question_id text not null,
  question_bank_version text not null,
  correctness_summary jsonb not null,
  timing_summary jsonb not null,
  schema_version integer not null,
  started_at timestamptz null,
  finished_at timestamptz null,
  primary key (match_id, round_number),
  constraint match_rounds_round_positive check (round_number > 0)
);

comment on column public.match_rounds.correctness_summary is
  'Server-built per-seat correctness only; never include submitted answers.';
comment on column public.match_rounds.timing_summary is
  'Server-built per-seat elapsed milliseconds; never include submitted answers.';
