import type { MatchConfig, MatchPhase, MatchSource, PublicQuestion, QuestionAttempt, QuestionType, RevealedQuestion, ScoreBreakdown, TopicId } from "../../../shared/domain";
export type { MatchConfig, MatchPhase, MatchSource, PublicQuestion, QuestionAttempt, QuestionType, RevealedQuestion, ScoreBreakdown, TopicId };
export type { TOPICS } from "../../../shared/domain";

export type RoomMetadata = { roomId: string; source: MatchSource; hostSeatId: string; config: MatchConfig };
export type RoomSeat = { seatId: string; name: string; connected: boolean };
export type RoomState = { metadata: RoomMetadata; seats: RoomSeat[] };
export type SubmissionPublic = { submitted: boolean; correct: boolean | null; score: ScoreBreakdown | null; answer: string | number | boolean | string[] | null };
export type RoundHistory = { round: number; question: RevealedQuestion; submissions: Record<string, SubmissionPublic> };
export type MatchPublicState = {
  roomId: string; source: MatchSource; phase: MatchPhase; config: MatchConfig; roundIndex: number; totalRounds: number;
  question: PublicQuestion | null; revealedQuestion: RevealedQuestion | null; questionStartedAt: number | null; questionEndsAt: number | null;
  countdownEndsAt: number | null; pause: { seatName: string; expiresAt: number } | null; ready: Record<string, boolean>;
  submissions: Record<string, SubmissionPublic>; scores: Record<string, { total: number; correct: number; responseMs: number }>;
  winnerSeatId: string | null; endReason: "completed" | "forfeit" | "abandoned" | "expired" | null; history: RoundHistory[];
};
export type ChatMessage = { type: "system" | "user"; sender: string; text: string; sentAt: number; id: string };
