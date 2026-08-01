import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  MatchRepository,
  PersistTerminalResult,
  TerminalMatchSnapshot,
} from "./match.repository.js";

const toRpcMatch = (snapshot: TerminalMatchSnapshot) => ({
  id: snapshot.matchId,
  idempotency_key: snapshot.idempotencyKey,
  mode: snapshot.mode,
  source: snapshot.source,
  terminal_outcome: snapshot.terminalOutcome,
  winner_seat_id: snapshot.winnerSeatId,
  topic_ids: snapshot.config.topicIds,
  round_count: snapshot.config.roundCount,
  question_timer_seconds: snapshot.config.questionTimerSeconds,
  question_bank_version: snapshot.questionBankVersion,
  schema_version: snapshot.schemaVersion,
  question_ids: snapshot.questionIds,
  started_at: snapshot.startedAt,
  finished_at: snapshot.finishedAt,
});

const toRpcPlayers = (snapshot: TerminalMatchSnapshot) => snapshot.players.map((player) => ({
  seat_id: player.seatId,
  guest_session_owner: player.guestSessionOwner,
  chosen_username: player.username,
  score_total: player.scoreTotal,
  correct_count: player.correctCount,
  response_ms_total: player.responseMsTotal,
  is_winner: player.isWinner,
}));

const toRpcRounds = (snapshot: TerminalMatchSnapshot) => snapshot.rounds.map((round) => ({
  round_number: round.roundNumber,
  question_id: round.questionId,
  question_bank_version: round.questionBankVersion,
  correctness_summary: round.correctness,
  timing_summary: round.responseMs,
}));

export class SupabaseMatchRepository implements MatchRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string, client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })) {
    this.client = client;
  }

  async persistTerminalMatch(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult> {
    const { data, error } = await this.client.rpc("persist_terminal_match", {
      p_match: toRpcMatch(snapshot),
      p_players: toRpcPlayers(snapshot),
      p_rounds: toRpcRounds(snapshot),
    });
    if (error) throw new Error(`Supabase terminal match write failed: ${error.message}`);
    if (data !== "inserted" && data !== "already_exists") throw new Error("Supabase terminal match RPC returned an invalid status.");
    return { status: data, matchId: snapshot.matchId };
  }
}
