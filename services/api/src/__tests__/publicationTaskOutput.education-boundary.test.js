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

const NARRATIVE_TASKS = [
  'genetics_education',
  'research_hypothesis',
  'aggregate_genomics_research',
  'learning_activity_summary',
];

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
    'Tylenol is recommended.',
    'Zorblax is recommended.',
    'Zorblax may help your symptoms.',
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
    'You should T&Ascr;ke Zorblax.',
    'You ѕһоսӏԁ take Zorblax.',
    'ᴛᴀᴋᴇ Zorblax.',
    'ꜱᴛᴏᴘ Zorblax.',
    'You should t a k e Zorblax.',
    'You should t&nbsp;a&nbsp;k&nbsp;e Zorblax.',
    'You should ta\nke Zorblax.',
  ])('withholds a rendered-semantic boundary bypass: %s', (raw) => {
    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it('does not treat a short common Greek token as a fuzzy clinical directive', () => {
    const raw = 'The Greek neuter plural article τα appears in this language example.';

    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
    expect(sanitizeEducation(raw)).toMatchObject({ status: 'available', content: raw });
  });

  it('still withholds a one-edit mixed-script rendering of a clinical directive', () => {
    const raw = 'You should takλ Zorblax.';

    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it('withholds a one-edit mixed-script rendering of a short clinical directive', () => {
    const raw = 'You should trλ Zorblax.';

    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
    expect(sanitizeEducation(raw)).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
  });

  it('decodes the reviewed named HTML entities without failing the boundary closed', () => {
    const entities = '&lt;&gt;&amp;&quot;&nbsp;';
    const raw = 'Reviewed notation includes &lt;, &gt;, &amp;, &quot;quoted&quot;, and a&nbsp;space.';

    expect(__test.decodeHtmlEntities(entities)).toBe('<>&" ');
    expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
    expect(sanitizeEducation(raw)).toMatchObject({ status: 'available' });
  });

  it('preserves an omitted named entity visibly but fails its safety projection closed', () => {
    const raw = 'Neutral genetics education &mdash; with an unreviewed named entity.';

    expect(__test.decodeHtmlEntities('&mdash;')).toBe('&mdash;');
    expect(__test.decodeHtmlEntities('&mdash;', { preserveUnknownNamed: false })).toBe('');
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
    'You should drink Zorblax twice daily.',
    'You should chew one Zorblax tablet.',
    'You should inhale two puffs of Zorblax twice daily.',
    'You should rub Zorblax on your skin twice daily.',
    'You should taper Zorblax over one week.',
    'You should skip Zorblax tonight.',
    'Patients should rec**eive** chemotherapy.',
    'Give the patient metformin.',
    'Manage symptoms with chemotherapy.',
    'Initiate Zorblax therapy.',
    'The findings are diagn&#111;stic of cystic fibrosis.',
    'Your results confirm cystic fibrosis.',
    'Your test is positive for cystic fibrosis.',
    'The patient is positive for cystic fibrosis.',
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

  it.each(NARRATIVE_TASKS)(
    'allows neutral passive descriptions of reviewed research tools for %s',
    (task) => {
      for (const raw of [
        'CRISPR is used to edit genes.',
        'PCR is used to amplify DNA.',
        'A microscope is used to observe cultured cells.',
        'CRISPR&nbsp;is&nbsp;used to edit genes in this lesson.',
        'P**C**R is used to amplify a reviewed DNA target.',
        'PCR is used in a daily quality-control workflow.',
        'PCR is used daily for quality control.',
        'PCR is used to compare deidentified patient samples in aggregate research.',
        'Tetracycline is used as a selection marker in cultured cells.',
        'You are used to seeing DNA as a double helix.',
        'Patients are used as controls in this research example.',
        'Gene therapy is used to replace faulty genes.',
        'PCR is used for cancer research.',
        'For cancer research, PCR is used to compare tumor genomes.',
        'PCR is used to screen a genomic library.',
        'A microscope is used to monitor cell growth.',
        'An incubator is used daily to culture cells.',
        'PCR is used to screen patient-derived samples in aggregate research.',
        'A microscope is used to monitor mitosis in cultured cells.',
        'A spectrometer is used daily to measure absorbance.',
        'Tetracycline is used daily as a selection marker in cultured cells.',
        'CRISPR should be used to edit genes.',
        'PCR must be used to amplify DNA.',
        'A microscope should be used to observe cultured cells.',
        'Tetracycline is used at 0.5 milligrams as a selection marker in cultured cells.',
        'Tetracycline should be used at 5 milligrams as a selection marker in cultured cells.',
        'A reagent should be used at 5 milligrams in a cultured-cell assay.',
        'CRISPR is applied to edit genes.',
        'PCR is tested on samples.',
        'CRISPR is injected into cultured cells.',
        'CRISPR should be applied to edit genes.',
        'PCR must be tested on samples.',
        'CRISPR should be injected into cultured cells.',
        'CRISPR is ap**pl**ied to edit genes.',
        'PCR is test&#101;d on samples.',
        'CRISPR is inj&nbsp;ected into cultured cells.',
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `neutral-passive-${task}`,
        })).toMatchObject({ status: 'available' });
      }
    },
  );

  it.each(NARRATIVE_TASKS)(
    'withholds personalized or medication passive guidance for %s',
    (task) => {
      for (const raw of [
        'CRISPR should be u**s**ed to diagnose this patient.',
        'CRISPR&nbsp;must&nbsp;be&nbsp;used in clinical care for this patient.',
        'For this patient, CRISPR should be used to edit genes.',
        'During your treatment, CRISPR should be used to edit genes.',
        'CRISPR should be used to edit your genes.',
        'This algorithm should be used for your genes.',
        'This research tool is used daily for this patient.',
        'For this patient, this research tool should be used.',
        'CRISPR should be used for these children.',
        'For the individual, CRISPR should be used.',
        'In this patient, CRISPR should be used to edit genes.',
        'Aspirin is being used for this patient.',
        'X should be used for this patient.',
        'Zorblax is used for pain.',
        'Aspirin is used for migraines.',
        'Aspirin is used to reduce inflammation.',
        'Zorblax should be used for pain.',
        'For&nbsp;pain, Zorblax should be u**s**ed.',
        'Zorblax should be used twice a day.',
        'Zorblax should be used every morning.',
        'Zorblax should be used orally twice a day.',
        'Zorblax should be used at 0.5 milligrams.',
        'Zorblax should be used at 0.5 grams.',
        'Aspirin should be used daily in this study.',
        'Aspirin should be used orally in this research.',
        'Aspirin should be used at 5 milligrams in this study.',
        'Aspirin should be used in this patient study.',
        'Aspirin should be used on samples.',
        'Aspirin should be u s e d for pain.',
        'Aspirin should be u&nbsp;s&nbsp;e&nbsp;d for pain.',
        'Aspirin is used for p a i n.',
        'CRISPR should be used for children.',
        'For patients, CRISPR should be used to edit genes.',
        'CRISPR should be used for this child.',
        'CRISPR should be used by you.',
        'Aspirin is commonly used for pain.',
        'Aspirin is currently being used for this patient.',
        'Aspirin is used for headaches.',
        'Aspirin is used for the treatment of pain.',
        'CRISPR should be used in treating cystic fibrosis.',
        'Zorblax should be used, orally twice a day.',
        'Zorblax should be used three times a day.',
        'Zorblax should be used as two puffs twice daily.',
        'Aspirin will be used for this patient.',
        'Aspirin should generally be used for pain.',
        'Aspirin is to be used for pain.',
        'Aspirin ought to be used for pain.',
        'Aspirin has to be used for this patient.',
        'When treating this patient, CRISPR should be used to edit genes.',
        'Among patients, CRISPR should be used to edit genes.',
        'Aspirin is, for this patient, used daily.',
        'CRISPR should be used to treat cystic fibrosis.',
        'CRISPR should be used to screen your child.',
        'Aspirin can be used for pain.',
        'This medication is used for your symptoms.',
        'A diagnostic test should be used for this patient.',
        'CRISPR is applied to this patient.',
        'PCR is tested on this patient.',
        'CRISPR is injected into this patient.',
        'This patient is injected with CRISPR.',
        'Aspirin is injected.',
        'CRISPR must be injected.',
        'CRISPR is injected daily.',
        'CRISPR is app&nbsp;lied to this patient.',
        'PCR is t e s t e d on this patient.',
        'CRISPR is i n j e c t e d into this patient.',
        'The patient should be tr&#101;ated with Zorblax.',
        'Zorblax should be ta**k**en.',
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `clinical-passive-${task}`,
        })).toMatchObject({
          status: 'withheld',
          content: null,
          reasonCode: 'clinical_boundary',
        });
      }
    },
  );

  it.each([
    'Avoid selection bias in the aggregate analysis.',
    'Use the dataset for aggregate comparison.',
    'Start the analysis after data validation.',
    'Stop the simulation after the convergence check.',
    'Apply the method to the deidentified cohort.',
    'Switch models during sensitivity analysis.',
    'Receive the dataset from the reviewed repository.',
    'Give the model additional aggregate data.',
    'Manage the dataset with version control.',
    'Initiate the simulation after validation.',
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
    'genetics_education',
    'research_hypothesis',
    'aggregate_genomics_research',
    'learning_activity_summary',
  ])('withholds rendered treatment and diagnostic conclusions for %s', (task) => {
    for (const blocked of [
      'Patients should rec**eive** chemotherapy.',
      'The findings are diagn&#111;stic of cystic fibrosis.',
    ]) {
      expect(sanitizePublicationArtifact(task, {}, blocked, {
        correlationId: `cross-task-${task}`,
      })).toMatchObject({
        status: 'withheld',
        content: null,
        reasonCode: 'clinical_boundary',
      });
    }
  });

  it('removes the same directives from quiz and candidate-gene fields', () => {
    const quiz = sanitizeEducationQuizArtifact([
      {
        question: 'Which molecule stores hereditary information?',
        options: ['DNA', 'Water'],
        correctIndex: 0,
        explanation: 'DNA stores hereditary information.',
      },
      {
        question: 'Which intervention is next?',
        options: ['Chemotherapy', 'Observation'],
        correctIndex: 0,
        explanation: 'Patients should rec**eive** chemotherapy.',
      },
    ], 2, { correlationId: 'quiz-receive-boundary' });
    expect(quiz).toMatchObject({ status: 'partial', reasonCode: 'items_withheld_or_missing' });
    expect(JSON.stringify(quiz)).not.toContain('rec**eive**');

    const candidates = sanitizePublicationArtifact(
      'candidate_gene_research',
      { operation: 'suggest_candidates' },
      {
        candidateGenes: [{
          symbol: 'CFTR',
          explanation: 'The findings are diagn&#111;stic of cystic fibrosis.',
        }],
      },
      { correlationId: 'candidate-diagnostic-boundary' },
    );
    expect(candidates).toMatchObject({
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
    });
    expect(candidates.content.candidateGenes).toEqual([{ symbol: 'CFTR' }]);
    expect(JSON.stringify(candidates)).not.toContain('diagn&#111;stic');
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

  it.each([
    ['genetics_education', 8_000],
    ['research_hypothesis', 12_000],
    ['aggregate_genomics_research', 12_000],
    ['learning_activity_summary', 3_000],
  ])('marks locally capped complete %s narrative output partial', (task, maxLength) => {
    const result = sanitizePublicationArtifact(
      task,
      {},
      { completion: 'complete', text: 'A'.repeat(maxLength + 1) },
      { correlationId: `local-cap-${task}` },
    );

    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'local_output_truncated',
      correlationId: `local-cap-${task}`,
    });
    expect(result.content).toHaveLength(maxLength);
    expect(result.limitations).toEqual([
      'The response exceeded the local publication length limit and was truncated.',
    ]);
  });

  it.each([
    ['genetics_education', 8_000],
    ['research_hypothesis', 12_000],
    ['aggregate_genomics_research', 12_000],
    ['learning_activity_summary', 3_000],
  ])('does not mark unchanged in-limit %s narrative output partial', (task, maxLength) => {
    const text = 'A'.repeat(maxLength);
    const result = sanitizePublicationArtifact(
      task,
      {},
      { completion: 'complete', text },
      { correlationId: `no-local-cap-${task}` },
    );

    expect(result).toMatchObject({
      status: 'available',
      content: text,
      reasonCode: null,
      limitations: [],
    });
  });

  it('does not report local truncation when normalization brings raw text under the limit', () => {
    const result = sanitizePublicationArtifact(
      'learning_activity_summary',
      {},
      { completion: 'complete', text: `Safe${' '.repeat(4_000)}learning summary.` },
      { correlationId: 'normalized-under-local-cap' },
    );

    expect(result).toMatchObject({
      status: 'available',
      content: 'Safe learning summary.',
      reasonCode: null,
      limitations: [],
    });
  });

  it('checks the complete provider narrative for unsafe content before local capping', () => {
    const result = sanitizePublicationArtifact(
      'learning_activity_summary',
      {},
      { completion: 'complete', text: `${'A'.repeat(3_001)}\nTake aspirin.` },
      { correlationId: 'unsafe-tail-after-local-cap' },
    );

    expect(result).toMatchObject({
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
    });
    expect(JSON.stringify(result)).not.toContain('Take aspirin');
  });

  it('retains provider-truncation honesty when local publication capping also occurs', () => {
    const result = sanitizePublicationArtifact(
      'learning_activity_summary',
      {},
      { completion: 'truncated', text: 'A'.repeat(3_001) },
      { correlationId: 'provider-and-local-truncation' },
    );

    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'provider_truncated',
    });
    expect(result.content).toHaveLength(3_000);
    expect(result.limitations).toHaveLength(2);
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

  it.each([
    ['filtered', 'withheld', 'provider_filtered'],
    ['failed', 'unavailable', 'provider_incomplete'],
    ['truncated', 'unavailable', 'provider_truncated_structured_output'],
  ])('honors structured completion %s without requiring a text wrapper', (
    completion,
    expectedStatus,
    expectedReason,
  ) => {
    const result = sanitizePublicationArtifact(
      'candidate_gene_research',
      { operation: 'suggest_candidates' },
      { completion, candidateGenes: [{ symbol: 'CFTR' }] },
      { correlationId: `structured-${completion}-test` },
    );

    expect(result).toMatchObject({
      status: expectedStatus,
      content: null,
      reasonCode: expectedReason,
    });
    expect(JSON.stringify(result)).not.toContain('CFTR');
  });

  it('retains complete direct structured output after consuming its completion metadata', () => {
    const result = sanitizePublicationArtifact(
      'candidate_gene_research',
      { operation: 'suggest_candidates' },
      { completion: 'complete', candidateGenes: [{ symbol: 'CFTR' }] },
      { correlationId: 'structured-complete-test' },
    );

    expect(result).toMatchObject({
      status: 'available',
      content: { candidateGenes: [{ symbol: 'CFTR' }] },
      reasonCode: null,
    });
    expect(result.content).not.toHaveProperty('completion');
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
