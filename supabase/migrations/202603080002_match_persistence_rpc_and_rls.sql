-- FE Arena persistence foundation, schema version 1.
-- The RPC is the one transaction boundary used by the server-only Supabase API-key path.
-- Public/anonymous reads and writes are intentionally not granted. Future account policy
-- work may scope reads through player_identities.auth_user_id; no account product is added.

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
  v_inserted boolean;
  v_player jsonb;
  v_round jsonb;
begin
  -- Do not mutate identity rows when a terminal event is retried.
  select idempotency_key into v_existing_key from public.matches where id = v_match_id;
  if found then
    if v_existing_key <> (p_match->>'idempotency_key')::uuid then
      raise exception 'A match ID cannot be reused with a different idempotency key';
    end if;
    return 'already_exists';
  end if;

  -- A username remains unique while the opaque guest owner is stable across reconnects.
  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    insert into public.player_identities (
      guest_session_owner,
      chosen_username,
      schema_version
    ) values (
      v_player->>'guest_session_owner',
      v_player->>'chosen_username',
      (p_match->>'schema_version')::integer
    )
    on conflict (guest_session_owner) do update
      set chosen_username = excluded.chosen_username,
          schema_version = excluded.schema_version,
          updated_at = now();
  end loop;

  insert into public.matches (
    id,
    idempotency_key,
    mode,
    source,
    terminal_outcome,
    winner_seat_id,
    topic_ids,
    round_count,
    question_timer_seconds,
    question_bank_version,
    schema_version,
    question_ids,
    started_at,
    finished_at
  ) values (
    v_match_id,
    (p_match->>'idempotency_key')::uuid,
    p_match->>'mode',
    p_match->>'source',
    p_match->>'terminal_outcome',
    nullif(p_match->>'winner_seat_id', '')::uuid,
    array(select jsonb_array_elements_text(coalesce(p_match->'topic_ids', '[]'::jsonb))),
    (p_match->>'round_count')::integer,
    (p_match->>'question_timer_seconds')::integer,
    p_match->>'question_bank_version',
    (p_match->>'schema_version')::integer,
    array(select jsonb_array_elements_text(coalesce(p_match->'question_ids', '[]'::jsonb))),
    (p_match->>'started_at')::timestamptz,
    (p_match->>'finished_at')::timestamptz
  ) on conflict (id) do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_rows > 0;
  if not v_inserted then    return 'already_exists';
  end if;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    insert into public.match_players (
      match_id,
      seat_id,
      player_identity_id,
      username_snapshot,
      score_total,
      correct_count,
      response_ms_total,
      is_winner,
      schema_version
    )
    select
      v_match_id,
      (v_player->>'seat_id')::uuid,
      identity.id,
      v_player->>'chosen_username',
      (v_player->>'score_total')::integer,
      (v_player->>'correct_count')::integer,
      (v_player->>'response_ms_total')::bigint,
      coalesce((v_player->>'is_winner')::boolean, false),
      (p_match->>'schema_version')::integer
    from public.player_identities as identity
    where identity.guest_session_owner = v_player->>'guest_session_owner';
  end loop;

  for v_round in select value from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb)) loop
    insert into public.match_rounds (
      match_id,
      round_number,
      question_id,
      question_bank_version,
      correctness_summary,
      timing_summary,
      schema_version
    ) values (
      v_match_id,
      (v_round->>'round_number')::integer,
      v_round->>'question_id',
      v_round->>'question_bank_version',
      coalesce(v_round->'correctness_summary', '{}'::jsonb),
      coalesce(v_round->'timing_summary', '{}'::jsonb),
      (p_match->>'schema_version')::integer
    );
  end loop;

  return 'inserted';
end;
$$;

-- RLS is enabled even though the server-only path uses a privileged API key.
alter table public.player_identities enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_rounds enable row level security;

alter table public.player_identities force row level security;
alter table public.matches force row level security;
alter table public.match_players force row level security;
alter table public.match_rounds force row level security;

-- No broad anonymous or authenticated policy is intentional in this guest-first slice.
revoke all on table public.player_identities, public.matches, public.match_players, public.match_rounds from public, anon, authenticated;
revoke all on function public.persist_terminal_match(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_terminal_match(jsonb, jsonb, jsonb) to service_role;
