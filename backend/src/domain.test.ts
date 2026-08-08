import assert from "node:assert/strict";
import test from "node:test";
import {
  CodingProblemSchema,
  calculateScore,
  ClientEventSchemas,
  compareScores,
  gradeQuestion,
  normalizeAnswer,
  QuestionSchema,
  selectSeededQuestions,
  ServerEventSchemas,
  toPublicQuestion,
  TOPICS,
  type Question,
} from "../../shared/domain.js";
import { CODING_PROBLEMS } from "../../shared/coding-problems.js";
import { QUESTION_BANK, validateQuestionBank } from "./data/questions.js";
import {
  inMemoryQuestionRepository,
  isQuestionBankReady,
  loadQuestionRepository,
  questionFromRow,
  questionToRow,
  type QuestionRepository,
} from "./services/question-bank.service.js";

const CODE_OUTPUT_ORACLE: Record<string, string[]> = {
  "q-array-c-output": ["10"],
  "q-recursion-c-output": ["3 2 1 "],
  "q-array-c-output-2": ["8"],
  "q-list-c-output": ["9"],
  "q-stack-c-output": ["1"],
  "q-queue-c-output": ["8"],
  "q-tree-c-output": ["2 5 9 "],
  "q-avl-c-output": ["-2"],
  "q-heap-c-output": ["1"],
  "q-hash-c-output": ["5"],
  "q-trie-c-output": ["1"],
  "q-sort-c-output": ["sorted"],
  "q-recursion-c-output-2": ["1 2 "],
  "q-analysis-c-output": ["14"],
  "q-hard-alias-increment": ["4 11 1"],
  "q-hard-pointer-to-pointer": ["8 8"],
  "q-hard-array-pointer-post": ["2 8 5"],
  "q-hard-struct-alias": ["2 8"],
  "q-hard-list-unlink": ["10 30 "],
  "q-hard-stack-alias": ["2 13"],
  "q-hard-stack-control": ["|3"],
  "q-hard-queue-front-rear": ["4 9"],
  "q-hard-queue-wrap": ["2 2 1"],
  "q-hard-tree-unwind": ["1 2 3 "],
  "q-hard-tree-height-trace": ["2 0"],
  "q-hard-avl-balance-trace": ["-2 3"],
  "q-hard-heap-sift": ["11 4 9"],
  "q-hard-heap-index": ["5 1"],
  "q-hard-hash-probe": ["2 27"],
  "q-hard-hash-tombstone": ["3 2"],
  "q-hard-trie-terminal": ["1 0"],
  "q-hard-sort-invariant": ["2 3 6 5 "],
  "q-hard-sort-compare": ["2 5"],
  "q-hard-recursion-static": ["7 10"],
  "q-hard-recursion-order": ["3 1 2 1 "],
  "q-hard-analysis-short-circuit": ["10"],
  "q-hard-analysis-bitmask": ["5"],
  "q-hard-control-alias": ["9"],
};

type GraphQuestion = Extract<Question, { type: "graph" }>;

const graphNeighbors = (question: GraphQuestion, nodeId: string): string[] =>
  question.graph.nodes
    .filter((node) =>
      question.graph.edges.some((edge) =>
        question.graph.directed
          ? edge.from === nodeId && edge.to === node.id
          : (edge.from === nodeId && edge.to === node.id) || (edge.from === node.id && edge.to === nodeId),
      ),
    )
    .map((node) => node.id);

const graphOracle = (question: GraphQuestion): string[] | boolean | number => {
  if (question.operation === "adjacency") return graphNeighbors(question, question.nodeId!);
  if (question.operation === "bfs-order") {
    const visited = new Set([question.startNode!]);
    const queue = [question.startNode!];
    const order: string[] = [];
    while (queue.length) {
      const node = queue.shift()!;
      order.push(node);
      for (const neighbor of graphNeighbors(question, node)) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    return order;
  }
  if (question.operation === "dfs-order") {
    const visited = new Set<string>();
    const order: string[] = [];
    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);
      order.push(node);
      for (const neighbor of graphNeighbors(question, node)) visit(neighbor);
    };
    visit(question.startNode!);
    return order;
  }
  const distances = new Map([[question.startNode!, 0]]);
  const queue = [question.startNode!];
  while (queue.length) {
    const node = queue.shift()!;
    for (const neighbor of graphNeighbors(question, node)) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distances.get(node)! + 1);
      queue.push(neighbor);
    }
  }
  if (question.operation === "reachability") return distances.has(question.targetNode!);
  return distances.get(question.targetNode!) ?? -1;
};

const storedGraphAnswer = (question: GraphQuestion): string[] | boolean | number =>
  question.operation === "bfs-order" || question.operation === "dfs-order"
    ? question.answerOrder!
    : question.operation === "adjacency"
      ? question.adjacentNodes!
      : question.operation === "reachability"
        ? question.reachable!
        : question.distance!;

test("normalization is stable and explicit aliases grade short answers", () => {
  assert.equal(normalizeAnswer("  Little–Endian! "), "little endian");
  const question = QUESTION_BANK.find((item) => item.id === "q-trie-prefix")!;
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: " CA " }), true);
  assert.equal(gradeQuestion(question, { questionId: question.id, answer: "cat" }), false);
});

test("reviewed bank has complete topic/type coverage, valid unique IDs, and hidden public solutions", () => {
  const questions = validateQuestionBank();
  assert.equal(questions.length, 201);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
  assert.equal(questions.filter((question) => question.type === "graph").length, 19);
  assert.equal(questions.filter((question) => question.type === "coding").length, 38);
  assert.ok(questions.filter((question) => question.difficulty === "stretch").length >= 70);
  assert.ok(questions.some((question) => question.published === false));
  assert.ok(questions.filter((question) => question.published !== false && question.type === "coding").length >= 30);
  assert.equal(new Set(questions.map((question) => question.type)).size, 7);
  assert.equal(new Set(questions.map((question) => question.topicId)).size, TOPICS.length);
  for (const topic of TOPICS) {
    const topicQuestions = questions.filter((question) => question.topicId === topic.id);
    assert.ok(topicQuestions.length >= 8, topic.id);
    assert.ok(new Set(topicQuestions.map((question) => question.type)).size >= 5, topic.id);
  }
  assert.equal(new Set(questions.map((question) => question.type)).size, 7);
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
    if (question.type === "code-output") assert.equal(publicView.code, question.code);
    if (question.type === "coding") {
      assert.equal(publicView.problem?.id, question.problem.id);
      assert.equal("explanation" in publicView, false);
      assert.equal("answer" in publicView, false);
    }
    if (question.type === "graph") {
      assert.deepEqual(publicView.graph, question.graph);
      assert.equal("reachable" in publicView, false);
      assert.equal("distance" in publicView, false);
    }
  }
});

test("publication policy retains retired content but excludes it from play", () => {
  const retired = QUESTION_BANK.find((question) => question.published === false)!;
  assert.ok(retired);
  assert.equal(inMemoryQuestionRepository.get(retired.id), undefined);
  assert.equal(
    inMemoryQuestionRepository.list().some((question) => question.id === retired.id),
    false,
  );
  assert.ok(inMemoryQuestionRepository.list().every((question) => question.published !== false));
  const stacks = inMemoryQuestionRepository.list(["stacks"]);
  assert.ok(stacks.length > 0);
  assert.ok(stacks.every((question) => question.published !== false && question.topicId === "stacks"));
  assert.equal(selectSeededQuestions([retired], "retired-only", 1, [retired.topicId]).length, 0);
});

test("question-bank readiness requires five published noncoding questions", () => {
  const publishedNoncoding = QUESTION_BANK.filter(
    (question) => question.published !== false && question.type !== "coding",
  );
  const repositoryFor = (questions: readonly Question[]): Pick<QuestionRepository, "select"> => ({
    select: (seed, count, topicIds, includeCoding = false) =>
      selectSeededQuestions(questions, seed, count, topicIds, includeCoding),
  });
  const partial = [
    ...publishedNoncoding.slice(0, 4),
    QUESTION_BANK.find((question) => question.type === "coding")!,
  ];
  assert.equal(isQuestionBankReady(repositoryFor(partial)), false);
  assert.equal(isQuestionBankReady(repositoryFor(publishedNoncoding.slice(0, 5))), true);
});

test("reviewed C traces match independent output oracles", () => {
  const codeQuestions = QUESTION_BANK.filter(
    (question): question is Extract<Question, { type: "code-output" }> => question.type === "code-output",
  );
  assert.deepEqual(codeQuestions.map((question) => question.id).sort(), Object.keys(CODE_OUTPUT_ORACLE).sort());
  for (const question of codeQuestions) {
    const expected = CODE_OUTPUT_ORACLE[question.id]!;
    assert.deepEqual(question.output, expected, question.id);
    assert.equal(gradeQuestion(question, { questionId: question.id, answer: expected }), true, question.id);
    assert.equal(gradeQuestion(question, { questionId: question.id, answer: ["__incorrect__"] }), false, question.id);
  }
});

test("reviewed graph answers match independent traversal oracles", () => {
  for (const question of QUESTION_BANK.filter((item): item is GraphQuestion => item.type === "graph")) {
    const expected = graphOracle(question);
    assert.deepEqual(storedGraphAnswer(question), expected, question.id);
    assert.equal(gradeQuestion(question, { questionId: question.id, answer: expected }), true, question.id);
    const incorrect = Array.isArray(expected)
      ? expected.length > 1
        ? [expected[1]!, expected[0]!, ...expected.slice(2)]
        : ["__incorrect__"]
      : typeof expected === "boolean"
        ? !expected
        : expected === -1
          ? 0
          : expected + 1;
    assert.equal(gradeQuestion(question, { questionId: question.id, answer: incorrect }), false, question.id);
  }
});

test("browser coding fixtures are schema-valid and bounded", () => {
  assert.equal(CODING_PROBLEMS.length, 38);
  assert.equal(new Set(CODING_PROBLEMS.map((problem) => problem.id)).size, CODING_PROBLEMS.length);
  for (const problem of CODING_PROBLEMS) {
    assert.equal(CodingProblemSchema.safeParse(problem).success, true, problem.id);
    assert.ok(problem.testHarness.length <= 8_192, problem.id);
    const markers = [...problem.testHarness.matchAll(/FEA_TEST\|(\d+)\|/g)].map((match) => Number(match[1]));
    assert.ok(markers.length > 0, problem.id);
    assert.deepEqual(
      markers,
      markers.map((_, index) => index + 1),
      problem.id,
    );
    assert.equal(
      QUESTION_BANK.some((question) => question.id === `q-${problem.id}` && question.type === "coding"),
      true,
    );
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
  assert.equal(
    ServerEventSchemas["server:error"].safeParse({ code: "BAD_REQUEST", message: "Invalid request" }).success,
    true,
  );
  assert.equal(ServerEventSchemas["queue:state"].safeParse({ status: "waiting" }).success, false);
});

test("seeded selection is deterministic, topic-filtered, and has no repeated questions", () => {
  const first = selectSeededQuestions(QUESTION_BANK, "replay-seed", 10, ["stacks", "queues"]);
  const second = selectSeededQuestions(QUESTION_BANK, "replay-seed", 10, ["stacks", "queues"]);
  assert.deepEqual(
    first.map((question) => question.id),
    second.map((question) => question.id),
  );
  assert.equal(new Set(first.map((question) => question.id)).size, first.length);
  assert.ok(
    first.every(
      (question) => question.published !== false && (question.topicId === "stacks" || question.topicId === "queues"),
    ),
  );
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
  const repository = await loadQuestionRepository(
    { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "service-key" },
    { from: () => query } as never,
  );
  const loaded = repository.get(source.id)!;
  assert.equal(loaded.explanation, source.explanation);
  assert.equal("answer" in toPublicQuestion(loaded), false);
});

test("Supabase private content cannot overwrite canonical row fields", () => {
  const source = QUESTION_BANK.find((question) => question.type === "multiple-choice")!;
  const row = questionToRow(source);
  const loaded = questionFromRow({
    ...row,
    content: {
      ...(row.content as Record<string, unknown>),
      id: "q-forged",
      topicId: "queues",
      type: "multiple-choice",
      prompt: "Forged content prompt",
      difficulty: "stretch",
    },
    schema_version: 2,
    published: true,
  });
  assert.equal(loaded.id, source.id);
  assert.equal(loaded.topicId, source.topicId);
  assert.equal(loaded.type, source.type);
  assert.equal(loaded.prompt, source.prompt);
  assert.equal(loaded.difficulty, source.difficulty);
});

test("Supabase rows preserve legacy C content and load graph content", async () => {
  const code = QUESTION_BANK.find((question) => question.type === "code-output")!;
  assert.equal(code.type, "code-output");
  if (code.type !== "code-output") return;
  const storedCode = questionToRow(code);
  const legacyContent = { ...(storedCode.content as Record<string, unknown>) };
  delete legacyContent.code;
  const legacy = questionFromRow({
    ...storedCode,
    prompt: 'What line does this C fragment print? int a[3] = {2, 4, 6}; printf("%d", a[1] + a[2]);',
    content: legacyContent,
    schema_version: 2,
    published: true,
  });
  assert.equal(legacy.type, "code-output");
  assert.equal(legacy.code, code.code);

  const graph = QUESTION_BANK.find((question) => question.type === "graph")!;
  const row = { ...questionToRow(graph), schema_version: 3, published: true };
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: [row], error: null }),
  };
  const repository = await loadQuestionRepository(
    { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "service-key" },
    { from: () => query } as never,
  );
  assert.deepEqual(repository.get(graph.id), graph);
});

test("graph grading supports traversal, adjacency, reachability, and shortest paths", () => {
  const bfs = QUESTION_BANK.find((item) => item.id === "q-graph-bfs")!;
  const adjacency = QUESTION_BANK.find((item) => item.id === "q-graph-adjacency")!;
  const reachability = QUESTION_BANK.find((item) => item.id === "q-graph-reachability")!;
  const shortest = QUESTION_BANK.find((item) => item.id === "q-graph-shortest")!;
  assert.equal(gradeQuestion(bfs, { questionId: bfs.id, answer: ["a", "b", "c", "d", "e"] }), true);
  assert.equal(gradeQuestion(bfs, { questionId: bfs.id, answer: ["a", "c", "b", "d", "e"] }), false);
  assert.equal(gradeQuestion(adjacency, { questionId: adjacency.id, answer: ["a", "b", "d", "e"] }), true);
  assert.equal(gradeQuestion(reachability, { questionId: reachability.id, answer: "no" }), true);
  assert.equal(gradeQuestion(reachability, { questionId: reachability.id, answer: true }), false);
  assert.equal(gradeQuestion(shortest, { questionId: shortest.id, answer: "3" }), true);
  assert.equal(gradeQuestion(shortest, { questionId: "q-other", answer: 3 }), false);
  const graph = QUESTION_BANK.find((item) => item.type === "graph")!;
  const malformed = structuredClone(graph);
  malformed.graph.nodes.push({ ...malformed.graph.nodes[0]! });
  assert.equal(QuestionSchema.safeParse(malformed).success, false);
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
