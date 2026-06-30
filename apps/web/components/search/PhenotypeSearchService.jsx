import { apiClient } from "@genemap/shared";
import { log } from "../shared/logger";
import { getErrorMessage } from "../shared/errorUtils";
import { GENE_ENRICHMENT_CONCURRENCY } from "../shared/constants";
import { parseLLMJson } from "../shared/llmJson";

export class PhenotypeSearchService {
  static async searchGenes(phenotypeQuery, isPremium = false) {
    try {
      // Check for admin access and get user preferences
      let isAdmin = false;
      let userPreferences = null;
      try {
        const user = await apiClient.getMe();
        isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.entitlements?.isAdmin === true;
        userPreferences = {
          age: user?.age,
          education_level: user?.education_level,
          field_of_study: user?.field_of_study
        };
      } catch (err) {
        isAdmin = false;
      }

      // Grant premium access to admin
      const effectivePremium = isPremium || isAdmin;

      const phenotypeAnalysis = await this.analyzePhenotype(phenotypeQuery);
      const candidateGenes = await this.findCandidateGenes(phenotypeAnalysis, effectivePremium, phenotypeQuery);
      const enrichedGenes = await this.enrichGeneData(candidateGenes, effectivePremium, userPreferences);
      
      return {
        query: phenotypeQuery,
        candidateGenes: enrichedGenes,
        isPremium: effectivePremium,
        hpoTerms: phenotypeAnalysis.hpoTerms || [],
        queryType: phenotypeAnalysis.queryType || 'phenotype'
      };
      
    } catch (error) {
      log.error("Search error:", error);
      throw new Error(getErrorMessage(error) || "Failed to search for genes. Please try again.");
    }
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
      medical_professional: "medical professional with clinical focus, disease mechanisms, and treatment implications",
      researcher: "scientific researcher with comprehensive technical details, experimental evidence, and cutting-edge findings"
    };

    let style = styles[userPreferences.education_level] || styles.undergraduate;
    
    if (userPreferences.age) {
      if (userPreferences.age < 18) {
        style = "young student with simple, engaging explanations using relatable examples";
      }
    }

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
- Identify all genes known to be associated with this disease
- Include both causative genes and risk factors
- Consider different genetic forms (if applicable)
- Include genes from GWAS studies if relevant

Provide a comprehensive analysis for gene discovery.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn your response as JSON with keys: queryType, isDisease, diseaseName, isHPOTerm, mainFeatures (array), hpoTerms (array), synonyms (array), category, inheritancePattern.', {
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

    if (phenotypeAnalysis.isDisease || (!searchTerms && originalQuery)) {
      prompt = `
Find ALL genes associated with the disease/condition: ${diseaseTarget}

**Comprehensive Gene Discovery Required:**
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
- Confidence score (0-1) for the association
- Brief explanation of the gene's role in the disease

Use comprehensive sources: OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, literature.

Return 5-15 most relevant genes ranked by evidence strength and clinical significance.
${phenotypeAnalysis.inheritancePattern ? `\nNote: Inheritance pattern is ${phenotypeAnalysis.inheritancePattern}` : ''}
`;
    } else {
      prompt = `
Based on the phenotype features: ${phenotypeTarget}

Find candidate genes that could be associated with these phenotypes.
Use your knowledge of genetics and genomics databases like OMIM, ClinVar, HPO, UniProt, HPA (Human Protein Atlas), and GTEx (Genotype-Tissue Expression).

For each gene, provide:
- Gene symbol and full name
- Entrez ID and Ensembl ID (if known)
- Chromosomal location (chromosome, approximate start/end coordinates)
- Confidence score (0-1) for the association
- Brief explanation of the gene-phenotype relationship

Return 3-8 most relevant candidate genes ranked by evidence strength.
`;
    }

    // Request the full token budget: a 5-15 gene list with per-gene metadata and
    // explanations easily exceeds the default cap, and a truncated reply yields
    // invalid JSON → an empty list → the "Found 0 candidate genes" the user saw.
    const response = await apiClient.invokeLLM(prompt + '\n\nReturn your response as JSON with key "candidateGenes" containing an array of objects with: symbol, name, entrezId, ensemblId, chromosome, start, end, score, associationType, explanation.', {
      add_context_from_internet: true,
      maxTokens: 4096
    });

    const parsed = parseLLMJson(response, { candidateGenes: [] });
    const geneResults = Array.isArray(parsed) ? { candidateGenes: parsed } : parsed;
    return (geneResults?.candidateGenes || []).filter((g) => g && g.symbol);
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
              sources: ["MyGene.info", "Ensembl", "HPO", "GWAS", "UniProt", "HPA", "GTEx"],
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
              sources: ["Literature Review"]
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
    const prompt = `For the human gene ${gene.symbol} (${gene.name || ''}), provide a structured profile.
Gene context: ${gene.explanation || ''}

Tailor all prose for ${explanationStyle}. Ground facts in OMIM, ClinVar, UniProt, HPO, HPA, and GTEx. Do not include preamble or meta-commentary.

Return ONLY a JSON object with these keys:
- "summary": string, a 2-3 sentence factual summary (function, key disease associations, mechanism)
- "keyTakeaways": array of 3-4 one-sentence strings
- "phenotypes": array of { "name": string, "hpoId": string|null } for the main associated phenotypes/diseases
- "expressionData": array of { "tissue": string, "expression": number } for the top 8 tissues by GTEx TPM
- "furtherReading": { "resources": array of { "name": string, "url": string }, "pubmedSearchTerms": array of strings }`;

    const response = await apiClient.invokeLLM(prompt, { add_context_from_internet: true, maxTokens: 2048 });
    const parsed = parseLLMJson(response, {});

    return {
      phenotypes: Array.isArray(parsed.phenotypes) ? parsed.phenotypes : [],
      aiSummary: (typeof parsed.summary === 'string' && parsed.summary.trim())
        ? parsed.summary
        : `${gene.symbol} is associated with the searched phenotype. ${gene.explanation || ''}`,
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
      expressionData: Array.isArray(parsed.expressionData) ? parsed.expressionData : [],
      furtherReading: parsed.furtherReading && typeof parsed.furtherReading === 'object'
        ? {
            resources: parsed.furtherReading.resources || [],
            pubmedSearchTerms: parsed.furtherReading.pubmedSearchTerms || [],
          }
        : null,
    };
  }

  static async getGenePhenotypes(geneSymbol) {
    const prompt = `
For the gene ${geneSymbol}, list the main phenotypes and diseases it's associated with.
Include HPO terms where applicable.
Focus on well-established gene-phenotype associations from OMIM, ClinVar, UniProt, and medical literature.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "phenotypes" containing array of {name, hpoId}.', {
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

Keep it factual and source-aware. Reference data from UniProt, HPA, or GTEx if relevant.
Match the complexity and terminology to the reader's background.
`;

    const response = await apiClient.invokeLLM(prompt, {
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
      add_context_from_internet: true
    });

    const parsed = parseLLMJson(response, { takeaways: [] });
    if (Array.isArray(parsed)) return parsed;
    return parsed.takeaways || [];
  }

  static async generateFurtherReading(gene, userPreferences) {
    const explanationStyle = this.getEducationContext(userPreferences);
    
    const prompt = `
For gene ${gene.symbol}, generate personalized further reading recommendations.

IMPORTANT: Tailor recommendations for ${explanationStyle}.

Provide:
1. 2-4 authoritative resources (OMIM, GeneReviews, UniProt, GTEx, etc.) with full URLs
2. 2-3 PubMed search terms optimized for the reader's level

Format resources as:
- OMIM for ${gene.symbol}: https://omim.org/search?search=${gene.symbol}
- GeneReviews: https://www.ncbi.nlm.nih.gov/books/NBK1116/ (if applicable)
- UniProt: https://www.uniprot.org/uniprotkb?query=${gene.symbol}
- GTEx Portal: https://gtexportal.org/home/gene/${gene.symbol}

Adjust complexity of search terms based on user background.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with keys: "resources" (array of {name, url}) and "pubmedSearchTerms" (array of strings).', {
      add_context_from_internet: false
    });

    const parsed = parseLLMJson(response, {});
    return {
      resources: parsed.resources || [],
      pubmedSearchTerms: parsed.pubmedSearchTerms || []
    };
  }

  static async getGeneExpressionData(geneSymbol) {
    const prompt = `
For the gene ${geneSymbol}, provide tissue expression data from GTEx (Genotype-Tissue Expression project).

Return expression levels (in TPM - Transcripts Per Million) for major human tissues.
Focus on the top 8-10 tissues where this gene is most highly expressed.

Format as an array of objects with tissue name and expression level.
Use tissue names like: brain, heart, liver, kidney, muscle, lung, etc.
`;

    try {
      const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "expression" containing array of {tissue, expression}.', {
        add_context_from_internet: true
      });

      return parseLLMJson(response, { expression: [] }).expression || [];
    } catch (error) {
      log.error(`Error fetching expression data for ${geneSymbol}:`, error);
      return [];
    }
  }

  static async getPremiumGeneData(geneSymbol, userPreferences) {
    const explanationStyle = this.getEducationContext(userPreferences);
    
    const prompt = `
For gene ${geneSymbol}, provide premium research data:

1. Population/prevalence data for associated diseases
2. Gene evolutionary history and family information  
3. Known pathogenic mutations and their clinical significance
4. Current treatments and therapies for associated diseases
5. Recent research developments

Use reliable sources like OMIM, ClinVar, PubMed, FDA databases, UniProt (protein function), HPA (Human Protein Atlas for expression), and GTEx (tissue expression).

IMPORTANT: Tailor all explanations for ${explanationStyle}.
Adjust technical depth, terminology, and focus based on the reader's background.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with keys: prevalence ({estimate, population, source}), geneHistory ({family, evolution, discovery}), mutations (array of {type, significance, disease}), treatments (array of {name, type, status}).', {
      add_context_from_internet: true
    });

    const premiumData = parseLLMJson(response, { prevalence: {}, geneHistory: {}, mutations: [], treatments: [] });

    return {
      prevalenceData: premiumData.prevalence,
      historyData: premiumData.geneHistory, 
      mutationData: premiumData.mutations || [],
      treatmentData: premiumData.treatments || []
    };
  }

  static async compareGeneSets(userGenes, phenotypeGenes, phenotype, isPremium) {
    const userGenesSet = new Set(userGenes.map(g => g.toUpperCase()));
    const phenotypeGenesSet = new Set(phenotypeGenes.map(g => g.toUpperCase()));

    const overlapping = userGenes.filter(g => phenotypeGenesSet.has(g.toUpperCase()));
    const uniqueToUser = userGenes.filter(g => !phenotypeGenesSet.has(g.toUpperCase()));
    const uniqueToPhenotype = phenotypeGenes.filter(g => !userGenesSet.has(g.toUpperCase()));

    // Get user preferences
    let userPreferences = null;
    try {
      const user = await apiClient.getMe();
      userPreferences = {
        age: user?.age,
        education_level: user?.education_level,
        field_of_study: user?.field_of_study
      };
    } catch (err) {
      // Not logged in
    }

    const educationContext = this.getEducationContext(userPreferences);

    // Generate comprehensive analysis
    const prompt = `
You are Robert, an AI gene analysis assistant. Analyze this gene set comparison:

**User's Input Genes (${userGenes.length}):** ${userGenes.join(', ')}

**Phenotype-Associated Genes (${phenotypeGenes.length}):** ${phenotypeGenes.join(', ')}
${phenotype ? `**Phenotype Context:** ${phenotype}` : ''}

**Comparison Results:**
- Overlapping: ${overlapping.length} genes (${overlapping.join(', ') || 'None'})
- Unique to user: ${uniqueToUser.length} genes (${uniqueToUser.join(', ') || 'None'})
- Unique to phenotype: ${uniqueToPhenotype.length} genes (${uniqueToPhenotype.join(', ') || 'None'})

**Your Task:**
Provide a comprehensive analysis tailored for ${educationContext}.

**Analysis should include:**
1. **Overview**: What do these results tell us about the relationship between the user's genes and the phenotype?
2. **Overlapping Genes**: Significance of genes that appear in both sets
3. **Unique User Genes**: What the user's unique genes might indicate
4. **Unique Phenotype Genes**: Important genes from the phenotype that the user didn't include
5. **Functional Connections**: Potential biological pathways or functional relationships
6. **Recommendations**: Suggest next steps or areas for further investigation

Use clear, engaging language appropriate for the user's background. Format with markdown for readability.
`;

    const analysisResponse = await apiClient.invokeLLM(prompt, {
      add_context_from_internet: true
    });
    const analysis = analysisResponse?.result || analysisResponse || "Analysis of gene set comparison";

    // Get functional relationships for overlapping genes
    let functionalRelationships = [];
    if (overlapping.length > 0 && overlapping.length <= 10) {
      functionalRelationships = await this.getFunctionalRelationships(overlapping);
    }

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

  static async getFunctionalRelationships(genes) {
    if (genes.length === 0) return [];

    const prompt = `
For the following genes: ${genes.join(', ')}

Identify key functional relationships between these genes, such as:
- Pathway interactions
- Protein-protein interactions
- Regulatory relationships
- Shared biological processes

Return up to 5 most significant relationships.
`;

    try {
      const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "relationships" containing array of {gene1, gene2, relationship, evidence}.', {
        add_context_from_internet: true
      });

      return parseLLMJson(response, { relationships: [] }).relationships || [];
    } catch (error) {
      log.error("Error getting functional relationships:", error);
      return [];
    }
  }
}