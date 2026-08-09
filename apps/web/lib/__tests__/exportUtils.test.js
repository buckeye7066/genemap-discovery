import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGeneReportSections,
  buildGeneShareText,
  exportGeneReport,
  exportVCFReport,
} from '../exportUtils';

const gene = {
  symbol: 'RUNX1',
  name: 'RUNX family transcription factor 1',
  chromosome: '21',
  location: '21q22.12',
  rankingBasis: 'human_verified',
  diseases: ['Candidate leukemia label'],
  phenotypes: [{ name: 'Leukemia', hpoId: 'HP:0001909', hpoVerified: true }],
  associationClaims: [
    {
      source: 'ClinGen <curated>',
      recordId: 'RUNX1-001',
      claim: 'RUNX1 identity is supported <script>alert(1)</script>',
      taxon: '9606',
      species: 'Homo sapiens',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_identity',
      evidenceStrength: 'supporting',
      releaseVersion: 'GRCh38 / 2026-08',
      retrievalDate: '2026-08-09',
      directLink: 'https://example.org/records/RUNX1?source=ClinGen',
      isAiLead: false,
    },
    {
      source: 'Untrusted source',
      recordId: null,
      claim: 'Unsafe link must not become clickable',
      taxon: 'unspecified',
      species: 'Unspecified',
      evidenceClass: 'ai_lead',
      evidenceType: 'model_suggestion',
      evidenceStrength: 'lead',
      releaseVersion: 'candidate_gene_research@1',
      retrievalDate: '2026-08-09',
      directLink: 'javascript:alert(1)',
      isAiLead: true,
    },
  ],
};

function installPrintWindow() {
  vi.useFakeTimers();
  const write = vi.spyOn(document, 'write').mockImplementation(() => {});
  const close = vi.spyOn(document, 'close').mockImplementation(() => {});
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockReturnValue(window);
  return { write, close, print };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('gene report provenance', () => {
  it('renders every required claim field and escapes untrusted content', () => {
    const sections = buildGeneReportSections(gene);
    const provenance = sections.find(section => section.title === 'Association Claims and Provenance');

    expect(provenance).toBeTruthy();
    expect(provenance.content).toContain('ClinGen &lt;curated&gt;');
    expect(provenance.content).toContain('RUNX1-001');
    expect(provenance.content).toContain('GRCh38 / 2026-08');
    expect(provenance.content).toContain('human_verified');
    expect(provenance.content).toContain('gene_identity');
    expect(provenance.content).toContain('Homo sapiens');
    expect(provenance.content).toContain('9606');
    expect(provenance.content).toContain('2026-08-09');
    expect(provenance.content).toContain('https://example.org/records/RUNX1?source=ClinGen');
    expect(provenance.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(provenance.content).not.toContain('<script>alert(1)</script>');
    expect(provenance.content).not.toContain('href="javascript:');
    expect(provenance.content).toContain('No validated HTTP(S) link recorded');
  });

  it('labels disease and phenotype lists as candidates rather than verified associations', () => {
    const sections = buildGeneReportSections(gene);
    const diseaseSection = sections.find(section => section.title === 'Candidate Disease Labels');
    const phenotypeSection = sections.find(section => section.title === 'Candidate Phenotype Terms');

    expect(diseaseSection.content).toMatch(/Candidate labels only/);
    expect(diseaseSection.content).toMatch(/not verified associations/);
    expect(phenotypeSection.content).toMatch(/Candidate terms only/);
    expect(phenotypeSection.content).toMatch(/not a gene-phenotype association/);
    expect(phenotypeSection.content).toContain('HP:0001909 (HPO-validated term)');
  });

  it('fails closed when no claim-level provenance is supplied', () => {
    const sections = buildGeneReportSections({ symbol: 'ZZZ1', diseases: ['Unknown condition'] });
    const provenance = sections.find(section => section.title === 'Association Claims and Provenance');

    expect(provenance.content).toMatch(/No claim-level provenance was supplied/);
    expect(provenance.content).toMatch(/unverified research lead/);
  });

  it('preserves provenance in the copied plain-text summary', () => {
    const summary = buildGeneShareText(gene);

    expect(summary).toContain('source=ClinGen <curated>');
    expect(summary).toContain('record=RUNX1-001');
    expect(summary).toContain('version=GRCh38 / 2026-08');
    expect(summary).toContain('evidence=human_verified');
    expect(summary).toContain('species=Homo sapiens');
    expect(summary).toContain('taxon=9606');
    expect(summary).toContain('retrieved=2026-08-09');
    expect(summary).toContain('link=https://example.org/records/RUNX1?source=ClinGen');
    expect(summary).toContain('Candidate disease labels, unverified unless supported above');
    expect(summary).not.toContain('link=javascript:alert(1)');
  });

  it('writes the same provenance-complete sections into the printable report', () => {
    const { write, close, print } = installPrintWindow();

    exportGeneReport(gene);

    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0];
    expect(html).toContain('Association Claims and Provenance');
    expect(html).toContain('ClinGen &lt;curated&gt;');
    expect(html).toContain('GRCh38 / 2026-08');
    expect(html).toContain('Education and exploratory research only');
    expect(close).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('normalizes explicit null input instead of crashing or inventing data', () => {
    const sections = buildGeneReportSections(null);
    const overview = sections.find(section => section.title === 'Gene Overview');
    const provenance = sections.find(section => section.title === 'Association Claims and Provenance');
    const summary = buildGeneShareText(null);

    expect(overview.content).toContain('Not recorded');
    expect(provenance.content).toMatch(/No claim-level provenance was supplied/);
    expect(summary).toContain('GeneMap Discovery - Gene: Unknown gene');
    expect(summary).toContain('Association claims: none supplied');

    const { write } = installPrintWindow();
    expect(() => exportGeneReport(null)).not.toThrow();
    expect(write.mock.calls[0][0]).toContain('Gene Report: Unknown gene');
  });

  it('renders non-finite expression and VCF numbers as N/A', () => {
    const sections = buildGeneReportSections({
      symbol: 'RUNX1',
      expressionData: [
        { tissue: 'Bone marrow', value: Number.NaN },
        { tissue: 'Blood', value: Number.POSITIVE_INFINITY },
        { tissue: 'Spleen', value: 1.234 },
      ],
    });
    const expression = sections.find(section => section.title === 'Expression Data');

    expect(expression.content).not.toContain('NaN');
    expect(expression.content).not.toContain('Infinity');
    expect(expression.content.match(/N\/A/g)).toHaveLength(2);
    expect(expression.content).toContain('1.23');

    const { write } = installPrintWindow();
    exportVCFReport([
      { gene: 'RUNX1', variant: 'v1', classification: 'research lead', frequency: Number.NaN },
      { gene: 'CFTR', variant: 'v2', classification: 'research lead', frequency: Number.NEGATIVE_INFINITY },
      { gene: 'FBN1', variant: 'v3', classification: 'research lead', frequency: 0.012345 },
    ], {});

    const html = write.mock.calls[0][0];
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html.match(/N\/A/g)).toHaveLength(2);
    expect(html).toContain('0.0123');
  });
});
