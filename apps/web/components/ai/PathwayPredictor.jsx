import React, { useState, lazy, Suspense } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Network, Sparkles, TrendingUp, AlertCircle, Info, Upload, Stethoscope } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

const VCFParser = lazy(() => import("../medical/VCFParser"));
const ClinicalTrialMatcher = lazy(() => import("../clinical/ClinicalTrialMatcher"));

const PREDICTOR_MD_COMPONENTS = {
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-green-900 mt-6 mb-3 flex items-center gap-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="space-y-2 my-3 ml-6">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="text-slate-700 leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-green-400 bg-green-50 pl-4 py-2 my-3 rounded-r">
      <div className="text-green-900">{children}</div>
    </blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
        {children}
      </code>
    ) : (
      <code className="block bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-sm my-3">
        {children}
      </code>
    ),
};

export default function PathwayPredictor({ genes = [] }) {
  const [predictions, setPredictions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputMode, setInputMode] = useState("genes"); // genes or vcf
  const [vcfFile, setVcfFile] = useState(null);
  const [vcfFileUrl, setVcfFileUrl] = useState(null);
  const [isUploadingVcf, setIsUploadingVcf] = useState(false);
  const [vcfGenes, setVcfGenes] = useState([]);
  const [parsedVcfVariants, setParsedVcfVariants] = useState([]);
  const [showTrialMatcher, setShowTrialMatcher] = useState(false);

  const predictInteractions = async () => {
    const activeGenes = inputMode === "vcf" ? vcfGenes : genes;
    
    if (activeGenes.length < 2) {
      setError("Please select at least 2 genes to predict interactions");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const geneList = activeGenes.map(g => typeof g === 'string' ? g : g.symbol).join(', ');

      const prompt = `You are an AI systems biology expert specializing in gene-gene interactions and pathway analysis. Analyze the following genes and predict their interactions.

**Input Genes:** ${geneList}

**Your Task:**
Provide comprehensive interaction and pathway predictions in this structure:

## 🔗 Predicted Gene-Gene Interactions

For each likely interaction pair, provide:
- **Gene Pair**: [GENE1 ↔ GENE2]
- **Interaction Type**: [Direct/Indirect | Physical/Regulatory/Co-expression]
- **Confidence Score**: [High/Medium/Low]
- **Evidence**: [Known databases, literature, or predicted based on shared pathways]
- **Functional Consequence**: [What happens when these genes interact]
- **Disease Relevance**: [Associated conditions or phenotypes]

## 🧬 Shared Biological Pathways

Identify pathways involving multiple input genes:
- **Pathway Name**: [e.g., p53 signaling, DNA repair, etc.]
- **Involved Genes**: [Which input genes participate]
- **Pathway Role**: [What each gene does in this pathway]
- **Clinical Significance**: [Disease associations, therapeutic targets]
- **Database Links**: KEGG, Reactome, WikiPathways

## 🎯 Hub Genes & Key Players

Identify which genes are likely to be:
- **Central Hubs**: Genes that interact with many others
- **Bottlenecks**: Critical connection points
- **Peripheral Players**: Less connected but still relevant
- Explain why each gene plays its role

## 🔮 Novel Interaction Predictions

Based on shared functions, pathways, or expression patterns:
- Predict previously unstudied interactions
- Explain the reasoning (shared pathways, protein domains, expression correlation)
- Assign confidence levels with justification
- Suggest validation experiments

## 📊 Functional Enrichment

What biological processes are over-represented:
- **GO Terms**: Biological processes, molecular functions, cellular components
- **Disease Associations**: Common disease connections
- **Drug Targets**: Are any genes druggable? Existing medications?

## 🧪 Experimental Validation Suggestions

Recommend experiments to validate predictions:
- Co-immunoprecipitation for physical interactions
- Yeast two-hybrid assays
- CRISPR screens
- RNA-seq co-expression analysis
- ChIP-seq for regulatory interactions

## ⚠️ Important Caveats

- Tissue/cell-type specificity
- Context-dependent interactions
- Confidence limitations
- Areas needing more research

**Analysis Guidelines:**
- Use known interaction databases (STRING, BioGRID, IntAct, HPRD)
- Consider pathway databases (KEGG, Reactome, WikiPathways)
- Leverage protein-protein interaction networks
- Consider expression correlation data (GTEx, HPA)
- Be transparent about prediction confidence
- Distinguish between known and predicted interactions
- Provide specific evidence and references
- Focus on functionally relevant interactions

Provide evidence-based predictions with clear confidence levels. Be honest about uncertainties.`;

      // BACKEND_NEEDED: InvokeLLM needs API implementation
      const response = "Pathway prediction feature is currently unavailable. API implementation needed.";

      setPredictions(response);
    } catch (err) {
      console.error("Error predicting interactions:", err);
      setError("Failed to predict interactions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVcfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVcf(true);
    try {
      // BACKEND_NEEDED: UploadFile needs API implementation
      // const { file_url } = await apiClient.uploadFile({ file });
      setVcfFile(file);
      // setVcfFileUrl(file_url);
      setError("File upload feature is currently unavailable. API implementation needed.");
    } catch (err) {
      console.error("Error uploading VCF:", err);
      setError("Failed to upload VCF file. Please try again.");
    } finally {
      setIsUploadingVcf(false);
    }
  };

  const handleVcfVariantsParsed = (variants) => {
    setParsedVcfVariants(variants);
    // Extract unique genes from variants
    const uniqueGenes = [...new Set(
      variants
        .filter(v => v.gene && v.gene !== 'Unknown gene' && v.gene !== '.')
        .map(v => v.gene)
    )];
    setVcfGenes(uniqueGenes);
  };

  const activeGenes = inputMode === "vcf" ? vcfGenes : genes;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-green-600" />
            AI Pathway & Interaction Predictor
          </CardTitle>
          <Badge className="bg-green-600 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={inputMode} onValueChange={setInputMode} className="mb-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="genes">From Search</TabsTrigger>
            <TabsTrigger value="vcf">From VCF File</TabsTrigger>
          </TabsList>
        </Tabs>

        {inputMode === "vcf" && (
          <div className="space-y-3 mb-4">
            <Label htmlFor="vcf-upload-pathway" className="text-base font-medium">
              Upload VCF File
            </Label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
              <input
                id="vcf-upload-pathway"
                type="file"
                accept=".vcf,.vcf.gz"
                onChange={handleVcfUpload}
                className="hidden"
                disabled={isUploadingVcf}
              />
              <label
                htmlFor="vcf-upload-pathway"
                className="cursor-pointer flex flex-col items-center"
              >
                {isUploadingVcf ? (
                  <>
                    <Loader2 className="w-12 h-12 text-green-600 mb-2 animate-spin" />
                    <p className="text-sm text-slate-600">Uploading VCF file...</p>
                  </>
                ) : vcfFile ? (
                  <>
                    <Upload className="w-12 h-12 text-green-600 mb-2" />
                    <p className="text-sm font-medium text-green-900">{vcfFile.name}</p>
                    <p className="text-xs text-slate-500 mt-1">Click to upload a different file</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-slate-400 mb-2" />
                    <p className="text-sm font-medium text-slate-700">Click to upload VCF file</p>
                    <p className="text-xs text-slate-500 mt-1">.vcf or .vcf.gz files supported</p>
                  </>
                )}
              </label>
            </div>

            {vcfFileUrl && (
              <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin mx-auto" />}>
                <VCFParser
                  fileUrl={vcfFileUrl}
                  onVariantsParsed={handleVcfVariantsParsed}
                />
              </Suspense>
            )}

            {vcfGenes.length > 0 && (
              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900 text-sm">
                  Extracted <strong>{vcfGenes.length} unique genes</strong> from VCF file variants
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {activeGenes.length < 2 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {inputMode === "vcf" 
                ? "Upload a VCF file with variants in at least 2 genes to predict interactions"
                : "Select at least 2 genes from search results to predict gene-gene interactions and pathway involvement"}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">
                Analyzing interactions for {activeGenes.length} genes:
              </p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {activeGenes.map((gene, idx) => (
                  <Badge key={idx} variant="outline" className="text-sm">
                    {typeof gene === 'string' ? gene : gene.symbol}
                  </Badge>
                ))}
              </div>
            </div>

            <Alert className="mb-4 bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 text-sm">
                <strong>Note:</strong> Predictions are based on known databases and AI inference. Always validate computationally predicted interactions experimentally.
              </AlertDescription>
            </Alert>

            <Button
              onClick={predictInteractions}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Interaction Networks...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Predict Interactions & Pathways
                </>
              )}
            </Button>

            {/* Clinical Trial Matcher Toggle */}
            {predictions && (
              <Button
                onClick={() => setShowTrialMatcher(!showTrialMatcher)}
                variant="outline"
                className="w-full mt-4 gap-2"
              >
                <Stethoscope className="w-4 h-4" />
                {showTrialMatcher ? 'Hide' : 'Find'} Matching Clinical Trials
              </Button>
            )}

            {/* Clinical Trial Matcher */}
            {showTrialMatcher && (
              <div className="mt-4">
                <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin mx-auto" />}>
                  <ClinicalTrialMatcher
                    genes={activeGenes}
                    variants={parsedVcfVariants}
                  />
                </Suspense>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {predictions && (
              <div className="mt-6 prose prose-sm max-w-none">
                <ReactMarkdown components={PREDICTOR_MD_COMPONENTS}>
                  {predictions}
                </ReactMarkdown>

                <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    📚 Recommended Validation Resources
                  </h4>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>• <strong>STRING</strong>: https://string-db.org</p>
                    <p>• <strong>BioGRID</strong>: https://thebiogrid.org</p>
                    <p>• <strong>KEGG Pathways</strong>: https://www.genome.jp/kegg/pathway.html</p>
                    <p>• <strong>Reactome</strong>: https://reactome.org</p>
                    <p>• <strong>GeneMANIA</strong>: https://genemania.org</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}