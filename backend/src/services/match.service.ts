import { createHash, randomUUID } from "node:crypto";
import {
  calculateScore,
  compareScores,
  CODING_QUESTION_SECONDS,
  gradeQuestion,
  DEFAULT_ROUND_COUNT,
  PAUSE_SECONDS,
  PUBLIC_QUESTION_SECONDS,
  REVEAL_SECONDS,
  TOPICS,
  emptyTopicPerformance,
  type TopicPerformance,
  type MatchConfig,
  type MatchPhase,
  type PublicQuestion,
  type QuestionAttempt,
  type RevealedQuestion,
  type ScoreBreakdown,
  type CodingProgress,
  type CodingRunResult,
  type CodingAnswer,
  CodingRunResultSchema,
  QuestionAttemptSchema,
  selectSeededQuestions,
} from "../../../shared/domain.js";
import { questionRepository, publicQuestion, revealedQuestion } from "./question-bank.service.js";
import { closeRoomForNewGuests, getMetadata, getSeats, type RoomMetadata } from "./room.service.js";
import { InMemoryMatchRepository } from "../persistence/in-memory-match.repository.js";
import {
  PERSISTENCE_SCHEMA_VERSION,
  QUESTION_BANK_VERSION,
  type MatchRepository,
  type TerminalMatchSnapshot,
} from "../persistence/match.repository.js";

export type SubmissionPublic = {
  submitted: boolean;
  correct: boolean | null;
  score: ScoreBreakdown | null;
  answer: string | number | boolean | string[] | CodingAnswer | null;
};
export type RoundHistory = { round: number; question: RevealedQuestion; submissions: Record<string, SubmissionPublic> };
export type MatchPublicState = {
  roomId: string;
  source: RoomMetadata["source"];
  phase: MatchPhase;
  config: MatchConfig;
  roundIndex: number;
  totalRounds: number;
  question: PublicQuestion | null;
  revealedQuestion: RevealedQuestion | null;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  countdownEndsAt: number | null;
  revealStartedAt: number | null;
  revealEndsAt: number | null;
  revealSkips: Record<string, boolean>;
  rematchRequests: Record<string, boolean>;
  pause: { seatName: string; expiresAt: number } | null;
  ready: Record<string, boolean>;
  codingReady: Record<string, boolean>;
  codingProgress: Record<string, CodingProgress>;
  submissions: Record<string, SubmissionPublic>;
  scores: Record<string, { total: number; correct: number; responseMs: number }>;
  topicSummary: Record<string, TopicPerformance>;
  winnerSeatId: string | null;
  endReason: "completed" | "forfeit" | "abandoned" | "expired" | null;
  history: RoundHistory[];
};

type MatchEvents = { emit: (state: MatchPublicState) => void; message: (text: string) => void };
type MatchRecord = {
  state: MatchPublicState;
  matchId: string;
  idempotencyKey: string;
  startedAt: number;
  seed: string;
  questionIds: string[];
  roundResponseMs: Record<number, Record<string, number>>;
  terminalPersistence: "idle" | "pending" | "persisted";
  timer: ReturnType<typeof setTimeout> | undefined;
  pausedFrom: Exclude<MatchPhase, "PAUSED"> | null;
  pausedAt: number | null;
};
const matches = new Map<string, MatchRecord>();
let matchRepository: MatchRepository = new InMemoryMatchRepository();
const pendingPersistence = new Set<Promise<unknown>>();

export const setMatchRepository = (repository: MatchRepository) => {
  matchRepository = repository;
};
export const waitForMatchPersistenceForTests = async () => {
  while (pendingPersistence.size) await Promise.all([...pendingPersistence]);
};

const emptySubmission = (): SubmissionPublic => ({ submitted: false, correct: null, score: null, answer: null });
const seatIds = (roomId: string) => getSeats(roomId).map((seat) => seat.seatId);
const namesById = (roomId: string) => Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, seat.name]));
const makeScores = (roomId: string) =>
  Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, { total: 0, correct: 0, responseMs: 0 }]));
const makeReady = (roomId: string) => Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, false]));
const makeCodingProgress = (roomId: string): Record<string, CodingProgress> =>
  Object.fromEntries(
    getSeats(roomId).map((seat) => [
      seat.seatId,
      { status: "idle", completedAt: null, passed: null, tests: [], outcome: null },
    ]),
  );
const makeSubmissions = (roomId: string) =>
  Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, emptySubmission()]));
const makeRevealSkips = (roomId: string) => Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, false]));
const makeRematchRequests = (roomId: string) =>
  Object.fromEntries(getSeats(roomId).map((seat) => [seat.seatId, false]));
const makeTopicSummary = (): Record<string, TopicPerformance> =>
  Object.fromEntries(TOPICS.map((topic) => [topic.id, emptyTopicPerformance()]));

const clearTimer = (record: MatchRecord) => {
  if (record.timer) clearTimeout(record.timer);
  record.timer = undefined;
};
const syncSeats = (record: MatchRecord) => {
  const ids = new Set(seatIds(record.state.roomId));
  for (const id of Object.keys(record.state.ready)) if (!ids.has(id)) delete record.state.ready[id];
  for (const id of Object.keys(record.state.rematchRequests)) if (!ids.has(id)) delete record.state.rematchRequests[id];
  for (const id of Object.keys(record.state.scores)) if (!ids.has(id)) delete record.state.scores[id];
  for (const id of Object.keys(record.state.codingReady)) if (!ids.has(id)) delete record.state.codingReady[id];
  for (const id of Object.keys(record.state.codingProgress)) if (!ids.has(id)) delete record.state.codingProgress[id];
  for (const id of Object.keys(record.state.submissions)) if (!ids.has(id)) delete record.state.submissions[id];
  for (const id of ids) {
    record.state.codingReady[id] ??= false;
    record.state.codingProgress[id] ??= { status: "idle", completedAt: null, passed: null, tests: [], outcome: null };
    record.state.ready[id] ??= false;
    record.state.rematchRequests[id] ??= false;
    record.state.scores[id] ??= { total: 0, correct: 0, responseMs: 0 };
    record.state.submissions[id] ??= emptySubmission();
  }
};
const ANSWER_VISIBLE_PHASES = new Set(["REVEAL", "RESULTS", "FORFEIT", "ABANDONED", "EXPIRED"]);
const publicSnapshot = (state: MatchPublicState): MatchPublicState => {
  const safeState = structuredClone(state);
  if (!ANSWER_VISIBLE_PHASES.has(safeState.phase)) {
    safeState.revealedQuestion = null;
    safeState.history = [];
  }
  if (["COUNTDOWN", "QUESTION", "PAUSED"].includes(safeState.phase)) {
    for (const submission of Object.values(safeState.submissions)) {
      submission.correct = null;
      submission.score = null;
      submission.answer = null;
    }
    for (const progress of Object.values(safeState.codingProgress)) {
      progress.passed = null;
      progress.tests = [];
      progress.outcome = null;
    }
    for (const playerId of Object.keys(safeState.scores))
      safeState.scores[playerId] = { total: 0, correct: 0, responseMs: 0 };
  }
  if (safeState.phase === "REVEAL") {
    for (const submission of Object.values(safeState.submissions)) submission.score = null;
    for (const playerId of Object.keys(safeState.scores))
      safeState.scores[playerId] = { total: 0, correct: 0, responseMs: 0 };
  }
  return safeState;
};
const emit = (record: MatchRecord, events: MatchEvents) => events.emit(publicSnapshot(record.state));
const configFor = (metadata: RoomMetadata): MatchConfig =>
  metadata.config ?? { topicIds: [], roundCount: DEFAULT_ROUND_COUNT, questionTimerSeconds: PUBLIC_QUESTION_SECONDS };
const selectFreshQuestions = (seed: string, config: MatchConfig, previousIds: readonly string[]) => {
  const includeCoding = config.includeCoding === true;
  const eligible = questionRepository
    .list()
    .filter((question) =>
      question.type === "coding"
        ? includeCoding
        : !config.topicIds.length || config.topicIds.includes(question.topicId),
    );
  const fresh = eligible.filter((question) => !previousIds.includes(question.id));
  if (fresh.length >= config.roundCount) {
    const selected = selectSeededQuestions(
      fresh,
      seed,
      config.roundCount,
      config.topicIds,
      includeCoding && fresh.some((question) => question.type === "coding"),
    );
    if (selected.length === config.roundCount) return selected;
  }
  return [];
};
const guestSessionOwner = (reconnectToken: string) => createHash("sha256").update(reconnectToken).digest("hex");
const terminalSnapshot = (record: MatchRecord): TerminalMatchSnapshot | undefined => {
  const endReason = record.state.endReason;
  if (!endReason) return undefined;
  const terminalOutcome = endReason === "completed" && record.state.winnerSeatId === null ? "draw" : endReason;
  const players = getSeats(record.state.roomId).map((seat) => {
    const score = record.state.scores[seat.seatId] ?? { total: 0, correct: 0, responseMs: 0 };
    return {
      seatId: seat.seatId,
      guestSessionOwner: guestSessionOwner(seat.reconnectToken),
      ...(seat.authUserId ? { authUserId: seat.authUserId } : {}),
      username: seat.name,
      scoreTotal: score.total,
      correctCount: score.correct,
      responseMsTotal: score.responseMs,
      isWinner: record.state.winnerSeatId === seat.seatId,
    };
  });
  const rounds = record.state.history.map((round) => {
    const responseMs = record.roundResponseMs[round.round - 1] ?? {};
    return {
      roundNumber: round.round,
      questionId: round.question.id,
      topicId: round.question.topicId,
      questionBankVersion: QUESTION_BANK_VERSION,
      correctness: Object.fromEntries(
        Object.entries(round.submissions).map(([seatId, submission]) => [seatId, submission.correct]),
      ),
      responseMs: Object.fromEntries(players.map((player) => [player.seatId, responseMs[player.seatId] ?? null])),
      score: Object.fromEntries(
        players.map((player) => [player.seatId, round.submissions[player.seatId]?.score?.total ?? null]),
      ),
    };
  });
  return {
    matchId: record.matchId,
    idempotencyKey: record.idempotencyKey,
    mode: "1v1",
    source: record.state.source,
    terminalOutcome,
    winnerSeatId: record.state.winnerSeatId,
    config: record.state.config,
    questionBankVersion: QUESTION_BANK_VERSION,
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    questionIds: [...record.questionIds],
    startedAt: new Date(record.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    players,
    rounds,
  };
};
const persistTerminal = (record: MatchRecord) => {
  if (record.terminalPersistence !== "idle") return;
  const snapshot = terminalSnapshot(record);
  if (!snapshot) return;
  record.terminalPersistence = "pending";
  const repository = matchRepository;
  const pending = repository.persistTerminalMatch(snapshot).then(
    () => {
      if (record.matchId === snapshot.matchId) record.terminalPersistence = "persisted";
    },
    () => {
      if (record.matchId === snapshot.matchId) record.terminalPersistence = "idle";
    },
  );
  pendingPersistence.add(pending);
  void pending.finally(() => pendingPersistence.delete(pending));
};

export const ensureMatch = (roomId: string, events?: MatchEvents) => {
  const existing = matches.get(roomId);
  if (existing) {
    if (["LOBBY", "SETUP", "READY", "REMATCH"].includes(existing.state.phase)) syncSeats(existing);
    return existing.state;
  }
  const metadata = getMetadata(roomId);
  if (!metadata) return undefined;
  const config = configFor(metadata);
  const selectedQuestions = questionRepository.select(
    `${roomId}:${metadata.hostSeatId}`,
    config.roundCount,
    config.topicIds,
    config.includeCoding === true,
  );
  const questions = selectedQuestions.length === config.roundCount ? selectedQuestions : [];
  const state: MatchPublicState = {
    roomId,
    source: metadata.source,
    phase: "LOBBY",
    config,
    roundIndex: 0,
    totalRounds: config.roundCount,
    question: null,
    revealedQuestion: null,
    questionStartedAt: null,
    questionEndsAt: null,
    countdownEndsAt: null,
    revealStartedAt: null,
    revealEndsAt: null,
    revealSkips: makeRevealSkips(roomId),
    rematchRequests: makeRematchRequests(roomId),
    pause: null,
    ready: makeReady(roomId),
    codingReady: makeReady(roomId),
    codingProgress: makeCodingProgress(roomId),
    submissions: makeSubmissions(roomId),
    scores: makeScores(roomId),
    topicSummary: makeTopicSummary(),
    winnerSeatId: null,
    endReason: null,
    history: [],
  };
  const matchId = randomUUID();
  const record: MatchRecord = {
    state,
    matchId,
    idempotencyKey: matchId,
    startedAt: Date.now(),
    seed: `${roomId}:${metadata.hostSeatId}`,
    questionIds: questions.map((question) => question.id),
    roundResponseMs: {},
    terminalPersistence: "idle",
    timer: undefined,
    pausedFrom: null,
    pausedAt: null,
  };
  matches.set(roomId, record);
  if (events) emit(record, events);
  return state;
};

const questionFor = (record: MatchRecord) => questionRepository.get(record.questionIds[record.state.roundIndex] ?? "");
const questionTimerSeconds = (record: MatchRecord, question: NonNullable<ReturnType<typeof questionFor>>) =>
  question.type === "coding" ? CODING_QUESTION_SECONDS : record.state.config.questionTimerSeconds;
const hasCodingRounds = (record: MatchRecord) =>
  record.questionIds.some((id) => questionRepository.get(id)?.type === "coding");
const allCodingReady = (record: MatchRecord) =>
  !hasCodingRounds(record) ||
  (seatIds(record.state.roomId).length === 2 &&
    seatIds(record.state.roomId).every((id) => record.state.codingReady[id]));
const startCountdown = (roomId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  if (!record) return;
  clearTimer(record);
  const now = Date.now();
  record.state.phase = "COUNTDOWN";
  record.state.countdownEndsAt = now + 3000;
  record.state.question = null;
  record.state.revealedQuestion = null;
  record.state.revealStartedAt = null;
  record.state.revealEndsAt = null;
  record.state.revealSkips = makeRevealSkips(roomId);
  emit(record, events);
  record.timer = setTimeout(() => startQuestion(roomId, events), 3000);
};
const startQuestion = (roomId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  const question = record && questionFor(record);
  if (!record || !question || record.state.phase !== "COUNTDOWN") return;
  if (question.type === "coding" && !allCodingReady(record)) {
    emit(record, events);
    return;
  }
  clearTimer(record);
  const now = Date.now();
  record.state.phase = "QUESTION";
  record.state.countdownEndsAt = null;
  record.state.question = publicQuestion(question);
  record.state.revealedQuestion = null;
  record.state.revealStartedAt = null;
  record.state.revealEndsAt = null;
  record.state.revealSkips = makeRevealSkips(roomId);
  record.state.questionStartedAt = now;
  record.state.questionEndsAt = now + questionTimerSeconds(record, question) * 1000;
  record.state.submissions = makeSubmissions(roomId);
  record.state.codingProgress = makeCodingProgress(roomId);
  emit(record, events);
  record.timer = setTimeout(() => revealRound(roomId, events), questionTimerSeconds(record, question) * 1000);
};

const advanceOrFinish = (roomId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  if (!record) return;
  if (record.state.roundIndex + 1 >= record.state.totalRounds) {
    clearTimer(record);
    record.state.phase = "RESULTS";
    record.state.question = null;
    record.state.questionStartedAt = null;
    record.state.questionEndsAt = null;
    record.state.countdownEndsAt = null;
    record.state.revealStartedAt = null;
    record.state.revealEndsAt = null;
    record.state.revealSkips = makeRevealSkips(roomId);
    const scores = Object.entries(record.state.scores).map(([playerId, score]) => ({
      playerId,
      playerName: namesById(roomId)[playerId] ?? playerId,
      ...score,
    }));
    const [left, right] = scores;
    const exactTie = Boolean(
      left &&
      right &&
      left.total === right.total &&
      left.correct === right.correct &&
      left.responseMs === right.responseMs,
    );
    record.state.winnerSeatId = exactTie
      ? null
      : left && right
        ? compareScores(left, right).playerId
        : (left?.playerId ?? null);
    record.state.endReason = "completed";
    closeRoomForNewGuests(roomId);
    persistTerminal(record);
    emit(record, events);
    return;
  }
  record.state.roundIndex += 1;
  record.state.revealedQuestion = null;
  startCountdown(roomId, events);
};

const finalizeRound = (
  record: MatchRecord,
  question: NonNullable<ReturnType<typeof questionFor>>,
  countUnanswered: boolean,
) => {
  const round = record.state.roundIndex + 1;
  const existing = record.state.history.find((entry) => entry.round === round);
  if (existing) return existing.question;
  if (countUnanswered) {
    for (const submission of Object.values(record.state.submissions)) {
      if (!submission.submitted) submission.correct = false;
    }
  }
  const revealed = revealedQuestion(question);
  record.state.history.push({ round, question: revealed, submissions: structuredClone(record.state.submissions) });
  const summary = record.state.topicSummary[question.topicId] ?? emptyTopicPerformance();
  const attempts = Object.values(record.state.submissions);
  const attempted = countUnanswered ? attempts.length : attempts.filter((submission) => submission.submitted).length;
  const correct = attempts.filter((submission) => submission.correct === true).length;
  const score = attempts.reduce((total, submission) => total + (submission.score?.total ?? 0), 0);
  const responseMs = Object.values(record.roundResponseMs[record.state.roundIndex] ?? {}).reduce(
    (total, value) => total + value,
    0,
  );
  const totalAttempted = summary.attempted + attempted;
  record.state.topicSummary[question.topicId] = {
    attempted: totalAttempted,
    correct: summary.correct + correct,
    incorrect: summary.incorrect + attempted - correct,
    accuracy: totalAttempted ? (summary.correct + correct) / totalAttempted : 0,
    score: summary.score + score,
    responseMs: summary.responseMs + responseMs,
  };
  return revealed;
};

const revealRound = (roomId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  const question = record && questionFor(record);
  if (!record || !question || (record.state.phase !== "QUESTION" && record.state.phase !== "PAUSED")) return;
  clearTimer(record);
  const timedOut = record.state.questionEndsAt !== null && record.state.questionEndsAt <= Date.now();
  const revealed = finalizeRound(record, question, timedOut);
  record.state.phase = "REVEAL";
  record.state.question = null;
  record.state.revealedQuestion = revealed;
  record.state.questionStartedAt = null;
  record.state.questionEndsAt = null;
  record.state.countdownEndsAt = null;
  const now = Date.now();
  record.state.revealStartedAt = now;
  record.state.revealEndsAt = now + REVEAL_SECONDS * 1000;
  record.state.revealSkips = makeRevealSkips(roomId);
  emit(record, events);
  record.timer = setTimeout(() => advanceOrFinish(roomId, events), REVEAL_SECONDS * 1000);
};

const allSubmitted = (record: MatchRecord) =>
  seatIds(record.state.roomId).length === 2 &&
  Object.values(record.state.submissions).every((submission) => submission.submitted);

export const skipReveal = (roomId: string, seatId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  if (!record || record.state.phase !== "REVEAL") return { ok: false as const, error: "Reveal is not active." };
  if ((record.state.revealEndsAt ?? 0) <= Date.now()) {
    advanceOrFinish(roomId, events);
    return { ok: false as const, error: "Reveal has ended." };
  }
  if (!seatIds(roomId).includes(seatId)) return { ok: false as const, error: "You are not seated in this match." };
  if (record.state.revealSkips[seatId]) return { ok: false as const, error: "You already skipped this reveal." };
  record.state.revealSkips[seatId] = true;
  if (seatIds(roomId).length === 2 && seatIds(roomId).every((id) => record.state.revealSkips[id]))
    advanceOrFinish(roomId, events);
  else emit(record, events);
  return { ok: true as const };
};

export const configureMatch = (roomId: string, seatId: string, config: MatchConfig, events: MatchEvents) => {
  const record = matches.get(roomId) ?? (ensureMatch(roomId) && matches.get(roomId));
  const metadata = getMetadata(roomId);
  if (!record || !metadata || metadata.hostSeatId !== seatId)
    return { ok: false as const, error: "Only the host can change match settings." };
  if (record.state.phase === "REMATCH")
    return { ok: false as const, error: "Rematch settings are locked to the fresh question pool." };
  if (!(record.state.phase === "LOBBY" || record.state.phase === "SETUP"))
    return { ok: false as const, error: "Settings can only change before a round begins." };
  if (!config.topicIds.length || !config.roundCount) return { ok: false as const, error: "Choose at least one topic." };
  const questions = questionRepository.select(
    `${record.seed}:${JSON.stringify(config)}`,
    config.roundCount,
    config.topicIds,
    config.includeCoding === true,
  );
  if (questions.length !== config.roundCount)
    return { ok: false as const, error: "There are not enough reviewed questions for that topic selection." };
  record.state.config = config;
  record.state.phase = "SETUP";
  record.questionIds = questions.map((question) => question.id);
  record.state.totalRounds = config.roundCount;
  record.state.ready = makeReady(roomId);
  record.state.codingReady = makeReady(roomId);
  record.state.codingProgress = makeCodingProgress(roomId);
  emit(record, events);
  return { ok: true as const, state: record.state };
};

export const toggleReady = (roomId: string, seatId: string, events: MatchEvents) => {
  const record = matches.get(roomId) ?? (ensureMatch(roomId) && matches.get(roomId));
  if (!record) return { ok: false as const, error: "Match not found." };
  if (!(
    record.state.phase === "LOBBY" ||
    record.state.phase === "SETUP" ||
    record.state.phase === "READY" ||
    record.state.phase === "REMATCH"
  ))
    return { ok: false as const, error: "Ready status is locked right now." };
  if (getSeats(roomId).length !== 2) return { ok: false as const, error: "Waiting for a second guest." };
  if (record.questionIds.length !== record.state.config.roundCount)
    return { ok: false as const, error: "There are not enough reviewed questions for this match." };
  if (!seatIds(roomId).includes(seatId)) return { ok: false as const, error: "You are not seated in this match." };
  record.state.ready[seatId] = !record.state.ready[seatId];
  record.state.phase = "READY";
  if (seatIds(roomId).every((id) => record.state.ready[id]) && allCodingReady(record)) {
    record.state.roundIndex = 0;
    record.state.history = [];
    record.state.scores = makeScores(roomId);
    record.state.topicSummary = makeTopicSummary();
    record.state.revealSkips = makeRevealSkips(roomId);
    record.roundResponseMs = {};
    record.terminalPersistence = "idle";
    record.state.winnerSeatId = null;
    record.state.endReason = null;
    record.state.codingProgress = makeCodingProgress(roomId);
    startCountdown(roomId, events);
  } else emit(record, events);
  return { ok: true as const, state: record.state };
};

export const markCodingReady = (roomId: string, seatId: string, events: MatchEvents) => {
  const record = matches.get(roomId) ?? (ensureMatch(roomId) && matches.get(roomId));
  if (!record || !hasCodingRounds(record)) return { ok: false as const, error: "This match has no coding rounds." };
  if (!seatIds(roomId).includes(seatId)) return { ok: false as const, error: "You are not seated in this match." };
  if (!["LOBBY", "SETUP", "READY"].includes(record.state.phase))
    return { ok: false as const, error: "Coding readiness must be reported before the match starts." };
  record.state.codingReady[seatId] = true;
  if (seatIds(roomId).every((id) => record.state.ready[id]) && allCodingReady(record)) startCountdown(roomId, events);
  else emit(record, events);
  return { ok: true as const, state: record.state };
};

export const submitCodingProgress = (
  roomId: string,
  seatId: string,
  status: "compiling" | "running",
  events: MatchEvents,
) => {
  const record = matches.get(roomId);
  const question = record && questionFor(record);
  if (!record || !question || question.type !== "coding" || record.state.phase !== "QUESTION")
    return { ok: false as const, error: "Coding progress is not accepted right now." };
  if (!seatIds(roomId).includes(seatId)) return { ok: false as const, error: "You are not seated in this match." };
  const progress = record.state.codingProgress[seatId];
  if (!progress || progress.status === "complete") return { ok: false as const, error: "Coding is already complete." };
  progress.status = status;
  emit(record, events);
  return { ok: true as const };
};

export const submitCodingResult = (roomId: string, seatId: string, result: CodingRunResult, events: MatchEvents) => {
  const record = matches.get(roomId);
  const question = record && questionFor(record);
  if (!record || !question || question.type !== "coding" || record.state.phase !== "QUESTION")
    return { ok: false as const, error: "Coding results are not accepted right now." };
  if (!seatIds(roomId).includes(seatId)) return { ok: false as const, error: "You are not seated in this match." };
  const parsed = CodingRunResultSchema.safeParse(result);
  if (!parsed.success) return { ok: false as const, error: "That coding result is invalid." };
  if (record.state.questionEndsAt !== null && record.state.questionEndsAt <= Date.now()) {
    revealRound(roomId, events);
    return { ok: false as const, error: "Question time has expired." };
  }
  if (parsed.data.questionId !== question.id)
    return { ok: false as const, error: "That coding question is no longer active." };
  const progress = record.state.codingProgress[seatId];
  const submission = record.state.submissions[seatId];
  if (!progress || !submission || progress.status === "complete" || submission.submitted)
    return { ok: false as const, error: "Your coding result is already locked." };
  const elapsedMs = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  const score = calculateScore(parsed.data.passed, elapsedMs, questionTimerSeconds(record, question) * 1000);
  progress.status = "complete";
  progress.completedAt = Date.now();
  progress.passed = parsed.data.passed;
  progress.tests = parsed.data.tests;
  progress.outcome = parsed.data.outcome;
  submission.submitted = true;
  submission.correct = parsed.data.passed;
  submission.score = score;
  submission.answer = {
    type: "coding",
    passed: parsed.data.passed,
    outcome: parsed.data.outcome,
    tests: structuredClone(parsed.data.tests),
  };
  const current = record.state.scores[seatId] ?? { total: 0, correct: 0, responseMs: 0 };
  record.state.scores[seatId] = {
    total: current.total + score.total,
    correct: current.correct + (parsed.data.passed ? 1 : 0),
    responseMs: current.responseMs + elapsedMs,
  };
  const roundTiming = record.roundResponseMs[record.state.roundIndex] ?? {};
  roundTiming[seatId] = elapsedMs;
  record.roundResponseMs[record.state.roundIndex] = roundTiming;
  emit(record, events);
  if (parsed.data.passed || allSubmitted(record)) revealRound(roomId, events);
  return { ok: true as const, score };
};

export const submitAnswer = (roomId: string, seatId: string, attempt: QuestionAttempt, events: MatchEvents) => {
  const record = matches.get(roomId);
  const question = record && questionFor(record);
  if (!record || !question || record.state.phase !== "QUESTION")
    return { ok: false as const, error: "Answers are not being accepted right now." };
  const submission = record.state.submissions[seatId];
  if (!submission) return { ok: false as const, error: "You are not seated in this match." };
  if (record.state.questionEndsAt !== null && record.state.questionEndsAt <= Date.now()) {
    revealRound(roomId, events);
    return { ok: false as const, error: "Question time has expired." };
  }
  if (submission.submitted) return { ok: false as const, error: "Your answer is already locked for this question." };
  const parsed = QuestionAttemptSchema.safeParse(attempt);
  if (!parsed.success || parsed.data.questionId !== question.id)
    return { ok: false as const, error: "That question is no longer active." };
  // Grading happens only here, on the server, against the private repository record.
  const correct = gradeQuestion(question, parsed.data);
  const elapsedMs = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  const score = calculateScore(correct, elapsedMs, record.state.config.questionTimerSeconds * 1000);
  submission.submitted = true;
  submission.correct = correct;
  submission.score = score;
  submission.answer = structuredClone(parsed.data.answer);
  const current = record.state.scores[seatId] ?? { total: 0, correct: 0, responseMs: 0 };
  record.state.scores[seatId] = {
    total: current.total + score.total,
    correct: current.correct + (correct ? 1 : 0),
    responseMs: current.responseMs + elapsedMs,
  };
  const roundTiming = record.roundResponseMs[record.state.roundIndex] ?? {};
  roundTiming[seatId] = elapsedMs;
  record.roundResponseMs[record.state.roundIndex] = roundTiming;
  emit(record, events);
  if (allSubmitted(record)) revealRound(roomId, events);
  return { ok: true as const, correct, score };
};

export const requestRematch = (roomId: string, seatId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  if (!record || !["RESULTS", "FORFEIT", "ABANDONED", "EXPIRED"].includes(record.state.phase))
    return { ok: false as const, error: "Rematch is only available after a completed match." };
  if (!seatIds(roomId).includes(seatId) || getSeats(roomId).length !== 2)
    return { ok: false as const, error: "Both guest seats are required for a rematch." };
  if (record.state.rematchRequests[seatId]) {
    emit(record, events);
    return { ok: true as const, state: record.state };
  }
  record.state.rematchRequests[seatId] = true;
  const seats = seatIds(roomId);
  if (!seats.every((id) => record.state.rematchRequests[id])) {
    emit(record, events);
    return { ok: true as const, state: record.state };
  }

  const previousQuestionIds = [...record.questionIds];
  record.seed = randomUUID();
  const questions = selectFreshQuestions(record.seed, record.state.config, previousQuestionIds);
  if (questions.length !== record.state.config.roundCount) {
    record.state.rematchRequests = makeRematchRequests(roomId);
    emit(record, events);
    return { ok: false as const, error: "There are not enough reviewed questions for a rematch." };
  }
  record.questionIds = questions.map((question) => question.id);
  record.state.phase = "REMATCH";
  record.matchId = randomUUID();
  record.idempotencyKey = record.matchId;
  record.startedAt = Date.now();
  record.roundResponseMs = {};
  record.terminalPersistence = "idle";
  record.state.roundIndex = 0;
  record.state.totalRounds = record.state.config.roundCount;
  record.state.ready = makeReady(roomId);
  record.state.rematchRequests = makeRematchRequests(roomId);
  record.state.codingReady = makeReady(roomId);
  record.state.codingProgress = makeCodingProgress(roomId);
  record.state.submissions = makeSubmissions(roomId);
  record.state.scores = makeScores(roomId);
  record.state.question = null;
  record.state.revealedQuestion = null;
  record.state.revealStartedAt = null;
  record.state.revealEndsAt = null;
  record.state.revealSkips = makeRevealSkips(roomId);
  record.state.topicSummary = makeTopicSummary();
  record.state.winnerSeatId = null;
  record.state.endReason = null;
  record.state.history = [];
  emit(record, events);
  return { ok: true as const, state: record.state };
};

export const leaveMatch = (
  roomId: string,
  leavingSeatId: string,
  reason: "forfeit" | "abandoned" | "expired",
  events: MatchEvents,
) => {
  const record = matches.get(roomId);
  if (!record) return;
  clearTimer(record);
  const phase = record.state.phase === "PAUSED" ? record.pausedFrom : record.state.phase;
  const question = phase === "QUESTION" ? questionFor(record) : undefined;
  if (question) finalizeRound(record, question, false);
  const winner = reason === "abandoned" ? null : (seatIds(roomId).find((id) => id !== leavingSeatId) ?? null);
  record.state.phase = reason === "forfeit" ? "FORFEIT" : reason === "expired" ? "EXPIRED" : "ABANDONED";
  record.state.winnerSeatId = winner;
  record.state.endReason = reason;
  closeRoomForNewGuests(roomId);
  persistTerminal(record);
  record.state.pause = null;
  record.state.question = null;
  record.state.revealedQuestion = null;
  record.state.questionStartedAt = null;
  record.state.questionEndsAt = null;
  record.state.countdownEndsAt = null;
  record.state.revealStartedAt = null;
  record.state.revealEndsAt = null;
  record.state.revealSkips = makeRevealSkips(roomId);
  record.pausedFrom = null;
  record.pausedAt = null;
  emit(record, events);
  events.message(
    winner
      ? `${winner === leavingSeatId ? "A guest" : "Your opponent"} left; the match is over.`
      : "The match ended because the room was abandoned.",
  );
};

export const pauseForDisconnect = (roomId: string, seatId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  const seatName = getSeats(roomId).find((seat) => seat.seatId === seatId)?.name;
  const phase = record?.state.phase;
  if (!record || !seatName || (phase !== "COUNTDOWN" && phase !== "QUESTION" && phase !== "REVEAL")) return false;
  clearTimer(record);
  record.pausedFrom = phase;
  record.pausedAt = Date.now();
  record.state.phase = "PAUSED";
  record.state.pause = { seatName, expiresAt: Date.now() + PAUSE_SECONDS * 1000 };
  emit(record, events);
  events.message(`${seatName} disconnected. Both guests are paused for ${PAUSE_SECONDS} seconds.`);
  return true;
};

export const resumeAfterReconnect = (roomId: string, events: MatchEvents) => {
  const record = matches.get(roomId);
  if (!record || record.state.phase !== "PAUSED" || !record.pausedFrom || record.pausedAt === null) return false;
  if (!getSeats(roomId).length || getSeats(roomId).some((seat) => !seat.connected)) return false;
  const pausedMs = Math.max(0, Date.now() - record.pausedAt);
  if (record.state.questionStartedAt !== null) record.state.questionStartedAt += pausedMs;
  if (record.state.questionEndsAt !== null) record.state.questionEndsAt += pausedMs;
  if (record.state.countdownEndsAt !== null) record.state.countdownEndsAt += pausedMs;
  if (record.state.revealStartedAt !== null) record.state.revealStartedAt += pausedMs;
  if (record.state.revealEndsAt !== null) record.state.revealEndsAt += pausedMs;
  record.state.phase = record.pausedFrom;
  record.state.pause = null;
  const deadline =
    record.state.phase === "COUNTDOWN"
      ? record.state.countdownEndsAt
      : record.state.phase === "QUESTION"
        ? record.state.questionEndsAt
        : record.state.revealEndsAt;
  const remaining = (deadline ?? Date.now()) - Date.now();
  record.pausedFrom = null;
  record.pausedAt = null;
  const action =
    record.state.phase === "COUNTDOWN"
      ? () => startQuestion(roomId, events)
      : record.state.phase === "QUESTION"
        ? () => revealRound(roomId, events)
        : () => advanceOrFinish(roomId, events);
  record.timer = setTimeout(action, Math.max(0, remaining));
  emit(record, events);
  events.message("Guest reconnected. The match is live again.");
  return true;
};

export const getMatchState = (roomId: string) => {
  const record = matches.get(roomId);
  return record ? publicSnapshot(record.state) : undefined;
};
export const clearMatch = (roomId: string) => {
  const record = matches.get(roomId);
  if (record) clearTimer(record);
  matches.delete(roomId);
};
export const clearMatchesForTests = () => {
  for (const record of matches.values()) clearTimer(record);
  matches.clear();
};
