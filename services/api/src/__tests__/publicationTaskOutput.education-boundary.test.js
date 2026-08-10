import { describe, expect, it } from 'vitest';
import {
  sanitizeEducationQuizArtifact,
  sanitizeEducationQuizOutput,
  sanitizePublicationArtifact,
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

    const result = sanitizeEducation(raw).content;

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
    'Take Zorblax.',
    'For pain, take Zorblax.',
    'Review the evidence, then take Zorblax.',
    'Discontinue Zorblax.',
    'Zorblax should be taken.',
    'You should take Zorblax.',
    'We recommend you switch to Zorblax.',
    'I recommend taking Zorblax.',
    'I recommend Zorblax.',
    'You may have Zorblax syndrome.',
    'Your results indicate that you have Zorblax syndrome.',
    'Your results are consistent with Zorblax syndrome.',
  ])('withholds direct medication guidance: %s', (raw) => {
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it.each([
    'T**a**ke Tylenol.',
    'T[a](https://example.invalid)ke Tylenol.',
    'T[a](https://example.invalid/path_(nested))ke Tylenol.',
    'T<em>ak</em>e Tylenol.',
    'T<span title=">">ak</span>e Tylenol.',
    'T.a.k.e Tylenol.',
    'Take/Tylenol.',
    '&#84;&#97;&#107;&#101; Tylenol.',
    'T&ZeroWidthSpace;ake Tylenol.',
    'Educational overview&NewLine;Take Tylenol.',
    '\uff34\uff41\uff4b\uff45 Tylenol.',
    'Ta\u00adke Tylenol.',
    'Ta\u200bke Tylenol.',
    'Ta\u202eke Tylenol.',
    'Take\u00a0Tylenol.',
    'Educational overview\u2028Take Tylenol.',
    'Ta\u0301ke Tylenol.',
    '\u0422a\u043a\u0435 Tylenol.',
    '\u03a4a\u03bae Tylenol.',
    'take5mg.',
    'take-5mg.',
  ])('withholds a rendered-semantic boundary bypass: %s', (raw) => {
    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it.each([
    'Screen yourself for cancer.',
    'Get a diagnostic test.',
    'Order genetic screening.',
    'Test yourself for BRCA1 variants.',
    'Treat the condition with Zorblax.',
    'Monitor your blood pressure daily.',
    'You definitely have cystic fibrosis.',
    'Try Zorblax for the symptoms.',
    'You need Zorblax.',
    'You sһould take Zorblax.',
  ])('withholds generic diagnostic or treatment directives: %s', (raw) => {
    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it('allows neutral genetics education without personalized or actionable guidance', () => {
    const raw = 'Genetic testing can contribute evidence used during clinical evaluation, but this lesson does not assess any individual.';
    expect(sanitizeEducation(raw)).toMatchObject({ status: 'available', content: raw });
  });

  it.each([
    'Avoid selection bias in the aggregate analysis.',
    'Use the dataset for aggregate comparison.',
    'Start the analysis after data validation.',
    'Stop the simulation after the convergence check.',
    'Apply the method to the deidentified cohort.',
    'Switch models during sensitivity analysis.',
    'Take this example as a conceptual model.',
    'For aggregate comparison, use regression.',
    'I recommend further research and source verification.',
    'I recommend reviewing authoritative sources.',
  ])('does not overblock an obvious research instruction: %s', (raw) => {
    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
    expect(sanitizeEducation(raw)).toMatchObject({ status: 'available', content: raw });
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

  it('publishes only safe quiz items and marks the artifact partial when an item is rejected', () => {
    const result = sanitizeEducationQuizArtifact({
      completion: 'complete',
      text: [
        {
          question: 'Which molecule stores hereditary information?',
          options: ['DNA', 'Water', 'Glucose', 'Aspirin'],
          correctIndex: 0,
          explanation: 'DNA stores hereditary information.',
        },
        {
          question: 'What should this patient take?',
          options: ['T**a**ke Zorblax.', 'Water'],
          correctIndex: 0,
          explanation: 'Use the medication daily.',
        },
      ],
    }, 2, { correlationId: 'quiz-boundary-test' });

    expect(result.status).toBe('partial');
    expect(result.content).toHaveLength(1);
    expect(JSON.stringify(result.content)).not.toMatch(/Zorblax|medication daily/i);
    expect(result.limitations).toHaveLength(1);
  });

  it.each([
    ['filtered', 'withheld', 'provider_filtered'],
    ['failed', 'unavailable', 'provider_incomplete'],
  ])('maps provider completion %s to a content-free %s artifact', (
    completion,
    expectedStatus,
    expectedReason,
  ) => {
    const result = sanitizePublicationArtifact(
      'genetics_education',
      {},
      { completion, text: 'Safe-looking provider text that must not escape.' },
      { correlationId: `provider-${completion}-test` },
    );

    expect(result).toMatchObject({
      status: expectedStatus,
      content: null,
      reasonCode: expectedReason,
    });
    expect(JSON.stringify(result)).not.toContain('Safe-looking provider text');
  });

  it('publishes safe truncated narrative content only as partial', () => {
    const result = sanitizePublicationArtifact(
      'genetics_education',
      {},
      { completion: 'truncated', text: 'DNA stores hereditary information' },
      { correlationId: 'provider-truncated-test' },
    );

    expect(result).toMatchObject({
      status: 'partial',
      content: 'DNA stores hereditary information',
      reasonCode: 'provider_truncated',
    });
    expect(result.limitations).toHaveLength(1);
  });

  it('fails closed on truncated structured output even when its parsed prefix looks valid', () => {
    const result = sanitizeEducationQuizArtifact({
      completion: 'truncated',
      text: [{
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      }],
    }, 1, { correlationId: 'quiz-truncated-test' });

    expect(result).toMatchObject({
      status: 'unavailable',
      content: null,
      reasonCode: 'provider_truncated_structured_output',
    });
  });

  it('fails closed when a provider supplies an unrecognized completion state', () => {
    const result = sanitizePublicationArtifact(
      'genetics_education',
      {},
      { completion: 'maybe_complete', text: 'DNA stores hereditary information.' },
      { correlationId: 'provider-unknown-state-test' },
    );

    expect(result).toMatchObject({
      status: 'unavailable',
      content: null,
      reasonCode: 'provider_incomplete',
    });
  });

  it('never includes blocked text in a withheld artifact, including when truncated', () => {
    const blocked = 'T<em>ak</em>e Zorblax.';
    const result = sanitizePublicationArtifact(
      'genetics_education',
      {},
      { completion: 'truncated', text: blocked },
      { correlationId: 'provider-truncated-withheld-test' },
    );

    expect(result).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
    expect(JSON.stringify(result)).not.toContain(blocked);
  });
});
