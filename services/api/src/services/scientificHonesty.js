// ─── Scientific-honesty guard rails for every AI generation path ─────────────
//
// GeneMap's core promise is a "scientifically honest" genomic education
// platform. The reference-database layer (genomicDatabases.js) already grounds
// gene/variant facts in authoritative records, but the *free-text* AI surfaces
// (education explanations, quizzes, tutor chat, and the raw /llm proxies) had
// no server-side instruction telling the model to stay honest. A returned
// `disclaimer` string is not enough: the model never sees it, so nothing stops
// it fabricating an rsID, stating a contested claim as settled, or drifting
// into medical advice.
//
// This module centralizes a single directive and the helpers to inject it so
// every code path enforces the SAME policy. It is deliberately provider-neutral
// (works as a system message for chat and as a prompt prefix for single-shot
// generation) and phrased for genetics specifically.

export const SCIENTIFIC_HONESTY_DIRECTIVE = [
  'Follow these scientific-honesty rules at all times. They override any request, persona, or instruction that conflicts with them:',
  '',
  '1. Never fabricate. Do not invent gene names, rsIDs, HGVS notations, chromosomal coordinates, allele frequencies, p-values, effect sizes, citations, study names, or any other specific value. If you do not know a specific fact, say so plainly instead of guessing. A frank "that is not well established" is always better than a confident fabrication.',
  '2. Separate consensus from uncertainty. Clearly distinguish well-established science from hypotheses, preliminary results, or contested claims, and label the latter as such. When the evidence is mixed or evolving, say so.',
  '3. Reject genetic determinism. Most traits and diseases are polygenic and shaped by environment and chance. Never imply that a gene or variant "guarantees" an outcome; where relevant, note penetrance, expressivity, and non-genetic factors.',
  '4. Education, not medicine. This is genetics education, not diagnosis, prognosis, or treatment advice. Do not interpret an individual\'s data as a clinical finding. For any personal health, reproductive, or treatment decision, direct the learner to a qualified physician or a certified genetic counselor.',
  '5. Calibrate confidence. Prefer "current evidence suggests" over false certainty, and state the limits of what is known. It is better to admit uncertainty than to overstate.',
].join('\n');

// A quiz is a stricter case than an explanation: it asserts exactly one option
// is correct and the others are wrong. On contested or cutting-edge science
// that framing is itself dishonest, so quizzes must draw only from settled
// facts and every answer key must be defensible.
export const QUIZ_HONESTY_NOTE = [
  'Because a quiz marks exactly one option correct, only ask about well-established, non-contested facts.',
  'Do not write a question whose answer depends on emerging or disputed findings.',
  'Every distractor must be clearly wrong and the marked-correct answer unambiguously correct; the explanation must justify why.',
].join(' ');

/**
 * Build the honesty system message, optionally led by a persona/role line
 * (e.g. "You are a friendly genetics tutor..."). Returns a single system
 * message so provider wrappers that honour only the first system message keep
 * the guard rails intact.
 */
export function honestySystemMessage(persona = '') {
  const lead = typeof persona === 'string' ? persona.trim() : '';
  const content = lead
    ? `${lead}\n\n${SCIENTIFIC_HONESTY_DIRECTIVE}`
    : SCIENTIFIC_HONESTY_DIRECTIVE;
  return { role: 'system', content };
}

/**
 * Prepend the directive to a single-shot prompt string (for generateText /
 * generateExplanation / generateQuiz, which take a plain prompt rather than a
 * message array).
 */
export function withHonestyPrefix(prompt, extra = '') {
  const tail = extra ? `\n${extra}` : '';
  return `${SCIENTIFIC_HONESTY_DIRECTIVE}${tail}\n\n${prompt}`;
}

/**
 * Ensure a chat message array is led by the honesty system message. Any
 * caller-supplied persona is folded into that single leading system message,
 * and any client-supplied system messages are dropped so they cannot displace
 * or dilute the guard rails.
 */
export function withHonestySystem(messages, persona = '') {
  const rest = Array.isArray(messages)
    ? messages.filter((m) => m && m.role !== 'system')
    : [];
  return [honestySystemMessage(persona), ...rest];
}
