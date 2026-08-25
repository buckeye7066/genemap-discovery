import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawAdapter = vi.hoisted(() => ({
  getAssociationEvidence: vi.fn(),
}));

vi.mock('../services/associationEvidence.js', () => rawAdapter);

import {
  getPublicationAssociationEvidence,
  sanitizeAssociationEvidence,
  __test,
} from '../services/associationEvidenceContract.js';

const reference = { kind: 'hpo', identifier: 'HP:0001250' };

describe('association evidence publication contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __test.resetCache();
  });

  it('bounds upstream text, drops unsafe links and unsupported fields, and avoids invented strength', () => {
    const result = sanitizeAssociationEvidence({
      query: {
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Seizure\u0085term',
        source: 'NLM HPO',
        apiVersion: 'v3',
        ontologyVersion: '0.1.0',
        obsolete: false,
      },
      claimsByGene: {
        SCN1A: [{
          source: 'Monarch\u0000Initiative',
          recordId: 'association-1',
          claim: 'SCN1A has source evidence.\u0085',
          taxon: 'NCBITaxon:9606',
          species: 'Homo sapiens',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_phenotype_association',
          evidenceStrength: 'strong',
          releaseVersion: '2026-06-08',
          referenceAssembly: 'GRCh38 should not be used here',
          retrievalDate: '2026-08-09T12:34:56.000Z',
          directLink: 'javascript:alert(1)',
          isAiLead: false,
          score: 0.999,
        }, {
          source: 'Unknown source',
          claim: 'Unsupported type must disappear',
          evidenceClass: 'human_verified',
          evidenceType: 'unsupported_type',
        }],
      },
      retrievedAt: '2026-08-09T12:34:56.000Z',
      sources: {
        monarch: { apiVersion: 'v3', releaseVersion: '2026-06-08' },
        openTargets: { apiVersion: 'v4', releaseVersion: null },
      },
      sourceStatus: 'available',
    }, ['SCN1A']);

    expect(result.query).toMatchObject({
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure term',
      // A source's stated version is recorded VERBATIM, whatever shape it takes.
      // See the release-version test below for why this is no longer null.
      ontologyVersion: '0.1.0',
    });
    expect(result.claimCount).toBe(1);
    expect(result.claimsByGene.SCN1A).toEqual([{
      source: 'Monarch Initiative',
      recordId: 'association-1',
      claim: 'SCN1A has source evidence.',
      subject: null,
      object: null,
      taxon: '9606',
      species: 'Homo sapiens',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_phenotype_association',
      evidenceStrength: 'supporting',
      // The upstream `score: 0.999` is NOT a decomposed component set, so it is
      // refused entirely rather than surfaced as an unattributable number.
      scoreComponents: [],
      releaseVersion: '2026-06-08',
      referenceAssembly: null,
      retrievalDate: '2026-08-09',
      directLink: null,
      isAiLead: false,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/javascript:|0\.999|unsupported_type|GRCh38/);
  });

  it('records a source release verbatim as an opaque token, whatever shape it takes', () => {
    // A release identifier is an opaque token, not a date. Rejecting a real
    // upstream version and then rendering "Not recorded" is provenance LOSS
    // reported as ABSENCE - a false statement about our own data.
    expect(__test.safeReleaseVersion('2026-06-08')).toBe('2026-06-08');
    expect(__test.safeReleaseVersion('26.06')).toBe('26.06');       // Open Targets
    expect(__test.safeReleaseVersion('0.1.0')).toBe('0.1.0');       // semver
    expect(__test.safeReleaseVersion('v3')).toBe('v3');
    expect(__test.safeReleaseVersion('2026-02-31')).toBe('2026-02-31'); // not parsed as a date
    expect(__test.safeReleaseVersion('kg-build_2026+07')).toBe('kg-build_2026+07');

    // Shape is still validated, so a version can never escape a render context.
    expect(__test.safeReleaseVersion('  ')).toBeNull();
    expect(__test.safeReleaseVersion('26 06')).toBeNull();          // whitespace
    expect(__test.safeReleaseVersion('<script>')).toBeNull();       // markup
    expect(__test.safeReleaseVersion('"drop"')).toBeNull();         // quotes
    expect(__test.safeReleaseVersion('a'.repeat(65))).toBeNull();   // unbounded
    expect(__test.safeReleaseVersion('\u0000v1')).toBeNull();       // control chars
  });

  it('drops an over-long record id rather than truncating it into a different one', () => {
    // A truncated identifier resolves to nothing but still looks authoritative.
    expect(__test.safeIdentifier('ENSG00000001626', 256)).toBe('ENSG00000001626');
    expect(__test.safeIdentifier('A'.repeat(257), 256)).toBeNull();
    // Prose is different: clipping a long sentence for display is honest.
    expect(__test.cleanText('B'.repeat(300), 256)).toHaveLength(256);
  });

  it('distinguishes "the source stated no version" from "we rejected the version"', () => {
    // THIS IS THE DISTINCTION THAT MATTERS. `Not recorded` in the UI must mean
    // the first, never the second.
    const stated = sanitizeAssociationEvidence({
      query: { kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'Seizure' },
      claimsByGene: {
        SCN1A: [{
          source: 'Open Targets Platform GraphQL API v4',
          claim: 'A source that states its release.',
          taxon: '9606',
          evidenceClass: 'computational',
          evidenceType: 'computed_target_disease_association',
          releaseVersion: '26.06',
          retrievalDate: '2026-08-25',
        }],
      },
      retrievedAt: '2026-08-25T00:00:00.000Z',
      sourceStatus: 'available',
    }, ['SCN1A']);
    expect(stated.claimsByGene.SCN1A[0].releaseVersion).toBe('26.06');

    const silent = sanitizeAssociationEvidence({
      query: { kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'Seizure' },
      claimsByGene: {
        SCN1A: [{
          source: 'A source that publishes no release identifier',
          claim: 'No release stated upstream.',
          taxon: '9606',
          evidenceClass: 'computational',
          evidenceType: 'computed_target_disease_association',
          releaseVersion: null,
          retrievalDate: '2026-08-25',
        }],
      },
      retrievedAt: '2026-08-25T00:00:00.000Z',
      sourceStatus: 'available',
    }, ['SCN1A']);
    expect(silent.claimsByGene.SCN1A[0].releaseVersion).toBeNull();
  });

  it('keeps a service API version out of the data-release slot', () => {
    // The anti-repurposing guarantee is STRUCTURAL, not a format check: a real
    // KG release could legitimately look like "0.1.0", so the format cannot
    // tell them apart. What must hold is that the two stay separate fields and
    // nothing copies one into the other.
    const result = sanitizeAssociationEvidence({
      query: {
        kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'Seizure',
        apiVersion: 'v3', ontologyVersion: null,
      },
      claimsByGene: {},
      retrievedAt: '2026-08-25T00:00:00.000Z',
      sources: { monarch: { apiVersion: 'v3', releaseVersion: null } },
      sourceStatus: 'available',
    }, []);
    expect(result.query.apiVersion).toBe('v3');
    expect(result.query.ontologyVersion).toBeNull();
    expect(result.sources.monarch.apiVersion).toBe('v3');
    expect(result.sources.monarch.releaseVersion).toBeNull();
  });

  it('carries every stated release through the whole sanitise path', () => {

    const result = sanitizeAssociationEvidence({
      query: {
        kind: 'mondo',
        identifier: 'MONDO:0009061',
        canonicalLabel: 'cystic fibrosis',
      },
      claimsByGene: {
        CFTR: [{
          source: 'Monarch Initiative',
          recordId: 'association-cftr',
          claim: 'CFTR has source evidence for cystic fibrosis',
          taxon: '9606',
          species: 'Homo sapiens',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_disease_association',
          evidenceStrength: 'supporting',
          releaseVersion: '0.1.0',
          retrievalDate: '2026-08-09',
          isAiLead: false,
        }],
      },
      sources: {
        monarch: { apiVersion: 'v3', releaseVersion: '0.1.0' },
        openTargets: { apiVersion: 'v4', releaseVersion: '2026-07-01' },
      },
      sourceStatus: 'available',
    }, ['CFTR']);

    // Previously these were nulled because they were not date-shaped. Losing a
    // real upstream release is provenance loss, so they now survive verbatim.
    expect(result.claimsByGene.CFTR[0].releaseVersion).toBe('0.1.0');
    expect(result.sources.monarch).toMatchObject({ apiVersion: 'v3', releaseVersion: '0.1.0' });
    expect(result.sources.openTargets).toMatchObject({ apiVersion: 'v4', releaseVersion: '2026-07-01' });
  });

  it('preserves the final source date across repeated calls by caching the full bounded result', async () => {
    rawAdapter.getAssociationEvidence.mockImplementation(async () => ({
      query: {
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Seizure',
        source: 'NLM Clinical Tables HPO',
        apiVersion: 'v3',
      },
      claimsByGene: {
        SCN1A: [{
          source: 'Monarch Initiative',
          recordId: 'association-1',
          claim: 'SCN1A has a source-recorded relation to Seizure',
          taxon: '9606',
          species: 'Homo sapiens',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_phenotype_association',
          evidenceStrength: 'supporting',
          releaseVersion: '2026-06-08',
          retrievalDate: new Date().toISOString(),
          directLink: 'https://example.org/association-1',
          isAiLead: false,
        }],
      },
      retrievedAt: new Date().toISOString(),
      sources: { monarch: { apiVersion: 'v3', releaseVersion: '2026-06-08' } },
      sourceStatus: 'available',
    }));

    const first = await getPublicationAssociationEvidence(reference, ['SCN1A']);
    const second = await getPublicationAssociationEvidence(reference, ['SCN1A']);

    expect(rawAdapter.getAssociationEvidence).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(second.claimsByGene.SCN1A[0].retrievalDate)
      .toBe(first.claimsByGene.SCN1A[0].retrievalDate);
  });

  it('reports ortholog-only evidence as available and keeps missing source data explicit', () => {
    const result = sanitizeAssociationEvidence({
      query: {
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Seizure',
      },
      claimsByGene: {
        SCN1A: [{
          source: 'Monarch Initiative ortholog-phenotype grid',
          recordId: null,
          claim: 'Mouse ortholog evidence overlaps Seizure; this is cross-species inference, not direct human evidence',
          taxon: '10090',
          species: 'Mus musculus',
          evidenceClass: 'animal_model',
          evidenceType: 'ortholog_phenotype_inference',
          evidenceStrength: 'unknown',
          releaseVersion: null,
          retrievalDate: null,
          directLink: null,
          isAiLead: false,
        }],
      },
      sourceStatus: 'no_matching_associations',
    }, ['SCN1A']);

    expect(result.sourceStatus).toBe('available');
    expect(result.claimsByGene.SCN1A[0]).toMatchObject({
      evidenceClass: 'animal_model',
      evidenceStrength: 'unknown',
      releaseVersion: null,
      retrievalDate: null,
      directLink: null,
    });
  });

  it('never returns claims for unrequested or policy-invalid candidate symbols', () => {
    expect(__test.isPublicationGeneSymbol('SCN1A')).toBe(true);
    expect(__test.isPublicationGeneSymbol('STOP1')).toBe(true);
    expect(__test.isPublicationGeneSymbol('STOP-DRUG')).toBe(false);
    expect(__test.isPublicationGeneSymbol('TAKE-5MG')).toBe(false);
    expect(__test.isPublicationGeneSymbol('not a gene')).toBe(false);

    const result = sanitizeAssociationEvidence({
      claimsByGene: {
        SCN1A: [],
        'TAKE-5MG': [{
          source: 'unsafe',
          claim: 'unsafe',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_phenotype_association',
        }],
        EXTRA1: [{
          source: 'unrequested',
          claim: 'unrequested',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_phenotype_association',
        }],
      },
      sourceStatus: 'available',
    }, ['SCN1A', 'TAKE-5MG']);

    expect(result.claimsByGene).toEqual({ SCN1A: [] });
    expect(result.claimsByGene).not.toHaveProperty('TAKE-5MG');
    expect(result.claimsByGene).not.toHaveProperty('EXTRA1');
    expect(result.claimCount).toBe(0);
  });

  it('preserves partial-coverage and per-source health instead of converting it to a negative', () => {
    const result = sanitizeAssociationEvidence({
      query: {
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Seizure',
      },
      claimsByGene: { SCN1A: [] },
      retrievedAt: '2026-08-09T12:00:00.000Z',
      sources: {
        monarch: {
          apiVersion: 'v3',
          releaseVersion: '2026-06-08',
          status: 'partial',
          truncated: true,
          retrievedAt: '2026-08-09T11:59:00.000Z',
        },
        openTargets: {
          apiVersion: 'v4',
          status: 'not_applicable',
          truncated: false,
          retrievedAt: null,
        },
      },
      sourceStatus: 'partial_coverage',
    }, ['SCN1A']);

    expect(result.sourceStatus).toBe('partial_coverage');
    expect(result.sources.monarch).toMatchObject({
      status: 'partial',
      truncated: true,
      retrievedAt: '2026-08-09T11:59:00.000Z',
    });
    expect(result.sources.openTargets.status).toBe('not_applicable');
  });

  it('rejects verified-human or animal claims whose taxon does not support the class', () => {
    const result = sanitizeAssociationEvidence({
      claimsByGene: {
        SCN1A: [
          {
            source: 'ambiguous source',
            claim: 'Ambiguous taxon must not become human evidence',
            taxon: 'unspecified',
            species: 'Unspecified',
            evidenceClass: 'human_verified',
            evidenceType: 'gene_phenotype_association',
          },
          {
            source: 'contradictory source',
            claim: 'Human taxon must not become animal evidence',
            taxon: '9606',
            species: 'Homo sapiens',
            evidenceClass: 'animal_model',
            evidenceType: 'ortholog_phenotype_inference',
          },
        ],
      },
      sourceStatus: 'available',
    }, ['SCN1A']);

    expect(result.claimsByGene.SCN1A).toEqual([]);
    expect(result.claimCount).toBe(0);
  });

});