import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  QuestionSchema,
  selectSeededQuestions,
  toPublicQuestion,
  toRevealedQuestion,
  type PublicQuestion,
  type Question,
  type RevealedQuestion,
  type TopicId,
} from "../../../shared/domain.js";
import { QUESTION_BANK, validateQuestionBank } from "../data/questions.js";

const reviewedQuestions = validateQuestionBank(QUESTION_BANK);

const LEGACY_C_CODE: Record<string, string> = {
  "q-array-c-output": `int a[3] = {2, 4, 6};
printf("%d", a[1] + a[2]);`,
  "q-recursion-c-output": `void countdown(int n) {
  if (n == 0) return;
  printf("%d ", n);
  countdown(n - 1);
}

countdown(3);`,
  "q-array-c-output-2": `int a[4] = {1, 3, 5, 7};
printf("%d", a[0] + a[3]);`,
  "q-list-c-output": `struct Node { int value; struct Node *next; };
struct Node n2 = {9, 0};
struct Node n1 = {4, &n2};
printf("%d", n1.next->value);`,
  "q-stack-c-output": `int top = 0;
top++;
top++;
top--;
printf("%d", top);`,
  "q-queue-c-output": `struct Node { int value; struct Node *next; };
struct Node n3 = {11, 0};
struct Node n2 = {8, &n3};
struct Node n1 = {5, &n2};
struct Node *front = &n1;
front = front->next;
printf("%d", front->value);`,
  "q-tree-c-output": `int left_key = 2;
int key = 5;
int right_key = 9;
printf("%d %d %d ", left_key, key, right_key);`,
  "q-avl-c-output": `int left_height = 2;
int right_height = 4;
int balance = left_height - right_height;
printf("%d", balance);`,
  "q-heap-c-output": `int heap[2] = {12, 7};
printf("%d", heap[0] >= heap[1]);`,
  "q-hash-c-output": `printf("%d", 29 % 6);`,
  "q-trie-c-output": `int found_cat = 1;
int found_can = 0;
printf("%d", found_cat + found_can);`,
  "q-sort-c-output": `int x = 3;
int y = 1;
if (x > y) printf("sorted");
else printf("swap");`,
  "q-recursion-c-output-2": `void f(int n) {
  if (n == 0) return;
  f(n - 1);
  printf("%d ", n);
}

f(2);`,
  "q-analysis-c-output": `int x = 2 + 3 * 4;
printf("%d", x);`,
};

const makeInMemoryRepository = (questions: readonly Question[]): QuestionRepository => ({
  list: (topicIds) =>
    topicIds?.length
      ? questions.filter((question) => question.published !== false && topicIds.includes(question.topicId))
      : questions.filter((question) => question.published !== false),
  select: (seed, count, topicIds, includeCoding = false) =>
    selectSeededQuestions(questions, seed, count, topicIds, includeCoding),
  get: (id) => questions.find((question) => question.published !== false && question.id === id),
});
export type QuestionRepository = {
  list(topicIds?: readonly TopicId[]): Question[];
  select(seed: string, count: number, topicIds?: readonly TopicId[], includeCoding?: boolean): Question[];
  get(id: string): Question | undefined;
};

export const inMemoryQuestionRepository = makeInMemoryRepository(reviewedQuestions);

/** Database rows keep common searchable fields separate and type-specific private data extensible. */
export type QuestionBankRow = {
  id: string;
  topic_id: string;
  question_type: string;
  prompt: string;
  explanation: string;
  assumptions: unknown;
  provenance: unknown;
  difficulty: string;
  content: unknown;
  schema_version: number;
  published: boolean;
  version: number;
};

export const questionToRow = (question: Question): Omit<QuestionBankRow, "schema_version"> => {
  const {
    id,
    topicId,
    type,
    prompt,
    explanation,
    assumptions,
    provenance,
    difficulty,
    published,
    version,
    ...content
  } = question;
  return {
    id,
    topic_id: topicId,
    question_type: type,
    prompt,
    explanation,
    assumptions,
    provenance,
    difficulty,
    content,
    published: published !== false,
    version: version ?? 1,
  };
};

export const questionFromRow = (row: QuestionBankRow): Question => {
  if (!row || typeof row.content !== "object" || row.content === null || Array.isArray(row.content)) {
    throw new Error(`Question ${row?.id ?? "unknown"} has invalid private content.`);
  }
  const content = { ...(row.content as Record<string, unknown>) };
  if (row.question_type === "code-output" && typeof content.code !== "string") {
    const legacyCode = LEGACY_C_CODE[row.id];
    if (!legacyCode) throw new Error(`Legacy C question ${row.id} has no curated code.`);
    content.code = legacyCode;
  }
  return QuestionSchema.parse({
    ...content,
    id: row.id,
    topicId: row.topic_id,
    type: row.question_type,
    prompt: row.prompt,
    explanation: row.explanation,
    assumptions: row.assumptions,
    provenance: row.provenance,
    difficulty: row.difficulty,
    published: row.published !== false,
    version: row.version ?? 1,
  });
};

export class SupabaseQuestionRepository implements QuestionRepository {
  private readonly questions: Question[];

  constructor(questions: readonly Question[]) {
    this.questions = validateQuestionBank(questions);
  }

  list(topicIds?: readonly TopicId[]): Question[] {
    return topicIds?.length
      ? this.questions.filter((question) => question.published !== false && topicIds.includes(question.topicId))
      : this.questions.filter((question) => question.published !== false);
  }

  select(seed: string, count: number, topicIds?: readonly TopicId[], includeCoding = false): Question[] {
    return selectSeededQuestions(this.questions, seed, count, topicIds, includeCoding);
  }

  get(id: string): Question | undefined {
    return this.questions.find((question) => question.published !== false && question.id === id);
  }
}

export type QuestionBankEnvironment = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };
export const hasQuestionBankConfiguration = (environment: QuestionBankEnvironment): boolean =>
  Boolean(environment.SUPABASE_URL?.trim() && environment.SUPABASE_SECRET_KEY?.trim());

export const loadQuestionRepository = async (
  environment: QuestionBankEnvironment = process.env,
  client?: SupabaseClient,
): Promise<QuestionRepository> => {
  if (!hasQuestionBankConfiguration(environment)) return inMemoryQuestionRepository;
  const supabase =
    client ??
    createClient(environment.SUPABASE_URL!.trim(), environment.SUPABASE_SECRET_KEY!.trim(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const { data, error } = await supabase
    .from("question_bank")
    .select("*")
    .eq("published", true)
    .order("id", { ascending: true });
  if (error) throw new Error(`Supabase question-bank load failed: ${error.message}`);
  const questions = (data ?? []).map((row) => questionFromRow(row as QuestionBankRow));
  if (!questions.length) throw new Error("Supabase question-bank load returned no published reviewed questions.");
  return new SupabaseQuestionRepository(questions);
};

/** The match and solo services use this live binding; startup swaps it after the DB load. */
export let questionRepository: QuestionRepository = inMemoryQuestionRepository;
export const setQuestionRepository = (repository: QuestionRepository) => {
  questionRepository = repository;
};

export const publicQuestion = (question: Question): PublicQuestion => toPublicQuestion(question);
export const revealedQuestion = (question: Question): RevealedQuestion => toRevealedQuestion(question);
export const questionBankStats = () => {
  const questions = questionRepository.list();
  return {
    total: questions.length,
    topics: new Set(questions.map((question) => question.topicId)).size,
    types: Object.fromEntries(
      [...new Set(questions.map((question) => question.type))]
        .sort()
        .map((type) => [type, questions.filter((question) => question.type === type).length]),
    ),
  };
};
