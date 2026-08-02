import { TOPICS, emptyTopicPerformance, type TopicId, type TopicPerformance } from "../../../shared/domain.js";
import type { TerminalMatchSnapshot } from "./match.repository.js";

export type AccountMatchHistory = {
  matchId: string;
  source: TerminalMatchSnapshot["source"];
  terminalOutcome: TerminalMatchSnapshot["terminalOutcome"];
  result: "win" | "loss" | "draw" | "forfeit" | "abandoned" | "expired";
  playerName: string;
  opponentName: string | null;
  playerScore: number;
  opponentScore: number | null;
  playerCorrect: number;
  opponentCorrect: number | null;
  startedAt: string;
  finishedAt: string;
  topicIds: TopicId[];
};

export type AccountHistory = {
  matches: AccountMatchHistory[];
  progress: Record<TopicId, TopicPerformance>;
};

const blankProgress = (): Record<TopicId, TopicPerformance> =>
  Object.fromEntries(TOPICS.map((topic) => [topic.id, emptyTopicPerformance()])) as Record<TopicId, TopicPerformance>;

export const emptyAccountHistory = (): AccountHistory => ({ matches: [], progress: blankProgress() });

export const accountHistoryForSnapshots = (snapshots: readonly TerminalMatchSnapshot[], authUserId: string): AccountHistory => {
  const history = emptyAccountHistory();
  for (const snapshot of snapshots) {
    const player = snapshot.players.find((candidate) => candidate.authUserId === authUserId);
    if (!player) continue;
    const opponent = snapshot.players.find((candidate) => candidate.seatId !== player.seatId);
    const result = snapshot.terminalOutcome === "draw"
      ? "draw"
      : snapshot.terminalOutcome === "completed"
        ? snapshot.winnerSeatId === player.seatId ? "win" : snapshot.winnerSeatId ? "loss" : "draw"
        : snapshot.terminalOutcome;
    history.matches.push({
      matchId: snapshot.matchId,
      source: snapshot.source,
      terminalOutcome: snapshot.terminalOutcome,
      result,
      playerName: player.username,
      opponentName: opponent?.username ?? null,
      playerScore: player.scoreTotal,
      opponentScore: opponent?.scoreTotal ?? null,
      playerCorrect: player.correctCount,
      opponentCorrect: opponent?.correctCount ?? null,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      topicIds: [...snapshot.config.topicIds],
    });
    for (const round of snapshot.rounds) {
      if (!round.topicId || !TOPICS.some((topic) => topic.id === round.topicId)) continue;
      const topicId = round.topicId;
      const correctness = round.correctness[player.seatId];
      // Completed/draw matches count a timed-out null correctness as an attempted miss,
      // matching match.service.finalizeRound(countUnanswered=true). Other terminal exits
      // only count answers that were actually submitted.
      const attempted = snapshot.terminalOutcome === "completed" || snapshot.terminalOutcome === "draw"
        ? true
        : correctness !== null && correctness !== undefined;
      if (!attempted) continue;
      const summary = history.progress[topicId];
      const correct = correctness === true;
      const score = round.score?.[player.seatId] ?? 0;
      const responseMs = round.responseMs[player.seatId] ?? 0;
      const attemptedCount = summary.attempted + 1;
      history.progress[topicId] = {
        attempted: attemptedCount,
        correct: summary.correct + (correct ? 1 : 0),
        incorrect: summary.incorrect + (correct ? 0 : 1),
        accuracy: (summary.correct + (correct ? 1 : 0)) / attemptedCount,
        score: summary.score + score,
        responseMs: summary.responseMs + responseMs,
      };
    }
  }
  history.matches.sort((left, right) => right.finishedAt.localeCompare(left.finishedAt));
  return history;
};

export const parseAccountHistory = (value: unknown): AccountHistory => {
  if (!value || typeof value !== "object") return emptyAccountHistory();
  const candidate = value as { matches?: unknown; progress?: unknown };
  const matches = Array.isArray(candidate.matches) ? candidate.matches as AccountMatchHistory[] : [];
  const progress = blankProgress();
  if (candidate.progress && typeof candidate.progress === "object") {
    for (const topic of TOPICS) {
      const item = (candidate.progress as Record<string, unknown>)[topic.id];
      if (!item || typeof item !== "object") continue;
      const value = item as Partial<TopicPerformance>;
      if ([value.attempted, value.correct, value.incorrect, value.accuracy, value.score, value.responseMs].every((field) => typeof field === "number" && Number.isFinite(field))) {
        progress[topic.id] = value as TopicPerformance;
      }
    }
  }
  return { matches, progress };
};
