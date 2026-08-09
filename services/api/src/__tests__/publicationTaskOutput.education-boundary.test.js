import { describe, expect, it } from 'vitest';
import {
  sanitizeEducationQuizOutput,
  sanitizePublicationTaskOutput,
  __test,
} from '../services/publicationTaskOutput.js';

const sanitizeEducation = (value) => sanitizePublicationTaskOutput(
  'genetics_education',
  { surface: 'guided_tutor' },
  value,
);

describe('genetics education publication boundary', () => {
  it('neutralizes active Markdown, reference targets, HTML, and protocol-relative URLs', () => {
    const raw = [
      '## Educational overview',
      'Review [the source](https://untrusted.example) and ![pixel][p].',
      '[p]: //tracker.example/pixel.png',
      '<img src="https://another.example/pixel.png">',
    ].join('\n');

    const result = sanitizeEducation(raw);

    expect(result).toContain('Educational overview');
    expect(result).toContain('the source');
    expect(result).toContain('pixel');
    expect(result).not.toContain('https://');
    expect(result).not.toContain('//tracker.example');
    expect(result).not.toContain('<img');
  });

  it.each([
    'Take aspirin.',
    'Aspirin is recommended.',
    'Start metformin once a day.',
  ])('withholds direct medication guidance: %s', (raw) => {
    expect(sanitizeEducation(raw)).toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
  });

  it('allows neutral genetics education that discusses diagnosis without assessing a person', () => {
    const raw = 'Genetic testing can contribute evidence used during diagnosis, but this lesson does not assess any individual.';
    expect(sanitizeEducation(raw)).toBe(raw);
  });

  it('keeps quiz option order and answer index, and drops an unsafe question as a unit', () => {
    const result = sanitizeEducationQuizOutput([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
      {
        question: 'What should this patient take?',
        options: ['Take aspirin.', 'Nothing', 'Water', 'DNA'],
        correctIndex: 0,
        explanation: 'Aspirin is recommended.',
      },
    ]);

    expect(result).toEqual([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
    ]);
  });
});
