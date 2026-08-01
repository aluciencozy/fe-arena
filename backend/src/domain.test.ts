import assert from "node:assert/strict";
import test from "node:test";
import { calculateScore, ClientEventSchemas, compareScores, gradeQuestion, normalizeAnswer, selectSeededQuestions, ServerEventSchemas, toPublicQuestion, TOPICS, type Question } from "../../shared/domain.js";
import { QUESTION_BANK, validateQuestionBank } from "./data/questions.js";
import { loadQuestionRepository, questionFromRow, questionToRow } from "./services/question-bank.service.js";

test("normalization is stable and explicit aliases grade short answers", () => {
  assert.equal(normalizeAnswer("  Little–Endian! "), "little endian");
  const question = QUESTION_BANK.find((item) => item.id === "q-trie-prefix")!;
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: " CA " }), true);
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: "cat" }), false);
});

test("reviewed bank has complete topic/type coverage, valid unique IDs, and hidden public solutions", () => {
  const questions = validateQuestionBank();
  assert.ok(questions.length >= 100);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.equal(new Set(questions.map((question) => question.topicId)).size, TOPICS.length);
  for (const topic of TOPICS) {
    const topicQuestions = questions.filter((question) => question.topicId === topic.id);
    assert.ok(topicQuestions.length >= 8, topic.id);
    assert.equal(new Set(topicQuestions.map((question) => question.type)).size, 5, topic.id);
  }
  assert.equal(new Set(questions.map((question) => question.type)).size, 5);
  for (const question of questions) {
    const publicView = toPublicQuestion(question);
    assert.equal("answer" in publicView, false);
    assert.equal("answers" in publicView, false);
    assert.equal("output" in publicView, false);
    assert.equal("tolerance" in publicView, false);
    assert.equal("answerOrder" in publicView, false);
    assert.equal("explanation" in publicView, false);
    assert.equal("assumptions" in publicView, false);
    assert.equal("provenance" in publicView, false);
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

test("seeded selection is deterministic, topic-filtered, and has no repeated questions", () => {
  const first = selectSeededQuestions(QUESTION_BANK, "replay-seed", 10, ["stacks", "queues"]);
  const second = selectSeededQuestions(QUESTION_BANK, "replay-seed", 10, ["stacks", "queues"]);
  assert.deepEqual(first.map((question) => question.id), second.map((question) => question.id));
  assert.equal(new Set(first.map((question) => question.id)).size, first.length);
  assert.ok(first.every((question) => question.topicId === "stacks" || question.topicId === "queues"));
  assert.equal(selectSeededQuestions(first, "replay-seed", first.length + 1).length, 0);
});

test("Supabase rows load private content through the repository without changing public views", async () => {
  const source = QUESTION_BANK.find((question) => question.type === "multiple-choice")!;
  const row = { ...questionToRow(source), schema_version: 2, published: true };
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: [row], error: null }),
  };
  const repository = await loadQuestionRepository({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "service-key" }, { from: () => query } as never);
  const loaded = repository.get(source.id)!;
  assert.equal(loaded.explanation, source.explanation);
  assert.equal("answer" in toPublicQuestion(loaded), false);
});

test("Supabase private content cannot overwrite canonical row fields", () => {
  const source = QUESTION_BANK.find((question) => question.type === "multiple-choice")!;
  const row = questionToRow(source);
  const loaded = questionFromRow({
    ...row,
    content: { ...(row.content as Record<string, unknown>), id: "q-forged", topicId: "queues", type: "multiple-choice", prompt: "Forged content prompt", difficulty: "stretch" },
    schema_version: 2,
    published: true,
  });
  assert.equal(loaded.id, source.id);
  assert.equal(loaded.topicId, source.topicId);
  assert.equal(loaded.type, source.type);
  assert.equal(loaded.prompt, source.prompt);
  assert.equal(loaded.difficulty, source.difficulty);
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
