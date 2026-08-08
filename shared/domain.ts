import { z } from "zod";

/** Stable identifiers shared by the question bank, API, and future account-backed stores. */
export const TOPICS = [
  { id: "arrays-memory", label: "Arrays and C memory" },
  { id: "linked-lists", label: "Singly linked lists" },
  { id: "stacks", label: "Stacks" },
  { id: "queues", label: "Queues" },
  { id: "binary-trees", label: "Binary trees and BSTs" },
  { id: "avl-trees", label: "AVL trees" },
  { id: "heaps", label: "Heaps and priority queues" },
  { id: "hash-tables", label: "Hash tables" },
  { id: "tries", label: "Tries" },
  { id: "sorting", label: "Sorting" },
  { id: "recursion", label: "Recursion" },
  { id: "analysis-mathematics", label: "Algorithm analysis and representation" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export type QuestionType =
  "multiple-choice" | "numeric" | "short-answer" | "code-output" | "ordered-sequence" | "graph" | "coding";
export type GraphOperation = "bfs-order" | "dfs-order" | "adjacency" | "reachability" | "shortest-path";
export type MatchSource = "private" | "public";
export type MatchMode = "quiz" | "mixed";
export const MatchModeSchema = z.enum(["quiz", "mixed"]);
export type MatchPhase =
  | "LOBBY"
  | "SETUP"
  | "READY"
  | "COUNTDOWN"
  | "QUESTION"
  | "REVEAL"
  | "RESULTS"
  | "REMATCH"
  | "PAUSED"
  | "FORFEIT"
  | "ABANDONED"
  | "EXPIRED";

export const QuestionTypeSchema = z.enum([
  "multiple-choice",
  "numeric",
  "short-answer",
  "code-output",
  "ordered-sequence",
  "graph",
  "coding",
]);
export const GraphOperationSchema = z.enum(["bfs-order", "dfs-order", "adjacency", "reachability", "shortest-path"]);
export const GraphNodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  x: z.number().finite().min(0).max(100),
  y: z.number().finite().min(0).max(100),
});
export const GraphEdgeSchema = z.object({
  from: z.string().regex(/^[a-z0-9-]+$/),
  to: z.string().regex(/^[a-z0-9-]+$/),
});
export const GraphSchema = z.object({
  directed: z.boolean(),
  nodes: z.array(GraphNodeSchema).min(1).max(40),
  edges: z.array(GraphEdgeSchema).max(120),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphDefinition = z.infer<typeof GraphSchema>;
export const TopicIdSchema = z.enum(TOPICS.map((topic) => topic.id) as [TopicId, ...TopicId[]]);
export const MatchSourceSchema = z.enum(["private", "public"]);
export const MatchPhaseSchema = z.enum([
  "LOBBY",
  "SETUP",
  "READY",
  "COUNTDOWN",
  "QUESTION",
  "REVEAL",
  "RESULTS",
  "REMATCH",
  "PAUSED",
  "FORFEIT",
  "ABANDONED",
  "EXPIRED",
]);

const ProvenanceSchema = z.object({
  source: z.string().min(1),
  note: z.string().min(1),
});

const BaseQuestionSchema = z.object({
  id: z.string().regex(/^q-[a-z0-9-]+$/),
  topicId: TopicIdSchema,
  type: QuestionTypeSchema,
  prompt: z.string().min(10),
  explanation: z.string().min(10),
  assumptions: z.array(z.string()).min(1),
  provenance: ProvenanceSchema,
  difficulty: z.enum(["intro", "core", "stretch"]),
  /** Publishing is a content-policy flag; retired questions remain in history. */
  published: z.boolean().optional(),
  /** Monotonic authored-bank version for forward content revisions. */
  version: z.number().int().positive().optional(),
});

export const CodingProblemSchema = z.object({
  id: z.string().regex(/^c-[a-z0-9-]+$/),
  title: z.string().min(3),
  description: z.string().min(10),
  functionSignature: z
    .string()
    .min(3)
    .refine((value) => !/[{};]/.test(value), {
      message: "Function signatures cannot contain a body or statement delimiter.",
    }),
  starterCode: z.string().min(1),
  prefix: z.string().min(1),
  testHarness: z.string().min(1),
});
export type CodingProblem = z.infer<typeof CodingProblemSchema>;

export const QuestionSchema = z.discriminatedUnion("type", [
  BaseQuestionSchema.extend({
    type: z.literal("multiple-choice"),
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
    answer: z.string().min(1),
  }),
  BaseQuestionSchema.extend({
    type: z.literal("numeric"),
    answer: z.number().finite(),
    tolerance: z.number().nonnegative(),
    unit: z.string().optional(),
  }),
  BaseQuestionSchema.extend({
    type: z.literal("short-answer"),
    answers: z.array(z.string().min(1)).min(1),
  }),
  BaseQuestionSchema.extend({
    type: z.literal("code-output"),
    language: z.literal("c"),
    code: z.string().min(1),
    output: z.array(z.string()).min(1),
  }),
  BaseQuestionSchema.extend({
    type: z.literal("ordered-sequence"),
    items: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
    answerOrder: z.array(z.string().min(1)).min(2),
  }),
  BaseQuestionSchema.extend({
    type: z.literal("coding"),
    problem: CodingProblemSchema,
  }),
  BaseQuestionSchema.extend({
    type: z.literal("graph"),
    graph: GraphSchema,
    operation: GraphOperationSchema,
    startNode: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    targetNode: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    nodeId: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    answerOrder: z
      .array(z.string().regex(/^[a-z0-9-]+$/))
      .min(1)
      .optional(),
    adjacentNodes: z.array(z.string().regex(/^[a-z0-9-]+$/)).optional(),
    reachable: z.boolean().optional(),
    distance: z.number().int().min(-1).optional(),
  }).superRefine((question, context) => {
    const nodeIds = new Set(question.graph.nodes.map((node) => node.id));
    if (nodeIds.size !== question.graph.nodes.length)
      context.addIssue({ code: "custom", path: ["graph", "nodes"], message: "Graph node IDs must be unique." });
    for (const edge of question.graph.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
        context.addIssue({
          code: "custom",
          path: ["graph", "edges"],
          message: "Graph edges must reference displayed nodes.",
        });
    }
    const requireNode = (field: "startNode" | "targetNode" | "nodeId") => {
      const value = question[field];
      if (!value || !nodeIds.has(value))
        context.addIssue({ code: "custom", path: [field], message: `${field} must reference a displayed node.` });
    };
    if (question.operation === "bfs-order" || question.operation === "dfs-order") {
      requireNode("startNode");
      if (!question.answerOrder?.every((id) => nodeIds.has(id)))
        context.addIssue({
          code: "custom",
          path: ["answerOrder"],
          message: "Traversal answers must reference displayed nodes.",
        });
    }
    if (question.operation === "adjacency") {
      requireNode("nodeId");
      if (!question.adjacentNodes || !question.adjacentNodes.every((id) => nodeIds.has(id)))
        context.addIssue({
          code: "custom",
          path: ["adjacentNodes"],
          message: "Adjacency answers must reference displayed nodes.",
        });
    }
    if (question.operation === "reachability" || question.operation === "shortest-path") {
      requireNode("startNode");
      requireNode("targetNode");
    }
    if (question.operation === "reachability" && question.reachable === undefined)
      context.addIssue({
        code: "custom",
        path: ["reachable"],
        message: "Reachability questions need a boolean answer.",
      });
    if (question.operation === "shortest-path" && question.distance === undefined)
      context.addIssue({
        code: "custom",
        path: ["distance"],
        message: "Shortest-path questions need a distance answer.",
      });
  }),
]);
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionAttemptSchema = z.object({
  questionId: z.string().min(1).max(128),
  answer: z.union([z.string().max(4096), z.number(), z.boolean(), z.array(z.string().max(256)).max(100)]),
});
export type QuestionAttempt = z.infer<typeof QuestionAttemptSchema>;

export type CodingAnswer = {
  type: "coding";
  passed: boolean;
  outcome: "success" | "compile-error" | "runtime-error" | "timeout";
  tests: CodingTestResult[];
};
export type PublicAnswer = string | number | boolean | string[] | CodingAnswer;

export type PublicQuestion = {
  id: string;
  topicId: TopicId;
  type: QuestionType;
  prompt: string;
  difficulty: Question["difficulty"];
  options?: Array<{ id: string; label: string }>;
  unit?: string;
  language?: "c";
  code?: string;
  items?: Array<{ id: string; label: string }>;
  orderLength?: number;
  answerLength?: number;
  graph?: GraphDefinition;
  operation?: GraphOperation;
  startNode?: string;
  targetNode?: string;
  nodeId?: string;
  problem?: CodingProblem;
};

export type RevealedQuestion = PublicQuestion & {
  explanation: string;
  assumptions: string[];
  provenance: { source: string; note: string };
  answer: PublicAnswer;
};

export const toPublicQuestion = (question: Question): PublicQuestion => {
  const base: PublicQuestion = {
    id: question.id,
    topicId: question.topicId,
    type: question.type,
    prompt: question.prompt,
    difficulty: question.difficulty,
  };
  if (question.type === "multiple-choice") return { ...base, options: question.options };
  if (question.type === "numeric") return question.unit ? { ...base, unit: question.unit } : base;
  if (question.type === "code-output") return { ...base, language: question.language, code: question.code };
  if (question.type === "coding") return { ...base, problem: question.problem };
  if (question.type === "ordered-sequence")
    return { ...base, items: question.items, orderLength: question.answerOrder.length };
  if (question.type === "graph") {
    const view: PublicQuestion = { ...base, graph: question.graph, operation: question.operation };
    if (question.startNode) view.startNode = question.startNode;
    if (question.targetNode) view.targetNode = question.targetNode;
    if (question.nodeId) view.nodeId = question.nodeId;
    const answerLength =
      question.operation === "bfs-order" || question.operation === "dfs-order"
        ? question.answerOrder?.length
        : question.operation === "adjacency"
          ? question.adjacentNodes?.length
          : undefined;
    if (answerLength !== undefined) view.answerLength = answerLength;
    return view;
  }
  return base;
};

export const toRevealedQuestion = (question: Question): RevealedQuestion => {
  const publicQuestion = toPublicQuestion(question);
  const answer =
    question.type === "multiple-choice"
      ? question.answer
      : question.type === "numeric"
        ? question.answer
        : question.type === "short-answer"
          ? question.answers
          : question.type === "code-output"
            ? question.output
            : question.type === "coding"
              ? ({ type: "coding", passed: true, outcome: "success", tests: [] } satisfies CodingAnswer)
              : question.type === "ordered-sequence"
                ? question.answerOrder
                : question.operation === "bfs-order" || question.operation === "dfs-order"
                  ? question.answerOrder!
                  : question.operation === "adjacency"
                    ? question.adjacentNodes!
                    : question.operation === "reachability"
                      ? question.reachable!
                      : question.distance!;
  return {
    ...publicQuestion,
    explanation: question.explanation,
    assumptions: question.assumptions,
    provenance: question.provenance,
    answer,
  };
};

/** User-facing text is normalized without fuzzy grading: every accepted alias is explicit in content. */
export const normalizeAnswer = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeSequence = (answer: string[]): string[] => answer.map((item) => normalizeAnswer(item)).filter(Boolean);

export const gradeQuestion = (question: Question, attempt: QuestionAttempt): boolean => {
  if (attempt.questionId !== question.id) return false;
  if (question.type === "multiple-choice")
    return typeof attempt.answer === "string" && attempt.answer === question.answer;
  if (question.type === "numeric") {
    const candidate = typeof attempt.answer === "number" ? attempt.answer : Number(attempt.answer);
    return Number.isFinite(candidate) && Math.abs(candidate - question.answer) <= question.tolerance;
  }
  if (question.type === "short-answer") {
    if (typeof attempt.answer !== "string") return false;
    const normalized = normalizeAnswer(attempt.answer);
    return question.answers.some((answer) => normalizeAnswer(answer) === normalized);
  }
  if (question.type === "code-output") {
    if (!Array.isArray(attempt.answer) && typeof attempt.answer !== "string") return false;
    const candidate = Array.isArray(attempt.answer) ? attempt.answer : attempt.answer.split(/\r?\n/);
    return normalizeSequence(candidate).join("\n") === normalizeSequence(question.output).join("\n");
  }
  if (question.type === "coding") return false;
  if (question.type === "ordered-sequence") {
    if (!Array.isArray(attempt.answer)) return false;
    return normalizeSequence(attempt.answer).join("|") === normalizeSequence(question.answerOrder).join("|");
  }
  if (question.operation === "bfs-order" || question.operation === "dfs-order") {
    return (
      Array.isArray(attempt.answer) &&
      normalizeSequence(attempt.answer).join("|") === normalizeSequence(question.answerOrder ?? []).join("|")
    );
  }
  if (question.operation === "adjacency") {
    return (
      Array.isArray(attempt.answer) &&
      normalizeSequence(attempt.answer).join("|") === normalizeSequence(question.adjacentNodes ?? []).join("|")
    );
  }
  if (question.operation === "reachability") {
    if (typeof attempt.answer === "boolean") return attempt.answer === question.reachable;
    if (typeof attempt.answer !== "string") return false;
    const normalized = normalizeAnswer(attempt.answer);
    const yes = ["true", "yes", "reachable", "connected"];
    const no = ["false", "no", "unreachable", "not reachable", "disconnected"];
    return question.reachable ? yes.includes(normalized) : no.includes(normalized);
  }
  const candidate =
    typeof attempt.answer === "number"
      ? attempt.answer
      : typeof attempt.answer === "string"
        ? Number(attempt.answer)
        : NaN;
  return Number.isInteger(candidate) && candidate === question.distance;
};

export const QUESTION_TIMER_MIN_SECONDS = 30;
export const QUESTION_TIMER_MAX_SECONDS = 300;
export const PUBLIC_QUESTION_SECONDS = 300;
/** Toolchain initialization is outside this deadline; coding gets a 60-second run window. */
export const CODING_QUESTION_SECONDS = 60;
export const PUBLIC_QUEUE_MAX_WAIT_SECONDS = 300;
export const PAUSE_SECONDS = 30;
export const REVEAL_SECONDS = 30;
export const DEFAULT_ROUND_COUNT = 5;
export const MAX_ROUND_COUNT = 5;

export type ScoreBreakdown = { correctness: number; speedBonus: number; total: number };
export const calculateScore = (correct: boolean, elapsedMs: number, timerMs: number): ScoreBreakdown => {
  if (!correct) return { correctness: 0, speedBonus: 0, total: 0 };
  const safeTimer = Math.max(1, timerMs);
  const safeElapsed = Math.max(0, Math.min(elapsedMs, safeTimer));
  const speedBonus = Math.round(300 * (1 - safeElapsed / safeTimer));
  return { correctness: 1000, speedBonus, total: 1000 + speedBonus };
};

export const createSeededRandom = (seed: string | number) => {
  let value =
    typeof seed === "number"
      ? seed >>> 0
      : Array.from(seed).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const seededShuffle = <T>(items: readonly T[], seed: string | number): T[] => {
  const random = createSeededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
};

export const selectSeededQuestions = (
  questions: readonly Question[],
  seed: string | number,
  count: number,
  topicIds?: readonly TopicId[],
  includeCoding = false,
) => {
  const unique = new Map<string, Question>();
  for (const question of questions) unique.set(question.id, question);
  const allowed = [...unique.values()].filter(
    (question) =>
      question.published !== false &&
      (question.type === "coding" ? includeCoding : !topicIds?.length || topicIds.includes(question.topicId)),
  );
  if (!allowed.length || count <= 0 || allowed.length < count) return [];
  const shuffled = seededShuffle(allowed, seed);
  const selected = shuffled.slice(0, count);
  if (includeCoding && !selected.some((question) => question.type === "coding")) {
    const codingQuestion = shuffled.find((question) => question.type === "coding");
    if (!codingQuestion) return [];
    const codingSlot = Math.floor(createSeededRandom(`${seed}:coding-slot`)() * count);
    selected[codingSlot] = codingQuestion;
  }
  return selected;
};

export type MatchScore = { playerId: string; playerName: string; total: number; correct: number; responseMs: number };
export type TopicPerformance = {
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  score: number;
  responseMs: number;
};
export const emptyTopicPerformance = (): TopicPerformance => ({
  attempted: 0,
  correct: 0,
  incorrect: 0,
  accuracy: 0,
  score: 0,
  responseMs: 0,
});
export const compareScores = (left: MatchScore, right: MatchScore): MatchScore => {
  if (left.correct !== right.correct) return left.correct > right.correct ? left : right;
  if (left.total !== right.total) return left.total > right.total ? left : right;
  if (left.responseMs !== right.responseMs) return left.responseMs < right.responseMs ? left : right;
  return left;
};

export const MatchConfigSchema = z.object({
  topicIds: z.array(TopicIdSchema).min(1).max(TOPICS.length),
  roundCount: z.number().int().min(1).max(MAX_ROUND_COUNT),
  questionTimerSeconds: z.number().int().min(QUESTION_TIMER_MIN_SECONDS).max(QUESTION_TIMER_MAX_SECONDS),
  /** Mixed playlists may contain curated browser-only coding rounds. */
  includeCoding: z.boolean().optional(),
});
export type MatchConfig = z.infer<typeof MatchConfigSchema>;

export const CreatePrivateSchema = z.object({
  requestId: z.string().uuid(),
  username: z.string().trim().min(1).max(24),
  config: MatchConfigSchema,
});
export const JoinRoomSchema = z.object({
  roomId: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6}$/i),
  username: z.string().trim().min(1).max(24),
});
export const ReconnectSchema = z.object({
  roomId: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6}$/i),
  reconnectToken: z.string().uuid(),
});
export const QueueJoinSchema = z.object({
  username: z.string().trim().min(1).max(24),
  queueToken: z.string().uuid().optional(),
});
export const ChatSchema = z.object({ message: z.string().trim().min(1).max(280) });
export const SubmitSchema = QuestionAttemptSchema;
export const SoloStartSchema = z.object({
  topicIds: z.array(TopicIdSchema).min(1).max(TOPICS.length),
  count: z.number().int().min(1).max(MAX_ROUND_COUNT).default(DEFAULT_ROUND_COUNT),
  timerSeconds: z.number().int().min(QUESTION_TIMER_MIN_SECONDS).max(QUESTION_TIMER_MAX_SECONDS).default(120),
});
export const AuthUpdateSchema = z.object({ accessToken: z.string().max(8192).nullable() });

export const CodingTestResultSchema = z.object({
  index: z.number().int().positive().max(100),
  name: z.string().min(1).max(100),
  passed: z.boolean(),
});
export const CodingRunResultSchema = z.object({
  questionId: z.string().min(1),
  passed: z.boolean(),
  tests: z.array(CodingTestResultSchema).max(20),
  outcome: z.enum(["success", "compile-error", "runtime-error", "timeout"]),
});
export type CodingRunResult = z.infer<typeof CodingRunResultSchema>;
export type CodingTestResult = z.infer<typeof CodingTestResultSchema>;
export const CodingAnswerSchema: z.ZodType<CodingAnswer> = z.object({
  type: z.literal("coding"),
  passed: z.boolean(),
  outcome: z.enum(["success", "compile-error", "runtime-error", "timeout"]),
  tests: z.array(CodingTestResultSchema).max(20),
});
export type CodingProgress = {
  status: CodingProgressStatus;
  completedAt: number | null;
  passed: boolean | null;
  tests: z.infer<typeof CodingTestResultSchema>[];
  outcome: CodingRunResult["outcome"] | null;
};
export const CodingProgressStatusSchema = z.enum([
  "idle",
  "worker",
  "sdk",
  "runtime",
  "compiler",
  "compiling",
  "running",
  "failed",
  "complete",
]);
export type CodingProgressStatus = z.infer<typeof CodingProgressStatusSchema>;
export const CodingProgressUpdateSchema = z.enum([
  "worker",
  "sdk",
  "runtime",
  "compiler",
  "compiling",
  "running",
  "failed",
]);
export type CodingProgressUpdate = z.infer<typeof CodingProgressUpdateSchema>;
export const PublicQuestionSchema = z.object({
  id: z.string().min(1),
  topicId: TopicIdSchema,
  type: QuestionTypeSchema,
  prompt: z.string().min(1),
  difficulty: z.enum(["intro", "core", "stretch"]),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).optional(),
  unit: z.string().optional(),
  language: z.literal("c").optional(),
  code: z.string().min(1).optional(),
  items: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).optional(),
  orderLength: z.number().int().positive().optional(),
  answerLength: z.number().int().nonnegative().optional(),
  graph: GraphSchema.optional(),
  operation: GraphOperationSchema.optional(),
  startNode: z.string().optional(),
  targetNode: z.string().optional(),
  nodeId: z.string().optional(),
  problem: CodingProblemSchema.optional(),
});
export const RevealedQuestionSchema = PublicQuestionSchema.and(
  z.object({
    explanation: z.string().min(1),
    assumptions: z.array(z.string()).min(1),
    provenance: ProvenanceSchema,
    answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), CodingAnswerSchema]),
  }),
);
export const ScoreBreakdownSchema: z.ZodType<ScoreBreakdown> = z.object({
  correctness: z.number().nonnegative(),
  speedBonus: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
export const RoomMetadataSchema = z.object({
  roomId: z.string().regex(/^[A-Z0-9]{6}$/),
  source: MatchSourceSchema,
  hostSeatId: z.string().uuid(),
  config: MatchConfigSchema,
});
export const SafeRoomSeatSchema = z.object({
  seatId: z.string().uuid(),
  name: z.string().min(1),
  connected: z.boolean(),
});
export const RoomStateSchema = z.object({ metadata: RoomMetadataSchema, seats: z.array(SafeRoomSeatSchema).max(2) });
export const SubmissionPublicSchema = z.object({
  submitted: z.boolean(),
  correct: z.boolean().nullable(),
  score: ScoreBreakdownSchema.nullable(),
  answer: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), CodingAnswerSchema]).nullable(),
});
export const RoundHistorySchema = z.object({
  round: z.number().int().positive(),
  question: RevealedQuestionSchema,
  submissions: z.record(z.string(), SubmissionPublicSchema),
});
export const CodingProgressSchema = z.object({
  status: CodingProgressStatusSchema,
  completedAt: z.number().nullable(),
  passed: z.boolean().nullable(),
  tests: z.array(CodingTestResultSchema).max(20),
  outcome: z.enum(["success", "compile-error", "runtime-error", "timeout"]).nullable(),
});
export const MatchPublicStateSchema = z.object({
  roomId: z.string().regex(/^[A-Z0-9]{6}$/),
  source: MatchSourceSchema,
  phase: MatchPhaseSchema,
  config: MatchConfigSchema,
  roundIndex: z.number().int().nonnegative(),
  totalRounds: z.number().int().nonnegative(),
  question: PublicQuestionSchema.nullable(),
  revealedQuestion: RevealedQuestionSchema.nullable(),
  questionStartedAt: z.number().nullable(),
  questionEndsAt: z.number().nullable(),
  countdownEndsAt: z.number().nullable(),
  revealStartedAt: z.number().nullable(),
  revealEndsAt: z.number().nullable(),
  revealSkips: z.record(z.string(), z.boolean()),
  rematchRequests: z.record(z.string(), z.boolean()),
  pause: z.object({ seatName: z.string().min(1), expiresAt: z.number() }).nullable(),
  ready: z.record(z.string(), z.boolean()),
  /** Browser capability readiness gates the first coding-round timer. */
  codingReady: z.record(z.string(), z.boolean()),
  codingProgress: z.record(z.string(), CodingProgressSchema),
  submissions: z.record(z.string(), SubmissionPublicSchema),
  scores: z.record(
    z.string(),
    z.object({
      total: z.number().nonnegative(),
      correct: z.number().int().nonnegative(),
      responseMs: z.number().nonnegative(),
    }),
  ),
  topicSummary: z.record(
    TopicIdSchema,
    z.object({
      attempted: z.number().int().nonnegative(),
      correct: z.number().int().nonnegative(),
      incorrect: z.number().int().nonnegative(),
      accuracy: z.number().nonnegative().max(1),
      score: z.number().nonnegative(),
      responseMs: z.number().nonnegative(),
    }),
  ),
  winnerSeatId: z.string().uuid().nullable(),
  endReason: z.enum(["completed", "forfeit", "abandoned", "expired"]).nullable(),
  history: z.array(RoundHistorySchema),
});
export const SoloStateSchema = z.object({
  phase: z.enum(["QUESTION", "RESULT", "COMPLETE"]),
  question: PublicQuestionSchema.nullable(),
  revealedQuestion: RevealedQuestionSchema.nullable(),
  questionStartedAt: z.number().nullable(),
  questionEndsAt: z.number().nullable(),
  result: z.object({ correct: z.boolean(), score: ScoreBreakdownSchema }).nullable(),
  topicSummary: z.record(
    TopicIdSchema,
    z.object({
      attempted: z.number().int().nonnegative(),
      correct: z.number().int().nonnegative(),
      incorrect: z.number().int().nonnegative(),
      accuracy: z.number().nonnegative().max(1),
      score: z.number().nonnegative(),
      responseMs: z.number().nonnegative(),
    }),
  ),
  runScore: z.number().nonnegative(),
  runCorrect: z.number().int().nonnegative(),
  runTotal: z.number().int().nonnegative(),
});

export const NoPayloadSchema = z.undefined();
export const ClientEventSchemas = {
  "room:create-private": CreatePrivateSchema,
  "room:join": JoinRoomSchema,
  "room:reconnect": ReconnectSchema,
  "room:state-request": NoPayloadSchema,
  "room:leave": NoPayloadSchema,
  "queue:join": QueueJoinSchema,
  "queue:leave": NoPayloadSchema,
  "match:configure": MatchConfigSchema,
  "match:ready": NoPayloadSchema,
  "match:coding-ready": NoPayloadSchema,
  "match:coding-progress": z.object({ status: CodingProgressUpdateSchema }),
  "match:coding-complete": CodingRunResultSchema,
  "match:submit": SubmitSchema,
  "match:reveal-skip": NoPayloadSchema,
  "match:rematch": NoPayloadSchema,
  "chat:send": ChatSchema,
  "solo:start": SoloStartSchema,
  "solo:submit": SubmitSchema,
  "solo:next": NoPayloadSchema,
  "auth:update": AuthUpdateSchema,
} as const;
export const ServerEventSchemas = {
  "room:created": z.object({
    requestId: z.string().uuid(),
    roomId: z.string().regex(/^[A-Z0-9]{6}$/),
    metadata: RoomMetadataSchema,
    seatId: z.string().uuid(),
    reconnectToken: z.string().uuid(),
  }),
  "room:session": z.object({
    roomId: z.string().regex(/^[A-Z0-9]{6}$/),
    seatId: z.string().uuid(),
    reconnectToken: z.string().uuid(),
  }),
  "room:state": RoomStateSchema,
  "room:reconnect-failed": z.object({ message: z.string().min(1) }),
  "queue:state": z.discriminatedUnion("status", [
    z.object({ status: z.literal("waiting"), expiresAt: z.number(), queueToken: z.string().uuid() }),
    z.object({ status: z.enum(["expired", "cancelled"]) }),
  ]),
  "queue:matched": z.object({ roomId: z.string().regex(/^[A-Z0-9]{6}$/), metadata: RoomMetadataSchema }),
  "queue:seat": z.object({
    roomId: z.string().regex(/^[A-Z0-9]{6}$/),
    seatId: z.string().uuid(),
    reconnectToken: z.string().uuid(),
  }),
  "match:state": MatchPublicStateSchema,
  "chat:message": z.object({
    type: z.enum(["system", "user"]),
    sender: z.string().min(1),
    text: z.string().min(1).max(280),
    sentAt: z.number(),
  }),
  "solo:state": SoloStateSchema,
  "server:error": z.object({ code: z.string().min(1), message: z.string().min(1) }),
} as const;

export const canConfigureMatch = (source: MatchSource, hostSeatId: string, seatId: string | null): boolean =>
  source === "private" && seatId === hostSeatId;
export const topicLabel = (topicId: TopicId) => TOPICS.find((topic) => topic.id === topicId)?.label ?? topicId;
