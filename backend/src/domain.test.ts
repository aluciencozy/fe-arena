import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, ClientEventSchemas, compareScores, gradeQuestion, normalizeAnswer, selectSeededQuestions, ServerEventSchemas, toPublicQuestion, TOPICS, type Question } from "../../shared/domain.js";
import { QUESTION_BANK, validateQuestionBank } from "./data/questions.js";

test("normalization is stable and explicit aliases grade short answers", () => {
  assert.equal(normalizeAnswer("  Little–Endian! "), "little endian");
  const question = QUESTION_BANK.find((item) => item.id === "q-trie-prefix")!;
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: " CA " }), true);
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: "cat" }), false);
});

test("all five discriminated question types validate and public views hide solutions", () => {
  const questions = validateQuestionBank();
  assert.equal(new Set(questions.map((question) => question.type)).size, 5);
  assert.equal(new Set(questions.map((question) => question.topicId)).size, TOPICS.length);
  for (const question of questions) {
    const publicView = toPublicQuestion(question);
    assert.equal("explanation" in publicView, false);
    assert.equal("answer" in publicView, false);
  }
});

test("score correctness dominates speed and bonus has hard boundaries", () => {
  assert.deepEqual(calculateScore(false, 1, 300_000), { correctness: 0, speedBonus: 0, total: 0 });
  assert.equal(calculateScore(true, 0, 300_000).total, 1300);
  assert.equal(calculateScore(true, 300_000, 300_000).total, 1000);
  assert.equal(calculateScore(true, 900_000, 300_000).total, 1000);
  const fourFast = { playerId: "a", playerName: "A", total: 5200, correct: 4, responseMs: 0 };
  const fiveSlow = { playerId: "b", playerName: "B", total: 5000, correct: 5, responseMs: 1_500_000 };
  assert.equal(compareScores(fourFast, fiveSlow).playerId, "b");
});

test("socket contracts validate payloadless requests and public outputs", () => {
  assert.equal(ClientEventSchemas["room:state-request"].safeParse(undefined).success, true);
  assert.equal(ClientEventSchemas["room:state-request"].safeParse({}).success, false);
  assert.equal(ServerEventSchemas["server:error"].safeParse({ code: "BAD_REQUEST", message: "Invalid request" }).success, true);
  assert.equal(ServerEventSchemas["queue:state"].safeParse({ status: "waiting" }).success, false);
});

test("seeded selection is deterministic and topic-filtered", () => {
  const first = selectSeededQuestions(QUESTION_BANK, "replay-seed", 5, ["stacks", "queues"]);
  const second = selectSeededQuestions(QUESTION_BANK, "replay-seed", 5, ["stacks", "queues"]);
  assert.deepEqual(first.map((question) => question.id), second.map((question) => question.id));
  assert.ok(first.every((question) => question.topicId === "stacks" || question.topicId === "queues"));
});

test("code output and ordered sequence grading do not execute arbitrary code", () => {
  const code = QUESTION_BANK.find((item) => item.type === "code-output")!;
  const ordered = QUESTION_BANK.find((item) => item.type === "ordered-sequence")!;
  assert.equal(gradeQuestion(code, { questionId: code.id, answer: ["10"] }), true);
  assert.equal(gradeQuestion(ordered, { questionId: ordered.id, answer: ordered.answerOrder }), true);
  assert.equal(gradeQuestion(ordered, { questionId: ordered.id, answer: ["__proto__"] }), false);
});

// Keeps the union visible to TypeScript when content contributors add a fixture.
const _questionTypeCheck: Question | undefined = QUESTION_BANK[0];
void _questionTypeCheck;
