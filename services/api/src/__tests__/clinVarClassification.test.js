import { describe, it, expect } from 'vitest';
import { extractClinVarClassification } from '../services/vcf.js';

/**
 * Contract test for ClinVar's esummary schema.
 *
 * Background: the UI read `clinical_significance.description` for months after
 * NCBI removed that field, so every variant rendered with no pathogenicity
 * verdict and nothing failed. These fixtures are captured from live esummary
 * responses; the first one deliberately omits `clinical_significance` entirely,
 * so any regression back to reading it fails here instead of silently blanking
 * the product's most important output.
 */

// Captured live: db=clinvar, uid 17677 (BRCA1 c.5266dup). Note the absence of
// `clinical_significance` and of a top-level `review_status`.
const LIVE_GERMLINE_RECORD = {
  uid: '17677',
  accession: 'VCV000017677',
  title: 'NM_007294.4(BRCA1):c.5266dup (p.Gln1756fs)',
  germline_classification: {
    description: 'Pathogenic',
    last_evaluated: '2016/04/22 00:00',
    review_status: 'reviewed by expert panel',
  },
  oncogenicity_classification: {},
  clinical_impact_classification: {},
};

describe('extractClinVarClassification', () => {
  it('reads the germline classification from a live-shaped record', () => {
    expect(extractClinVarClassification(LIVE_GERMLINE_RECORD)).toEqual({
      description: 'Pathogenic',
      reviewStatus: 'reviewed by expert panel',
      lastEvaluated: '2016/04/22 00:00',
    });
  });

  it('does not depend on the retired clinical_significance field', () => {
    // Guard: the live record has no such key at all. If the implementation goes
    // back to reading it, the assertion above returns null and this documents why.
    expect('clinical_significance' in LIVE_GERMLINE_RECORD).toBe(false);
    expect(extractClinVarClassification(LIVE_GERMLINE_RECORD)?.description).toBe('Pathogenic');
  });

  it('falls back to oncogenicity when no germline classification is present', () => {
    const somaticOnly = {
      uid: '999',
      germline_classification: {},
      oncogenicity_classification: {
        description: 'Oncogenic',
        review_status: 'criteria provided, single submitter',
      },
    };
    expect(extractClinVarClassification(somaticOnly)).toMatchObject({
      description: 'Oncogenic',
      reviewStatus: 'criteria provided, single submitter',
    });
  });

  it('still resolves legacy payloads so cached responses keep working', () => {
    const legacy = {
      uid: '123',
      clinical_significance: { description: 'Benign' },
      review_status: 'criteria provided, single submitter',
    };
    expect(extractClinVarClassification(legacy)).toMatchObject({
      description: 'Benign',
      reviewStatus: 'criteria provided, single submitter',
    });
  });

  it('returns null rather than a partial verdict when nothing is classified', () => {
    expect(extractClinVarClassification(null)).toBeNull();
    expect(extractClinVarClassification({})).toBeNull();
    expect(extractClinVarClassification({ germline_classification: {} })).toBeNull();
    expect(extractClinVarClassification({ germline_classification: { description: '  ' } })).toBeNull();
  });
});
