import { apiClient } from "@genemap/shared";
import { log } from "../shared/logger";
import { getErrorMessage } from "../shared/errorUtils";
import { GENE_ENRICHMENT_CONCURRENCY } from "../shared/constants";

export class PhenotypeSearchService {
  static async searchGenes(phenotypeQuery, isPremium = false) {
    try {
      // Check for admin access and get user preferences
      let isAdmin = false;
      let userPreferences = null;
      try {
        const user = await apiClient.getMe();
        isAdmin = user?.super_admin === true || user?.role === "admin" || user?.role === "super_admin" || user?.entitlements?.isAdmin === true;
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
      const candidateGenes = await this.findCandidateGenes(phenotypeAnalysis, effectivePremium);
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

    try {
      const raw = response?.result || response;
      const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
      return parsed;
    } catch {
      return {};
    }
  }

  static async findCandidateGenes(phenotypeAnalysis, isPremium) {
    const searchTerms = [
      phenotypeAnalysis.mainFeatures,
      phenotypeAnalysis.synonyms
    ].flat().join(", ");

    let prompt = "";
    
    if (phenotypeAnalysis.isDisease) {
      prompt = `
Find ALL genes associated with the disease: ${phenotypeAnalysis.diseaseName || searchTerms}

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
Based on the phenotype features: ${searchTerms}

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

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn your response as JSON with key "candidateGenes" containing an array of objects with: symbol, name, entrezId, ensemblId, chromosome, start, end, score, associationType, explanation.', {
      add_context_from_internet: true
    });

    try {
      const raw = response?.result || response;
      const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}') : raw;
      const geneResults = Array.isArray(parsed) ? { candidateGenes: parsed } : parsed;
      return geneResults.candidateGenes || [];
    } catch {
      return [];
    }
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
            const [phenotypes, expressionData] = await Promise.all([
              this.getGenePhenotypes(gene.symbol),
              this.getGeneExpressionData(gene.symbol)
            ]);
            
            const [aiSummary, keyTakeaways, furtherReading] = await Promise.all([
              this.generateGeneSummary(gene, phenotypes, userPreferences),
              this.generateKeyTakeaways(gene, phenotypes, userPreferences),
              this.generateFurtherReading(gene, userPreferences)
            ]);
            
            let premiumData = {};
            if (isPremium) {
              premiumData = await this.getPremiumGeneData(gene.symbol, userPreferences);
            }

            return {
              ...gene,
              genomeBuild: "GRCh38",
              phenotypes: phenotypes,
              aiSummary: aiSummary,
              keyTakeaways: keyTakeaways,
              furtherReading: furtherReading,
              expressionData: expressionData,
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

  static async getGenePhenotypes(geneSymbol) {
    const prompt = `
For the gene ${geneSymbol}, list the main phenotypes and diseases it's associated with.
Include HPO terms where applicable.
Focus on well-established gene-phenotype associations from OMIM, ClinVar, UniProt, and medical literature.
`;

    const response = await apiClient.invokeLLM(prompt + '\n\nReturn as JSON with key "phenotypes" containing array of {name, hpoId}.', {
      add_context_from_internet: true
    });

    try {
      const raw = response?.result || response;
      const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
      return parsed.phenotypes || [];
    } catch {
      return [];
    }
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

    try {
      const raw = response?.result || response;
      const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}') : raw;
      if (Array.isArray(parsed)) return parsed;
      return parsed.takeaways || [];
    } catch {
      return [];
    }
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

    try {
      const raw = response?.result || response;
      const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
      return {
        resources: parsed.resources || [],
        pubmedSearchTerms: parsed.pubmedSearchTerms || []
      };
    } catch {
      return { resources: [], pubmedSearchTerms: [] };
    }
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

      try {
        const raw = response?.result || response;
        const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
        return parsed.expression || [];
      } catch {
        return [];
      }
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

    let premiumData;
    try {
      const raw = response?.result || response;
      premiumData = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
    } catch {
      premiumData = { prevalence: {}, geneHistory: {}, mutations: [], treatments: [] };
    }

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

      try {
        const raw = response?.result || response;
        const parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;
        return parsed.relationships || [];
      } catch {
        return [];
      }
    } catch (error) {
      log.error("Error getting functional relationships:", error);
      return [];
    }
  }
}