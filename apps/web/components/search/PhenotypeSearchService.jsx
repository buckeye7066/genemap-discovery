import { apiClient } from "@genemap/shared";
// Import provenance helpers by source path. The browser alias maps
// `@genemap/shared` to the HTTP client rather than the package barrel.
import {
  aiLeadClaim,
  externalFollowupClaim,
  humanGeneIdentityClaim,
  hpoPhenotypeClaim,
  deriveRankingBasisFromClaims,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  stripLlmSelfScores,
} from "../../../../packages/shared/src/associationClaim.ts";
import {
  createPublicationArtifact,
  isCanonicalPublicationArtifact,
  terminalPublicationArtifactFromError,
} from "@genemap/shared/publicationStatus";
import { log } from "../shared/logger";
import { getErrorMessage } from "../shared/errorUtils";
import { GENE_ENRICHMENT_CONCURRENCY } from "../shared/constants";
import { parseLLMJson, reusablePublicationArtifact } from "../shared/llmJson";
import { resolvePublicationSearchReference } from "@/lib/publicationConceptCatalog";

function adapterDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function unavailableProfilePublication(reasonCode) {
  return createPublicationArtifact({
    status: 'unavailable',
    reasonCode,
    correlationId: `client-profile:${reasonCode}`,
  });
}

const INVALID_CANDIDATE_PUBLICATION = Object.freeze(createPublicationArtifact({
  status: 'unavailable',
  reasonCode: 'invalid_candidate_publication',
  correlationId: 'client-candidate:invalid-publication',
}));

function normalizeCandidatePublication(artifact) {
  return isCanonicalPublicationArtifact(artifact)
    ? artifact
    : INVALID_CANDIDATE_PUBLICATION;
}

const TERMINAL_PUBLICATION_STATUSES = new Set([
  'withheld',
  'unavailable',
  'superseded',
]);

function isTerminalPublicationArtifact(artifact) {
  return Boolean(
    isCanonicalPublicationArtifact(artifact)
    && TERMINAL_PUBLICATION_STATUSES.has(artifact.status),
  );
}

export class PhenotypeSearchService {
  static async getUserContext() {
    let isAdmin = false;
    let userPreferences = null;
    try {
      const user = await apiClient.getMe();
      isAdmin = user?.role === "admin"
        || user?.role === "super_admin"
        || user?.entitlements?.isAdmin === true;
      userPreferences = {
        education_level: user?.education_level,
        field_of_study: user?.field_of_study,
      };
    } catch {
      isAdmin = false;
    }
    return { isAdmin, userPreferences };
  }

  /**
   * FAST phase. Generate bounded candidate leads and replace model-controlled
   * coordinates/identifiers with authoritative MyGene records before the cards
   * appear. Per-gene profile text is deliberately deferred to enrichCandidates.
   */
  static async findCandidates(
    phenotypeQuery,
    isPremium = false,
    searchMode = 'free_text',
    selectedReference = null,
  ) {
    try {
      const queryReference = resolvePublicationSearchReference(
        phenotypeQuery,
        searchMode,
        selectedReference,
      );
      if (!queryReference) {
        throw new Error(
          'Choose a reviewed disease/phenotype result or enter an exact HPO identifier. Free-text labels are not sent to the model.',
        );
      }

      const [{ isAdmin, userPreferences }, fused] = await Promise.all([
        this.getUserContext(),
        this.analyzeAndFindCandidates(queryReference),
      ]);
      const effectivePremium = isPremium || isAdmin;
      let { analysis, candidateGenes, publication } = fused;
      publication = normalizeCandidatePublication(publication);
      if (isTerminalPublicationArtifact(publication)) candidateGenes = [];

      // A sparse but syntactically valid response receives one bounded fallback
      // through the same immutable reference, never through model-generated text.
      if (!candidateGenes.length && reusablePublicationArtifact({ publication })) {
        analysis = await this.analyzePhenotype(queryReference);
        publication = normalizeCandidatePublication(analysis.publication);
        if (!isTerminalPublicationArtifact(publication)) {
          const fallback = await this.findCandidateGenes(
            analysis,
            effectivePremium,
            queryReference,
          );
          candidateGenes = fallback.candidateGenes;
          publication = normalizeCandidatePublication(fallback.publication);
          if (isTerminalPublicationArtifact(publication)) candidateGenes = [];
        }
      }

      const usesDiseaseCandidateLimit = this.usesDiseaseCandidatePrompt(
        analysis,
        queryReference,
      );
      const maxCandidateLeads = analysis.isDisease
        || analysis.queryType === 'disease'
        || usesDiseaseCandidateLimit
        ? 15
        : 8;
      candidateGenes = candidateGenes.slice(0, maxCandidateLeads);

      const symbols = candidateGenes.map((gene) => gene.symbol).filter(Boolean);
      const { genes: authGenes } = await this.safeEnrich(symbols, []);
      const baseGenes = this.attachProvenance(
        this.applyAuthoritativeData(
          candidateGenes.map((gene) => ({
            ...gene,
            candidatePublication: gene.candidatePublication || publication,
            sources: ['AI-suggested'],
            phenotypes: [],
            detailsPending: true,
          })),
          authGenes,
          {},
        ),
        phenotypeQuery,
      );

      return {
        query: phenotypeQuery,
        candidateGenes: baseGenes,
        isPremium: effectivePremium,
        hpoTerms: [],
        queryType: analysis.queryType || 'phenotype',
        userPreferences,
        publication,
        enriched: false,
      };
    } catch (error) {
      log.error("Search (find candidates) error:", error);
      const recoveryPublication = terminalPublicationArtifactFromError(error);
      if (recoveryPublication) {
        return {
          query: phenotypeQuery,
          candidateGenes: [],
          isPremium,
          hpoTerms: [],
          queryType: searchMode,
          userPreferences: null,
          publication: recoveryPublication,
          enriched: false,
        };
      }
      throw new Error(getErrorMessage(error) || "Failed to search for genes. Please try again.");
    }
  }

  /** One strict server-owned request classifies the reference and returns leads. */
  static async analyzeAndFindCandidates(queryReference) {
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'classify_and_suggest',
        query: queryReference,
        audience: 'researcher',
      },
      { maxTokens: 4096 },
    );

    const parsed = parseLLMJson(response, {});
    const candidateGenes = (
      Array.isArray(parsed.candidateGenes) ? parsed.candidateGenes : []
    ).filter((gene) => gene && gene.symbol);
    return {
      analysis: {
        queryType: parsed.queryType || (parsed.isDisease ? 'disease' : 'phenotype'),
        isDisease: Boolean(parsed.isDisease),
        diseaseName: parsed.diseaseName || null,
        isHPOTerm: Boolean(parsed.isHPOTerm),
        mainFeatures: Array.isArray(parsed.mainFeatures) ? parsed.mainFeatures : [],
        synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
        inheritancePattern: parsed.inheritancePattern || null,
        // Model-created ontology identifiers are not authoritative records.
        hpoTerms: [],
      },
      candidateGenes,
      publication: response?.publication || null,
    };
  }

  /**
   * SLOW phase. Fill profile text and phenotype names only after cards exist,
   * then validate those names through HPO and reattach complete provenance.
   */
  static async enrichCandidates(base) {
    try {
      const enrichedGenes = await this.enrichGeneData(
        base.candidateGenes,
        base.isPremium,
        base.userPreferences,
      );
      const phenotypeNames = this.collectPhenotypeNames(enrichedGenes);
      const { phenotypes: authHpo } = await this.safeEnrich([], phenotypeNames);
      const finalGenes = this.finalizeEnriched(
        enrichedGenes,
        authHpo,
        base.query,
      ).map((gene) => ({ ...gene, detailsPending: false }));
      return { ...base, candidateGenes: finalGenes, enriched: true };
    } catch (error) {
      log.error("Search (enrich) error:", error);
      const recoveryPublication = terminalPublicationArtifactFromError(error);
      return {
        ...base,
        candidateGenes: this.attachProvenance(
          (base.candidateGenes || []).map((gene) => ({
            ...gene,
            detailsPending: false,
            aiSummary: null,
            profileStatus: recoveryPublication?.status || 'unavailable',
            profilePublication: recoveryPublication
              || unavailableProfilePublication('profile_enrichment_failed'),
            keyTakeaways: [],
            phenotypes: [],
          })),
          base.query,
        ),
        enriched: true,
      };
    }
  }

  static async searchGenes(
    phenotypeQuery,
    isPremium = false,
    searchMode = 'free_text',
    selectedReference = null,
  ) {
    const base = await this.findCandidates(
      phenotypeQuery,
      isPremium,
      searchMode,
      selectedReference,
    );
    if (
      isTerminalPublicationArtifact(base.publication)
      || (
        base.publication.status === 'partial'
        && base.candidateGenes.length === 0
      )
    ) return base;
    return this.enrichCandidates(base);
  }

  static finalizeEnriched(genes, authHpo = {}, phenotypeQuery = '') {
    const hpoChecked = Object.keys(authHpo).length > 0;
    const finalized = (genes || []).map((gene) => {
      const merged = {
        ...gene,
        sources: this.honestSources(Boolean(gene.coordinatesVerified)),
      };
      if (Array.isArray(merged.phenotypes)) {
        merged.hpoChecked = hpoChecked;
        merged.phenotypes = merged.phenotypes.map((phenotype) => {
          if (!phenotype || typeof phenotype.name !== 'string') return phenotype;
          const record = authHpo[phenotype.name.trim().toLowerCase()];
          if (record?.verified) {
            return {
              ...phenotype,
              hpoId: record.hpoId,
              hpoVerified: true,
              retrievedAt: record.retrievedAt || null,
            };
          }
          return {
            ...phenotype,
            hpoId: null,
            hpoVerified: false,
            retrievedAt: null,
          };
        });
      }
      return merged;
    });
    return this.attachProvenance(finalized, phenotypeQuery);
  }

  static async safeEnrich(symbols, phenotypes) {
    if ((!symbols || symbols.length === 0) && (!phenotypes || phenotypes.length === 0)) {
      return { genes: {}, phenotypes: {} };
    }
    try {
      const response = await apiClient.enrichGenomicData(symbols || [], phenotypes || []);
      return {
        genes: response?.genes || {},
        phenotypes: response?.phenotypes || {},
      };
    } catch (error) {
      log.debug('Authoritative enrichment unavailable:', error?.message);
      return { genes: {}, phenotypes: {} };
    }
  }

  static collectPhenotypeNames(genes) {
    const names = new Map();
    for (const gene of genes || []) {
      for (const phenotype of (gene.phenotypes || []).slice(0, 6)) {
        const value = typeof phenotype?.name === 'string' ? phenotype.name.trim() : '';
        if (value) names.set(value.toLocaleLowerCase('en-US'), value);
      }
    }
    return [...names.values()].slice(0, 60);
  }

  static honestSources(verified) {
    return verified
      ? ['MyGene.info (Ensembl/NCBI) identity metadata', 'AI-suggested candidate lead']
      : ['AI-suggested candidate lead'];
  }

  static buildAssociationClaims(gene, phenotypeQuery = '') {
    const claims = [];
    const query = phenotypeQuery || gene?.query || 'phenotype search';
    claims.push(aiLeadClaim(gene.symbol, query));

    if (gene.coordinatesVerified && (gene.ensemblId || gene.entrezId)) {
      claims.push(humanGeneIdentityClaim({
        symbol: gene.symbol,
        ensemblId: gene.ensemblId,
        entrezId: gene.entrezId,
        genomeBuild: gene.genomeBuild || null,
        source: gene.verifiedSource || 'MyGene.info (Ensembl/NCBI)',
        retrievalDate: adapterDate(gene.authoritativeRetrievedAt),
      }));
    }

    for (const phenotype of gene.phenotypes || []) {
      if (phenotype?.hpoVerified && phenotype.hpoId) {
        claims.push(hpoPhenotypeClaim({
          geneSymbol: gene.symbol,
          phenotypeName: phenotype.name,
          hpoId: phenotype.hpoId,
          retrievalDate: adapterDate(phenotype.retrievedAt),
        }));
      }
    }

    // These deterministic search URLs are follow-up destinations. GeneMap has
    // not retrieved the destination record, so retrievalDate remains null.
    for (const resource of gene.furtherReading?.resources || []) {
      if (resource?.url && resource?.name) {
        claims.push(externalFollowupClaim({
          geneSymbol: gene.symbol,
          database: resource.name,
          url: resource.url,
          retrievalDate: null,
        }));
      }
    }
    return claims;
  }

  static attachProvenance(genes, phenotypeQuery = '') {
    const withClaims = (genes || []).map((gene) => {
      const stripped = stripLlmSelfScores(gene);
      const associationClaims = this.buildAssociationClaims(stripped, phenotypeQuery);
      return {
        ...stripped,
        associationClaims,
        evidencePartition: partitionClaimsBySpecies(associationClaims),
        rankingBasis: deriveRankingBasisFromClaims(associationClaims),
        // The model order is retained only as an uncalibrated display hint.
        leadOrderHint: Number.isFinite(gene.leadOrderHint)
          ? gene.leadOrderHint
          : null,
      };
    });
    return rankGenesByProvenance(withClaims);
  }

  static applyAuthoritativeData(genes, authGenes = {}, authHpo = {}) {
    const hpoChecked = Object.keys(authHpo).length > 0;
    return (genes || []).map((gene) => {
      const record = authGenes[gene.symbol];
      const verified = Boolean(record?.verified);
      const merged = {
        ...gene,
        coordinatesVerified: verified,
        verifiedSource: verified ? record.source : null,
        authoritativeRetrievedAt: verified ? record.retrievedAt || null : null,
        sources: this.honestSources(verified),
      };
      if (verified) {
        merged.chromosome = record.chromosome ?? null;
        merged.start = record.start ?? null;
        merged.end = record.end ?? null;
        merged.ensemblId = record.ensemblId ?? null;
        merged.entrezId = record.entrezId ?? null;
        merged.name = record.name || merged.name;
        merged.genomeBuild = record.genomeBuild || null;
        merged.mapLocation = record.mapLocation || null;
      } else {
        merged.chromosome = null;
        merged.start = null;
        merged.end = null;
        merged.ensemblId = null;
        merged.entrezId = null;
        merged.genomeBuild = null;
        merged.mapLocation = null;
      }

      if (Array.isArray(merged.phenotypes)) {
        merged.hpoChecked = hpoChecked;
        merged.phenotypes = merged.phenotypes.map((phenotype) => {
          if (!phenotype || typeof phenotype.name !== 'string') return phenotype;
          const hpoRecord = authHpo[phenotype.name.trim().toLowerCase()];
          if (hpoRecord?.verified) {
            return {
              ...phenotype,
              hpoId: hpoRecord.hpoId,
              hpoVerified: true,
              retrievedAt: hpoRecord.retrievedAt || null,
            };
          }
          return {
            ...phenotype,
            hpoId: null,
            hpoVerified: false,
            retrievedAt: null,
          };
        });
      }
      return merged;
    });
  }

  static getAudience(userPreferences) {
    const level = userPreferences?.education_level;
    if (level === 'medical_professional') return 'medical_researcher';
    if (level === 'researcher' || level === 'phd') return 'researcher';
    if (level === 'graduate' || level === 'postgraduate') return 'graduate';
    if (level === 'high_school') return 'general';
    return 'undergraduate';
  }

  static async analyzePhenotype(queryReference) {
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'classify',
        query: queryReference,
        audience: 'researcher',
      },
    );
    return {
      ...parseLLMJson(response, {}),
      publication: response?.publication || null,
    };
  }

  static async findCandidateGenes(_phenotypeAnalysis, _isPremium, queryReference) {
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'suggest_candidates',
        query: queryReference,
        audience: 'researcher',
      },
      { maxTokens: 4096 },
    );
    const parsed = parseLLMJson(response, { candidateGenes: [] });
    const result = Array.isArray(parsed) ? { candidateGenes: parsed } : parsed;
    const publication = response?.publication || null;
    return {
      candidateGenes: (result?.candidateGenes || [])
        .filter((gene) => gene && gene.symbol)
        .map((gene) => ({ ...gene, candidatePublication: publication })),
      publication,
    };
  }

  static usesDiseaseCandidatePrompt(phenotypeAnalysis, queryReference) {
    const searchTerms = [
      phenotypeAnalysis?.mainFeatures,
      phenotypeAnalysis?.synonyms,
    ].flat().filter(Boolean).join(', ');
    return Boolean(
      phenotypeAnalysis?.isDisease
      || phenotypeAnalysis?.queryType === 'disease'
      || queryReference?.conceptKind === 'disease'
      || queryReference?.kind === 'mondo'
      || (!searchTerms && queryReference),
    );
  }

  static async enrichGeneData(candidateGenes, isPremium, userPreferences) {
    const enrichedGenes = [];
    const concurrency = GENE_ENRICHMENT_CONCURRENCY;
    for (let index = 0; index < candidateGenes.length; index += concurrency) {
      const batch = candidateGenes.slice(index, index + concurrency);
      const batchResults = await Promise.all(batch.map(async (gene) => {
        try {
          const enriched = await this.enrichGeneCombined(gene, userPreferences);
          const premiumData = isPremium
            ? await this.getPremiumGeneData(gene.symbol, userPreferences)
            : {};
          return {
            ...gene,
            ...enriched,
            sources: this.honestSources(Boolean(gene.coordinatesVerified)),
            ...premiumData,
          };
        } catch (error) {
          log.error(`Error enriching gene ${gene.symbol}:`, error);
          const recoveryPublication = terminalPublicationArtifactFromError(error);
          return {
            ...gene,
            phenotypes: [],
            aiSummary: null,
            profileStatus: recoveryPublication?.status || 'unavailable',
            profilePublication: recoveryPublication
              || unavailableProfilePublication('profile_enrichment_failed'),
            keyTakeaways: [],
            furtherReading: this.deterministicFurtherReading(gene.symbol),
            expressionData: [],
            sources: this.honestSources(Boolean(gene.coordinatesVerified)),
          };
        }
      }));
      enrichedGenes.push(...batchResults);
    }
    return enrichedGenes;
  }

  static async enrichGeneCombined(gene, userPreferences) {
    const verifiedIdentifier = gene.ensemblId || gene.entrezId;
    if (!gene.coordinatesVerified || !verifiedIdentifier) {
      return {
        phenotypes: [],
        aiSummary: null,
        profileStatus: 'unavailable',
        profilePublication: unavailableProfilePublication('profile_identifier_unverified'),
        keyTakeaways: [],
        expressionData: [],
        furtherReading: this.deterministicFurtherReading(gene.symbol),
      };
    }

    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'gene_profile',
        gene: { symbol: gene.symbol },
        audience: this.getAudience(userPreferences),
      },
      { maxTokens: 2048 },
    );
    const parsed = parseLLMJson(response, {});
    const topLevelStatus = response?.publication?.status;
    const summaryStatus = ['withheld', 'unavailable', 'superseded'].includes(topLevelStatus)
      ? topLevelStatus
      : parsed.summaryStatus === 'available'
      ? 'available'
      : parsed.summaryStatus === 'withheld'
        ? 'withheld'
        : 'unavailable';
    const reusableArtifact = reusablePublicationArtifact(response);
    const profilePublication = reusableArtifact && summaryStatus !== 'available'
      ? {
          ...reusableArtifact,
          status: summaryStatus,
          content: null,
          reasonCode: `profile_${summaryStatus}`,
        }
      : response?.publication || null;
    const summary = summaryStatus === 'available' && typeof parsed.summary === 'string'
      ? parsed.summary.trim()
      : null;
    return {
      phenotypes: summaryStatus === 'available' && Array.isArray(parsed.phenotypes)
        ? parsed.phenotypes
        : [],
      aiSummary: summary,
      profileStatus: summaryStatus,
      profilePublication,
      keyTakeaways: summaryStatus === 'available' && Array.isArray(parsed.keyTakeaways)
        ? parsed.keyTakeaways
        : [],
      expressionData: [],
      furtherReading: this.deterministicFurtherReading(gene.symbol),
    };
  }

  static deterministicFurtherReading(geneSymbol) {
    const symbol = String(geneSymbol || '').trim().toUpperCase();
    const encoded = encodeURIComponent(symbol);
    if (!symbol) return { resources: [], pubmedSearchTerms: [] };
    return {
      resources: [
        { name: `NCBI Gene search: ${symbol}`, url: `https://www.ncbi.nlm.nih.gov/gene/?term=${encoded}` },
        { name: `ClinVar search: ${symbol}`, url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encoded}` },
        { name: `UniProt search: ${symbol}`, url: `https://www.uniprot.org/uniprotkb?query=${encoded}` },
        { name: `PubMed search: ${symbol}`, url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encoded}` },
      ],
      pubmedSearchTerms: [symbol, `${symbol} gene phenotype`, `${symbol} functional evidence`],
    };
  }

  static async getPremiumGeneData() {
    // Versioned population prevalence, pathogenicity, and treatment adapters do
    // not exist in this release. Empty fields are safer than model-generated data.
    return {
      prevalenceData: null,
      historyData: null,
      mutationData: [],
      treatmentData: [],
    };
  }

  static async compareGeneSets(userGenes, phenotypeGenes, phenotype, isPremium) {
    const userSet = new Set(userGenes.map((gene) => gene.toUpperCase()));
    const phenotypeSet = new Set(phenotypeGenes.map((gene) => gene.toUpperCase()));
    const overlapping = userGenes.filter((gene) => phenotypeSet.has(gene.toUpperCase()));
    const uniqueToUser = userGenes.filter((gene) => !phenotypeSet.has(gene.toUpperCase()));
    const uniqueToPhenotype = phenotypeGenes.filter((gene) => !userSet.has(gene.toUpperCase()));
    const context = phenotype ? ` for the exploratory query “${phenotype}”` : '';
    return {
      userGenes,
      phenotypeGenes,
      phenotype,
      overlapping,
      uniqueToUser,
      uniqueToPhenotype,
      analysis: [
        `This comparison checks list overlap${context}; it does not evaluate a person's genome.`,
        `${overlapping.length} gene(s) appear in both lists, ${uniqueToUser.length} only in the input list, and ${uniqueToPhenotype.length} only in the AI-generated candidate list.`,
        'Overlap is a research-organizing signal, not evidence of causation, diagnosis, or personal risk. Verify each association in primary sources.',
      ].join(' '),
      functionalRelationships: [],
      isPremium,
    };
  }
}
