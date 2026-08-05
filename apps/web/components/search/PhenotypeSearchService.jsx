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
  static async findCandidates(phenotypeQuery, isPremium = false) {
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
        this.analyzeAndFindCandidates(phenotypeQuery),
      ]);
      const effectivePremium = isPremium || isAdmin;

      let { analysis, candidateGenes } = fused;

      // Reliability net: if the single fused call came back without genes (sparse
      // or unparseable JSON), fall back to the original two-step path so the
      // speedup never costs us a result.
      if (!candidateGenes.length) {
        analysis = await this.analyzePhenotype(phenotypeQuery);
        candidateGenes = await this.findCandidateGenes(analysis, effectivePremium, phenotypeQuery);
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
  static async analyzeAndFindCandidates(query) {
    const prompt = `
You are a genomics assistant. For the query below, do BOTH steps in ONE response.

Query: "${query}"

STEP 1 — Classify the query:
- Is it a disease name (e.g. "Rheumatoid Arthritis", "Trisomy 21", "Cystic Fibrosis")?
- Is it a phenotype description (e.g. "polydactyly", "intellectual disability")?
- Is it an HPO term (starts with "HP:")?
- Identify its main phenotypic features, related HPO terms, synonyms, and — if it is a
  Mendelian disorder — the inheritance pattern.

STEP 2 — Generate candidate-gene research leads for that query:
- If it is a DISEASE: suggest a bounded set of plausible primary, susceptibility,
  modifier, and pathway leads. Never claim the list is exhaustive or clinically validated.
  Return 5-15 genes ranked only by model-estimated relevance to the query.
- If it is a PHENOTYPE or HPO term: find candidate genes associated with these features.
  Return 3-8 model-generated leads for source verification.
- For EACH gene provide: symbol, full name, Entrez ID and Ensembl ID (if known),
  chromosomal location (chromosome + approximate start/end), an AI relevance score (0-1),
  the association type (causative, risk factor, GWAS, pathway), evidence species
  (human, animal, computational, mixed, or unknown), and a brief explanation.

OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, and PubMed are follow-up
destinations, not sources you may claim to have checked. Do not invent citations,
record identifiers, evidence grades, prevalence, or clinical significance. Anchor
the gene list on the ORIGINAL query "${query}" — do NOT fall back to generic famous
genes (BRCA1 / TP53 / APOE) unless they are genuinely relevant.
`;

    const response = await apiClient.invokeLLM(
      prompt +
        '\n\nReturn ONLY a JSON object with keys: queryType (string), isDisease (boolean), ' +
        'diseaseName (string|null), isHPOTerm (boolean), mainFeatures (array of strings), ' +
        'hpoTerms (array of strings), synonyms (array of strings), inheritancePattern ' +
        '(string|null), and candidateGenes (array of objects with: symbol, name, entrezId, ' +
        'ensemblId, chromosome, start, end, score, associationType, evidenceSpecies, explanation).',
      {
        publicationTask: 'candidate_gene_research',
        add_context_from_internet: true,
        maxTokens: 4096,
      }
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
      hpoTerms: Array.isArray(parsed.hpoTerms) ? parsed.hpoTerms : [],
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
  static async searchGenes(phenotypeQuery, isPremium = false) {
    const base = await this.findCandidates(phenotypeQuery, isPremium);
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
          return { ...p, hpoId: hpoChecked ? null : p.hpoId, hpoVerified: false };
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

  // Overlay authoritative gene records + validated HPO ids onto the AI results,
  // tagging provenance so the UI can show what's verified vs AI-estimated.
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
        merged.chromosome = rec.chromosome ?? merged.chromosome;
        merged.start = rec.start ?? merged.start;
        merged.end = rec.end ?? merged.end;
        merged.ensemblId = rec.ensemblId ?? merged.ensemblId;
        merged.entrezId = rec.entrezId ?? merged.entrezId;
        merged.name = rec.name || merged.name;
        merged.genomeBuild = rec.genomeBuild || merged.genomeBuild;
        merged.mapLocation = rec.mapLocation || merged.mapLocation;
      }
      if (Array.isArray(merged.phenotypes)) {
        merged.hpoChecked = hpoChecked;
        merged.phenotypes = merged.phenotypes.map((p) => {
          if (!p || typeof p.name !== 'string') return p;
          const v = authHpo[p.name.trim().toLowerCase()];
          if (v && v.verified) return { ...p, hpoId: v.hpoId, hpoVerified: true };
          // Validation ran but found no match → drop the unverified AI id rather
          // than present a possibly-fabricated one. If validation didn't run at
          // all (endpoint unavailable), keep the AI id as-is (still labeled).
          return { ...p, hpoId: hpoChecked ? null : p.hpoId, hpoVerified: false };
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

  static async analyzePhenotype(query) {
    const prompt = `
Analyze this query and determine if it's a disease name, phenotype, or HPO term:
Query: "${query}"

**Analysis Required:**
1. Is this a disease name (e.g., "Rheumatoid Arthritis", "Trisomy 21", "Cystic Fibrosis")?
2. Is this a phenotype description (e.g., "polydactyly", "intellectual disability")?
3. Is this an HPO term (starts with HP:)?
4. What are the main phenotypic features or disease characteristics?
5. What related HPO terms might be relevant?
6. What are alternative names/synonyms?

If it's a disease:
- Identify categories of candidate genes that may be useful for later source review
- Do not claim an exhaustive list, clinical validation, or that any database was queried

Provide a bounded exploratory analysis for candidate-gene lead generation.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn your response as JSON with keys: queryType, isDisease, diseaseName, isHPOTerm, mainFeatures (array), hpoTerms (array), synonyms (array), category, inheritancePattern.', {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true
    });

    return parseLLMJson(response, {});
  }

  static async findCandidateGenes(phenotypeAnalysis, isPremium, originalQuery = "") {
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

    let prompt = "";

    if (this.usesDiseaseCandidatePrompt(phenotypeAnalysis, originalQuery)) {
      prompt = `
Generate candidate-gene research leads for the disease/condition: ${diseaseTarget}

**Bounded Lead Generation:**
1. Primary causative genes (monogenic forms)
2. Risk factor genes (polygenic/complex forms)
3. GWAS-identified susceptibility loci
4. Modifier genes
5. Genes in relevant pathways
6. Genes from animal models (if highly relevant)

For each gene, provide:
- Gene symbol and full name
- Entrez ID and Ensembl ID (if known)
- Chromosomal location (chromosome, approximate start/end coordinates)
- Association type (causative, risk factor, GWAS, pathway)
- AI relevance score (0-1); explicitly not a probability or evidence grade
- Brief explanation of the gene's role in the disease
- Evidence species: human, animal, computational, mixed, or unknown

Treat OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, and PubMed as
follow-up destinations. Do not imply that you queried them and do not invent citations.

Return 5-15 model-estimated leads. Never describe the list as exhaustive or clinically validated.
${phenotypeAnalysis.inheritancePattern ? `\nNote: Inheritance pattern is ${phenotypeAnalysis.inheritancePattern}` : ''}
`;
    } else {
      prompt = `
Based on the phenotype features: ${phenotypeTarget}

Generate candidate-gene research leads from general genomics knowledge. Treat
OMIM, ClinVar, HPO, UniProt, HPA, GTEx, and PubMed only as follow-up destinations;
do not imply that you queried them and do not invent citations, record identifiers,
evidence grades, expression values, prevalence, or clinical significance.

For each gene, provide:
- Gene symbol and full name
- Entrez ID and Ensembl ID (if known)
- Chromosomal location (chromosome, approximate start/end coordinates)
- AI relevance score (0-1); not a probability or evidence grade
- Brief explanation of the gene-phenotype relationship
- Evidence species: human, animal, computational, mixed, or unknown

Return 3-8 candidate leads ranked by model-estimated relevance for source verification.
`;
    }

    // Request the full token budget: a 5-15 gene list with per-gene metadata and
    // explanations easily exceeds the default cap, and a truncated reply yields
    // invalid JSON → an empty list → the "Found 0 candidate genes" the user saw.
    const response = await apiClient.invokeLLM(prompt + '\n\nReturn your response as JSON with key "candidateGenes" containing an array of objects with: symbol, name, entrezId, ensemblId, chromosome, start, end, score, associationType, evidenceSpecies, explanation.', {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true,
      maxTokens: 4096
    });

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
    const explanationStyle = this.getEducationContext(userPreferences);
    const prompt = `For the human gene ${gene.symbol} (${gene.name || ''}), provide a structured exploratory-research profile.
Gene context: ${gene.explanation || ''}

Tailor all prose for ${explanationStyle}. Treat OMIM, ClinVar, UniProt, HPO,
HPA, GTEx, and PubMed as places the reader should search next; do not claim
that you queried them and do not invent citations, numeric expression values,
clinical significance, penetrance, prevalence, diagnosis, prognosis, treatment,
screening, pharmacogenomic, or dosing guidance. Clearly describe every
gene-phenotype statement as a candidate lead that requires source verification.
Do not include preamble or meta-commentary.

Return ONLY a JSON object with these keys:
- "summary": string, a 2-3 sentence exploratory summary (function, candidate research associations, mechanism)
- "keyTakeaways": array of 3-4 one-sentence strings
- "phenotypes": array of { "name": string, "hpoId": string|null } for candidate phenotype terms`;

    const response = await apiClient.invokeLLM(prompt, {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true,
      maxTokens: 2048,
    });
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

  static async getGenePhenotypes(geneSymbol) {
    const prompt = `
For the gene ${geneSymbol}, list the main phenotypes and diseases it's associated with.
Include HPO terms where applicable.
Return candidate association terms only. Do not claim that OMIM, ClinVar,
UniProt, HPO, or PubMed were queried, and do not invent citations or evidence grades.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "phenotypes" containing array of {name, hpoId}.', {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true
    });

    return parseLLMJson(response, { phenotypes: [] }).phenotypes || [];
  }

  static async generateGeneSummary(gene, phenotypes, userPreferences) {
    const phenotypeList = phenotypes.map(p => p.name).join(", ");
    const explanationStyle = this.getEducationContext(userPreferences);
    
    const prompt = `
Generate a concise, scientific summary for the gene ${gene.symbol} (${gene.name}).

Context:
- Associated phenotypes: ${phenotypeList}
- Gene explanation: ${gene.explanation || ''}

IMPORTANT: Tailor this explanation for ${explanationStyle}.

Provide a 2-3 sentence summary covering:
1. Gene function/role
2. Key disease associations
3. Molecular mechanism (adjust depth based on audience)

Keep it explicitly exploratory and match the complexity and terminology to the
reader's background. Treat UniProt, HPA, GTEx, and PubMed as follow-up search
destinations only; do not imply they were queried and do not invent citations,
record identifiers, evidence grades, expression values, or clinical significance.
`;

    const response = await apiClient.invokeLLM(prompt, {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true
    });
    return response?.result || response || `${gene.symbol} is associated with the searched phenotype.`;
  }

  static async generateKeyTakeaways(gene, phenotypes, userPreferences) {
    const phenotypeList = phenotypes.map(p => p.name).join(", ");
    const explanationStyle = this.getEducationContext(userPreferences);
    
    const prompt = `
For the gene ${gene.symbol} (${gene.name}), generate 3-4 key takeaways as bullet points.

Context:
- Associated phenotypes: ${phenotypeList}
- Gene explanation: ${gene.explanation || ''}

IMPORTANT: Tailor these takeaways for ${explanationStyle}.

Each takeaway should be:
- One concise sentence
- Highlight the most important information
- Actionable or informative
- Appropriate complexity for the audience

Return ONLY an array of strings, no additional formatting.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "takeaways" containing array of strings.', {
      publicationTask: 'candidate_gene_research',
      add_context_from_internet: true
    });

    const parsed = parseLLMJson(response, { takeaways: [] });
    if (Array.isArray(parsed)) return parsed;
    return parsed.takeaways || [];
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
