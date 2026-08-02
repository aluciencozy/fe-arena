-- FE Arena account history, schema version 2.
-- Account rows are created only from auth_user_id values supplied by the server after
-- Supabase Auth token verification. No raw answers, answer keys, chat, or prompt text
-- are stored. Existing guest terminal persistence remains valid and idempotent.

create index if not exists player_identities_auth_user_id_idx
  on public.player_identities (auth_user_id);

comment on column public.player_identities.auth_user_id is
  'Server-verified Supabase Auth user ID; never accepted from a client payload.';

alter table public.match_rounds add column if not exists topic_id text null;
alter table public.match_rounds add column if not exists score_summary jsonb not null default '{}'::jsonb;

create table if not exists public.account_match_history (
  auth_user_id uuid not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_identity_id uuid not null references public.player_identities(id),
  username_snapshot text not null,
  opponent_username_snapshot text null,
  source text not null,
  result text not null,
  terminal_outcome text not null,
  player_score integer not null default 0,
  opponent_score integer null,
  player_correct_count integer not null default 0,
  opponent_correct_count integer null,
  topic_ids text[] not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  schema_version integer not null,
  primary key (auth_user_id, match_id),
  constraint account_history_source check (source in ('private', 'public')),
  constraint account_history_result check (result in ('win', 'loss', 'draw', 'forfeit', 'abandoned', 'expired'))
);

-- Keep reruns safe for an account-history table created by an earlier version of this migration.
alter table public.account_match_history add column if not exists source text;
update public.account_match_history as history
set source = matches.source
from public.matches
where matches.id = history.match_id
  and history.source is null;
alter table public.account_match_history alter column source set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_history_source'
      and conrelid = 'public.account_match_history'::regclass
  ) then
    alter table public.account_match_history
      add constraint account_history_source check (source in ('private', 'public'));
  end if;
end;
$$;

comment on column public.account_match_history.source is
  'Terminal match source copied from matches.source: private or public.';

create table if not exists public.account_topic_progress (
  auth_user_id uuid not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  topic_id text not null,
  attempted integer not null default 0,
  correct integer not null default 0,
  incorrect integer not null default 0,
  score integer not null default 0,
  response_ms bigint not null default 0,
  schema_version integer not null,
  primary key (auth_user_id, match_id, topic_id)
);

create or replace function public.persist_terminal_match(
  p_match jsonb,
  p_players jsonb,
  p_rounds jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid := (p_match->>'id')::uuid;
  v_existing_key uuid;
  v_rows integer;
  v_player jsonb;
  v_round jsonb;
  v_identity_id uuid;
  v_auth_user_id uuid;
  v_opponent jsonb;
  v_result text;
  v_attempted integer;
  v_correct integer;
  v_score integer;
  v_response_ms bigint;
  v_topic text;
begin
  select idempotency_key into v_existing_key from public.matches where id = v_match_id;
  if found then
    if v_existing_key <> (p_match->>'idempotency_key')::uuid then
      raise exception 'A match ID cannot be reused with a different idempotency key';
    end if;
    return 'already_exists';
  end if;

  insert into public.matches (
    id, idempotency_key, mode, source, terminal_outcome, winner_seat_id,
    topic_ids, round_count, question_timer_seconds, question_bank_version,
    schema_version, question_ids, started_at, finished_at
  ) values (
    v_match_id, (p_match->>'idempotency_key')::uuid, p_match->>'mode', p_match->>'source',
    p_match->>'terminal_outcome', nullif(p_match->>'winner_seat_id', '')::uuid,
    array(select jsonb_array_elements_text(coalesce(p_match->'topic_ids', '[]'::jsonb))),
    (p_match->>'round_count')::integer, (p_match->>'question_timer_seconds')::integer,
    p_match->>'question_bank_version', (p_match->>'schema_version')::integer,
    array(select jsonb_array_elements_text(coalesce(p_match->'question_ids', '[]'::jsonb))),
    (p_match->>'started_at')::timestamptz, (p_match->>'finished_at')::timestamptz
  ) on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    select idempotency_key into v_existing_key from public.matches where id = v_match_id;
    if v_existing_key <> (p_match->>'idempotency_key')::uuid then
      raise exception 'A match ID cannot be reused with a different idempotency key';
    end if;
    return 'already_exists';
  end if;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    select id, auth_user_id into v_identity_id, v_auth_user_id
      from public.player_identities where guest_session_owner = v_player->>'guest_session_owner';
    if v_identity_id is null then
      insert into public.player_identities (guest_session_owner, chosen_username, auth_user_id, schema_version)
      values (v_player->>'guest_session_owner', v_player->>'chosen_username', nullif(v_player->>'auth_user_id', '')::uuid, (p_match->>'schema_version')::integer)
      returning id, auth_user_id into v_identity_id, v_auth_user_id;
    else
      update public.player_identities
        set chosen_username = v_player->>'chosen_username',
            auth_user_id = nullif(v_player->>'auth_user_id', '')::uuid,
            schema_version = (p_match->>'schema_version')::integer,
            updated_at = now()
        where id = v_identity_id;
      select auth_user_id into v_auth_user_id from public.player_identities where id = v_identity_id;
    end if;
  end loop;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    insert into public.match_players (
      match_id, seat_id, player_identity_id, username_snapshot, score_total,
      correct_count, response_ms_total, is_winner, schema_version
    ) values (
      v_match_id, (v_player->>'seat_id')::uuid,
      (select id from public.player_identities where guest_session_owner = v_player->>'guest_session_owner'),
      v_player->>'chosen_username', (v_player->>'score_total')::integer,
      (v_player->>'correct_count')::integer, (v_player->>'response_ms_total')::bigint,
      coalesce((v_player->>'is_winner')::boolean, false), (p_match->>'schema_version')::integer
    );
  end loop;

  for v_round in select value from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb)) loop
    insert into public.match_rounds (
      match_id, round_number, question_id, topic_id, question_bank_version,
      correctness_summary, timing_summary, score_summary, schema_version
    ) values (
      v_match_id, (v_round->>'round_number')::integer, v_round->>'question_id',
      nullif(v_round->>'topic_id', ''), v_round->>'question_bank_version',
      coalesce(v_round->'correctness_summary', '{}'::jsonb),
      coalesce(v_round->'timing_summary', '{}'::jsonb),
      coalesce(v_round->'score_summary', '{}'::jsonb), (p_match->>'schema_version')::integer
    );
  end loop;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    v_auth_user_id := nullif(v_player->>'auth_user_id', '')::uuid;
    if v_auth_user_id is null then continue; end if;
    select value into v_opponent from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
      where value->>'seat_id' <> v_player->>'seat_id' limit 1;
    v_result := case
      when p_match->>'terminal_outcome' = 'draw' then 'draw'
      when p_match->>'terminal_outcome' = 'completed' and p_match->>'winner_seat_id' = v_player->>'seat_id' then 'win'
      when p_match->>'terminal_outcome' = 'completed' then 'loss'
      else p_match->>'terminal_outcome'
    end;
    insert into public.account_match_history (
      auth_user_id, match_id, player_identity_id, username_snapshot, opponent_username_snapshot,
      source, result, terminal_outcome, player_score, opponent_score, player_correct_count,
      opponent_correct_count, topic_ids, started_at, finished_at, schema_version
    ) values (
      v_auth_user_id, v_match_id,
      (select id from public.player_identities where guest_session_owner = v_player->>'guest_session_owner'),
      v_player->>'chosen_username', v_opponent->>'chosen_username', p_match->>'source', v_result,
      p_match->>'terminal_outcome', (v_player->>'score_total')::integer,
      nullif(v_opponent->>'score_total', '')::integer, (v_player->>'correct_count')::integer,
      nullif(v_opponent->>'correct_count', '')::integer,
      array(select jsonb_array_elements_text(coalesce(p_match->'topic_ids', '[]'::jsonb))),
      (p_match->>'started_at')::timestamptz, (p_match->>'finished_at')::timestamptz,
      (p_match->>'schema_version')::integer
    ) on conflict (auth_user_id, match_id) do nothing;

    for v_topic in select jsonb_array_elements_text(coalesce(p_match->'topic_ids', '[]'::jsonb)) loop
      select count(*) filter (where p_match->>'terminal_outcome' in ('completed', 'draw') or (r.correctness_summary ? v_player->>'seat_id' and r.correctness_summary->>(v_player->>'seat_id') <> 'null')),
             count(*) filter (where r.correctness_summary->>(v_player->>'seat_id') = 'true'),
             coalesce(sum(case when r.score_summary->>(v_player->>'seat_id') ~ '^[0-9]+$' then (r.score_summary->>(v_player->>'seat_id'))::integer else 0 end), 0),
             coalesce(sum(case when r.timing_summary->>(v_player->>'seat_id') ~ '^[0-9]+$' then (r.timing_summary->>(v_player->>'seat_id'))::bigint else 0 end), 0)
        into v_attempted, v_correct, v_score, v_response_ms
        from public.match_rounds r where r.match_id = v_match_id and r.topic_id = v_topic;
      insert into public.account_topic_progress (auth_user_id, match_id, topic_id, attempted, correct, incorrect, score, response_ms, schema_version)
      values (v_auth_user_id, v_match_id, v_topic, v_attempted, v_correct, v_attempted - v_correct, v_score, v_response_ms, (p_match->>'schema_version')::integer)
      on conflict (auth_user_id, match_id, topic_id) do nothing;
    end loop;
  end loop;
  return 'inserted';
end;
$$;

create or replace function public.get_account_history(p_auth_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'matches', coalesce((select jsonb_agg(jsonb_build_object(
      'matchId', h.match_id, 'source', h.source, 'terminalOutcome', h.terminal_outcome,
      'result', h.result, 'playerName', h.username_snapshot, 'opponentName', h.opponent_username_snapshot,
      'playerScore', h.player_score, 'opponentScore', h.opponent_score,
      'playerCorrect', h.player_correct_count, 'opponentCorrect', h.opponent_correct_count,
      'topicIds', h.topic_ids, 'startedAt', h.started_at, 'finishedAt', h.finished_at
    ) order by h.finished_at desc) from public.account_match_history h where h.auth_user_id = p_auth_user_id), '[]'::jsonb),
    'progress', coalesce((select jsonb_object_agg(grouped.topic_id, grouped.value) from (
      select topic_id, jsonb_build_object(
        'attempted', sum(attempted), 'correct', sum(correct), 'incorrect', sum(incorrect),
        'accuracy', case when sum(attempted) = 0 then 0 else sum(correct)::numeric / sum(attempted) end,
        'score', sum(score), 'responseMs', sum(response_ms)
      ) as value
      from public.account_topic_progress where auth_user_id = p_auth_user_id group by topic_id
    ) as grouped), '{}'::jsonb)
  );
$$;

alter table public.account_match_history enable row level security;
alter table public.account_topic_progress enable row level security;
alter table public.account_match_history force row level security;
alter table public.account_topic_progress force row level security;
revoke all on table public.account_match_history, public.account_topic_progress from public, anon, authenticated;
revoke all on function public.persist_terminal_match(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.get_account_history(uuid) from public, anon, authenticated;
grant execute on function public.persist_terminal_match(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.get_account_history(uuid) to service_role;
