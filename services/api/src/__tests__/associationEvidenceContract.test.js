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
      ontologyVersion: null,
    });
    expect(result.claimCount).toBe(1);
    expect(result.claimsByGene.SCN1A).toEqual([{
      source: 'Monarch Initiative',
      recordId: 'association-1',
      claim: 'SCN1A has source evidence.',
      taxon: '9606',
      species: 'Homo sapiens',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_phenotype_association',
      evidenceStrength: 'supporting',
      releaseVersion: '2026-06-08',
      referenceAssembly: null,
      retrievalDate: '2026-08-09',
      directLink: null,
      isAiLead: false,
    }]);
    expect(JSON.stringify(result)).not.toMatch(/javascript:|0\.999|unsupported_type|GRCh38|0\.1\.0/);
  });

  it('records only date-shaped KG releases and never repurposes API package versions', () => {
    expect(__test.safeReleaseVersion('2026-06-08')).toBe('2026-06-08');
    expect(__test.safeReleaseVersion('2026-02-31')).toBeNull();
    expect(__test.safeReleaseVersion('0.1.0')).toBeNull();
    expect(__test.safeReleaseVersion('v3')).toBeNull();

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

    expect(result.claimsByGene.CFTR[0].releaseVersion).toBeNull();
    expect(result.sources.monarch).toEqual({ apiVersion: 'v3', releaseVersion: null });
    expect(result.sources.openTargets).toEqual({ apiVersion: 'v4', releaseVersion: '2026-07-01' });
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

  it('never returns claims for unrequested or invalid candidate symbols', () => {
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

    expect(result.claimsByGene).toEqual({ SCN1A: [], 'TAKE-5MG': [] });
    expect(result.claimsByGene).not.toHaveProperty('EXTRA1');
    expect(result.claimCount).toBe(0);
  });
});