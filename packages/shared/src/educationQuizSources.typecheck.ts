import type { ApiClient } from './client.js';
import type { EducationSource } from './types.js';

// This compile-time contract keeps the canonical provenance returned by
// /education/quiz visible to every typed client consumer.
type GenerateQuizResponse = Awaited<ReturnType<ApiClient['generateQuiz']>>;
type Assert<T extends true> = T;
type IsExact<Left, Right> = [Left, Right] extends [Right, Left] ? true : false;

type _QuizSourcesRemainCanonical = Assert<
  IsExact<GenerateQuizResponse['sources'], EducationSource[]>
>;

export {};
