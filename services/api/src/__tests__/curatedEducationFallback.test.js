import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { TOPICS_CATALOG, resolveEducationTopic } from '../config/educationCatalog.js';
import {
  CURATED_EDUCATION_VERSION,
  curatedEducationExplanation,
  curatedEducationQuiz,
  __test,
} from '../services/curatedEducationFallback.js';
import {
  sanitizeEducationQuizArtifact,
  sanitizePublicationArtifact,
} from '../services/publicationTaskOutput.js';

const LEVELS = [
  'elementary',
  'middle_school',
  'high_school',
  'undergraduate',
  'graduate',
  'postgraduate',
];
const TOPICS = TOPICS_CATALOG.flatMap((category) => category.topics);
const REVIEWED_CURRICULUM_RELEASE = Object.freeze({
  version: 4,
  sha256: '70c35bc34a9ef674926f8790eac5c536b7dc4926b4941276f126d133745e818b',
});

describe('curated education continuity curriculum', () => {
  it('covers every canonical topic with reusable, boundary-safe content at every level', () => {
    expect(CURATED_EDUCATION_VERSION).toBe(4);
    expect(__test.TOPIC_IDS).toEqual(TOPICS.map((topic) => topic.id));

    for (const listedTopic of TOPICS) {
      const topic = resolveEducationTopic(listedTopic.id);
      for (const level of LEVELS) {
        const content = curatedEducationExplanation(topic, level);
        expect(content).toContain(topic.title);
        expect(content.length).toBeGreaterThan(500);
        expect(content).toContain('## The Big Picture');
        expect(content).toContain('## How It Works');
        expect(content).toContain('## Why It Matters');
        expect(content).toContain('## Key Takeaways');

        const publication = sanitizePublicationArtifact(
          'genetics_education',
          { surface: 'curated_explanation', topic: topic.id, level },
          content,
          { correlationId: `test:${topic.id}:${level}` },
        );
        expect(publication).toMatchObject({
          status: 'available',
          reasonCode: null,
          limitations: [],
        });
        expect(publication.content).toBe(content);
      }
    }
  });

  it('builds deterministic, valid quizzes without pretending to satisfy an unbounded request', () => {
    for (const listedTopic of TOPICS) {
      const topic = resolveEducationTopic(listedTopic.id);
      for (const level of LEVELS) {
        const first = curatedEducationQuiz(topic, level, 20);
        const second = curatedEducationQuiz(topic, level, 20);
        expect(second).toEqual(first);
        expect(first).toHaveLength(3);

        for (const item of first) {
          expect(item.question).toContain(topic.title);
          expect(item.options).toHaveLength(4);
          expect(new Set(item.options).size).toBe(4);
          expect(item.correctIndex).toBeGreaterThanOrEqual(0);
          expect(item.correctIndex).toBeLessThan(item.options.length);
          expect(item.explanation).toBe(item.options[item.correctIndex]);
        }

        const publication = sanitizeEducationQuizArtifact(first, first.length, {
          correlationId: `test:${topic.id}:${level}:quiz`,
        });
        expect(publication.status).toBe('available');
        expect(publication.content).toHaveLength(3);
      }
    }
  });

  it('changes both lesson language and quiz cognition across all six levels', () => {
    const topic = resolveEducationTopic('dna-replication');
    const lessons = LEVELS.map((level) => curatedEducationExplanation(topic, level));
    const quizzes = LEVELS.map((level) => curatedEducationQuiz(topic, level, 3));

    expect(new Set(lessons).size).toBe(LEVELS.length);
    expect(new Set(quizzes.map((quiz) => JSON.stringify(quiz))).size).toBe(LEVELS.length);
    expect(lessons[0]).toContain('One clear idea:');
    expect(lessons[0]).toContain('copying proteins called DNA polymerases');
    expect(lessons[0]).not.toContain('copying proteins called copying proteins');
    expect(lessons[0]).not.toContain('complementary strands');
    expect(JSON.stringify(quizzes[0])).not.toContain('copying proteins called copying proteins');
    expect(lessons[3]).toContain('Causal sequence:');
    expect(lessons[3]).toContain('perturbation, comparison, and downstream readout');
    expect(lessons[4]).toContain('orthogonal measurements');
    expect(lessons[5]).toContain('causal identifiability');
    expect(lessons[5]).toContain('identifiability conditions');
    expect(lessons[5]).toContain('latent variables');
    expect(quizzes[0][0].question).toContain('simple idea');
    expect(quizzes[4][1].explanation).toContain('confounders and uncertainty sources');
    expect(quizzes[5][0].question).toContain('model-scoped');
  });

  it('binds the independent curriculum revision to the exact reviewed material', () => {
    const payload = TOPICS.flatMap((listedTopic) => {
      const topic = resolveEducationTopic(listedTopic.id);
      return LEVELS.map((level) => ({
        topic: topic.id,
        level,
        lesson: curatedEducationExplanation(topic, level),
        quiz: curatedEducationQuiz(topic, level, 20),
      }));
    });
    const sha256 = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    expect({ version: CURATED_EDUCATION_VERSION, sha256 })
      .toEqual(REVIEWED_CURRICULUM_RELEASE);
  });
});
