import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Search, Loader2, ExternalLink, Info, CheckCircle2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';

const databases = [
  {
    id: "clingen",
    name: "ClinGen",
    description: "Clinical Genome Resource - Gene-disease validity",
    url: "https://clinicalgenome.org",
    icon: "🧬"
  },
  {
    id: "dbgap",
    name: "dbGaP",
    description: "Database of Genotypes and Phenotypes",
    url: "https://www.ncbi.nlm.nih.gov/gap/",
    icon: "📊"
  },
  {
    id: "cosmic",
    name: "COSMIC",
    description: "Catalogue of Somatic Mutations in Cancer",
    url: "https://cancer.sanger.ac.uk/cosmic",
    icon: "🔬"
  },
  {
    id: "decipher",
    name: "DECIPHER",
    description: "Database of genomic variation and phenotype",
    url: "https://www.deciphergenomics.org",
    icon: "🧪"
  },
  {
    id: "gtex",
    name: "GTEx",
    description: "Genotype-Tissue Expression project",
    url: "https://gtexportal.org",
    icon: "🫀"
  }
];

function getEducationContext(level) {
  if (level === 'medical_professional') {
    return "clinical researchers";
  }
  if (level === 'phd' || level === 'researcher') {
    return "research scientists";
  }
  return "advanced researchers";
}

export default function ExternalDatabaseIntegration({ userEducationLevel }) {
  const [selectedDatabase, setSelectedDatabase] = useState("clingen");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const db = databases.find(d => d.id === selectedDatabase);
      const educationContext = getEducationContext(userEducationLevel);

      const prompt = `You are a research database integration assistant. Provide comprehensive information from ${db.name} for the query: "${searchQuery}".

**Database:** ${db.name} (${db.description})
**Query:** ${searchQuery}
**Audience:** ${educationContext}

**Your Task:**

1. **Database Overview for this Query**
   - What ${db.name} can tell us about "${searchQuery}"
   - Types of data available
   - Relevance to research

2. **Key Findings**
   ${selectedDatabase === 'clingen' ? `
   - Gene-disease clinical validity classification
   - Evidence level and review status
   - Dosage sensitivity information
   - Clinical actionability
   ` : selectedDatabase === 'dbgap' ? `
   - Available studies containing this gene/variant
   - Study types (GWAS, WES, WGS)
   - Phenotypes studied
   - Access requirements and data availability
   ` : selectedDatabase === 'cosmic' ? `
   - Somatic mutation frequency
   - Cancer types affected
   - Mutation significance
   - Therapeutic implications
   ` : selectedDatabase === 'decipher' ? `
   - Syndromic associations
   - Phenotypic spectrum
   - Inheritance patterns
   - Diagnostic yield
   ` : selectedDatabase === 'gtex' ? `
   - Tissue-specific expression patterns
   - eQTL associations
   - Splice variants
   - Developmental expression
   ` : ''}

3. **Research Applications**
   - How to use this data in your research
   - Complementary databases to consult
   - Analysis strategies

4. **Data Access Instructions**
   - How to access full dataset
   - Registration/approval requirements
   - API access information
   - Citation requirements

5. **Integration with GeneMap Data**
   - How to combine with your existing analyses
   - Cross-reference opportunities
   - Validation strategies

6. **Direct Database Links**
   Provide specific URLs to:
   - Main search page for this query
   - Documentation
   - API endpoints (if available)

Be comprehensive but practical. Include specific search strategies and resource links.`;

      // BACKEND_NEEDED: InvokeLLM integration needs API implementation
      // const response = await base44.integrations.Core.InvokeLLM({
      //   prompt,
      //   add_context_from_internet: true
      // });
      const response = "Database integration feature requires backend integration";

      setResults({
        database: db,
        query: searchQuery,
        analysis: response
      });

    } catch (err) {
      console.error("Error searching database:", err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-green-600" />
            External Research Database Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-green-50 border-green-200">
            <Info className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900 text-sm">
              <strong>Database Integration:</strong> Access curated research databases for 
              gene-disease associations, population studies, cancer genomics, and expression data.
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {databases.map((db) => (
              <Card
                key={db.id}
                className={`cursor-pointer transition-all ${
                  selectedDatabase === db.id 
                    ? 'ring-2 ring-green-500 bg-green-50' 
                    : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedDatabase(db.id)}
              >
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-4xl mb-2">{db.icon}</div>
                    <h3 className="font-semibold text-slate-900 mb-1">{db.name}</h3>
                    <p className="text-xs text-slate-600 mb-2">{db.description}</p>
                    <a
                      href={db.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Visit <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="database-select">Selected Database</Label>
              <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((db) => (
                    <SelectItem key={db.id} value={db.id}>
                      {db.icon} {db.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="search-query">Search Query</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="search-query"
                  placeholder="e.g., BRCA1, Alzheimer's disease, chr17:41234567"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={isSearching}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{results.database.icon}</span>
              <div>
                <CardTitle>{results.database.name} Results</CardTitle>
                <p className="text-sm text-slate-600">Query: {results.query}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {children} <ExternalLink className="w-3 h-3 inline" />
                    </a>
                  ),
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-900 mt-5 mb-2">{children}</h2>,
                  p: ({ children }) => <p className="text-slate-700 mb-3">{children}</p>,
                  ul: ({ children }) => <ul className="ml-4 mb-3 space-y-1 list-disc">{children}</ul>,
                }}
              >
                {results.analysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}