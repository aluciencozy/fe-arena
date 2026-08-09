import {
  calculateScore,
  gradeQuestion,
  QUESTION_TIMER_MAX_SECONDS,
  TOPICS,
  CodingRunResultSchema,
  emptyTopicPerformance,
  QuestionAttemptSchema,
  type TopicPerformance,
  type MatchConfig,
  type QuestionAttempt,
  type PublicQuestion,
  type ScoreBreakdown,
  type TopicId,
} from "../../../shared/domain.js";
import { publicQuestion, questionRepository, revealedQuestion } from "./question-bank.service.js";

export type SoloState = {
  phase: "QUESTION" | "RESULT" | "COMPLETE";
  question: PublicQuestion | null;
  revealedQuestion: ReturnType<typeof revealedQuestion> | null;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  result: { correct: boolean; score: ScoreBreakdown } | null;
  topicSummary: Record<string, TopicPerformance>;
  runScore: number;
  runCorrect: number;
  runTotal: number;
};
type SoloRecord = {
  state: SoloState;
  ids: string[];
  index: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  timerSeconds: number;
};
const sessions = new Map<string, SoloRecord>();
const initial = (): SoloState => ({
  phase: "QUESTION",
  question: null,
  revealedQuestion: null,
  questionStartedAt: null,
  questionEndsAt: null,
  result: null,
  topicSummary: Object.fromEntries(TOPICS.map((topic) => [topic.id, emptyTopicPerformance()])),
  runScore: 0,
  runCorrect: 0,
  runTotal: 0,
});
const clearTimer = (record: SoloRecord) => {
  if (record.timer) clearTimeout(record.timer);
  record.timer = undefined;
};
const clearSoloRecord = (record: SoloRecord) => {
  clearTimer(record);
  for (const [sessionId, current] of sessions) {
    if (current === record) sessions.delete(sessionId);
  }
};
const sendQuestion = (record: SoloRecord, emit: (state: SoloState) => void) => {
  clearTimer(record);
  const question = questionRepository.get(record.ids[record.index] ?? "");
  if (!question) {
    record.state.phase = "COMPLETE";
    record.state.question = null;
    emit(record.state);
    clearSoloRecord(record);
    return;
  }
  const now = Date.now();
  record.state = {
    ...record.state,
    phase: "QUESTION",
    question: publicQuestion(question),
    revealedQuestion: null,
    questionStartedAt: now,
    questionEndsAt: now + record.timerSeconds * 1000,
    result: null,
  };
  emit(record.state);
  record.timer = setTimeout(() => finishQuestion(record, emit, false), record.timerSeconds * 1000);
};
const finishQuestion = (
  record: SoloRecord,
  emit: (state: SoloState) => void,
  correct: boolean,
  score: ScoreBreakdown = { correctness: 0, speedBonus: 0, total: 0 },
) => {
  clearTimer(record);
  const question = questionRepository.get(record.ids[record.index] ?? "");
  if (!question) return;
  const responseMs = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  record.state.phase = "RESULT";
  record.state.question = null;
  record.state.revealedQuestion = revealedQuestion(question);
  record.state.questionStartedAt = null;
  record.state.questionEndsAt = null;
  record.state.result = { correct, score };
  record.state.runTotal += 1;
  if (correct) {
    record.state.runCorrect += 1;
    record.state.runScore += score.total;
  }
  const topicId = question.topicId;
  const summary = record.state.topicSummary[topicId] ?? emptyTopicPerformance();
  const attempted = summary.attempted + 1;
  record.state.topicSummary[topicId] = {
    attempted,
    correct: summary.correct + (correct ? 1 : 0),
    incorrect: summary.incorrect + (correct ? 0 : 1),
    accuracy: (summary.correct + (correct ? 1 : 0)) / attempted,
    score: summary.score + score.total,
    responseMs: summary.responseMs + responseMs,
  };
  emit(record.state);
};

export const startSolo = (
  sessionId: string,
  topicIds: TopicId[],
  count: number,
  timerSeconds: number,
  emit: (state: SoloState) => void,
  supportsCoding = true,
) => {
  if (!supportsCoding)
    return {
      ok: false as const,
      error: "Solo practice includes browser C rounds. Enable cross-origin isolation and warm the C runner first.",
    };
  const config: MatchConfig = {
    topicIds,
    roundCount: Math.min(5, Math.max(1, count)),
    questionTimerSeconds: Math.min(QUESTION_TIMER_MAX_SECONDS, Math.max(30, timerSeconds)),
  };
  const questions = questionRepository.select(
    `solo:${sessionId}:${Date.now()}`,
    config.roundCount,
    config.topicIds,
    true,
  );
  if (questions.length !== config.roundCount)
    return { ok: false as const, error: "There are not enough reviewed questions for that topic selection." };
  clearSolo(sessionId);
  const record: SoloRecord = {
    state: initial(),
    ids: questions.map((question) => question.id),
    index: 0,
    timer: undefined,
    timerSeconds: config.questionTimerSeconds,
  };
  sessions.set(sessionId, record);
  sendQuestion(record, emit);
  return { ok: true as const };
};
export const soloCodingComplete = (
  sessionId: string,
  result: unknown,
  emit: (state: SoloState) => void,
) => {
  const record = sessions.get(sessionId);
  const question = record && questionRepository.get(record.ids[record.index] ?? "");
  if (!record || !question || question.type !== "coding" || record.state.phase !== "QUESTION")
    return { ok: false as const, error: "Coding results are not accepted right now." };
  const parsed = CodingRunResultSchema.safeParse(result);
  if (!parsed.success) return { ok: false as const, error: "That coding result is invalid." };
  if (record.state.questionEndsAt !== null && record.state.questionEndsAt <= Date.now()) {
    finishQuestion(record, emit, false);
    return { ok: false as const, error: "Question time has expired." };
  }
  if (parsed.data.questionId !== question.id)
    return { ok: false as const, error: "That coding question is no longer active." };
  if (parsed.data.outcome !== "success")
    return { ok: false as const, error: "That browser run did not complete. Retry the coding run." };
  if (!parsed.data.passed) {
    emit(record.state);
    return { ok: true as const, retryable: true as const };
  }
  const elapsedMs = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  const score = calculateScore(parsed.data.passed, elapsedMs, record.timerSeconds * 1000);
  finishQuestion(record, emit, parsed.data.passed, score);
  return { ok: true as const, score };
};
export const soloSubmit = (sessionId: string, attempt: QuestionAttempt, emit: (state: SoloState) => void) => {
  const record = sessions.get(sessionId);
  const question = record && questionRepository.get(record.ids[record.index] ?? "");
  if (!record || !question || record.state.phase !== "QUESTION")
    return { ok: false as const, error: "Solo practice is not accepting an answer." };
  if (question.type === "coding")
    return { ok: false as const, error: "Use the browser coding runner for this question." };
  const parsed = QuestionAttemptSchema.safeParse(attempt);
  if (!parsed.success || parsed.data.questionId !== question.id)
    return { ok: false as const, error: "That answer does not match the active question." };
  if (record.state.questionEndsAt !== null && record.state.questionEndsAt <= Date.now()) {
    finishQuestion(record, emit, false);
    return { ok: false as const, error: "Question time has expired." };
  }
  const correct = gradeQuestion(question, parsed.data);
  const elapsed = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  finishQuestion(record, emit, correct, calculateScore(correct, elapsed, record.timerSeconds * 1000));
  return { ok: true as const };
};
export const soloNext = (sessionId: string, emit: (state: SoloState) => void) => {
  const record = sessions.get(sessionId);
  if (!record || record.state.phase !== "RESULT") return false;
  record.index += 1;
  if (record.index >= record.ids.length) {
    record.state.phase = "COMPLETE";
    record.state.question = null;
    record.state.revealedQuestion = null;
    emit(record.state);
    clearSoloRecord(record);
    return true;
  }
  sendQuestion(record, emit);
  return true;
};
export const clearSolo = (sessionId: string) => {
  const record = sessions.get(sessionId);
  if (record) clearTimer(record);
  sessions.delete(sessionId);
};
export const soloSessionCountForTests = () => sessions.size;
export const clearSoloForTests = () => {
  for (const id of sessions.keys()) clearSolo(id);
};
