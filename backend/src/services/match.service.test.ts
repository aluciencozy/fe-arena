import assert from "node:assert/strict";
import test from "node:test";
import {
  attachSeat,
  clearRoomsForTests,
  createRoom,
  disconnectSocket,
  joinRoom,
  reconnectRoom,
  removeSeat,
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
  requestRematch,
} from "./match.service.js";
import { QUESTION_BANK } from "../data/questions.js";
import { inMemoryQuestionRepository, setQuestionRepository, type QuestionRepository } from "./question-bank.service.js";
import { publicConfig } from "./queue.service.js";
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
  assert.equal(
    submitAnswer(
      room.metadata.roomId,
      room.seat.seatId,
      { questionId: questionState.question.id, answer: "x".repeat(4097) },
      events(),
    ).ok,
    false,
  );
  assert.equal(
    submitAnswer(
      room.metadata.roomId,
      room.seat.seatId,
      { questionId: questionState.question.id, answer: Array.from({ length: 101 }, () => "x") },
      events(),
    ).ok,
    false,
  );
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
          passed: false,
          tests: [{ index: 1, name: "sum", passed: false }],
          outcome: "compile-error",
        },
        events(),
      ).ok,
      true,
    );
    const active = getMatchState(room.metadata.roomId)!;
    assert.equal(active.phase, "QUESTION");
    assert.equal(active.codingProgress[room.seat.seatId]?.passed, null);
    assert.deepEqual(active.codingProgress[room.seat.seatId]?.tests, []);
    assert.equal(active.codingProgress[room.seat.seatId]?.outcome, null);
    assert.equal(
      submitCodingResult(
        room.metadata.roomId,
        guest.seat.seatId,
        {
          questionId: state.question!.id,
          passed: false,
          tests: [{ index: 1, name: "sum", passed: false }],
          outcome: "compile-error",
        },
        events(),
      ).ok,
      true,
    );
    const reveal = getMatchState(room.metadata.roomId)!;
    assert.equal(reveal.phase, "REVEAL");
    assert.equal(reveal.codingProgress[room.seat.seatId]?.passed, false);
    assert.deepEqual(reveal.codingProgress[room.seat.seatId]?.tests, [{ index: 1, name: "sum", passed: false }]);
    assert.equal(reveal.codingProgress[room.seat.seatId]?.outcome, "compile-error");
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearMatchesForTests();
    clearRoomsForTests();
  }
});

test("mixed rematches do not reuse an exhausted coding question", (t) => {
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
    topicIds: [graph.topicId],
    roundCount: 1,
    questionTimerSeconds: 30,
    includeCoding: true,
  } as MatchConfig;
  try {
    const room = createRoom("private", mixedConfig, "Host");
    attachSeat(room.metadata.roomId, room.seat, "rematch-host");
    const guest = joinRoom(room.metadata.roomId, "Guest", "rematch-guest");
    assert.equal(guest.ok, true);
    if (!guest.ok) return;
    ensureMatch(room.metadata.roomId);
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    markCodingReady(room.metadata.roomId, room.seat.seatId, events());
    markCodingReady(room.metadata.roomId, guest.seat.seatId, events());
    t.mock.timers.tick(3_000);
    const first = getMatchState(room.metadata.roomId)!;
    assert.equal(first.question?.id, coding.id);
    const result = {
      questionId: coding.id,
      passed: false,
      tests: [{ index: 1, name: "sum", passed: false }],
      outcome: "compile-error" as const,
    };
    assert.equal(submitCodingResult(room.metadata.roomId, room.seat.seatId, result, events()).ok, true);
    assert.equal(submitCodingResult(room.metadata.roomId, guest.seat.seatId, result, events()).ok, true);
    t.mock.timers.tick(30_000);
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "RESULTS");
    assert.equal(requestRematch(room.metadata.roomId, room.seat.seatId, events()).ok, true);
    assert.equal(requestRematch(room.metadata.roomId, guest.seat.seatId, events()).ok, true);
    assert.equal(getMatchState(room.metadata.roomId)?.phase, "REMATCH");
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    t.mock.timers.tick(3_000);
    const next = getMatchState(room.metadata.roomId)?.question;
    assert.equal(next?.type, "graph");
    assert.notEqual(next?.id, coding.id);
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

test("rematch is two-sided, preserves results while pending, and selects a fresh pool after reconnect", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const eligible = QUESTION_BANK.filter((question) => question.topicId === "stacks");
  const first = eligible[0];
  const second = eligible[1];
  assert.ok(first && second);
  if (!first || !second) return;
  setQuestionRepository(fixedQuestionRepository([first, second]));
  const oneRound = { topicIds: ["stacks"], roundCount: 1, questionTimerSeconds: 30 } as MatchConfig;
  try {
    const room = createRoom("private", oneRound, "Host");
    attachSeat(room.metadata.roomId, room.seat, "host");
    const guest = joinRoom(room.metadata.roomId, "Guest", "guest");
    assert.equal(guest.ok, true);
    if (!guest.ok) return;
    ensureMatch(room.metadata.roomId);
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    t.mock.timers.tick(3_000);
    const questionId = getMatchState(room.metadata.roomId)?.question?.id;
    assert.equal(questionId, first.id);
    assert.ok(questionId);
    assert.equal(
      submitAnswer(
        room.metadata.roomId,
        "00000000-0000-0000-0000-000000000000",
        { questionId, answer: "intruder" },
        events(),
      ).ok,
      false,
    );
    submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId, answer: "host answer" }, events());
    submitAnswer(room.metadata.roomId, guest.seat.seatId, { questionId, answer: "guest answer" }, events());
    const reveal = getMatchState(room.metadata.roomId)!;
    assert.equal(reveal.phase, "REVEAL");
    assert.equal(reveal.submissions[room.seat.seatId]?.correct, false);
    assert.equal(reveal.submissions[room.seat.seatId]?.answer, "host answer");
    assert.equal(reveal.submissions[guest.seat.seatId]?.answer, "guest answer");
    assert.equal(reveal.scores[room.seat.seatId]?.total, 0);
    assert.equal(reveal.submissions[room.seat.seatId]?.score, null);
    assert.ok(reveal.revealedQuestion?.answer !== undefined);
    t.mock.timers.tick(30_000);
    const results = getMatchState(room.metadata.roomId)!;
    assert.equal(results.phase, "RESULTS");
    assert.equal(results.history.length, 1);

    assert.equal(requestRematch(room.metadata.roomId, room.seat.seatId, events()).ok, true);
    const pending = getMatchState(room.metadata.roomId)!;
    assert.equal(pending.phase, "RESULTS");
    assert.equal(pending.rematchRequests[room.seat.seatId], true);
    assert.equal(pending.history.length, 1);

    assert.ok(disconnectSocket("guest"));
    assert.ok(reconnectRoom(room.metadata.roomId, guest.seat.reconnectToken, "guest-reconnected").ok);
    assert.equal(requestRematch(room.metadata.roomId, guest.seat.seatId, events()).ok, true);
    const rematch = getMatchState(room.metadata.roomId)!;
    assert.equal(rematch.phase, "REMATCH");
    assert.equal(rematch.history.length, 0);
    assert.equal(rematch.rematchRequests[room.seat.seatId], false);
    assert.equal(
      configureMatch(
        room.metadata.roomId,
        room.seat.seatId,
        { ...oneRound, topicIds: ["queues"] },
        events(),
      ).ok,
      false,
    );
    assert.equal(getMatchState(room.metadata.roomId)?.question, null);
    toggleReady(room.metadata.roomId, room.seat.seatId, events());
    toggleReady(room.metadata.roomId, guest.seat.seatId, events());
    t.mock.timers.tick(3_000);
    assert.equal(getMatchState(room.metadata.roomId)?.question?.id, second.id);
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearMatchesForTests();
    clearRoomsForTests();
  }
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

test("terminal matches reject replacement guests", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const oneRound = { ...config, roundCount: 1, questionTimerSeconds: 30 };
  const room = createRoom("private", oneRound, "Host");
  attachSeat(room.metadata.roomId, room.seat, "terminal-host");
  const guest = joinRoom(room.metadata.roomId, "Guest", "terminal-guest");
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  ensureMatch(room.metadata.roomId);
  toggleReady(room.metadata.roomId, room.seat.seatId, events());
  toggleReady(room.metadata.roomId, guest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const questionId = getMatchState(room.metadata.roomId)?.question?.id;
  assert.ok(questionId);
  assert.equal(
    submitAnswer(room.metadata.roomId, room.seat.seatId, { questionId: questionId!, answer: "private answer" }, events()).ok,
    true,
  );
  leaveMatch(room.metadata.roomId, guest.seat.seatId, "forfeit", events());
  assert.equal(removeSeat(room.metadata.roomId, guest.seat.seatId)?.remaining.length, 1);
  const replacement = joinRoom(room.metadata.roomId, "Replacement", "replacement-guest");
  assert.equal(replacement.ok, false);
  if (!replacement.ok) assert.equal(replacement.error, "This match has ended and cannot accept replacement guests.");
  assert.equal(getMatchState(room.metadata.roomId)?.phase, "FORFEIT");
  assert.equal(getMatchState(room.metadata.roomId)?.submissions[room.seat.seatId]?.answer, "private answer");
  clearMatchesForTests();
  clearRoomsForTests();
});

test("public and private rooms isolate match state and submitted answers", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearMatchesForTests();
  clearRoomsForTests();
  const privateRoom = createRoom(
    "private",
    { topicIds: [TOPICS[2].id], roundCount: 1, questionTimerSeconds: 30 },
    "Private host",
  );
  const publicRoom = createRoom("public", publicConfig, "Public host");
  attachSeat(privateRoom.metadata.roomId, privateRoom.seat, "private-host");
  attachSeat(publicRoom.metadata.roomId, publicRoom.seat, "public-host");
  const privateGuest = joinRoom(privateRoom.metadata.roomId, "Private guest", "private-guest");
  const publicGuest = joinRoom(publicRoom.metadata.roomId, "Public guest", "public-guest");
  assert.equal(privateGuest.ok, true);
  assert.equal(publicGuest.ok, true);
  if (!privateGuest.ok || !publicGuest.ok) return;
  const privateState = ensureMatch(privateRoom.metadata.roomId)!;
  const publicState = ensureMatch(publicRoom.metadata.roomId)!;
  assert.notEqual(privateState.roomId, publicState.roomId);
  assert.equal(privateState.source, "private");
  assert.equal(publicState.source, "public");
  toggleReady(privateRoom.metadata.roomId, privateRoom.seat.seatId, events());
  toggleReady(privateRoom.metadata.roomId, privateGuest.seat.seatId, events());
  toggleReady(publicRoom.metadata.roomId, publicRoom.seat.seatId, events());
  toggleReady(publicRoom.metadata.roomId, publicGuest.seat.seatId, events());
  t.mock.timers.tick(3_000);
  const privateQuestionId = getMatchState(privateRoom.metadata.roomId)?.question?.id;
  const publicQuestionId = getMatchState(publicRoom.metadata.roomId)?.question?.id;
  assert.ok(privateQuestionId);
  assert.ok(publicQuestionId);
  assert.equal(
    submitAnswer(
      publicRoom.metadata.roomId,
      publicRoom.seat.seatId,
      { questionId: publicQuestionId!, answer: "public answer" },
      events(),
    ).ok,
    true,
  );
  assert.equal(getMatchState(privateRoom.metadata.roomId)?.submissions[privateRoom.seat.seatId]?.submitted, false);
  assert.equal(getMatchState(publicRoom.metadata.roomId)?.submissions[publicRoom.seat.seatId]?.answer, null);
  assert.equal(
    submitAnswer(
      privateRoom.metadata.roomId,
      publicRoom.seat.seatId,
      { questionId: privateQuestionId!, answer: "cross-room answer" },
      events(),
    ).ok,
    false,
  );
  assert.equal(
    submitAnswer(
      publicRoom.metadata.roomId,
      publicGuest.seat.seatId,
      { questionId: publicQuestionId!, answer: "public guest answer" },
      events(),
    ).ok,
    true,
  );
  assert.equal(getMatchState(publicRoom.metadata.roomId)?.phase, "REVEAL");
  assert.equal(getMatchState(publicRoom.metadata.roomId)?.submissions[publicRoom.seat.seatId]?.answer, "public answer");
  assert.equal(getMatchState(privateRoom.metadata.roomId)?.submissions[privateRoom.seat.seatId]?.answer, null);
  clearMatchesForTests();
  clearRoomsForTests();
});
