import {
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

/** Repository boundary: replace this module with a database-backed repository later. */
export interface QuestionRepository {
  list(topicIds?: readonly TopicId[]): Question[];
  select(seed: string, count: number, topicIds?: readonly TopicId[]): Question[];
  get(id: string): Question | undefined;
}

export const questionRepository: QuestionRepository = {
  list: (topicIds) => topicIds?.length ? reviewedQuestions.filter((question) => topicIds.includes(question.topicId)) : [...reviewedQuestions],
  select: (seed, count, topicIds) => selectSeededQuestions(reviewedQuestions, seed, count, topicIds),
  get: (id) => reviewedQuestions.find((question) => question.id === id),
};

export const publicQuestion = (question: Question): PublicQuestion => toPublicQuestion(question);
export const revealedQuestion = (question: Question): RevealedQuestion => toRevealedQuestion(question);
export const questionBankStats = () => ({ total: reviewedQuestions.length, topics: new Set(reviewedQuestions.map((question) => question.topicId)).size });
