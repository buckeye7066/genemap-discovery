import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGeneReportSections,
  buildGeneShareText,
  exportGeneReport,
  exportVCFReport,
  isPublicationExportable,
  publicationSafeExportData,
  publicationSafeGene,
} from '../exportUtils';

const gene = {
  symbol: 'RUNX1',
  name: 'RUNX family transcription factor 1',
  chromosome: '21',
  location: '21q22.12',
  coordinatesVerified: true,
  profileStatus: 'available',
  candidatePublication: {
    contractVersion: 1,
    status: 'available',
    content: { candidateGenes: [{ symbol: 'RUNX1' }] },
    reasonCode: null,
    correlationId: 'candidate-runx1',
    limitations: [],
  },
  profilePublication: {
    contractVersion: 1,
    status: 'available',
    content: { summary: 'Research profile' },
    reasonCode: null,
    correlationId: 'profile-runx1',
    limitations: [],
  },
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
      releaseVersion: null,
      referenceAssembly: 'GRCh38',
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
      referenceAssembly: null,
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
  it('drops legacy generated aliases even when a terminal response leaves them populated', () => {
    const safe = publicationSafeExportData({
      result: 'legacy result must not be exported',
      response: 'legacy response must not be exported',
      publication: {
        contractVersion: 1,
        status: 'withheld',
        content: null,
        reasonCode: 'clinical_boundary',
        correlationId: 'generic-withheld-export',
        limitations: [],
      },
    });

    expect(safe.result).toBeUndefined();
    expect(safe.response).toBeUndefined();
    expect(safe.publication.status).toBe('withheld');
    expect(safe.publication.content).toBeNull();
  });

  it.each([
    ['primitive', 'not-a-publication-artifact'],
    ['malformed terminal object', {
      status: 'withheld',
      content: { providerRaw: 'MALFORMED_PUBLICATION_CONTENT_LEAK' },
    }],
  ])('drops generated aliases whenever the wrapper owns a %s publication value', (_label, publication) => {
    const safe = publicationSafeExportData({
      publication,
      result: 'MALFORMED_PUBLICATION_RESULT_LEAK',
      response: 'MALFORMED_PUBLICATION_RESPONSE_LEAK',
      deterministicMetadata: 'preserved',
    });

    expect(safe.result).toBeUndefined();
    expect(safe.response).toBeUndefined();
    expect(safe.deterministicMetadata).toBe('preserved');
    expect(safe.publication).toEqual({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'invalid_publication_envelope',
      correlationId: 'client-invalid-publication',
      limitations: [],
    });
    expect(JSON.stringify(safe)).not.toContain('MALFORMED_PUBLICATION_RESULT_LEAK');
    expect(JSON.stringify(safe)).not.toContain('MALFORMED_PUBLICATION_RESPONSE_LEAK');
    expect(JSON.stringify(safe)).not.toContain('MALFORMED_PUBLICATION_CONTENT_LEAK');
  });

  it('redacts terminal gene fields nested inside replayed publication content', () => {
    const terminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'nested-terminal-gene',
      limitations: [],
    };
    const safe = publicationSafeExportData({
      publication: {
        contractVersion: 1,
        status: 'available',
        content: {
          replayed: {
            genes: [{
              symbol: 'BRCA1',
              name: 'TERMINAL_NAME_LEAK',
              fullName: 'TERMINAL_FULL_NAME_LEAK',
              explanation: 'TERMINAL_EXPLANATION_LEAK',
              description: 'TERMINAL_DESCRIPTION_LEAK',
              diseases: ['TERMINAL_DISEASE_LEAK'],
              aiSummary: 'TERMINAL_SUMMARY_LEAK',
              keyTakeaways: ['TERMINAL_TAKEAWAY_LEAK'],
              phenotypes: [{ name: 'TERMINAL_PHENOTYPE_LEAK' }],
              expressionData: [{ tissue: 'TERMINAL_EXPRESSION_LEAK' }],
              chromosome: 'TERMINAL_CHROMOSOME_LEAK',
              location: 'TERMINAL_LOCATION_LEAK',
              ensemblId: 'TERMINAL_ENSEMBL_LEAK',
              coordinatesVerified: false,
              profileStatus: 'withheld',
              candidatePublication: terminalPublication,
              profilePublication: terminalPublication,
            }],
          },
        },
        reasonCode: null,
        correlationId: 'replayed-publication-export',
        limitations: [],
      },
    });

    expect(isPublicationExportable(safe.publication)).toBe(true);
    expect(safe.publication).toMatchObject({
      contractVersion: 1,
      status: 'available',
      reasonCode: null,
      correlationId: 'replayed-publication-export',
      limitations: [],
    });
    expect(safe.publication.content.replayed.genes).toEqual([{
      symbol: 'BRCA1',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      phenotypes: [],
      expressionData: [],
    }]);
    expect(JSON.stringify(safe)).not.toContain('TERMINAL_');
  });

  it.each([
    ['available', 'object'],
    ['available', 'array'],
    ['partial', 'object'],
    ['partial', 'array'],
  ])('redacts a terminal gene at the root of %s publication content shaped as an %s', (status, shape) => {
    const marker = `TERMINAL_${status.toUpperCase()}_${shape.toUpperCase()}`;
    const terminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: `root-content-${status}-${shape}-terminal`,
      limitations: [],
    };
    const terminalGene = {
      symbol: 'ROOT1',
      name: `${marker}_NAME_LEAK`,
      fullName: `${marker}_FULL_NAME_LEAK`,
      explanation: `${marker}_EXPLANATION_LEAK`,
      description: `${marker}_DESCRIPTION_LEAK`,
      diseases: [`${marker}_DISEASE_LEAK`],
      aiSummary: `${marker}_SUMMARY_LEAK`,
      keyTakeaways: [`${marker}_TAKEAWAY_LEAK`],
      phenotypes: [{ name: `${marker}_PHENOTYPE_LEAK` }],
      expressionData: [{ tissue: `${marker}_EXPRESSION_LEAK` }],
      chromosome: `${marker}_CHROMOSOME_LEAK`,
      location: `${marker}_LOCATION_LEAK`,
      ensemblId: `${marker}_ENSEMBL_LEAK`,
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
    };
    const metadata = {
      kind: 'publication-metadata',
      marker: `GENERIC_${status.toUpperCase()}_${shape.toUpperCase()}_PRESERVED`,
    };
    const content = shape === 'array' ? [terminalGene, metadata] : terminalGene;
    const safe = publicationSafeExportData({
      contractVersion: 1,
      status,
      content,
      reasonCode: status === 'partial' ? 'provider_truncated' : null,
      correlationId: `root-content-${status}-${shape}`,
      limitations: status === 'partial' ? ['Output may be incomplete.'] : [],
    });
    const safeGene = shape === 'array' ? safe.content[0] : safe.content;

    expect(isPublicationExportable(safe)).toBe(true);
    expect(safeGene).toEqual({
      symbol: 'ROOT1',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      phenotypes: [],
      expressionData: [],
    });
    if (shape === 'array') {
      expect(safe.content[1]).toEqual(metadata);
    }
    expect(JSON.stringify(safe)).not.toContain(marker);
  });

  it('preserves shared publication artifacts while omitting only true ancestor cycles', () => {
    const sharedPublication = {
      contractVersion: 1,
      status: 'available',
      content: {
        candidateGenes: [{
          symbol: 'CFTR',
          name: 'Approved candidate label',
          explanation: 'Approved candidate explanation',
        }],
        genes: [{
          symbol: 'RUNX1',
          name: 'Approved artifact-owned label',
          explanation: 'Approved artifact-owned explanation',
        }],
      },
      reasonCode: null,
      correlationId: 'shared-publication-export',
      limitations: [],
    };
    const cycle = { label: 'cycle root' };
    cycle.self = cycle;
    const nestedGene = { symbol: 'CFTR', candidatePublication: sharedPublication };
    nestedGene.self = nestedGene;

    const safe = publicationSafeExportData({
      genes: [
        nestedGene,
        { symbol: 'RUNX1', profilePublication: sharedPublication },
      ],
      branch: { publication: sharedPublication },
      cycle,
    });

    const expectedSharedPublication = {
      ...sharedPublication,
      content: {
        ...sharedPublication.content,
        genes: [{
          symbol: 'RUNX1',
          phenotypes: [],
          expressionData: [],
        }],
      },
    };

    expect(safe.genes[0].candidatePublication).toEqual(expectedSharedPublication);
    expect(safe.genes[0].self).toBe('[Circular reference omitted]');
    expect(safe.genes[1].profilePublication).toEqual(expectedSharedPublication);
    expect(safe.branch.publication).toEqual(expectedSharedPublication);
    expect(safe.cycle).toEqual({
      label: 'cycle root',
      self: '[Circular reference omitted]',
    });
  });

  it('omits publication-to-root-gene cycles without re-entering the canonical envelope', () => {
    const cyclicPublication = {
      contractVersion: 1,
      status: 'available',
      content: null,
      reasonCode: null,
      correlationId: 'root-gene-publication-cycle',
      limitations: [],
    };
    const cyclicGene = {
      symbol: 'CYCLE1',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: cyclicPublication,
      profilePublication: cyclicPublication,
    };
    cyclicPublication.content = cyclicGene;

    const safe = publicationSafeExportData(cyclicPublication);

    expect(isPublicationExportable(safe)).toBe(true);
    expect(safe).toMatchObject({
      contractVersion: 1,
      status: 'available',
      reasonCode: null,
      correlationId: 'root-gene-publication-cycle',
      limitations: [],
    });
    expect(safe.content).toEqual({
      symbol: 'CYCLE1',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: '[Circular reference omitted]',
      profilePublication: '[Circular reference omitted]',
      phenotypes: [],
      expressionData: [],
    });
  });

  it('omits root-gene-to-publication cycles when sanitation starts from the gene', () => {
    const cyclicGene = {
      symbol: 'CYCLE2',
      coordinatesVerified: false,
      profileStatus: 'withheld',
    };
    const cyclicPublication = {
      contractVersion: 1,
      status: 'available',
      content: cyclicGene,
      reasonCode: null,
      correlationId: 'gene-root-publication-cycle',
      limitations: [],
    };
    cyclicGene.candidatePublication = cyclicPublication;

    const safe = publicationSafeGene(cyclicGene);

    expect(safe).toMatchObject({
      symbol: 'CYCLE2',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: {
        contractVersion: 1,
        status: 'available',
        reasonCode: null,
        correlationId: 'gene-root-publication-cycle',
        limitations: [],
      },
      phenotypes: [],
      expressionData: [],
    });
    expect(safe.candidatePublication.content).toEqual({
      symbol: 'CYCLE2',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: '[Circular reference omitted]',
      phenotypes: [],
      expressionData: [],
    });
  });

  it.each([
    ['candidatePublication', null, 'NULL_PUBLICATION_LEAK'],
    ['candidatePublication', 'PRIMITIVE_CANDIDATE_PUBLICATION_LEAK', 'PRIMITIVE_CANDIDATE_PUBLICATION_LEAK'],
    ['candidatePublication', { providerRaw: 'OBJECT_CANDIDATE_PUBLICATION_LEAK' }, 'OBJECT_CANDIDATE_PUBLICATION_LEAK'],
    ['candidatePublication', {
      ...gene.candidatePublication,
      providerRaw: 'EXTRA_KEY_CANDIDATE_PUBLICATION_LEAK',
    }, 'EXTRA_KEY_CANDIDATE_PUBLICATION_LEAK'],
    ['profilePublication', null, 'NULL_PUBLICATION_LEAK'],
    ['profilePublication', 'PRIMITIVE_PROFILE_PUBLICATION_LEAK', 'PRIMITIVE_PROFILE_PUBLICATION_LEAK'],
    ['profilePublication', { providerRaw: 'OBJECT_PROFILE_PUBLICATION_LEAK' }, 'OBJECT_PROFILE_PUBLICATION_LEAK'],
    ['profilePublication', {
      ...gene.profilePublication,
      providerRaw: 'EXTRA_KEY_PROFILE_PUBLICATION_LEAK',
    }, 'EXTRA_KEY_PROFILE_PUBLICATION_LEAK'],
  ])('replaces a noncanonical %s value with a safe artifact', (publicationKey, artifact, leak) => {
    const artifactCorrelationId = artifact !== null
      && typeof artifact === 'object'
      && 'correlationId' in artifact
      && typeof artifact.correlationId === 'string'
      ? artifact.correlationId
      : 'client-invalid-publication';
    const safe = publicationSafeGene({
      symbol: 'SAFE-EXPORT',
      coordinatesVerified: false,
      profileStatus: 'available',
      explanation: 'CANDIDATE_PROSE_LEAK',
      aiSummary: 'PROFILE_PROSE_LEAK',
      phenotypes: [{ name: 'PROFILE_PHENOTYPE_LEAK' }],
      [publicationKey]: artifact,
    });

    expect(safe[publicationKey]).toEqual({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'invalid_publication_envelope',
      correlationId: artifactCorrelationId,
      limitations: [],
    });
    expect(safe.explanation).toBeUndefined();
    expect(safe.aiSummary).toBeUndefined();
    expect(safe.phenotypes).toEqual([]);
    expect(JSON.stringify(safe)).not.toContain(leak);
    expect(JSON.stringify(safe)).not.toContain('PROSE_LEAK');
    expect(JSON.stringify(safe)).not.toContain('PHENOTYPE_LEAK');
  });

  it('applies terminal publication policy to genes nested in an export wrapper', () => {
    const blockedCandidateContent = 'BLOCKED_NESTED_CANDIDATE_CONTENT';
    const blockedProfileContent = 'BLOCKED_NESTED_PROFILE_CONTENT';
    const terminalGene = {
      symbol: 'SAFE2',
      name: 'attacker generated nested name',
      explanation: blockedCandidateContent,
      aiSummary: blockedProfileContent,
      coordinatesVerified: false,
      profileStatus: 'unavailable',
      candidatePublication: {
        contractVersion: 1,
        status: 'withheld',
        content: null,
        reasonCode: 'clinical_boundary',
        correlationId: 'nested-candidate-withheld',
        limitations: [],
      },
      profilePublication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'provider_failed',
        correlationId: 'nested-profile-unavailable',
        limitations: [],
      },
      associationClaims: [{
        source: 'Ensembl',
        recordId: 'ENSG00000123456',
        evidenceClass: 'human_verified',
        directLink: 'https://www.ensembl.org/id/ENSG00000123456',
        isAiLead: false,
      }],
    };
    const safe = publicationSafeExportData({
      reportKind: 'candidate-comparison',
      genes: [terminalGene],
      analysis: { groups: [{ genes: [terminalGene, 'deterministic-note'] }] },
    });

    expect(safe.reportKind).toBe('candidate-comparison');
    expect(safe.genes[0]).toMatchObject({
      symbol: 'SAFE2',
      coordinatesVerified: false,
      associationClaims: [{
        source: 'Ensembl',
        recordId: 'ENSG00000123456',
        evidenceClass: 'human_verified',
        directLink: 'https://www.ensembl.org/id/ENSG00000123456',
        isAiLead: false,
      }],
      candidatePublication: { status: 'withheld', content: null },
      profilePublication: { status: 'unavailable', content: null },
    });
    expect(safe.genes[0].name).toBeUndefined();
    expect(safe.genes[0].explanation).toBeUndefined();
    expect(safe.genes[0].aiSummary).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain('attacker generated nested');
    expect(JSON.stringify(safe)).not.toContain(blockedCandidateContent);
    expect(JSON.stringify(safe)).not.toContain(blockedProfileContent);
    expect(safe.analysis.groups[0].genes[0]).toEqual(safe.genes[0]);
    expect(safe.analysis.groups[0].genes[1]).toBe('deterministic-note');
  });

  it('sanitizes gene records in keyed and deep gene maps without flattening wrapper data', () => {
    const sharedTerminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'mapped-gene-terminal',
      limitations: [],
    };
    const sharedTerminalGene = {
      symbol: 'BRCA1',
      name: 'TERMINAL_MAPPED_NAME_LEAK',
      explanation: 'TERMINAL_MAPPED_EXPLANATION_LEAK',
      aiSummary: 'TERMINAL_MAPPED_SUMMARY_LEAK',
      phenotypes: [{ name: 'TERMINAL_MAPPED_PHENOTYPE_LEAK' }],
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: sharedTerminalPublication,
      profilePublication: sharedTerminalPublication,
    };
    const associationOnlyGene = {
      associationClaims: [],
      fullName: 'TERMINAL_DEEP_FULL_NAME_LEAK',
      description: 'TERMINAL_DEEP_DESCRIPTION_LEAK',
      keyTakeaways: ['TERMINAL_DEEP_TAKEAWAY_LEAK'],
      coordinatesVerified: false,
      profileStatus: 'unavailable',
      candidatePublication: sharedTerminalPublication,
      profilePublication: sharedTerminalPublication,
    };
    const cycle = { label: 'mapped cycle' };
    cycle.self = cycle;

    const safe = publicationSafeExportData({
      genes: {
        primary: sharedTerminalGene,
        nested: {
          count: 2,
          byRecord: { secondary: associationOnlyGene },
          metadata: {
            name: 'GENERIC_MAP_NAME_PRESERVED',
            phenotypes: [{ name: 'GENERIC_MAP_PHENOTYPE_PRESERVED' }],
          },
        },
        repeated: sharedTerminalGene,
        cycle,
        note: 'deterministic map note',
      },
    });

    expect(safe.genes.primary).toMatchObject({
      symbol: 'BRCA1',
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: sharedTerminalPublication,
      profilePublication: sharedTerminalPublication,
      phenotypes: [],
      expressionData: [],
    });
    expect(safe.genes.primary.name).toBeUndefined();
    expect(safe.genes.primary.explanation).toBeUndefined();
    expect(safe.genes.primary.aiSummary).toBeUndefined();
    expect(safe.genes.nested.byRecord.secondary).toMatchObject({
      associationClaims: [],
      coordinatesVerified: false,
      profileStatus: 'unavailable',
      candidatePublication: sharedTerminalPublication,
      profilePublication: sharedTerminalPublication,
      phenotypes: [],
      expressionData: [],
    });
    expect(safe.genes.nested.byRecord.secondary.fullName).toBeUndefined();
    expect(safe.genes.nested.byRecord.secondary.description).toBeUndefined();
    expect(safe.genes.nested.byRecord.secondary.keyTakeaways).toBeUndefined();
    expect(safe.genes.nested.count).toBe(2);
    expect(safe.genes.nested.metadata).toEqual({
      name: 'GENERIC_MAP_NAME_PRESERVED',
      phenotypes: [{ name: 'GENERIC_MAP_PHENOTYPE_PRESERVED' }],
    });
    expect(safe.genes.repeated).toEqual(safe.genes.primary);
    expect(safe.genes.repeated).not.toBe('[Circular reference omitted]');
    expect(safe.genes.cycle).toEqual({
      label: 'mapped cycle',
      self: '[Circular reference omitted]',
    });
    expect(safe.genes.note).toBe('deterministic map note');
    expect(JSON.stringify(safe)).not.toContain('TERMINAL_');
  });

  it('recognizes publication-marked terminal genes without identifiers inside an explicit genes collection', () => {
    const terminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'identifier-free-terminal-gene',
      limitations: [],
    };
    const genericMetadata = {
      kind: 'metadata',
      name: 'GENERIC_IDENTIFIER_FREE_NAME_PRESERVED',
      explanation: 'GENERIC_IDENTIFIER_FREE_EXPLANATION_PRESERVED',
      phenotypes: [{ name: 'GENERIC_IDENTIFIER_FREE_PHENOTYPE_PRESERVED' }],
    };
    const safe = publicationSafeExportData({
      genes: [{
        name: 'TERMINAL_IDENTIFIER_FREE_NAME_LEAK',
        explanation: 'TERMINAL_IDENTIFIER_FREE_EXPLANATION_LEAK',
        aiSummary: 'TERMINAL_IDENTIFIER_FREE_SUMMARY_LEAK',
        phenotypes: [{ name: 'TERMINAL_IDENTIFIER_FREE_PHENOTYPE_LEAK' }],
        coordinatesVerified: false,
        profileStatus: 'withheld',
        candidatePublication: terminalPublication,
        profilePublication: terminalPublication,
      }, genericMetadata],
    });

    expect(safe.genes[0]).toEqual({
      coordinatesVerified: false,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      phenotypes: [],
      expressionData: [],
    });
    expect(safe.genes[1]).toEqual(genericMetadata);
    expect(safe.genes[1]).not.toHaveProperty('expressionData');
    expect(JSON.stringify(safe)).not.toContain('TERMINAL_IDENTIFIER_FREE');
  });

  it.each([
    ['boolean false', false],
    ['string false', 'false'],
  ])('requires coordinatesVerified to be true, not %s, before exporting authoritative coordinates', (_label, coordinatesVerified) => {
    const terminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'string-false-coordinates',
      limitations: [],
    };
    const safe = publicationSafeGene({
      symbol: 'STRICT1',
      name: 'STRING_FALSE_NAME_LEAK',
      fullName: 'STRING_FALSE_FULL_NAME_LEAK',
      chromosome: 'STRING_FALSE_CHROMOSOME_LEAK',
      location: 'STRING_FALSE_LOCATION_LEAK',
      mapLocation: 'STRING_FALSE_MAP_LOCATION_LEAK',
      start: 123,
      end: 456,
      ensemblId: 'STRING_FALSE_ENSEMBL_LEAK',
      genomeBuild: 'STRING_FALSE_GENOME_BUILD_LEAK',
      verifiedSource: 'STRING_FALSE_VERIFIED_SOURCE_LEAK',
      authoritativeRetrievedAt: 'STRING_FALSE_RETRIEVED_AT_LEAK',
      coordinatesVerified,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      associationClaims: [{
        source: 'Ensembl',
        recordId: 'ENSG-SAFE-PROVENANCE',
        evidenceClass: 'human_verified',
      }],
    });

    expect(safe.symbol).toBe('STRICT1');
    expect(safe.coordinatesVerified).toBe(coordinatesVerified);
    expect(safe.associationClaims).toEqual([{
      source: 'Ensembl',
      recordId: 'ENSG-SAFE-PROVENANCE',
      evidenceClass: 'human_verified',
    }]);
    for (const key of [
      'name',
      'fullName',
      'chromosome',
      'location',
      'mapLocation',
      'start',
      'end',
      'ensemblId',
      'genomeBuild',
      'verifiedSource',
      'authoritativeRetrievedAt',
    ]) {
      expect(safe[key]).toBeUndefined();
    }
    expect(JSON.stringify(safe)).not.toContain('STRING_FALSE_');
  });

  it('preserves authoritative coordinate provenance only when coordinatesVerified is true', () => {
    const terminalPublication = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'verified-coordinate-provenance',
      limitations: [],
    };
    const safe = publicationSafeGene({
      symbol: 'STRICT2',
      name: 'Verified identity',
      chromosome: '17',
      location: '17q21.31',
      mapLocation: '17q21.31',
      genomeBuild: 'GRCh38',
      verifiedSource: 'Ensembl',
      authoritativeRetrievedAt: '2026-08-11',
      coordinatesVerified: true,
      profileStatus: 'withheld',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      associationClaims: [{
        source: 'Ensembl',
        recordId: 'ENSG-VERIFIED-PROVENANCE',
        evidenceClass: 'human_verified',
      }],
    });

    expect(safe).toMatchObject({
      symbol: 'STRICT2',
      name: 'Verified identity',
      chromosome: '17',
      location: '17q21.31',
      mapLocation: '17q21.31',
      genomeBuild: 'GRCh38',
      verifiedSource: 'Ensembl',
      authoritativeRetrievedAt: '2026-08-11',
      coordinatesVerified: true,
      associationClaims: [{
        source: 'Ensembl',
        recordId: 'ENSG-VERIFIED-PROVENANCE',
        evidenceClass: 'human_verified',
      }],
    });
  });

  it('sanitizes gene-shaped entries in mixed root arrays while leaving other objects generic', () => {
    const terminalPublication = {
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'provider_failed',
      correlationId: 'root-array-terminal',
      limitations: [],
    };
    const sharedTerminalGene = {
      symbol: 'CFTR',
      name: 'TERMINAL_ROOT_NAME_LEAK',
      explanation: 'TERMINAL_ROOT_EXPLANATION_LEAK',
      aiSummary: 'TERMINAL_ROOT_SUMMARY_LEAK',
      coordinatesVerified: false,
      profileStatus: 'unavailable',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
    };
    const genericObject = {
      kind: 'metadata',
      name: 'GENERIC_ROOT_NAME_PRESERVED',
      explanation: 'GENERIC_ROOT_EXPLANATION_PRESERVED',
      phenotypes: [{ name: 'GENERIC_ROOT_PHENOTYPE_PRESERVED' }],
    };
    const cyclicWrapper = { kind: 'cycle' };
    cyclicWrapper.self = cyclicWrapper;

    const safe = publicationSafeExportData([
      sharedTerminalGene,
      genericObject,
      'deterministic root note',
      [genericObject, sharedTerminalGene],
      cyclicWrapper,
    ]);

    expect(safe[0]).toMatchObject({
      symbol: 'CFTR',
      coordinatesVerified: false,
      profileStatus: 'unavailable',
      candidatePublication: terminalPublication,
      profilePublication: terminalPublication,
      phenotypes: [],
      expressionData: [],
    });
    expect(safe[0].name).toBeUndefined();
    expect(safe[0].explanation).toBeUndefined();
    expect(safe[0].aiSummary).toBeUndefined();
    expect(safe[1]).toEqual(genericObject);
    expect(safe[1]).not.toHaveProperty('expressionData');
    expect(safe[2]).toBe('deterministic root note');
    expect(safe[3][0]).toEqual(genericObject);
    expect(safe[3][1]).toEqual(safe[0]);
    expect(safe[3][1]).not.toBe('[Circular reference omitted]');
    expect(safe[4]).toEqual({
      kind: 'cycle',
      self: '[Circular reference omitted]',
    });
    expect(JSON.stringify(safe)).not.toContain('TERMINAL_');
  });

  it.each([
    ['partial', 'partial content', ['Incomplete output.']],
    ['unavailable', null, []],
  ])('exports %s with a null reason as an invalid unavailable envelope', (status, content, limitations) => {
    const safe = publicationSafeExportData({
      result: 'legacy alias must not survive',
      publication: {
        contractVersion: 1,
        status,
        content,
        reasonCode: null,
        correlationId: `null-reason-export-${status}`,
        limitations,
      },
    });

    expect(safe.result).toBeUndefined();
    expect(safe.publication).toMatchObject({
      status: 'unavailable',
      content: null,
      reasonCode: 'invalid_publication_envelope',
    });
  });


  it('independently strips generated aliases and forged content from non-reusable publications', () => {
    const safe = publicationSafeGene({
      symbol: 'SAFE1',
      name: 'attacker generated name',
      explanation: 'attacker generated explanation',
      aiSummary: 'attacker generated summary',
      keyTakeaways: ['attacker takeaway'],
      phenotypes: [{ name: 'attacker phenotype' }],
      profileStatus: 'withheld',
      candidatePublication: {
        contractVersion: 1,
        status: 'withheld',
        content: { candidateGenes: [{ symbol: 'LEAK1' }] },
        reasonCode: 'clinical_boundary',
        correlationId: 'candidate-withheld',
        limitations: [],
      },
      profilePublication: {
        contractVersion: 1,
        status: 'unavailable',
        content: { summary: 'LEAK2' },
        reasonCode: 'provider_failed',
        correlationId: 'profile-unavailable',
        limitations: [],
      },
      associationClaims: gene.associationClaims,
    });

    expect(safe.symbol).toBe('SAFE1');
    expect(safe.name).toBeUndefined();
    expect(safe.explanation).toBeUndefined();
    expect(safe.aiSummary).toBeUndefined();
    expect(safe.keyTakeaways).toBeUndefined();
    expect(safe.phenotypes).toEqual([]);
    expect(safe.candidatePublication.content).toBeNull();
    expect(safe.profilePublication.content).toBeNull();
    expect(JSON.stringify(safe)).not.toContain('LEAK1');
    expect(JSON.stringify(safe)).not.toContain('LEAK2');
    expect(JSON.stringify(safe)).not.toContain('attacker generated name');
  });

  it('serializes partial-publication limitations in printable and copied artifacts', () => {
    const partialGene = {
      ...gene,
      candidatePublication: {
        ...gene.candidatePublication,
        status: 'partial',
        reasonCode: 'provider_truncated',
        limitations: ['Candidate explanations may be incomplete.'],
      },
    };
    const status = buildGeneReportSections(partialGene)
      .find((section) => section.title === 'Publication Status');
    const share = buildGeneShareText(partialGene);

    expect(status.content).toContain('partial');
    expect(status.content).toContain('Candidate explanations may be incomplete.');
    expect(share).toContain('Candidate lead publication: partial');
    expect(share).toContain('Candidate lead publication limitation: Candidate explanations may be incomplete.');
  });

  it('renders every required provenance field and escapes untrusted content', () => {
    const sections = buildGeneReportSections(gene);
    const provenance = sections.find(section => section.title === 'Evidence and Source Provenance');

    expect(provenance).toBeTruthy();
    expect(provenance.content).toContain('Identity / ontology / follow-up metadata');
    expect(provenance.content).toContain('AI candidate lead');
    expect(provenance.content).toContain('ClinGen &lt;curated&gt;');
    expect(provenance.content).toContain('RUNX1-001');
    expect(provenance.content).toContain('Source Release / Version</th><td>Not recorded');
    expect(provenance.content).toContain('Reference Assembly</th><td>GRCh38');
    expect(provenance.content).toContain('human_verified');
    expect(provenance.content).toContain('gene_identity');
    expect(provenance.content).toContain('supporting');
    expect(provenance.content).toContain('Homo sapiens');
    expect(provenance.content).toContain('9606');
    expect(provenance.content).toContain('2026-08-09');
    expect(provenance.content).toContain('AI Lead</th><td>false');
    expect(provenance.content).toContain('AI Lead</th><td>true');
    expect(provenance.content).toContain('https://example.org/records/RUNX1?source=ClinGen');
    expect(provenance.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(provenance.content).not.toContain('<script>alert(1)</script>');
    expect(provenance.content).not.toContain('href="javascript:');
    expect(provenance.content).toContain('No validated HTTP(S) link recorded');
  });

  it('uses the same association-ranking fallback as the gene card', () => {
    const overview = buildGeneReportSections(gene)
      .find(section => section.title === 'Gene Overview');
    const summary = buildGeneShareText(gene);

    expect(overview.content).toContain('AI research lead');
    expect(summary).toContain('Ranking: AI research lead');

    const associationClaim = {
      source: 'Reviewed computational fixture',
      recordId: 'COMP:1',
      claim: 'RUNX1 computationally supports the bounded query',
      taxon: '9606',
      species: 'Homo sapiens',
      evidenceClass: 'computational',
      evidenceType: 'gene_phenotype_association_prediction',
      evidenceStrength: 'supporting',
      releaseVersion: 'v1',
      referenceAssembly: null,
      retrievalDate: '2026-08-09',
      directLink: 'https://example.org/COMP:1',
      isAiLead: false,
    };
    const associationGene = { ...gene, associationClaims: [associationClaim] };
    const associationOverview = buildGeneReportSections(associationGene)
      .find(section => section.title === 'Gene Overview');
    expect(associationOverview.content).toContain('Computational association evidence');
    expect(buildGeneShareText(associationGene)).toContain('Ranking: Computational association evidence');

    const openTargetsGene = {
      ...gene,
      associationClaims: [{
        ...associationClaim,
        source: 'Open Targets Platform GraphQL API v4',
        recordId: 'ENSG00000159216',
        claim: 'Open Targets aggregates source datatypes for RUNX1 and the bounded query',
        subject: { kind: 'gene', id: 'ENSG00000159216', label: 'RUNX1' },
        object: { kind: 'disease', id: 'MONDO:0005027', label: 'Seizure disorder' },
        evidenceClass: 'computational',
        evidenceType: 'computed_target_disease_association',
        scoreComponents: [{
          id: 'literature',
          label: 'Literature',
          score: 0.42,
          evidenceClass: 'literature',
          scale: 'open_targets_datatype_score_0_1',
        }],
        releaseVersion: '26.06',
        retrievalDate: '2026-08-25',
        directLink: 'https://platform.opentargets.org/disease/MONDO_0005027/associations',
      }],
    };
    const openTargetsSections = buildGeneReportSections(openTargetsGene);
    const openTargetsOverview = openTargetsSections.find(section => section.title === 'Gene Overview');
    const openTargetsProvenance = openTargetsSections
      .find(section => section.title === 'Evidence and Source Provenance');
    const openTargetsShare = buildGeneShareText(openTargetsGene);

    expect(openTargetsOverview.content).toContain('Computational association evidence');
    expect(openTargetsProvenance.content).toContain('Source Score Components');
    expect(openTargetsProvenance.content).toContain('Literature: 0.42 · class literature');
    expect(openTargetsProvenance.content).toContain('open_targets_datatype_score_0_1');
    expect(openTargetsShare).toContain('Ranking: Computational association evidence');
    expect(openTargetsShare).toContain('source_score_component=Literature');
    expect(openTargetsShare).toContain('component_evidence=literature');
  });

  it('labels disease and phenotype lists as candidates rather than verified associations', () => {
    const sections = buildGeneReportSections(gene);
    const diseaseSection = sections.find(section => section.title === 'Candidate Disease Labels');
    const phenotypeSection = sections.find(section => section.title === 'Candidate Phenotype Terms');

    expect(diseaseSection.content).toMatch(/Candidate labels only/);
    expect(diseaseSection.content).toMatch(/explicitly labeled association evidence/);
    expect(phenotypeSection.content).toMatch(/Candidate terms only/);
    expect(phenotypeSection.content).toMatch(/not a gene-phenotype association/);
    expect(phenotypeSection.content).toContain('HP:0001909 (HPO-validated term)');
  });

  it('fails closed when no claim-level provenance is supplied', () => {
    const sections = buildGeneReportSections({ symbol: 'ZZZ1', diseases: ['Unknown condition'] });
    const provenance = sections.find(section => section.title === 'Evidence and Source Provenance');

    expect(provenance.content).toMatch(/No claim-level provenance was supplied/);
    expect(provenance.content).toMatch(/unverified research lead/);
  });

  it('preserves provenance roles, assembly, and explicit AI-lead status in copied text', () => {
    const summary = buildGeneShareText(gene);

    expect(summary).toContain('Evidence and source provenance:');
    expect(summary).toContain('role=source_metadata');
    expect(summary).toContain('role=ai_candidate_lead');
    expect(summary).toContain('source=ClinGen <curated>');
    expect(summary).toContain('record=RUNX1-001');
    expect(summary).toContain('version=Not recorded');
    expect(summary).toContain('assembly=GRCh38');
    expect(summary).toContain('evidence=human_verified');
    expect(summary).toContain('evidence_type=gene_identity');
    expect(summary).toContain('evidence_strength=supporting');
    expect(summary).toContain('species=Homo sapiens');
    expect(summary).toContain('taxon=9606');
    expect(summary).toContain('retrieved=2026-08-09');
    expect(summary).toContain('ai_lead=false');
    expect(summary).toContain('ai_lead=true');
    expect(summary).toContain('link=https://example.org/records/RUNX1?source=ClinGen');
    expect(summary).toContain('Candidate disease labels, unverified unless supported above');
    expect(summary).not.toContain('link=javascript:alert(1)');
  });

  it('records missing AI-lead status instead of silently omitting it', () => {
    const summary = buildGeneShareText({
      symbol: 'ZZZ1',
      associationClaims: [{
        source: 'Legacy source',
        recordId: 'LEGACY:1',
        claim: 'Legacy claim',
        taxon: 'unspecified',
        species: 'Unspecified',
        evidenceClass: 'external_followup',
        evidenceType: 'database_link',
        evidenceStrength: 'none',
        releaseVersion: null,
        referenceAssembly: null,
        retrievalDate: '2026-08-09',
        directLink: null,
      }],
    });

    expect(summary).toContain('ai_lead=not_recorded');
  });

  it('writes the same provenance-complete sections into the printable report', () => {
    const { write, close, print } = installPrintWindow();

    exportGeneReport(gene);

    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0];
    expect(html).toContain('Evidence and Source Provenance');
    expect(html).toContain('ClinGen &lt;curated&gt;');
    expect(html).toContain('Reference Assembly</th><td>GRCh38');
    expect(html).toContain('gene_identity');
    expect(html).toContain('supporting');
    expect(html).toContain('Education and exploratory research only');
    expect(close).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('normalizes explicit null input instead of crashing or inventing data', () => {
    const sections = buildGeneReportSections(null);
    const overview = sections.find(section => section.title === 'Gene Overview');
    const provenance = sections.find(section => section.title === 'Evidence and Source Provenance');
    const summary = buildGeneShareText(null);

    expect(overview.content).toContain('Not recorded');
    expect(provenance.content).toMatch(/No claim-level provenance was supplied/);
    expect(summary).toContain('GeneMap Discovery - Gene: Unknown gene');
    expect(summary).toContain('Evidence and source provenance: none supplied');

    const { write } = installPrintWindow();
    expect(() => exportGeneReport(null)).not.toThrow();
    expect(write.mock.calls[0][0]).toContain('Gene Report: Unknown gene');
  });

  it('renders non-finite expression and VCF numbers as N/A', () => {
    const sections = buildGeneReportSections({
      symbol: 'RUNX1',
      profileStatus: 'available',
      profilePublication: {
        contractVersion: 1,
        status: 'available',
        content: { summary: 'Expression fixture' },
        reasonCode: null,
        correlationId: 'profile-expression-fixture',
        limitations: [],
      },
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
