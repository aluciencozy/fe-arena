import {
  calculateScore,
  gradeQuestion,
  PUBLIC_QUESTION_SECONDS,
  QuestionAttemptSchema,
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
  runScore: number;
  runCorrect: number;
  runTotal: number;
};
type SoloRecord = { state: SoloState; ids: string[]; index: number; timer: ReturnType<typeof setTimeout> | undefined; timerSeconds: number };
const sessions = new Map<string, SoloRecord>();
const initial = (): SoloState => ({ phase: "QUESTION", question: null, revealedQuestion: null, questionStartedAt: null, questionEndsAt: null, result: null, runScore: 0, runCorrect: 0, runTotal: 0 });
const clearTimer = (record: SoloRecord) => { if (record.timer) clearTimeout(record.timer); record.timer = undefined; };
const sendQuestion = (record: SoloRecord, emit: (state: SoloState) => void) => {
  clearTimer(record);
  const question = questionRepository.get(record.ids[record.index] ?? "");
  if (!question) { record.state.phase = "COMPLETE"; record.state.question = null; emit(record.state); return; }
  const now = Date.now();
  record.state = { ...record.state, phase: "QUESTION", question: publicQuestion(question), revealedQuestion: null, questionStartedAt: now, questionEndsAt: now + record.timerSeconds * 1000, result: null };
  emit(record.state);
  record.timer = setTimeout(() => finishQuestion(record, emit, false), record.timerSeconds * 1000);
};
const finishQuestion = (record: SoloRecord, emit: (state: SoloState) => void, correct: boolean, score: ScoreBreakdown = { correctness: 0, speedBonus: 0, total: 0 }) => {
  clearTimer(record);
  const question = questionRepository.get(record.ids[record.index] ?? "");
  if (!question) return;
  record.state.phase = "RESULT";
  record.state.question = null;
  record.state.revealedQuestion = revealedQuestion(question);
  record.state.questionStartedAt = null;
  record.state.questionEndsAt = null;
  record.state.result = { correct, score };
  record.state.runTotal += 1;
  if (correct) { record.state.runCorrect += 1; record.state.runScore += score.total; }
  emit(record.state);
};

export const startSolo = (sessionId: string, topicIds: TopicId[], count: number, timerSeconds: number, emit: (state: SoloState) => void) => {
  const config: MatchConfig = { topicIds, roundCount: Math.min(5, Math.max(1, count)), questionTimerSeconds: Math.min(PUBLIC_QUESTION_SECONDS, Math.max(30, timerSeconds)) };
  const questions = questionRepository.select(`solo:${sessionId}:${Date.now()}`, config.roundCount, config.topicIds);
  const record: SoloRecord = { state: initial(), ids: questions.map((question) => question.id), index: 0, timer: undefined, timerSeconds: config.questionTimerSeconds };
  sessions.set(sessionId, record);
  sendQuestion(record, emit);
};
export const soloSubmit = (sessionId: string, attempt: QuestionAttempt, emit: (state: SoloState) => void) => {
  const record = sessions.get(sessionId);
  const question = record && questionRepository.get(record.ids[record.index] ?? "");
  if (!record || !question || record.state.phase !== "QUESTION") return { ok: false as const, error: "Solo practice is not accepting an answer." };
  const parsed = QuestionAttemptSchema.safeParse(attempt);
  if (!parsed.success || parsed.data.questionId !== question.id) return { ok: false as const, error: "That answer does not match the active question." };
  const correct = gradeQuestion(question, parsed.data);
  const elapsed = Math.max(0, Date.now() - (record.state.questionStartedAt ?? Date.now()));
  finishQuestion(record, emit, correct, calculateScore(correct, elapsed, record.timerSeconds * 1000));
  return { ok: true as const };
};
export const soloNext = (sessionId: string, emit: (state: SoloState) => void) => {
  const record = sessions.get(sessionId);
  if (!record || record.state.phase !== "RESULT") return false;
  record.index += 1;
  if (record.index >= record.ids.length) { record.state.phase = "COMPLETE"; record.state.question = null; record.state.revealedQuestion = null; emit(record.state); return true; }
  sendQuestion(record, emit);
  return true;
};
export const clearSolo = (sessionId: string) => { const record = sessions.get(sessionId); if (record) clearTimer(record); sessions.delete(sessionId); };
export const clearSoloForTests = () => { for (const id of sessions.keys()) clearSolo(id); };
