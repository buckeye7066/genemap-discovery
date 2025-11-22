import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import DnaIcon from "../icons/DnaIcon";
import {
  MapPin,
  Tag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Users,
  Pill,
  History,
  BookOpen,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Info,
  Sparkles,
  FileHeart,
  Target,
  Stethoscope,
  Brain, // Added for variant analysis
  Heart, // Added for variant analysis
  AlertCircle // Added for variant analysis
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import GeneExpressionChart from "../visualizations/GeneExpressionChart";
import ChromosomeView from "../visualizations/ChromosomeView";
import PhenotypeNetwork from "../visualizations/PhenotypeNetwork";
import ProteinDomains from "../visualizations/ProteinDomains";
import ProteinStructure from "../visualizations/ProteinStructure";
import ProteinInteractions from "../visualizations/ProteinInteractions";
import GenomeBrowser from "../visualizations/GenomeBrowser";
import RobertClinicalSupport from "../clinical/RobertClinicalSupport";
import ClinicalTrialFinder from "../clinical/ClinicalTrialFinder"; // Added
import ReactMarkdown from 'react-markdown';
import { Textarea } from "@/components/ui/textarea"; // Added
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Added
import { Label } from "@/components/ui/label"; // Added
import { Alert, AlertDescription } from "@/components/ui/alert"; // Added
import FHIRExporter from "../medical/FHIRExporter";

export default function GeneCard({ gene, rank, isPremium, isSelected = false, onSelect = null }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [user, setUser] = useState(null);
  const [scoreInterpretation, setScoreInterpretation] = useState(null);
  const [isLoadingInterpretation, setIsLoadingInterpretation] = useState(false);
  const [comprehensiveSynthesis, setComprehensiveSynthesis] = useState(null);
  const [isLoadingSynthesis, setIsLoadingSynthesis] = useState(false);
  const [medicalContext, setMedicalContext] = useState(null);
  const [showClinicalAnalysis, setShowClinicalAnalysis] = useState(false);
  const [variantInput, setVariantInput] = useState(""); // Added
  const [variantAnalysis, setVariantAnalysis] = useState(null); // Added
  const [isAnalyzingVariant, setIsAnalyzingVariant] = useState(false); // Added
  const [showClinicalTrials, setShowClinicalTrials] = useState(false); // Added

  React.useEffect(() => {
    loadUserAndContext();
    
    // Track gene view activity
    if (gene && gene.symbol) {
      trackGeneView(gene.symbol);
    }
  }, [gene?.symbol]);

  const trackGeneView = async (geneSymbol) => {
    try {
      await base44.entities.UserActivity.create({
        activity_type: "gene_view",
        gene_symbol: geneSymbol,
        metadata: {
          confidence_score: gene.score,
          phenotypes: gene.phenotypes?.map(p => p.name) || []
        }
      });
    } catch (err) {
      // Silently fail - activity tracking shouldn't break the app
      console.log("Could not track activity:", err);
    }
  };

  React.useEffect(() => {
    if (isExpanded) {
      if (!scoreInterpretation && gene.score && gene.explanation) {
        loadScoreInterpretation();
      }
      if (!comprehensiveSynthesis && gene.aiSummary) {
        loadComprehensiveSynthesis();
      }
    }
  }, [isExpanded]);

  const loadUserAndContext = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      try {
        const records = await base44.entities.MedicalData.filter(
          { created_by: currentUser.email },
          '-created_date',
          5
        );
        
        if (records && records.length > 0) {
          const context = {
            hasGeneticTests: records.some(r => r.file_type === 'genetic_test'),
            hasBloodTests: records.some(r => r.file_type === 'blood_test'),
            relevantGenes: [...new Set(records.flatMap(r => r.relevant_genes || []))],
            identifiedPhenotypes: [...new Set(records.flatMap(r => r.phenotypes_identified || []))],
            recordCount: records.length
          };
          setMedicalContext(context);
        }
      } catch (err) {
        console.log("No medical data found");
      }
    } catch (err) {
      console.log("Not logged in");
    }
  };

  const loadScoreInterpretation = async () => {
    setIsLoadingInterpretation(true);
    try {
      const interpretation = await getRobertScoreInterpretation(
        gene.symbol,
        gene.score,
        gene.explanation,
        user?.education_level
      );
      setScoreInterpretation(interpretation);
    } catch (err) {
      console.error("Error loading score interpretation:", err);
    } finally {
      setIsLoadingInterpretation(false);
    }
  };

  const loadComprehensiveSynthesis = async () => {
    setIsLoadingSynthesis(true);
    try {
      const synthesis = await getRobertComprehensiveSynthesis(
        gene,
        user?.education_level,
        medicalContext
      );
      setComprehensiveSynthesis(synthesis);
    } catch (err) {
      console.error("Error loading comprehensive synthesis:", err);
    } finally {
      setIsLoadingSynthesis(false);
    }
  };

  const getRobertComprehensiveSynthesis = async (gene, educationLevel, medicalContext) => {
    const educationContext = getEducationContext(educationLevel);
    
    let prompt = `You are Robert, an expert AI genetic counselor. Synthesize comprehensive, personalized insights about this gene for the user.

**Gene Information:**
- Symbol: ${gene.symbol}
- Name: ${gene.name}
- Confidence Score: ${gene.score} (${Math.round(gene.score * 100)}%)

**Current Analysis:**
${gene.aiSummary}

**Key Takeaways:**
${gene.keyTakeaways?.map((t, i) => `${i + 1}. ${t}`).join('\n') || 'None available'}

**Further Reading Resources:**
${gene.furtherReading?.resources?.map(r => `- ${r.name}`).join('\n') || 'None available'}

**User Education Level:** ${educationContext}

`;

    if (medicalContext && medicalContext.recordCount > 0) {
      prompt += `**User's Medical Context:**
- Has uploaded ${medicalContext.recordCount} medical record(s)
- Genetic tests uploaded: ${medicalContext.hasGeneticTests ? 'Yes' : 'No'}
- Blood tests uploaded: ${medicalContext.hasBloodTests ? 'Yes' : 'No'}
${medicalContext.relevantGenes.length > 0 ? `- Genes identified in their data: ${medicalContext.relevantGenes.join(', ')}` : ''}
${medicalContext.identifiedPhenotypes.length > 0 ? `- Phenotypes in their records: ${medicalContext.identifiedPhenotypes.join(', ')}` : ''}

**Check for connections:** Does ${gene.symbol} relate to any genes or phenotypes in their medical data?
`;
    }

    prompt += `
**Your Task:**
Provide a cohesive, personalized synthesis that includes:

1. **Clinical Relevance Summary** (2-3 sentences)
   - What makes this gene important for this specific user?
   - How does it relate to their search/medical context?
   - Why should they care about this gene specifically?

2. **Personalized Risk & Impact** (bullet points)
   - What conditions/traits are most relevant?
   - Any connections to their uploaded medical data?
   - Practical implications for their health

3. **Actionable Next Steps** (3-4 specific recommendations)
   - What should they do with this information?
   - When to consult healthcare providers?
   - Additional testing or screening to consider
   - Lifestyle or preventive measures

4. **Additional Resources** (if relevant)
   - Most valuable resources from the further reading list
   - Why each resource is recommended

**Tone & Style:**
- ${educationContext}
- Be supportive and empowering
- Avoid unnecessary alarm while being honest
- Focus on actionable insights
- Use clear formatting with headers
- Connect information to user's specific context

Synthesize all the information into a cohesive, personalized narrative. Don't just repeat what's already said - add deeper insights and personal relevance.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    return response;
  };

  const getRobertScoreInterpretation = async (geneSymbol, score, explanation, educationLevel) => {
    const educationContext = getEducationContext(educationLevel);
    
    const prompt = `You are Robert, an AI gene analysis assistant. Analyze this gene's association strength and provide insights.

**Gene:** ${geneSymbol}
**Confidence Score:** ${score} (scale 0-1, where 1 is highest confidence)
**Technical Explanation:** ${explanation}

**User Education Level:** ${educationContext}

**Your Task:**
Provide a clear, personalized interpretation that includes:

1. **Confidence Level Explanation**: What does this ${Math.round(score * 100)}% confidence mean in practical terms?
2. **Evidence Strength**: How strong is the evidence linking this gene to the phenotype?
3. **Clinical Significance**: What does this confidence level mean for clinical or research applications?
4. **Caveats & Considerations**: What should be kept in mind given this confidence level?
5. **Next Steps**: What would strengthen or validate this association?

Adjust your language complexity and focus based on the user's background. Be honest about uncertainties while remaining supportive.

Keep your response concise (3-4 short paragraphs) and use clear formatting.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    return response;
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "high school student - use simple, everyday language with clear explanations";
    }
    if (level === 'undergraduate') {
      return "undergraduate student - use moderate scientific terminology with explanations";
    }
    if (level === 'graduate' || level === 'phd') {
      return "graduate/PhD student - use technical language and scientific concepts";
    }
    if (level === 'medical_professional') {
      return "medical professional - focus on clinical significance and implications";
    }
    if (level === 'researcher') {
      return "researcher - use scientific language with methodological details";
    }
    return "general audience - use clear, accessible language";
  };

  const analyzeVariant = async () => {
    if (!variantInput.trim()) return;

    setIsAnalyzingVariant(true);
    try {
      const educationContext = getEducationContext(user?.education_level);
      
      const prompt = `You are Robert, an AI genetic variant interpretation specialist. Analyze this genetic variant for the patient.

**Gene Context:** ${gene.symbol} (${gene.name})
**Variant Input:** ${variantInput.trim()}

**Patient Context:**
- Age: ${user?.age || 'Not specified'}
- Education Level: ${educationContext}

**Your Task - Comprehensive Variant Interpretation:**

1. **Variant Identification & Validation**
   - Parse the variant notation (rsID, HGVS, or description)
   - Confirm it's associated with ${gene.symbol}
   - Provide standard nomenclature (if input is non-standard)
   - Genomic location and nucleotide change

2. **Population Genetics**
   - Population frequency (from gnomAD, 1000 Genomes, etc.)
   - How common is this variant?
   - Ethnic/geographic distribution differences
   - Allele frequency interpretation

3. **Clinical Significance**
   - Classification: Pathogenic, Likely Pathogenic, VUS (Variant of Unknown Significance), Likely Benign, Benign
   - Disease associations and evidence level
   - Penetrance (if applicable) - what % of people with this variant develop the condition?
   - Age of onset considerations
   - Use ClinVar, OMIM, published literature

4. **Functional Impact**
   - Effect on protein function (missense, nonsense, frameshift, etc.)
   - Predicted pathogenicity scores (SIFT, PolyPhen, CADD, etc.)
   - Domain/region affected
   - Conservation across species

5. **Personalized Risk Assessment**
   - Given this variant, what is the risk level? (Low / Moderate / High / Very High)
   - Absolute risk vs. relative risk
   - Risk context (e.g., general population risk is X%, this variant increases it to Y%)
   - Age-specific considerations
   - Other genetic/environmental factors that modify risk

6. **Pharmacogenomic Implications** (CRITICAL for clinical genes)
   - Does this variant affect drug metabolism or response?
   - Specific medications impacted (list drug names)
   - Recommended dose adjustments or alternatives
   - FDA pharmacogenomic labels
   - Use PharmGKB, CPIC guidelines

7. **Clinical Management & Next Steps**
   - Recommended genetic counseling? (Yes/No and why)
   - Additional testing needed?
   - Screening recommendations (what, when, how often?)
   - Lifestyle modifications
   - Family implications (inheritance pattern, testing relatives)
   - Specialist consultation recommendations

8. **Patient-Friendly Summary**
   - What does this variant mean for ME specifically?
   - Should I be concerned?
   - What should I DO about it?
   - Timeline for action (urgent/soon/routine/monitoring)

**Adaptation for ${educationContext}:**
${getEducationGuidance(user?.education_level)}

**Critical Guidelines:**
- Cite evidence sources (ClinVar, gnomAD, PharmGKB, etc.)
- Be honest about uncertainty (VUS means we don't know yet)
- Emphasize genetic counseling for pathogenic/likely pathogenic variants
- Provide both technical details AND plain language explanations
- Use risk analogies appropriate for education level
- Include warning banners for high-risk findings
- Be supportive and avoid unnecessary alarm while being truthful

Provide comprehensive, evidence-based analysis formatted with clear sections.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true
      });

      // Parse for high-risk indicators
      const hasHighRisk = response.toLowerCase().includes('pathogenic') || 
                         response.toLowerCase().includes('high risk') ||
                         response.toLowerCase().includes('very high');
      
      const hasDrugImplications = response.toLowerCase().includes('medication') ||
                                 response.toLowerCase().includes('drug') ||
                                 response.toLowerCase().includes('pharmacogenomic');

      const requiresCounseling = response.toLowerCase().includes('genetic counseling recommended') ||
                                response.toLowerCase().includes('should see a genetic counselor');

      setVariantAnalysis({
        analysis: response,
        has_high_risk: hasHighRisk,
        has_drug_implications: hasDrugImplications,
        requires_counseling: requiresCounseling,
        variant: variantInput.trim(),
        gene: gene.symbol
      });

    } catch (err) {
      console.error("Error analyzing variant:", err);
      setVariantAnalysis({
        error: true,
        message: "Failed to analyze variant. Please check the variant notation and try again."
      });
    } finally {
      setIsAnalyzingVariant(false);
    }
  };

  const getEducationGuidance = (level) => {
    if (!level || level === 'high_school') {
      return `- Use everyday language, avoid jargon
- Explain concepts with simple analogies (e.g., "like a typo in the instruction manual")
- Focus on practical impact
- Use percentages in relatable terms (e.g., "1 in 100 people")
- Keep explanations brief and clear`;
    }
    if (level === 'undergraduate') {
      return `- Use basic scientific terminology with brief explanations
- Include some molecular details but keep accessible
- Explain evidence levels clearly
- Use both technical and plain language
- Provide context for statistics`;
    }
    if (level === 'graduate' || level === 'phd') {
      return `- Use full scientific nomenclature
- Include detailed molecular mechanisms
- Reference specific studies and databases
- Discuss methodological considerations
- Provide comprehensive evidence review`;
    }
    if (level === 'medical_professional') {
      return `- Use clinical terminology
- Focus on diagnostic and management implications
- Include differential diagnoses
- Reference clinical guidelines
- Emphasize actionable medical decisions`;
    }
    if (level === 'researcher') {
      return `- Use complete technical terminology
- Include detailed bioinformatics predictions
- Discuss functional validation studies
- Reference latest literature
- Include methodological limitations`;
    }
    return `- Use clear, accessible language
- Balance technical accuracy with readability
- Provide context for all technical terms`;
  };

  const handleClearVariantAnalysis = () => {
    setVariantAnalysis(null);
    setVariantInput("");
  };

  const confidenceColor = gene.score >= 0.9 ? "bg-green-100 text-green-800 border-green-200" :
                         gene.score >= 0.7 ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                         "bg-orange-100 text-orange-800 border-orange-200";

  const confidenceIcon = gene.score >= 0.9 ? TrendingUp : 
                        gene.score >= 0.7 ? Info : 
                        AlertTriangle;

  const ConfidenceIcon = confidenceIcon;

  return (
    <Card className={`shadow-md hover:shadow-lg transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {onSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                className="mt-1"
              />
            )}
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl font-bold text-blue-600">
              {rank}
            </div>
            <div>
              <CardTitle className="text-xl text-slate-900 flex items-center gap-2">
                <DnaIcon className="w-5 h-5 text-blue-600" />
                {gene.symbol}
              </CardTitle>
              <p className="text-slate-600 text-sm">{gene.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className={`${confidenceColor} flex items-center gap-1`}>
              <ConfidenceIcon className="w-3 h-3" />
              {Math.round(gene.score * 100)}% confidence
            </Badge>
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isExpanded && (
          <div className="mb-4 bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-start gap-2">
              <ConfidenceIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                gene.score >= 0.9 ? 'text-green-600' : 
                gene.score >= 0.7 ? 'text-yellow-600' : 
                'text-orange-600'
              }`} />
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-2">
                  Robert's Confidence Analysis
                </h4>
                
                {isLoadingInterpretation ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Analyzing confidence level...</span>
                  </div>
                ) : scoreInterpretation ? (
                  <div className="prose prose-sm max-w-none">
                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                      {scoreInterpretation}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    <p className="mb-2">
                      <strong>Evidence Score:</strong> {Math.round(gene.score * 100)}% - 
                      {gene.score >= 0.9 ? " Very high confidence" : 
                       gene.score >= 0.7 ? " Good confidence" : 
                       " Moderate confidence"}
                    </p>
                    {gene.explanation && (
                      <p className="text-xs text-slate-500 italic">
                        {gene.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-slate-500" />
              <span className="font-medium">Location:</span>
              <span className="text-slate-600">
                {gene.chromosome}:{gene.start?.toLocaleString()}-{gene.end?.toLocaleString()}
              </span>
              <Badge variant="outline" className="text-xs">
                {gene.genomeBuild}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ExternalLink className="w-4 h-4 text-slate-500" />
              <span className="font-medium">IDs:</span>
              <span className="text-slate-600">
                {gene.entrezId && `ENTREZ:${gene.entrezId}`}
                {gene.entrezId && gene.ensemblId && " | "}
                {gene.ensemblId}
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4 text-slate-500" />
              <span className="font-medium">Sources:</span>
              <div className="flex gap-1">
                {gene.sources.map((source, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {source}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Associated Phenotypes
          </h4>
          <div className="flex flex-wrap gap-2">
            {gene.phenotypes?.slice(0, 5).map((phenotype, idx) => (
              <Badge key={idx} variant="secondary" className="text-sm">
                {phenotype.name}
                {phenotype.hpoId && (
                  <span className="ml-1 text-xs text-slate-500">
                    ({phenotype.hpoId})
                  </span>
                )}
              </Badge>
            ))}
            {gene.phenotypes?.length > 5 && (
              <Badge variant="outline" className="text-sm">
                +{gene.phenotypes.length - 5} more
              </Badge>
            )}
            {(!gene.phenotypes || gene.phenotypes.length === 0) && (
              <span className="text-sm text-slate-500 italic">Loading phenotype data...</span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mb-4 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 p-5 rounded-lg border-2 border-purple-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                  Robert's Personalized Analysis
                  {medicalContext && medicalContext.recordCount > 0 && (
                    <Badge className="bg-purple-600 text-white text-xs">
                      <FileHeart className="w-3 h-3 mr-1" />
                      Based on your data
                    </Badge>
                  )}
                </h4>
                
                {isLoadingSynthesis ? (
                  <div className="flex items-center gap-2 text-sm text-purple-700">
                    <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Robert is synthesizing personalized insights...</span>
                  </div>
                ) : comprehensiveSynthesis ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                        ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2">{children}</ul>,
                        ol: ({ children }) => <ol className="ml-4 mb-3 space-y-2 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="text-slate-700">{children}</li>,
                        h3: ({ children }) => <h3 className="text-base font-semibold text-purple-900 mt-4 mb-2 flex items-center gap-2"><Target className="w-4 h-4" />{children}</h3>,
                        h4: ({ children }) => <h4 className="text-sm font-semibold text-purple-800 mt-3 mb-1">{children}</h4>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-purple-300 pl-4 my-3 italic text-purple-800">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {comprehensiveSynthesis}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm text-purple-700">
                    <p>Click expand to see Robert's comprehensive analysis of this gene's relevance to you.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100 mb-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 mb-2">Robert Insights</h4>
              <p className="text-blue-800 text-sm leading-relaxed mb-3">
                {gene.aiSummary}
              </p>
              
              {gene.keyTakeaways && gene.keyTakeaways.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <h5 className="text-xs font-semibold text-blue-900 uppercase mb-2">Key Takeaways</h5>
                  <ul className="space-y-1">
                    {gene.keyTakeaways.map((takeaway, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mb-4">
            <Tabs defaultValue={showClinicalTrials ? "trials" : "clinical"} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="clinical">Clinical Analysis</TabsTrigger>
                <TabsTrigger value="variant">Variant Analysis</TabsTrigger>
                <TabsTrigger value="trials">Clinical Trials</TabsTrigger>
              </TabsList>

              <TabsContent value="clinical" className="mt-4">
                <Button
                  onClick={() => setShowClinicalAnalysis(!showClinicalAnalysis)}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 min-h-[48px] touch-manipulation text-white"
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  {showClinicalAnalysis ? 'Hide Clinical Data Analysis' : 'Analyze Against My Medical Data'}
                </Button>
              </TabsContent>

              <TabsContent value="variant" className="mt-4 space-y-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                  <div className="flex items-start gap-2 mb-3">
                    <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-indigo-900 mb-1">AI-Powered Variant Interpretation</h4>
                      <p className="text-sm text-indigo-700">
                        Enter a specific genetic variant to get personalized analysis including risk assessment, 
                        drug implications, and clinical recommendations.
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="variant-input" className="text-sm font-medium text-slate-900 mb-1 block">
                        Variant Notation
                      </Label>
                      <Textarea
                        id="variant-input"
                        placeholder="e.g., rs1234567, c.1234A>G, p.Val123Met, or description"
                        value={variantInput}
                        onChange={(e) => setVariantInput(e.target.value)}
                        className="min-h-[80px]"
                        disabled={isAnalyzingVariant}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Supported formats: rsID (rs123), HGVS (c.123A&gt;G, p.Val123Met), or plain description
                      </p>
                    </div>

                    <Button
                      onClick={analyzeVariant}
                      disabled={!variantInput.trim() || isAnalyzingVariant}
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                    >
                      {isAnalyzingVariant ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                          Robert is Analyzing...
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Analyze Variant with Robert
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {variantAnalysis && !variantAnalysis.error && (
                  <div className="space-y-4">
                    {/* High Risk Warning */}
                    {variantAnalysis.has_high_risk && (
                      <Alert className="bg-red-50 border-red-300 border-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <AlertDescription className="text-red-900">
                          <strong className="text-lg">⚠️ HIGH-RISK VARIANT DETECTED</strong>
                          <p className="mt-1">This variant may have significant clinical implications. Review the analysis below and consult with a genetic counselor or healthcare provider promptly.</p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Drug Implications */}
                    {variantAnalysis.has_drug_implications && (
                      <Alert className="bg-amber-50 border-amber-300 border-2">
                        <Pill className="h-5 w-5 text-amber-600" />
                        <AlertDescription className="text-amber-900">
                          <strong className="text-base">💊 PHARMACOGENOMIC IMPLICATIONS</strong>
                          <p className="mt-1">This variant affects medication metabolism or response. See drug-specific guidance below.</p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Counseling Recommendation */}
                    {variantAnalysis.requires_counseling && (
                      <Alert className="bg-blue-50 border-blue-300">
                        <Heart className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-900">
                          <strong>Genetic Counseling Recommended</strong>
                          <p className="mt-1">Consider speaking with a genetic counselor to discuss this variant, its implications, and next steps.</p>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Variant Header */}
                    <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-600">Analyzed Variant</p>
                            <p className="text-xl font-bold text-indigo-900">{variantAnalysis.variant}</p>
                            <p className="text-sm text-slate-700">in gene {variantAnalysis.gene}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleClearVariantAnalysis}
                          >
                            New Variant
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Analysis Results */}
                    <Card className="shadow-lg">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <Brain className="w-5 h-5 text-indigo-600" />
                            Robert's Variant Interpretation
                          </CardTitle>
                          <FHIRExporter
                            data={{
                              gene: variantAnalysis.gene,
                              variant: variantAnalysis.variant,
                              analysis: variantAnalysis.analysis,
                              timestamp: new Date().toISOString()
                            }}
                            type="variant_interpretation"
                          />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold text-indigo-900">{children}</strong>,
                              ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2 list-disc">{children}</ul>,
                              ol: ({ children }) => <ol className="ml-4 mb-3 space-y-2 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="text-slate-700">{children}</li>,
                              h1: ({ children }) => <h1 className="text-2xl font-bold text-indigo-900 mt-6 mb-3 pb-2 border-b-2 border-indigo-200">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-xl font-semibold text-indigo-900 mt-5 mb-2">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>,
                              h4: ({ children }) => <h4 className="text-base font-semibold text-slate-800 mt-3 mb-1">{children}</h4>,
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-red-500 pl-4 my-4 bg-red-50 py-3 rounded-r">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-600 mt-1 flex-shrink-0" />
                                    <div className="text-red-900 font-medium">{children}</div>
                                  </div>
                                </blockquote>
                              ),
                              code: ({ inline, children }) => 
                                inline ? (
                                  <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">
                                    {children}
                                  </code>
                                ) : (
                                  <code className="block bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-sm">
                                    {children}
                                  </code>
                                ),
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-4">
                                  <table className="min-w-full border-collapse border border-slate-300">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
                              th: ({ children }) => <th className="border border-slate-300 px-4 py-2 text-left font-semibold">{children}</th>,
                              td: ({ children }) => <td className="border border-slate-300 px-4 py-2">{children}</td>,
                            }}
                          >
                            {variantAnalysis.analysis}
                          </ReactMarkdown>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Disclaimer */}
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-900 text-xs">
                        <strong>Important:</strong> This is an AI-powered interpretation for educational purposes. 
                        Variant interpretation requires clinical context and professional expertise. Always consult 
                        a board-certified genetic counselor or medical geneticist for clinical decision-making. 
                        For concerning findings, seek professional guidance promptly.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {variantAnalysis?.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{variantAnalysis.message}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="trials" className="mt-4">
                <Alert className="mb-4 bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900 text-sm">
                    Search for clinical trials related to {gene.symbol} and its associated conditions.
                  </AlertDescription>
                </Alert>
                <ClinicalTrialFinder
                  geneticData={{
                    gene: gene.symbol,
                    variant: variantAnalysis?.variant || null,
                    conditions: gene.phenotypes?.map(p => p.name) || []
                  }}
                  userEducationLevel={user?.education_level}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        {showClinicalAnalysis && (
          <div className="mb-4">
            <RobertClinicalSupport
              gene={gene}
              userEducationLevel={user?.education_level}
              onClose={() => setShowClinicalAnalysis(false)}
            />
          </div>
        )}

        {gene.furtherReading && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
            <div className="flex items-start gap-2">
              <BookOpen className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-2">Further Reading</h4>
                <div className="space-y-2">
                  {gene.furtherReading.resources && gene.furtherReading.resources.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Recommended Resources:</p>
                      <div className="flex flex-wrap gap-2">
                        {gene.furtherReading.resources.map((resource, idx) => (
                          <a
                            key={idx}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {resource.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {gene.furtherReading.pubmedSearchTerms && gene.furtherReading.pubmedSearchTerms.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">PubMed Search Terms:</p>
                      <div className="flex flex-wrap gap-2">
                        {gene.furtherReading.pubmedSearchTerms.map((term, idx) => (
                          <a
                            key={idx}
                            href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-white border border-slate-300 hover:border-green-400 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                          >
                            "{term}"
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isExpanded && (
          <>
            <Separator className="my-4" />

            <div className="space-y-4">
              <GenomeBrowser 
                genes={[gene]} 
                onGeneClick={(clickedGene) => {
                  if (clickedGene.symbol !== gene.symbol) {
                    window.open(`/search?query=${clickedGene.symbol}`, '_blank');
                  }
                }}
              />

              <ChromosomeView
                gene={gene}
                userEducationLevel={user?.education_level}
              />

              {gene.expressionData && gene.expressionData.length > 0 && (
                <GeneExpressionChart
                  expressionData={gene.expressionData}
                  userEducationLevel={user?.education_level}
                />
              )}

              {gene.phenotypes && gene.phenotypes.length > 3 && (
                <PhenotypeNetwork
                  phenotypes={gene.phenotypes}
                  userEducationLevel={user?.education_level}
                />
              )}

              <ProteinDomains
                gene={gene}
                userEducationLevel={user?.education_level}
              />

              <ProteinStructure
                gene={gene}
                userEducationLevel={user?.education_level}
              />

              <ProteinInteractions
                gene={gene}
                userEducationLevel={user?.education_level}
              />
            </div>
          </>
        )}

        {isPremium && (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleContent className="mt-4">
              <Separator className="mb-4" />

              <div className="space-y-4">
                {gene.prevalenceData && (
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Users className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-900 mb-1">Population Data</h4>
                        <p className="text-amber-800 text-sm">
                          {gene.prevalenceData.estimate}
                          {gene.prevalenceData.population && ` in ${gene.prevalenceData.population}`}
                          {gene.prevalenceData.source && ` (Source: ${gene.prevalenceData.source})`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {gene.historyData && (
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <History className="w-5 h-5 text-purple-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-purple-900 mb-1">Gene History</h4>
                        <p className="text-purple-800 text-sm">
                          {gene.historyData.family && `Family: ${gene.historyData.family}. `}
                          {gene.historyData.evolution}
                          {gene.historyData.discovery && ` Discovery: ${gene.historyData.discovery}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {gene.treatmentData && gene.treatmentData.length > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Pill className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-green-900 mb-1">Treatment Options</h4>
                        <div className="space-y-2">
                          {gene.treatmentData.slice(0, 3).map((treatment, idx) => (
                            <div key={idx} className="text-green-800 text-sm">
                              <span className="font-medium">{treatment.name}</span>
                              {treatment.type && ` (${treatment.type})`}
                              {treatment.status && ` - ${treatment.status}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}