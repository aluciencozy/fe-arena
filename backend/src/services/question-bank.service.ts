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

const makeInMemoryRepository = (questions: readonly Question[]): QuestionRepository => ({
  list: (topicIds) => topicIds?.length ? questions.filter((question) => topicIds.includes(question.topicId)) : [...questions],
  select: (seed, count, topicIds) => selectSeededQuestions(questions, seed, count, topicIds),
  get: (id) => questions.find((question) => question.id === id),
});

export type QuestionRepository = {
  list(topicIds?: readonly TopicId[]): Question[];
  select(seed: string, count: number, topicIds?: readonly TopicId[]): Question[];
  get(id: string): Question | undefined;
};

export const inMemoryQuestionRepository = makeInMemoryRepository(reviewedQuestions);

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
};

export const questionToRow = (question: Question): Omit<QuestionBankRow, "schema_version" | "published"> => {
  const { id, topicId, type, prompt, explanation, assumptions, provenance, difficulty, ...content } = question;
  return { id, topic_id: topicId, question_type: type, prompt, explanation, assumptions, provenance, difficulty, content };
};

export const questionFromRow = (row: QuestionBankRow): Question => {
  if (!row || typeof row.content !== "object" || row.content === null || Array.isArray(row.content)) {
    throw new Error(`Question ${row?.id ?? "unknown"} has invalid private content.`);
  }
  const content = { ...(row.content as Record<string, unknown>) };
  if (row.question_type === "code-output" && typeof content.code !== "string" && typeof row.prompt === "string") content.code = row.prompt;
  return QuestionSchema.parse({
    id: row.id,
    topicId: row.topic_id,
    type: row.question_type,
    prompt: row.prompt,
    explanation: row.explanation,
    assumptions: row.assumptions,
    provenance: row.provenance,
    difficulty: row.difficulty,
    ...content,
  });
};

export class SupabaseQuestionRepository implements QuestionRepository {
  private readonly questions: Question[];

  constructor(questions: readonly Question[]) {
    this.questions = validateQuestionBank(questions);
  }

  list(topicIds?: readonly TopicId[]): Question[] {
    return topicIds?.length ? this.questions.filter((question) => topicIds.includes(question.topicId)) : [...this.questions];
  }

  select(seed: string, count: number, topicIds?: readonly TopicId[]): Question[] {
    return selectSeededQuestions(this.questions, seed, count, topicIds);
  }

  get(id: string): Question | undefined {
    return this.questions.find((question) => question.id === id);
  }
}

export type QuestionBankEnvironment = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };
export const hasQuestionBankConfiguration = (environment: QuestionBankEnvironment): boolean => Boolean(
  environment.SUPABASE_URL?.trim() && environment.SUPABASE_SECRET_KEY?.trim(),
);

export const loadQuestionRepository = async (
  environment: QuestionBankEnvironment = process.env,
  client?: SupabaseClient,
): Promise<QuestionRepository> => {
  if (!hasQuestionBankConfiguration(environment)) return inMemoryQuestionRepository;
  const supabase = client ?? createClient(environment.SUPABASE_URL!.trim(), environment.SUPABASE_SECRET_KEY!.trim(), {
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

export let questionRepository: QuestionRepository = inMemoryQuestionRepository;
export const setQuestionRepository = (repository: QuestionRepository) => { questionRepository = repository; };

export const publicQuestion = (question: Question): PublicQuestion => toPublicQuestion(question);
export const revealedQuestion = (question: Question): RevealedQuestion => toRevealedQuestion(question);
export const questionBankStats = () => {
  const questions = questionRepository.list();
  return {
    total: questions.length,
    topics: new Set(questions.map((question) => question.topicId)).size,
    types: Object.fromEntries([...new Set(questions.map((question) => question.type))].sort().map((type) => [type, questions.filter((question) => question.type === type).length])),
  };
};
