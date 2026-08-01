import type { MatchConfig, MatchSource } from "../../../shared/domain.js";

export const PERSISTENCE_SCHEMA_VERSION = 1;
export const QUESTION_BANK_VERSION = "fe-arena-question-bank-v2";

export type TerminalOutcome = "completed" | "draw" | "forfeit" | "abandoned" | "expired";

export type TerminalPlayerSummary = {
  seatId: string;
  guestSessionOwner: string;
  username: string;
  scoreTotal: number;
  correctCount: number;
  responseMsTotal: number;
  isWinner: boolean;
};

export type TerminalRoundSummary = {
  roundNumber: number;
  questionId: string;
  questionBankVersion: string;
  correctness: Record<string, boolean | null>;
  responseMs: Record<string, number | null>;
};

export type TerminalMatchSnapshot = {
  matchId: string;
  idempotencyKey: string;
  mode: "1v1";
  source: MatchSource;
  terminalOutcome: TerminalOutcome;
  winnerSeatId: string | null;
  config: MatchConfig;
  questionBankVersion: string;
  schemaVersion: number;
  questionIds: string[];
  startedAt: string;
  finishedAt: string;
  players: TerminalPlayerSummary[];
  rounds: TerminalRoundSummary[];
};

export type PersistTerminalResult = {
  status: "inserted" | "already_exists";
  matchId: string;
};

/**
 * Durable match writes are deliberately narrower than the live match engine.
 * Implementations must make matchId/idempotencyKey repeats safe.
 */
export interface MatchRepository {
  persistTerminalMatch(snapshot: TerminalMatchSnapshot): Promise<PersistTerminalResult>;
}
