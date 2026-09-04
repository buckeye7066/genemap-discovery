import { describe, expect, it } from 'vitest';
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

describe('curated education continuity curriculum', () => {
  it('covers every canonical topic with reusable, boundary-safe content at every level', () => {
    expect(CURATED_EDUCATION_VERSION).toBe(1);
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
        expect(['available', 'partial']).toContain(publication.status);
        expect(typeof publication.content).toBe('string');
        expect(publication.content.length).toBeGreaterThan(500);
      }
    }
  });

  it('builds deterministic, valid quizzes without pretending to satisfy an unbounded request', () => {
    for (const listedTopic of TOPICS) {
      const topic = resolveEducationTopic(listedTopic.id);
      const first = curatedEducationQuiz(topic, 'undergraduate', 20);
      const second = curatedEducationQuiz(topic, 'undergraduate', 20);
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
        correlationId: `test:${topic.id}:quiz`,
      });
      expect(publication.status).toBe('available');
      expect(publication.content).toHaveLength(3);
    }
  });
});
