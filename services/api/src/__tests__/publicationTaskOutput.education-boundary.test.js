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

  it('preserves safe lesson sections while withholding a clinical paragraph', () => {
    const raw = [
      '## The Big Picture',
      'DNA stores hereditary information in cells.',
      '## Unsafe Provider Paragraph',
      'Take aspirin.',
      '## Key Takeaways',
      '- DNA can be copied before cell division.',
    ].join('\n');

    const result = sanitizeEducation(raw);

    expect(result).toMatchObject({
      status: 'partial',
      reasonCode: 'clinical_sections_withheld',
    });
    expect(result.content).toContain('DNA stores hereditary information');
    expect(result.content).toContain('DNA can be copied');
    expect(result.content).not.toContain('Unsafe Provider Paragraph');
    expect(result.content).not.toContain('aspirin');
    expect(result.limitations).not.toHaveLength(0);
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

  it.each(NARRATIVE_TASKS)(
    'publishes neutral genetics noun phrases and bounded research instructions for %s',
    (task) => {
      for (const raw of [
        'Start codons signal where translation begins.',
        'Stop codons terminate translation.',
        'Start-loss variants can disrupt translation.',
        'Stop-loss variants can extend a protein.',
        'Stop-gain variants can truncate a protein.',
        'Start/stop codons define an open reading frame.',
        'Start and stop codons define an open reading frame.',
        'Stop and start codons define an open reading frame.',
        'Start–stop coordinates delimit the interval.',
        'Start and end coordinates delimit the interval.',
        'Start–end coordinates delimit the interval.',
        'Test crosses reveal inheritance patterns.',
        'Test statistics summarize evidence.',
        'Test performance is summarized here.',
        'Test sets support model validation.',
        'Test/use cases are reviewed in this lesson.',
        'Use-dependent effects are described here.',
        'Use in research is described here.',
        'Use as a selection marker is described here.',
        'Use is measured in the aggregate cohort.',
        'Use of CRISPR can illustrate gene editing.',
        'Use of aspirin was measured as an aggregate cohort variable.',
        'Use a Punnett square to predict inheritance ratios.',
        'Start PCR after validation.',
        'Stop the simulation after convergence.',
        'Test the model on deidentified data.',
        'You can use a Punnett square in this lesson.',
        'You might test the model on aggregate data.',
        'Patients may stop the research survey.',
        'People may use a Punnett square.',
        'We may start PCR.',
        'You should not use the dataset before validation.',
        'You should not test the model before validation.',
        'The study should test variants in cultured cells.',
        'Researchers should test the model.',
        'Students should test their understanding.',
        'Test patient-derived samples in a laboratory assay.',
        'Use patient-derived samples for aggregate research.',
        'Test your understanding with this genetics quiz.',
        'How to use a Punnett square is explained here.',
        'When to start PCR depends on the validated workflow.',
        'Should you use a Punnett square in this example?',
        'Use the dataset and then test the model.',
        'Test the model before using the dataset.',
        'Start the analysis to apply the method.',
        'Do use the dataset for this comparison.',
        'The next step is to start the analysis.',
        'Screen the genomic library in the assay.',
        'How to screen the genomic library is explained here.',
        'Diagnose the model failure before rerunning it.',
        'Testing is recommended for quality control.',
        'The test is recommended for this assay.',
        'I recommend using the dataset.',
        'I recommend further research.',
        'The recommendation is further research.',
        'Recommendation: further research.',
        'The preferred option is the aggregate model.',
        'The aggregate model is the preferred option.',
        'The model is appropriate for this analysis.',
        'The method is indicated for this assay.',
        'Use the model to estimate population-level cancer risk.',
        'Use the model to compare aggregate cancer-risk estimates across deidentified cohorts.',
        'Combine datasets from the two cohorts.',
        'Pause the simulation after convergence.',
        'Maintain the workflow under version control.',
        'Replace the model after validation.',
        'Remove the outlier from the dataset.',
        'Add variants to the analysis.',
        'Refill the assay reservoir.',
        'Dose cultured cells with the reagent in this assay.',
        'Redose cultured cells in the assay.',
        'Take care when interpreting aggregate results.',
        'Use caution when comparing small cohorts.',
        'A 5 mg reagent aliquot was tested in cultured cells.',
        'BRCA1 penetrance is approximately 80 percent in this study.',
        'The variant prevalence was 50% in the aggregate cohort.',
        'Use the model to estimate 50% prevalence in the aggregate cohort.',
        'Use a P**u**nnett square to predict ratios.',
        'Use a Punnett&nbsp;square to predict ratios.',
        'Start P**C**R after validation.',
        'Use of C**R**ISPR can illustrate gene editing.',
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `neutral-directive-${task}`,
        })).toMatchObject({
          status: 'available',
        });
      }
    },
  );

  it.each(NARRATIVE_TASKS)(
    'withholds ambiguous clinical directives across modal and rendered boundaries for %s',
    (task) => {
      for (const raw of [
        'Start Zorblax.',
        'Stop Zorblax.',
        'Test yourself for cancer.',
        'Use Zorblax.',
        'You may start Zorblax.',
        'You can stop Zorblax.',
        'This patient may use Zorblax.',
        'Patients could test for cancer.',
        'You may want to start Zorblax.',
        'Consider using Zorblax.',
        'Test the gene before starting Zorblax.',
        'Use the model before stopping Zorblax.',
        'Use the model to take Zorblax.',
        'Start the analysis to administer Zorblax.',
        'Use the dataset to begin Zorblax.',
        'Test the gene before taking Zorblax.',
        'It may be reasonable to start Zorblax.',
        'The next step is to start Zorblax.',
        'How to take Zorblax.',
        'Steps to inject Zorblax.',
        'Ways to administer Zorblax.',
        'Consider taking Zorblax.',
        'Can you take Zorblax?',
        'How should you take Zorblax?',
        'Do take Zorblax.',
        'Before you start Zorblax, read the label.',
        'After you stop Zorblax, rest.',
        'This patient may use the gene panel.',
        'This patient can start PCR.',
        'Use a Punnett square to estimate personal risk.',
        'Use a Punnett square to estimate your childs disease risk.',
        'Use the model to predict cancer risk.',
        'Use gene data to calculate disease risk.',
        'Start care.',
        'Stop care.',
        'You may start care.',
        'This patient should start care.',
        'Begin care.',
        'Continue care.',
        'Resume care.',
        'This child may start Zorblax.',
        'The child can use Zorblax.',
        'A child should stop Zorblax.',
        'One can take Zorblax.',
        'People may use Zorblax.',
        'I would start Zorblax.',
        'We may stop Zorblax.',
        'They can take Zorblax.',
        'Readers may use Zorblax.',
        'You should not take Zorblax.',
        'You should never start Zorblax.',
        'You may not use Zorblax.',
        'Patients must not stop Zorblax.',
        'You cannot use Zorblax.',
        'You do not need to take Zorblax.',
        'This patient is not to use Zorblax.',
        'When to start Zorblax.',
        'Should you use Zorblax?',
        'Use the model to start Zorblax.',
        'Use the model to choose Zorblax.',
        'Use the gene panel for this patient.',
        'You may stаrt Zorblax.',
        'You may u s e Zorblax.',
        'You may u&nbsp;s&nbsp;e Zorblax.',
        'Safe context — Start Zorblax.',
        'Safe context / Start Zorblax.',
        'Safe context • Start Zorblax.',
        'Safe context “Start Zorblax.”',
        'Safe context (Start Zorblax.)',
        'Safe context&#8212;Start Zorblax.',
        'Safe context<br>Start Zorblax.',
        '<div>Safe context</div><div>Start Zorblax.</div>',
        '- [ ] Start Zorblax.',
        '| Start Zorblax |',
        'Safe context — Take Zorblax.',
        'Safe context<br>Inject Zorblax.',
        'You may drink Zorblax.',
        'Patients might receive Zorblax.',
        `Use the model ${' carefully'.repeat(25)} to start Zorblax.`,
        `Use the dataset ${' carefully'.repeat(25)} for this patient.`,
        `You may use the model ${' carefully'.repeat(25)} to take Zorblax.`,
        'Dose Zorblax.',
        'Dose this patient with Zorblax.',
        'How to dose Zorblax.',
        'Medicate with Zorblax.',
        'Medicate this patient with Zorblax.',
        'You should medicate with Zorblax.',
        'Redose Zorblax.',
        'Refill Zorblax.',
        'Combine Zorblax with aspirin.',
        'Restart Zorblax.',
        'Re-start Zorblax.',
        'Hold Zorblax.',
        'Pause Zorblax.',
        'Cease Zorblax.',
        'Maintain Zorblax.',
        'Keep taking Zorblax.',
        'Keep using Zorblax.',
        'Replace aspirin with Zorblax.',
        'Substitute Zorblax for aspirin.',
        'Remove Zorblax from the regimen.',
        'Add Zorblax to the regimen.',
        'Zorblax should be restarted.',
        'Aspirin should be restarted.',
        'Zorblax should be held.',
        'Zorblax should be paused.',
        'Zorblax should be maintained.',
        'Zorblax should be removed from the regimen.',
        'Zorblax may be used at thirteen milligrams.',
        'Zorblax can be taken at twenty milligrams.',
        'Zorblax may be injected at 5 IU.',
        'Zorblax can be used at 500 nanograms.',
        'Zorblax may be applied as a 1% solution.',
        'Zorblax can be taken as 2 cc.',
        'Zorblax may be used each morning.',
        'Zorblax can be taken twice per day.',
        'Zorblax may be injected every 8 h.',
        'Zorblax may be used three times weekly.',
        'Zorblax can be taken with breakfast.',
        'Zorblax may be used on Mondays.',
        'Zorblax can be taken q8h.',
        'Zorblax is used at thirteen milligrams.',
        'Zorblax is taken at 5 IU.',
        'Zorblax is applied as a 1% solution.',
        'Apply Zorblax as a 2% solution.',
        'Zorblax is applied as a 2 percent solution.',
        'This patient should use a 2 percent solution.',
        'Zorblax is taken q8h.',
        'Zorblax is used each morning.',
        'Use the model to estimate personal risk from aggregate data.',
        'Use the model to calculate individualized risk from deidentified data.',
        'Use the model to estimate your disease risk using aggregate evidence.',
        'Use the model to calculate individualized genetic risk.',
        'Use the model to determine your cardiovascular risk.',
        'Use the model to assess individual recurrence risk.',
        'Use gene data to calculate family risk.',
        'I recommend starting care.',
        'I recommend Zorblax.',
        'This patient is advised to use the gene panel.',
        'Recommendation: Zorblax.',
        'My recommendation is Zorblax.',
        'The recommendation is to start Zorblax.',
        'Zorblax is my recommendation.',
        'The preferred option is Zorblax.',
        'Zorblax is the preferred choice for this patient.',
        'A reasonable option is Zorblax for this patient.',
        'Zorblax is appropriate for this patient.',
        'Zorblax is suitable for you.',
        'Zorblax is a good choice for this patient.',
        'The best choice for this patient is Zorblax.',
        'Zorblax would be beneficial for this patient.',
        'Zorblax is indicated for this patient.',
        'Zorblax is advised for this patient.',
        'Choice for this patient: Zorblax.',
        'Medication for this patient: Zorblax.',
        'Treatment for this patient: Zorblax.',
        'For this patient: Zorblax.',
        'For pain: Zorblax.',
        'The treatment is Zorblax.',
        `Zorblax${' extended'.repeat(20)} is appropriate for this patient.`,
        `Zorblax${' extended'.repeat(20)} is my recommendation.`,
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `clinical-directive-${task}`,
        })).toMatchObject({
          status: 'withheld',
          content: null,
          reasonCode: 'clinical_boundary',
        });
      }
    },
  );

  it.each(NARRATIVE_TASKS)(
    'withholds clause-bounded passive percentage administration for %s',
    (task) => {
      for (const raw of [
        'Zorblax is applied slowly as a 1% solution.',
        'Zorblax is applied with care as a 1 percent solution.',
        'Zorblax is used topically as a 1% solution.',
        'Zorblax is applied in a concentration of 1%.',
        'Zorblax is applied at a concentration of 1 percent.',
        'Zorblax is applied at a 1% concentration.',
        `Zorblax is applied ${'slowly '.repeat(100)}as a 1% solution.`,
        'Zorblax is applied slowly at thirteen milligrams.',
        'This patient applies a 1% solution.',
        'The patient uses a 1% solution.',
        'Patients use a 1 percent solution.',
        'This patient applies a 1% solution during PCR.',
        'The patient uses a 1% solution in the laboratory.',
        'This patient takes a 1% solution during PCR.',
        'This patient receives a 1% solution during PCR.',
        'This patient injects a 1% solution during PCR.',
        'This patient inhales a 1% solution during PCR.',
        'This patient administers a 1% solution during PCR.',
        'This patient starts a 1% solution during PCR.',
        'This patient continues a 1% solution during PCR.',
        'Patients take a 1% solution during PCR.',
        'Patients receive a 1% solution during PCR.',
        'The adult uses a 1% solution during PCR.',
        'Zorblax is applied slowly as a 1% topical solution.',
        'Zorblax is applied slowly as a 1% cream.',
        'Zorblax is applied slowly as a 1% gel.',
        'Zorblax is applied slowly as a 1% ointment.',
        'Zorblax is applied slowly at 1%.',
        'Zorblax is applied slowly as 1%.',
        'Zorblax is applied at 2%.',
        'Zorblax is used as 2%.',
        'Zorblax is applied slowly in a 1% formulation.',
        'Zorblax is applied slowly at one percent strength.',
        'Zorblax is applied slowly as a 1 percent-strength solution.',
        'Zorblax is applied slowly as a 1٪ solution.',
        'Zorblax is applied slowly as a 1&#1642; solution.',
        'Zorblax is applied slowly as a 1&percnt; solution.',
        'Zorblax is applied slowly as a ١٪ solution.',
        'Zorblax is applied slowly as a &#1633;&#1642; solution.',
        'Zorblax is applied slowly as a ۱٪ solution.',
        'Zorblax is applied slowly as a &#1777;&#1642; solution.',
        'Zorblax is applied at 1% in this study.',
        'Zorblax is applied at 1% while the method is tested in this study.',
        'Zorblax is applied as a 1% solution during administration, while PCR is later performed.',
        'Zorblax is applied topically as a 1% cream, while a laboratory assay is later described.',
        'Zorblax was used as a 1% solution for administration, whereas PCR is later performed.',
        'Zorblax was used as a 1% solution on the skin, then PCR was performed.',
        'Zorblax was administered as a 1% formulation, although a laboratory assay is later discussed.',
        'The 1% cream is applied topically, while PCR is later performed.',
        'This patient uses a 1٪ solution during PCR.',
        'This patient uses a 1&#1642; solution in the laboratory.',
        'This individual applies a 1% solution in aggregate research.',
        'Zorblax is applied as a .5% solution.',
        'Zorblax is applied at .5%.',
        'Zorblax is applied as a ٢٫٥٪ solution.',
        'Zorblax is applied at ٢٫٥٪.',
        'Zorblax is applied as a &#1634;&#1643;&#1637;&#1642; solution.',
        'Zorblax is applied as a ۲٫۵٪ solution.',
        'Zorblax is applied at 2\n%.',
        'Zorblax is applied at 2<br>%.',
        'Zorblax is applied at 2&NewLine;%.',
        'Zorblax is applied at 2\\%.',
        'Zorblax was applied at 2%.',
        'Zorblax was used as a 1% solution.',
        'Zorblax was administered at 2 percent.',
        'This patient routinely applies a 1% solution.',
        'This patient is using a 1% cream.',
        'This patient is using the filter at 95% sensitivity in aggregate research.',
        'This individual is using Zorblax at 95% sensitivity in aggregate research.',
        'This individual is using the filter at 95% sensitivity in aggregate research to estimate personal risk.',
        'This individual is using the filter at 95% sensitivity in aggregate research and then starting Zorblax.',
        'This patient uses a 1–2% solution.',
        'The 1% cream is applied topically.',
        'The 1% Zorblax cream is applied topically.',
        'The 1% Zorblax cream is applied topically, then PCR is performed.',
        'The 1% aspirin cream is applied topically.',
        'A 1% solution is used on the skin.',
        `Zorblax is${' cautiously'.repeat(30)} applied at 2%.`,
        `Zorblax should be${' cautiously'.repeat(30)} applied as a 2% solution.`,
        `This patient${' cautiously'.repeat(30)} uses a 2% solution.`,
        'Zorblax is applied as a 2 per cent solution.',
        'Zorblax is applied as a two per cent solution.',
        'This patient uses a 2 per cent solution.',
        'Zorblax is applied at 2\npercent.',
        'Zorblax is applied at 2&NewLine;percent.',
        'Zorblax is applied at 2&#10;percent.',
        'Zorblax is applied at 2\u2028percent.',
        'Zorblax is applied at 2 per\ncent.',
        'Zorblax\nis applied at 2%.',
        'Zorblax is\napplied at 2%.',
        'Zorblax is&NewLine;applied at 2%.',
        'This patient\nuses a 2% solution.',
        'This patient&NewLine;uses a 2% solution.',
        '17 is applied at 2%.',
        'Zorblax is used at 95% sensitivity in aggregate analysis.',
        'Zorblax is used at 5% false-positive rate in aggregate analysis.',
        'ZORBLAX is used at 95% sensitivity in aggregate analysis.',
        'zorblax is used at 95% sensitivity in aggregate analysis.',
        'X-17 is applied at 2% in this study.',
        'The method is used at 50% in this study and the therapy is administered daily.',
        'The method is used at 50 percent in this study while the therapy is administered weekly.',
        'The method is used at 50 per cent in this study although the therapy is administered every morning.',
        'The method is used at 50% in this study but the therapy is administered orally twice daily.',
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(true);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `clinical-percentage-${task}`,
        })).toMatchObject({
          status: 'withheld',
          content: null,
          reasonCode: 'clinical_boundary',
        });
      }
    },
  );

  it.each(NARRATIVE_TASKS)(
    'publishes neutral percentage findings and concrete lab formulations for %s',
    (task) => {
      for (const raw of [
        'BRCA1 penetrance is approximately 80 percent in this study.',
        'The variant prevalence was 50% in the aggregate cohort.',
        'The assay is applied to 50% of the reviewed samples.',
        'PCR is used to measure 50% prevalence in this aggregate study.',
        'A 1% agarose solution is used in a laboratory assay.',
        'The 1% agarose gel is used for electrophoresis.',
        'A 1% agarose gel was used during gel electrophoresis.',
        'A reagent is applied slowly as a 1% solution in a cultured-cell assay.',
        'A reagent is applied at a concentration of 1% in a laboratory assay.',
        'The reagent is used as a 1% solution for DNA extraction.',
        'A reagent is applied as a 1% solution in a genetics experiment.',
        'The reagent is applied at a concentration of 1% during PCR.',
        'The reagent is used as a 1 percent solution for sequencing library preparation.',
        'The reagent is applied as a 1% solution in the lab.',
        'The reagent is applied as a 1% solution in laboratory research.',
        'The reagent is applied as a 1% solution during RNA extraction.',
        'The reagent is applied as a 1% solution for CRISPR editing.',
        'The reagent is applied as a 1% solution during gel electrophoresis.',
        'The reagent is applied as a 1% solution in a cell-culture experiment.',
        'The reagent is applied as a 1% topical solution during PCR.',
        'The reagent is applied as a 1% cream during DNA extraction.',
        'The reagent is applied at one percent strength in a laboratory assay.',
        'The reagent is applied as a 1 percent-strength solution during sequencing library preparation.',
        'The variant prevalence was 50٪ in the aggregate cohort.',
        'The variant prevalence was 50&#1642; in the aggregate cohort.',
        'The variant prevalence was 50&percnt; in the aggregate cohort.',
        'The variant prevalence was ٥٠٪ in the aggregate cohort.',
        'The variant prevalence was ۵۰٪ in the aggregate cohort.',
        'The variant prevalence was &#1781;&#1776;&#1642; in the aggregate cohort.',
        'The method is used in 50% of simulations.',
        'The method is used in this study at 50%.',
        'The approach is used in 50% of simulations in aggregate analysis.',
        'The procedure is used in 50% of simulations in aggregate analysis.',
        'The equation is used in 50% of simulations in aggregate analysis.',
        'The estimator is used in 50% of simulations in aggregate analysis.',
        'The correction is used in 50% of simulations in aggregate analysis.',
        'The test is used in 50% of simulations in aggregate analysis.',
        'The technique is used in 50% of simulations in aggregate analysis.',
        'The strategy is used in 50% of simulations in aggregate analysis.',
        'The analysis is used in 50% of simulations in aggregate analysis.',
        'The model is tested at a 5% significance level in aggregate analysis.',
        'The filter is applied at 1% allele frequency in the aggregate cohort.',
        'You use a Punnett square in 50% of lesson examples.',
        'The correction is applied at a 1 percentage-point threshold in aggregate analysis.',
        'The calibration is applied at a 1 percentage-point threshold in aggregate analysis.',
        'This individual applies the model at a 1% threshold in aggregate research.',
        'The model is tested at a .5% significance level in aggregate analysis.',
        'The variant prevalence was .5% in the aggregate cohort.',
        'The reagent is applied as a .5% solution during PCR.',
        'The model is tested at ٢٫٥٪ significance in aggregate analysis.',
        'The variant prevalence was ٢٫٥٪ in the aggregate cohort.',
        'The reagent is applied as a ۲٫۵٪ solution during PCR.',
        'The reagent was applied at 2% during PCR.',
        `The reagent is${' cautiously'.repeat(30)} applied at 2% during PCR.`,
        `This individual${' cautiously'.repeat(30)} applies the model at 2% threshold in aggregate research.`,
        'The model is tested at 2\n% significance in aggregate analysis.',
        'The model is tested at 2<br>% significance in aggregate analysis.',
        'The variant prevalence was 2&NewLine;% in the aggregate cohort.',
        'The model is tested at 2\\% significance in aggregate analysis.',
        'The reagent was applied as 2<br>% solution during PCR.',
        'The test is used at 95% sensitivity in aggregate analysis.',
        'The procedure is used at 95% specificity in aggregate analysis.',
        'The test is used at 5% false-positive rate in aggregate analysis.',
        'The correction is applied at a 5% false discovery rate in aggregate analysis.',
        'The procedure is applied at 80% statistical power in aggregate analysis.',
        'The correction is applied at 2% in this study.',
        'The estimator is used at 90% accuracy in aggregate analysis.',
        'The classifier is tested at 85% precision in aggregate analysis.',
        'The model is tested at 80% recall in aggregate analysis.',
        'The variant prevalence was 50 per cent in the aggregate cohort.',
        'The reagent was applied as a two per cent solution during PCR.',
        'The model is tested at 5 percent significance in aggregate analysis.',
        'The test is used at 95 per cent sensitivity in aggregate analysis.',
        'The approach is applied at two percent in aggregate research.',
        'The method is applied at 1% while the model is tested in this study.',
        'This individual is using the model at 1% threshold in aggregate research.',
        'This individual is using the filter at 95% sensitivity in aggregate research.',
        'This individual is using the approach at 95% specificity in aggregate research.',
        'This individual is using the procedure at 5% false-positive rate in aggregate research.',
        'This individual is using the estimator at 90% accuracy in aggregate research.',
        'This individual is using the correction at 5% false discovery rate in aggregate research.',
        'This individual is using the test at 80% statistical power in aggregate research.',
        'This individual is using the technique at 85% precision in aggregate research.',
        'This individual is using the strategy at 80% recall in aggregate research.',
        'This individual is using the classifier at 95% sensitivity in aggregate research.',
        'This individual is using the calibration at 2% in aggregate research.',
        'The 1% solution is used during PCR.',
        'A 1% solution is used in a laboratory assay.',
        'The reagent is applied as a 1% solution during PCR, while the method is later evaluated.',
        'The reagent was used as a 1% solution during PCR, then the method was evaluated.',
        'The 1% solution is used during PCR, while aggregate results are later analyzed.',
        'The model is tested at 5\npercent significance in aggregate analysis.',
        'The test is used at 95 per\ncent sensitivity in aggregate analysis.',
        'The reagent is applied as a two\npercent solution during PCR.',
        'The classifier is used at 95% sensitivity in aggregate analysis.',
        'The approach is applied at 2% in this study.',
        'The calibration is applied at 2% in this study.',
        'PCR is used at 95% sensitivity in aggregate analysis.',
        'The method is used at 50% in this study and the reagent is administered daily during PCR.',
        'A 5 mg reagent aliquot was tested in cultured cells.',
      ]) {
        expect(__test.containsProhibitedClinicalGuidance(raw)).toBe(false);
        expect(sanitizePublicationArtifact(task, {}, raw, {
          correlationId: `neutral-percentage-${task}`,
        })).toMatchObject({ status: 'available' });
      }
    },
  );

  it('scans a full 12k near-miss percentage frame once without suffix rescans', () => {
    const repeats = 800;
    const nearMiss = `model is used at 50% in this study${' model is filler'.repeat(repeats)}`;

    expect(nearMiss.length).toBeGreaterThan(12_000);
    expect(__test.scanPassivePercentageFrame(nearMiss)).toEqual({
      barePercentageSubjects: ['model'],
      eventCount: repeats + 3,
    });
    expect(__test.containsProhibitedClinicalGuidance(nearMiss)).toBe(false);
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
