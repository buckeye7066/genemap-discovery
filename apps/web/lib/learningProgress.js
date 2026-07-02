// Single source of truth for per-topic learning status, so the Learn Genetics
// summary counter and the Learning Path tracker can never disagree on what
// counts as progress. A topic is:
//   mastered    - best quiz score >= 80% of the quiz's questions
//   in_progress - at least one quiz attempt, but not yet mastered
//   not_started - no attempts recorded
//
// A progress record looks like { topicId, bestScore, totalQuestions, attempts }.
export const MASTERY_THRESHOLD = 0.8;

export function isMastered(p) {
  // Guard totalQuestions > 0: without it, a record with totalQuestions === 0
  // satisfies `0 >= 0` and would be falsely counted as mastered.
  return !!p && p.totalQuestions > 0 && p.bestScore >= p.totalQuestions * MASTERY_THRESHOLD;
}

export function getTopicStatus(progress, topicId) {
  const p = Array.isArray(progress) ? progress.find((pr) => pr.topicId === topicId) : null;
  if (!p) return 'not_started';
  if (isMastered(p)) return 'mastered';
  if (p.attempts > 0) return 'in_progress';
  return 'not_started';
}

export function countMastered(progress) {
  return Array.isArray(progress) ? progress.filter(isMastered).length : 0;
}
