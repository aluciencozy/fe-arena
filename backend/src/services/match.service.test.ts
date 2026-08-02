import assert from "node:assert/strict";
import test from "node:test";
import {
  attachSeat,
  clearRoomsForTests,
  createRoom,
  disconnectSocket,
  joinRoom,
  reconnectRoom,
} from "./room.service.js";
import {
  clearMatch,
  clearMatchesForTests,
  configureMatch,
  ensureMatch,
  getMatchState,
  leaveMatch,
  markCodingReady,
  pauseForDisconnect,
  resumeAfterReconnect,
  skipReveal,
  submitAnswer,
  submitCodingResult,
  toggleReady,
} from "./match.service.js";
import { QUESTION_BANK } from "../data/questions.js";
import { inMemoryQuestionRepository, setQuestionRepository, type QuestionRepository } from "./question-bank.service.js";
import { TOPICS, type MatchConfig, type Question } from "../../../shared/domain.js";

const events = () => ({ emit: (_state: unknown) => undefined, message: (_text: string) => undefined });
const config: MatchConfig = { topicIds: ["stacks", "queues"], roundCount: 5, questionTimerSeconds: 60 };

const fixedQuestionRepository = (questions: readonly Question[]): QuestionRepository => ({
  list: () => [...questions],
  select: (_seed, count) => questions.slice(0, count),
  get: (id) => questions.find((question) => question.id === id),
});

test("match transitions through question, reveal, and results with locked private submissions", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { ...config, roundCount: 1, questionTimerSeconds: 30 };
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  const initial = ensureMatch(room.metadata.roomId)!;
  assert.equal(initial.phase, "LOBBY");
  assert.equal(initial.question, null);
  assert.equal("answer" in initial, false);
  if (!guest.ok) return;
  configureMatch(room.metadata.roomId, room.seat.seatId, oneRound, events());
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "READY");
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "COUNTDOWN");
  t.mock.timers.tick(3_000);
  const questionState = getMatchState(room.metadata.roomId)!;
  assert.equal(questionState.phase, "QUESTION");
  assert.ok(questionState.question);
  if (!questionState.question) return;
  assert.equal("answer" in questionState.question, false);
  const attempt = { questionId: questionState.question.id, answer: "not-the-answer" };
  assert.equal(submitAnswer(room.metadata.roomId, room.seat.seatId, attempt, events()).ok, true);
  assert.equal(submitAnswer(room.metadata.roomId, room.seat.seatId, attempt, events()).ok, false);
  const submittedState = getMatchState(room.metadata.roomId)!;
  assert.equal(submittedState.submissions[room.seat.seatId]?.submitted, true);
  assert.equal(submittedState.submissions[room.seat.seatId]?.correct, null);
  assert.equal(submittedState.submissions[room.seat.seatId]?.answer, null);
  assert.equal(submitAnswer(room.metadata.roomId, guest.seat.seatId, attempt, events()).ok, true);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
  t.mock.timers.tick(30_000);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "RESULTS");
  clearMatch(room.metadata.roomId);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("graph and C submissions stay server-authoritative through the match lifecycle", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const graph = QUESTION_BANK.find((question) => question.id === "q-graph-bfs");
  const code = QUESTION_BANK.find((question) => question.id === "q-array-c-output");
  assert.ok(graph?.type === "graph");
  assert.ok(code?.type === "code-output");
  if (graph?.type !== "graph" || code?.type !== "code-output") return;
  setQuestionRepository(fixedQuestionRepository([graph, code]));
  const oneMatch = { topicIds: ["arrays-memory"], roundCount: 2, questionTimerSeconds: 30 } as MatchConfig;
  try {
    const room = createRoom("private", oneMatch, "Host");
    attachSeat(room.metadata.roomId, room.seat, "host-socket");
    const guest = joinRoom(room.metadata.roomId, "Guest", "guest-socket");
    assert.equal(guest.ok, true);
    if (!guest.ok) return;
    ensureMatch(room.metadata.roomId);
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    t.mock.timers.tick(3_000);

    const first = getMatchState(room.metadata.roomId)?.question;
    assert.equal(first?.id, graph.id);
    assert.equal(
      submitAnswer(
        room.metadata.roomId,
        room.seat.seatId,
        { questionId: "q-wrong", answer: graph.answerOrder! },
        events(),
      ).ok,
      false,
    );
    assert.equal(
      submitAnswer(
        room.metadata.roomId,
        room.seat.seatId,
        { questionId: graph.id, answer: ["a", "unknown", "c", "d", "e"] },
        events(),
      ).ok,
      true,
    );
    assert.equal(
      submitAnswer(
        room.metadata.roomId,
        room.seat.seatId,
        { questionId: graph.id, answer: graph.answerOrder! },
        events(),
      ).ok,
      false,
    );
    assert.equal(
      submitAnswer(
        room.metadata.roomId,
        guest.seat.seatId,
        { questionId: graph.id, answer: graph.answerOrder! },
        events(),
      ).ok,
      true,
    );

    t.mock.timers.tick(30_000);
    t.mock.timers.tick(3_000);
    const second = getMatchState(room.metadata.roomId)?.question;
    assert.equal(second?.id, code.id);
    assert.equal(getMatchState(room.metadata.roomId)?.history.length, 0);
    assert.equal(getMatchState(room.metadata.roomId)?.revealedQuestion, null);
    assert.equal(
      submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId: "q-wrong", answer: code.output }, events()).ok,
      false,
    );
    assert.equal(
      submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId: code.id, answer: code.output }, events()).ok,
      true,
    );
    assert.equal(
      submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId: code.id, answer: code.output }, events()).ok,
      false,
    );
    t.mock.timers.tick(30_000);
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
    assert.equal(
      submitAnswer(room.metadata.roomId, guest.seat.seatId, { questionId: code.id, answer: code.output }, events()).ok,
      false,
    );
    clearMatch(room.metadata.roomId);
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearMatchesForTests();
    clearRoomsForTests();
  }
});

test("mixed matches gate coding rounds on browser readiness and accept typed completion ordering", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const coding = QUESTION_BANK.find((question) => question.type === "coding");
  const graph = QUESTION_BANK.find((question) => question.id === "q-graph-bfs");
  assert.ok(coding && coding.type === "coding");
  assert.ok(graph && graph.type === "graph");
  if (!coding || coding.type !== "coding" || !graph || graph.type !== "graph") return;
  setQuestionRepository(fixedQuestionRepository([coding, graph]));
  const mixedConfig = {
    topicIds: ["arrays-memory"],
    roundCount: 2,
    questionTimerSeconds: 30,
    includeCoding: true,
  } as MatchConfig;
  try {
    const room = createRoom("private", mixedConfig, "Host");
    attachSeat(room.metadata.roomId, room.seat, "mixed-host");
    const guest = joinRoom(room.metadata.roomId, "Guest", "mixed-guest");
    assert.equal(guest.ok, true);
    if (!guest.ok) return;
    ensureMatch(room.metadata.roomId);
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "READY");
    assert.equal(markCodingReady(room.metadata.roomId, room.seat.seatId, events()).ok, true);
    assert.equal(markCodingReady(room.metadata.roomId, guest.seat.seatId, events()).ok, true);
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "COUNTDOWN");
    t.mock.timers.tick(3_000);
    const state = getMatchState(room.metadata.roomId)!;
    assert.equal(state.question?.type, "coding");
    assert.equal(state.questionEndsAt, (state.questionStartedAt ?? 0) + 60_000);
    t.mock.timers.tick(59_999);
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "QUESTION");
    assert.equal(
      submitCodingResult(
        room.metadata.roomId,
        room.seat.seatId,
        {
          questionId: state.question!.id,
          passed: true,
          tests: [{ index: 1, name: "sum", passed: true }],
          outcome: "success",
        },
        events(),
      ).ok,
      true,
    );
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
    assert.equal(getMatchState(room.metadata.roomId)?.codingProgress[room.seat.seatId]?.passed, true);
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearMatchesForTests();
    clearRoomsForTests();
  }
});

test("reveal lasts thirty seconds, supports one-sided review, and both skips advance", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { ...config, roundCount: 1, questionTimerSeconds: 30 };
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  submitAnswer(room.metadata.roomId, room.metadata.hostSeatId, { questionId: questionId!, answer: "wrong" }, events());
  submitAnswer(room.metadata.roomId, guest.seat.seatId, { questionId: questionId!, answer: "wrong" }, events());
  const reveal = getMatchState(room.metadata.roomId)!;
  assert.equal(reveal.phase, "REVEAL");
  assert.equal(reveal.revealEndsAt, 34_000);
  assert.equal(reveal.revealSkips[room.metadata.hostSeatId], false);
  assert.equal(skipReveal(room.metadata.roomId, room.metadata.hostSeatId, events()).ok, true);
  assert.equal(skipReveal(room.metadata.roomId, room.metadata.hostSeatId, events()).ok, false);
  t.mock.timers.tick(29_999);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
  assert.equal(skipReveal(room.metadata.roomId, guest.seat.seatId, events()).ok, true);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "RESULTS");
  clearMatchesForTests();
  clearRoomsForTests();
});

test("reconnect pauses and resumes the reveal deadline without exposing answers early", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { ...config, roundCount: 1, questionTimerSeconds: 30 };
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const question = getMatchState(room.metadata.roomId)?.question;
  assert.ok(question);
  assert.equal("answer" in question!, false);
  submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId: question!.id, answer: "wrong" }, events());
  submitAnswer(room.metadata.roomId, guest.seat.seatId, { questionId: question!.id, answer: "wrong" }, events());
  const before = getMatchState(room.metadata.roomId)!;
  t.mock.timers.tick(5_000);
  assert.equal(pauseForDisconnect(room.metadata.roomId, guest.seat.seatId, events()), true);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "PAUSED");
  t.mock.timers.tick(5_000);
  assert.equal(resumeAfterReconnect(room.metadata.roomId, events()), true);
  assert.equal(getMatchState(room.metadata.roomId)?.revealEndsAt, before.revealEndsAt! + 5_000);
  t.mock.timers.tick(24_999);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
  t.mock.timers.tick(1);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "RESULTS");
  clearMatchesForTests();
  clearRoomsForTests();
});

test("late submissions and cleared match timers cannot advance state", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 } as MatchConfig;
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  configureMatch(room.metadata.roomId, room.seat.seatId, oneRound, events());
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  t.mock.timers.tick(30_000);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
  assert.equal(
    submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId, answer: "late" }, events()).ok,
    false,
  );
  clearMatch(room.metadata.roomId);
  t.mock.timers.tick(10_000);
  assert.equal(getMatchState(room.metadata.roomId), undefined);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("a submission at the server deadline is rejected before grading", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 } as MatchConfig;
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  t.mock.timers.setTime(34_000);
  assert.equal(
    submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId, answer: "late" }, events()).ok,
    false,
  );
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "REVEAL");
  assert.equal(getMatchState(room.metadata.roomId)?.submissions[room.seat.seatId]?.submitted, false);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("question timeouts count unanswered seats as incorrect topic attempts", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 } as MatchConfig;
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  t.mock.timers.tick(30_000);
  const summary = getMatchState(room.metadata.roomId)?.topicSummary[TOPICS[2].id];
  assert.deepEqual(
    summary && { attempted: summary.attempted, correct: summary.correct, incorrect: summary.incorrect },
    { attempted: 2, correct: 0, incorrect: 2 },
  );
  clearMatchesForTests();
  clearRoomsForTests();
});

test("reconnect waits for both guests and abandoned matches have no winner", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { ...config, roundCount: 1 };
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "host");
  const guest = joinRoom(room.metadata.roomId, "Guest", "guest");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  assert.ok(disconnectSocket("guest"));
  assert.equal(pauseForDisconnect(room.metadata.roomId, guest.seat.seatId, events()), true);
  assert.ok(disconnectSocket("host"));
  assert.equal(pauseForDisconnect(room.metadata.roomId, room.seat.seatId, events()), false);
  assert.ok(reconnectRoom(room.metadata.roomId, guest.seat.reconnectToken, "guest-new").ok);
  assert.equal(resumeAfterReconnect(room.metadata.roomId, events()), false);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "PAUSED");
  assert.ok(reconnectRoom(room.metadata.roomId, room.seat.reconnectToken, "host-new").ok);
  assert.equal(resumeAfterReconnect(room.metadata.roomId, events()), true);
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "QUESTION");
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "abandoned", events());
  assert.equal(getMatchState(room.metadata.roomId)?.winnerSeatId, null);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("forfeiting during a question finalizes the current topic summary", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 } as MatchConfig;
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "a");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  assert.equal(
    submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId, answer: "wrong" }, events()).ok,
    true,
  );
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  const summary = getMatchState(room.metadata.roomId)?.topicSummary[TOPICS[2].id];
  assert.deepEqual(
    summary && { attempted: summary.attempted, correct: summary.correct, incorrect: summary.incorrect },
    { attempted: 1, correct: 0, incorrect: 1 },
  );
  clearMatchesForTests();
  clearRoomsForTests();
});

test("leaving an active match records a forfeit", () => {
  clearMatchesForTests();
  clearRoomsForTests();
  const room = createRoom("private", config, "Host");
  const guest = joinRoom(room.metadata.roomId, "Guest", "b");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "FORFEIT");
  assert.equal(getMatchState(room.metadata.roomId)?.winnerSeatId, room.seat.seatId);
  clearMatchesForTests();
  clearRoomsForTests();
});

test("simultaneous rooms have isolated state", () => {
  clearMatchesForTests();
  clearRoomsForTests();
  const first = createRoom("private", { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 }, "A");
  const second = createRoom("private", { topicIds: [TOPICS[3].id], roundCount: 1, questionTimerSeconds: 30 }, "B");
  const firstState = ensureMatch(first.metadata.roomId)!;
  const secondState = ensureMatch(second.metadata.roomId)!;
  assert.notEqual(firstState.roomId, secondState.roomId);
  assert.equal(firstState.config.topicIds[0], TOPICS[2].id);
  assert.equal(secondState.config.topicIds[0], TOPICS[3].id);
  clearMatchesForTests();
  clearRoomsForTests();
});
