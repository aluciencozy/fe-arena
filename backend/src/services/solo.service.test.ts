import assert from "node:assert/strict";
import test from "node:test";
import { QUESTION_BANK } from "../data/questions.js";
import {
  clearSolo,
  clearSoloForTests,
  soloNext,
  soloSessionCountForTests,
  soloSubmit,
  startSolo,
  type SoloState,
} from "./solo.service.js";
import { inMemoryQuestionRepository, setQuestionRepository, type QuestionRepository } from "./question-bank.service.js";

const fixedQuestionRepository = (question: (typeof QUESTION_BANK)[number]): QuestionRepository => ({
  list: () => [question],
  select: (_seed, count) => Array.from({ length: count }, () => question),
  get: (id) => (id === question.id ? question : undefined),
});

test("solo submissions at the server deadline are rejected before grading", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 });
  clearSoloForTests();
  const question = QUESTION_BANK.find((candidate) => candidate.published !== false && candidate.topicId === "stacks");
  assert.ok(question);
  setQuestionRepository(fixedQuestionRepository(question));
  try {
    let state: SoloState | undefined;
    assert.equal(
      startSolo("solo-deadline", ["stacks"], 1, 30, (next) => {
        state = next;
      }).ok,
      true,
    );
    t.mock.timers.setTime(31_000);
    assert.equal(
      soloSubmit("solo-deadline", { questionId: question.id, answer: "late" }, (next) => {
        state = next;
      }).ok,
      false,
    );
    assert.ok(state);
    assert.ok(state.result);
    assert.ok(state.topicSummary.stacks);
    assert.equal(state.phase, "RESULT");
    assert.equal(state.result.correct, false);
    assert.equal(state.topicSummary.stacks.attempted, 1);
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearSoloForTests();
  }
});

test("solo sessions are removed after terminal completion", () => {
  clearSoloForTests();
  const question = QUESTION_BANK.find((candidate) => candidate.published !== false && candidate.topicId === "stacks");
  assert.ok(question);
  setQuestionRepository(fixedQuestionRepository(question));
  try {
    const states: SoloState[] = [];
    assert.equal(startSolo("solo-terminal", ["stacks"], 1, 30, (state) => states.push(state)).ok, true);
    assert.equal(
      soloSubmit("solo-terminal", { questionId: question.id, answer: "wrong" }, (state) => states.push(state)).ok,
      true,
    );
    assert.equal(
      soloNext("solo-terminal", (state) => states.push(state)),
      true,
    );
    assert.equal(states.at(-1)?.phase, "COMPLETE");
    assert.equal(soloSessionCountForTests(), 0);
    assert.equal(
      soloNext("solo-terminal", () => undefined),
      false,
    );
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearSoloForTests();
  }
});

test("clearing a disconnected solo session makes reconnect non-resumable", () => {
  clearSoloForTests();
  const question = QUESTION_BANK.find((candidate) => candidate.published !== false && candidate.topicId === "stacks");
  assert.ok(question);
  setQuestionRepository(fixedQuestionRepository(question));
  try {
    assert.equal(startSolo("solo-disconnect", ["stacks"], 1, 30, () => undefined).ok, true);
    assert.equal(soloSessionCountForTests(), 1);
    clearSolo("solo-disconnect");
    assert.equal(soloSessionCountForTests(), 0);
    assert.equal(soloSubmit("solo-disconnect", { questionId: question.id, answer: "late" }, () => undefined).ok, false);
  } finally {
    setQuestionRepository(inMemoryQuestionRepository);
    clearSoloForTests();
  }
});
