import { apiClient } from "@genemap/shared";
import { log } from "../shared/logger";
import { getErrorMessage } from "../shared/errorUtils";
import { GENE_ENRICHMENT_CONCURRENCY } from "../shared/constants";
import { parseLLMJson } from "../shared/llmJson";

export class PhenotypeSearchService {
  static async getUserContext() {
    let isAdmin = false;
    let userPreferences = null;
    try {
      const user = await apiClient.getMe();
      isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.entitlements?.isAdmin === true;
      userPreferences = {
        education_level: user?.education_level,
        field_of_study: user?.field_of_study,
      };
    } catch (err) {
      isAdmin = false;
    }
    return { isAdmin, userPreferences };
  }

  /**
   * FAST phase. Identify candidate genes and attach AUTHORITATIVE coordinates
   * (MyGene.info → Ensembl/NCBI). This is 2 LLM calls + 1 batched DB lookup, so
   * the UI can render gene cards in ~15-20s instead of blocking the full
   * per-gene enrichment (which used to keep "Searching…" on screen for 40-100s
   * with nothing rendered). Per-gene detail is filled in later by
   * enrichCandidates(). Each returned gene carries `detailsPending: true`.
   */
  static async findCandidates(phenotypeQuery, isPremium = false, searchMode = 'free_text') {
    try {
      // Two independent round-trips run CONCURRENTLY:
      //  - getUserContext() (a /auth/me call) — needed only for the premium flag
      //    and the LATER per-gene enrichment, NOT for candidate discovery.
      //  - analyzeAndFindCandidates() — a single FUSED LLM call that both
      //    classifies the query and returns candidate genes.
      // Candidate discovery doesn't read the user profile, so there's no reason
      // to wait for getMe() before starting the (slow) LLM call — overlap them.
      const [{ isAdmin, userPreferences }, fused] = await Promise.all([
        this.getUserContext(),
        this.analyzeAndFindCandidates(phenotypeQuery, searchMode),
      ]);
      const effectivePremium = isPremium || isAdmin;

      let { analysis, candidateGenes } = fused;

      // Reliability net: if the single fused call came back without genes (sparse
      // or unparseable JSON), fall back to the original two-step path so the
      // speedup never costs us a result.
      if (!candidateGenes.length) {
        analysis = await this.analyzePhenotype(phenotypeQuery, searchMode);
        candidateGenes = await this.findCandidateGenes(analysis, effectivePremium, phenotypeQuery, searchMode);
      }

      // LLM output is untrusted: enforce the promised lead limits before any
      // authoritative or per-gene enrichment can fan out into external calls.
      const usesDiseaseCandidateLimit = this.usesDiseaseCandidatePrompt(analysis, phenotypeQuery);
      const maxCandidateLeads = analysis.isDisease
        || analysis.queryType === 'disease'
        || usesDiseaseCandidateLimit
        ? 15
        : 8;
      candidateGenes = candidateGenes.slice(0, maxCandidateLeads);

      const symbols = candidateGenes.map((g) => g.symbol).filter(Boolean);
      const { genes: authGenes } = await this.safeEnrich(symbols, []);

      const baseGenes = this.applyAuthoritativeData(
        candidateGenes.map((g) => ({
          ...g,
          genomeBuild: 'GRCh38',
          sources: ['AI-suggested'],
          phenotypes: [],
          detailsPending: true,
        })),
        authGenes,
        {}
      );

      return {
        query: phenotypeQuery,
        candidateGenes: baseGenes,
        isPremium: effectivePremium,
        hpoTerms: analysis.hpoTerms || [],
        queryType: analysis.queryType || 'phenotype',
        userPreferences,
        enriched: false,
      };
    } catch (error) {
      log.error("Search (find candidates) error:", error);
      throw new Error(getErrorMessage(error) || "Failed to search for genes. Please try again.");
    }
  }

  /**
   * FUSED classification + candidate discovery in a SINGLE LLM round-trip.
   *
   * Previously this was two sequential calls — analyzePhenotype() then
   * findCandidateGenes() — and the second consumed the first's classification
   * (isDisease / diseaseName / inheritancePattern), so they were a hard
   * dependency chain that could never run in parallel. Folding them into one
   * structured response removes a full slow round-trip from the blocking phase,
   * roughly halving time-to-first-card. Returns the same { analysis,
   * candidateGenes } shape the two-step path produced, so callers (and the
   * fallback) are unchanged. parseLLMJson tolerates fences/prose; a sparse reply
   * yields an empty gene list, which findCandidates() handles by falling back.
  */
  static async analyzeAndFindCandidates(query, searchMode = 'free_text') {
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'classify_and_suggest',
        query: { kind: this.queryKind(query, searchMode), term: query },
        audience: 'researcher',
      },
      { maxTokens: 4096 },
    );

    const parsed = parseLLMJson(response, {});
    const candidateGenes = (Array.isArray(parsed.candidateGenes) ? parsed.candidateGenes : []).filter(
      (g) => g && g.symbol
    );
    const analysis = {
      queryType: parsed.queryType || (parsed.isDisease ? 'disease' : 'phenotype'),
      isDisease: Boolean(parsed.isDisease),
      diseaseName: parsed.diseaseName || null,
      isHPOTerm: Boolean(parsed.isHPOTerm),
      mainFeatures: Array.isArray(parsed.mainFeatures) ? parsed.mainFeatures : [],
      // Model-supplied HPO identifiers are not source records. Leave this
      // empty until exact HPO ids are resolved by the authoritative adapter.
      hpoTerms: [],
      synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
      inheritancePattern: parsed.inheritancePattern || null,
    };
    return { analysis, candidateGenes };
  }

  /**
   * SLOW phase. Per-gene LLM detail (summary, phenotypes, takeaways, expression)
   * + HPO validation. Runs AFTER the candidate cards are already on screen, so
   * its latency is never blocking. A failure here returns the candidates
   * unchanged rather than wiping the already-rendered results.
   */
  static async enrichCandidates(base) {
    try {
      const enrichedGenes = await this.enrichGeneData(base.candidateGenes, base.isPremium, base.userPreferences);
      const phenotypeNames = this.collectPhenotypeNames(enrichedGenes);
      const { phenotypes: authHpo } = await this.safeEnrich([], phenotypeNames);
      const finalGenes = this.finalizeEnriched(enrichedGenes, authHpo).map((g) => ({ ...g, detailsPending: false }));
      return { ...base, candidateGenes: finalGenes, enriched: true };
    } catch (error) {
      log.error("Search (enrich) error:", error);
      return {
        ...base,
        candidateGenes: (base.candidateGenes || []).map((g) => ({ ...g, detailsPending: false })),
        enriched: true,
      };
    }
  }

  // Backward-compatible one-shot: candidates then enrichment in one await.
  static async searchGenes(phenotypeQuery, isPremium = false, searchMode = 'free_text') {
    const base = await this.findCandidates(phenotypeQuery, isPremium, searchMode);
    return this.enrichCandidates(base);
  }

  // After enrichGeneData (which re-stamps `sources` and adds LLM phenotypes),
  // restore honest provenance from the already-applied coordinate verification
  // and validate HPO ids. Coordinates were verified in findCandidates and are
  // preserved through enrichGeneData's spread.
  static finalizeEnriched(genes, authHpo = {}) {
    const hpoChecked = Object.keys(authHpo).length > 0;
    return (genes || []).map((g) => {
      const merged = { ...g, sources: this.honestSources(Boolean(g.coordinatesVerified)) };
      if (Array.isArray(merged.phenotypes)) {
        merged.hpoChecked = hpoChecked;
        merged.phenotypes = merged.phenotypes.map((p) => {
          if (!p || typeof p.name !== 'string') return p;
          const v = authHpo[p.name.trim().toLowerCase()];
          if (v && v.verified) return { ...p, hpoId: v.hpoId, hpoVerified: true };
          return { ...p, hpoId: null, hpoVerified: false };
        });
      }
      return merged;
    });
  }

  // Call the authoritative-enrichment endpoint, never throwing: if it's slow or
  // unavailable, the search proceeds with the (clearly-labeled) AI data.
  static async safeEnrich(symbols, phenotypes) {
    if ((!symbols || symbols.length === 0) && (!phenotypes || phenotypes.length === 0)) {
      return { genes: {}, phenotypes: {} };
    }
    try {
      const res = await apiClient.enrichGenomicData(symbols, phenotypes);
      return { genes: res?.genes || {}, phenotypes: res?.phenotypes || {} };
    } catch (err) {
      log.debug('Authoritative enrichment unavailable:', err?.message);
      return { genes: {}, phenotypes: {} };
    }
  }

  // Unique phenotype names worth validating (top few per gene; bounded overall).
  static collectPhenotypeNames(genes) {
    const names = new Set();
    for (const g of genes || []) {
      for (const p of (g.phenotypes || []).slice(0, 6)) {
        if (p && typeof p.name === 'string' && p.name.trim()) names.add(p.name.trim());
      }
    }
    return [...names].slice(0, 60);
  }

  static honestSources(verified) {
    return verified ? ['Ensembl/NCBI (verified)', 'AI-suggested'] : ['AI-suggested'];
  }

  // Overlay authoritative gene records + validated HPO ids onto the AI results.
  // Model-generated coordinates/identifiers are never retained: when the
  // authoritative adapter cannot verify a record, those fields fail closed to
  // null instead of being presented as scientific metadata.
  static applyAuthoritativeData(genes, authGenes = {}, authHpo = {}) {
    const hpoChecked = Object.keys(authHpo).length > 0;
    return (genes || []).map((g) => {
      const rec = authGenes[g.symbol];
      const verified = Boolean(rec && rec.verified);
      const merged = {
        ...g,
        coordinatesVerified: verified,
        verifiedSource: verified ? rec.source : null,
        sources: this.honestSources(verified),
      };
      if (verified) {
        merged.chromosome = rec.chromosome ?? null;
        merged.start = rec.start ?? null;
        merged.end = rec.end ?? null;
        merged.ensemblId = rec.ensemblId ?? null;
        merged.entrezId = rec.entrezId ?? null;
        merged.name = rec.name || merged.name;
        merged.genomeBuild = rec.genomeBuild || null;
        merged.mapLocation = rec.mapLocation || null;
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
        merged.phenotypes = merged.phenotypes.map((p) => {
          if (!p || typeof p.name !== 'string') return p;
          const v = authHpo[p.name.trim().toLowerCase()];
          if (v && v.verified) return { ...p, hpoId: v.hpoId, hpoVerified: true };
          // Never expose an LLM-supplied ontology id as a source record. If
          // validation is unavailable, fail closed to a null identifier.
          return { ...p, hpoId: null, hpoVerified: false };
        });
      }
      return merged;
    });
  }

  static getEducationContext(userPreferences) {
    if (!userPreferences || !userPreferences.education_level) {
      return "general audience with clear, accessible language";
    }

    const styles = {
      high_school: "high school student with simple explanations, avoiding jargon, using everyday analogies",
      undergraduate: "undergraduate student with moderate scientific detail and basic genetics terminology",
      graduate: "graduate student with technical language, advanced concepts, and detailed mechanisms",
      phd: "PhD-level researcher with sophisticated terminology, molecular details, and latest research findings",
      medical_professional: "medical professional using the tool for academic review; focus on mechanisms, evidence limitations, and source verification without clinical recommendations",
      researcher: "scientific researcher with comprehensive technical details, experimental evidence, and cutting-edge findings"
    };

    let style = styles[userPreferences.education_level] || styles.undergraduate;
    
    if (userPreferences.field_of_study) {
      style += `. Consider their background in ${userPreferences.field_of_study}`;
    }

    return style;
  }

  static getAudience(userPreferences) {
    const level = userPreferences?.education_level;
    if (level === 'medical_professional') return 'medical_researcher';
    if (level === 'researcher' || level === 'phd') return 'researcher';
    if (level === 'graduate' || level === 'postgraduate') return 'graduate';
    if (level === 'high_school') return 'general';
    return 'undergraduate';
  }

  static queryKind(query, searchMode = 'free_text') {
    const normalized = String(query || '').trim();
    if (searchMode === 'hpo_term' || /^HP:\d{7}$/i.test(normalized)) return 'hpo';
    if (searchMode === 'disease') return 'disease';
    return 'phenotype';
  }

  static async analyzePhenotype(query, searchMode = 'free_text') {
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'classify',
        query: { kind: this.queryKind(query, searchMode), term: query },
        audience: 'researcher',
      },
    );

    return parseLLMJson(response, {});
  }

  static async findCandidateGenes(phenotypeAnalysis, isPremium, originalQuery = "", searchMode = 'free_text') {
    const searchTerms = [
      phenotypeAnalysis.mainFeatures,
      phenotypeAnalysis.synonyms
    ].flat().filter(Boolean).join(", ");

    // If analyzePhenotype returned sparse/unparseable JSON, searchTerms and
    // diseaseName can be empty — which previously produced an EMPTY prompt
    // ("Based on the phenotype features: ") and made the model fall back to
    // generic "famous" genes (BRCA1/TP53/APOE) unrelated to the query. Always
    // anchor on the user's original query so e.g. "Cystic Fibrosis" still
    // searches for cystic fibrosis genes (CFTR) even when analysis is thin.
    const diseaseTarget = phenotypeAnalysis.diseaseName || originalQuery || searchTerms;
    const phenotypeTarget = searchTerms || originalQuery;

    const isDisease = this.usesDiseaseCandidatePrompt(phenotypeAnalysis, originalQuery);
    const target = originalQuery || (isDisease ? diseaseTarget : phenotypeTarget);
    const response = await apiClient.invokePublicationTask(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'suggest_candidates',
        query: { kind: isDisease ? 'disease' : this.queryKind(target, searchMode), term: target },
        audience: 'researcher',
      },
      { maxTokens: 4096 },
    );

    const parsed = parseLLMJson(response, { candidateGenes: [] });
    const geneResults = Array.isArray(parsed) ? { candidateGenes: parsed } : parsed;
    return (geneResults?.candidateGenes || []).filter((g) => g && g.symbol);
  }

  static usesDiseaseCandidatePrompt(phenotypeAnalysis, originalQuery = "") {
    const searchTerms = [
      phenotypeAnalysis?.mainFeatures,
      phenotypeAnalysis?.synonyms,
    ].flat().filter(Boolean).join(", ");
    return Boolean(phenotypeAnalysis?.isDisease || (!searchTerms && originalQuery));
  }

  static async enrichGeneData(candidateGenes, isPremium, userPreferences) {
    const enrichedGenes = [];
    const concurrency = GENE_ENRICHMENT_CONCURRENCY;

    // Process genes in parallel batches for better performance
    for (let i = 0; i < candidateGenes.length; i += concurrency) {
      const batch = candidateGenes.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (gene) => {
          try {
            // ONE combined call per gene instead of five (phenotypes, summary,
            // takeaways, further-reading, expression). A disease search returns
            // 5-15 genes; at five calls each that was 25-75 sequential LLM round
            // trips from the browser — minutes of latency that blew the request
            // timeout and left the user with a spinner and no results. Folding
            // them into a single structured response keeps the same output shape
            // while cutting the call count ~5x.
            const enriched = await this.enrichGeneCombined(gene, userPreferences);

            let premiumData = {};
            if (isPremium) {
              premiumData = await this.getPremiumGeneData(gene.symbol, userPreferences);
            }

            return {
              ...gene,
              genomeBuild: "GRCh38",
              ...enriched,
              // Honest default; applyAuthoritativeData() upgrades this to
              // "Ensembl/NCBI (verified)" once real coordinates are resolved.
              sources: ["AI-suggested"],
              ...premiumData
            };
          } catch (error) {
            log.error(`Error enriching gene ${gene.symbol}:`, error);
            return {
              ...gene,
              genomeBuild: "GRCh38",
              phenotypes: [],
              aiSummary: `${gene.symbol} is associated with the searched phenotype. ${gene.explanation || ''}`,
              keyTakeaways: [],
              furtherReading: null,
              expressionData: [],
              sources: ["AI-suggested"]
            };
          }
        })
      );
      enrichedGenes.push(...batchResults);
    }

    return enrichedGenes;
  }

  // Single structured enrichment call. Returns the same fields the previous
  // five separate calls produced, with per-field fallbacks so a partial or
  // malformed response degrades gracefully instead of failing the whole gene.
  static async enrichGeneCombined(gene, userPreferences) {
    const verifiedIdentifier = gene.ensemblId || gene.entrezId;
    if (!gene.coordinatesVerified || !verifiedIdentifier) {
      return {
        phenotypes: [],
        aiSummary: `${gene.symbol} is an AI-suggested candidate lead. Authoritative gene-identifier verification was unavailable, so no additional model profile was generated.`,
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
        gene: {
          symbol: gene.symbol,
          ...(gene.ensemblId ? { ensemblId: gene.ensemblId } : {}),
          ...(gene.entrezId ? { entrezId: gene.entrezId } : {}),
        },
        audience: this.getAudience(userPreferences),
      },
      { maxTokens: 2048 },
    );
    const parsed = parseLLMJson(response, {});

    return {
      phenotypes: Array.isArray(parsed.phenotypes) ? parsed.phenotypes : [],
      aiSummary: (typeof parsed.summary === 'string' && parsed.summary.trim())
        ? parsed.summary
        : `${gene.symbol} is associated with the searched phenotype. ${gene.explanation || ''}`,
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      // Numeric tissue-expression values and URLs generated by an LLM looked
      // authoritative but were not source records. Keep those fields empty and
      // provide deterministic search destinations instead.
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

  static async generateFurtherReading(gene) {
    return this.deterministicFurtherReading(gene?.symbol);
  }

  static async getGeneExpressionData() {
    // A future implementation should query a versioned GTEx/HPA endpoint.
    // LLM-generated TPM values are not data and must not be rendered as such.
    return [];
  }

  static async getPremiumGeneData() {
    // Population prevalence, pathogenicity, and treatment data must come from
    // exact versioned records. Until those adapters exist, fail closed rather
    // than selling model-generated values as premium evidence.
    return {
      prevalenceData: null,
      historyData: null,
      mutationData: [],
      treatmentData: [],
    };
  }

  static async compareGeneSets(userGenes, phenotypeGenes, phenotype, isPremium) {
    const userGenesSet = new Set(userGenes.map(g => g.toUpperCase()));
    const phenotypeGenesSet = new Set(phenotypeGenes.map(g => g.toUpperCase()));

    const overlapping = userGenes.filter(g => phenotypeGenesSet.has(g.toUpperCase()));
    const uniqueToUser = userGenes.filter(g => !phenotypeGenesSet.has(g.toUpperCase()));
    const uniqueToPhenotype = phenotypeGenes.filter(g => !userGenesSet.has(g.toUpperCase()));

    // Set overlap is deterministic. Do not ask an LLM what a user's unique
    // genes "might indicate"; that converted a research-list comparison into
    // unsupported personal interpretation.
    const context = phenotype ? ` for the exploratory query “${phenotype}”` : '';
    const analysis = [
      `This comparison checks list overlap${context}; it does not evaluate a person's genome.`,
      `${overlapping.length} gene(s) appear in both lists, ${uniqueToUser.length} only in the input list, and ${uniqueToPhenotype.length} only in the AI-generated candidate list.`,
      'Overlap is a research-organizing signal, not evidence of causation, diagnosis, or personal risk. Verify each association in primary sources.',
    ].join(' ');
    const functionalRelationships = [];

    return {
      userGenes,
      phenotypeGenes,
      phenotype,
      overlapping,
      uniqueToUser,
      uniqueToPhenotype,
      analysis,
      functionalRelationships,
      isPremium
    };
  }

  static async getFunctionalRelationships() {
    // Do not fabricate relationship evidence. A future implementation should
    // return exact STRING/BioGRID record identifiers and database versions.
    return [];
  }
}
