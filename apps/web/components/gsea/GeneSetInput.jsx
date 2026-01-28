import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, Sparkles, X, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function GeneSetInput({ onSubmit, isLoading }) {
  const [geneInput, setGeneInput] = useState("");
  const [genes, setGenes] = useState([]);
  const [fileName, setFileName] = useState(null);

  const parseGeneList = (text) => {
    // Parse genes from various formats: comma-separated, space-separated, newline-separated
    const parsed = text
      .replace(/[,;\t]/g, ' ')
      .split(/\s+/)
      .map(g => g.trim().toUpperCase())
      .filter(g => g.length > 0 && /^[A-Z0-9-]+$/.test(g));
    
    return [...new Set(parsed)]; // Remove duplicates
  };

  const handleTextInput = () => {
    if (!geneInput.trim()) return;
    const parsedGenes = parseGeneList(geneInput);
    setGenes(parsedGenes);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedGenes = parseGeneList(text);
      setGenes(parsedGenes);
      setGeneInput(text);
    };

    reader.readAsText(file);
  };

  const handleRemoveGene = (geneToRemove) => {
    setGenes(genes.filter(g => g !== geneToRemove));
  };

  const handleSubmit = () => {
    if (genes.length === 0) return;
    onSubmit(genes);
  };

  const handleReset = () => {
    setGeneInput("");
    setGenes([]);
    setFileName(null);
  };

  const exampleGenes = ["BRCA1", "TP53", "EGFR", "KRAS", "MYC", "PTEN", "RB1", "APC"];

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          Input Gene Set
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Methods */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Enter Gene Symbols
            </label>
            <Textarea
              placeholder="Enter gene symbols (separated by spaces, commas, or newlines)&#10;Example: BRCA1 TP53 EGFR"
              value={geneInput}
              onChange={(e) => setGeneInput(e.target.value)}
              className="h-32 font-mono text-sm"
              disabled={isLoading}
            />
            <Button
              onClick={handleTextInput}
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!geneInput.trim() || isLoading}
            >
              Parse Genes
            </Button>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              Upload Gene List File
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors">
              <input
                type="file"
                accept=".txt,.csv,.tsv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isLoading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm text-slate-600">
                  {fileName || "Click to upload .txt, .csv, or .tsv file"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  One gene per line or comma-separated
                </p>
              </label>
            </div>
          </div>
        </div>

        {/* Quick Examples */}
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">
            Quick Start (Example Gene Set)
          </label>
          <div className="flex flex-wrap gap-2">
            {exampleGenes.map((gene) => (
              <Button
                key={gene}
                variant="outline"
                size="sm"
                onClick={() => {
                  const newGenes = [...new Set([...genes, gene])];
                  setGenes(newGenes);
                  setGeneInput(newGenes.join(' '));
                }}
                disabled={isLoading || genes.includes(gene)}
              >
                {gene}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGenes(exampleGenes);
                setGeneInput(exampleGenes.join(' '));
              }}
              disabled={isLoading}
              className="bg-indigo-50"
            >
              Use All Examples
            </Button>
          </div>
        </div>

        {/* Parsed Genes Display */}
        {genes.length > 0 && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-slate-900">
                Parsed Gene Set ({genes.length} genes)
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isLoading}
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {genes.map((gene) => (
                <Badge
                  key={gene}
                  variant="secondary"
                  className="pr-1 gap-2"
                >
                  {gene}
                  <button
                    onClick={() => handleRemoveGene(gene)}
                    className="ml-1 hover:bg-slate-300 rounded-full p-0.5"
                    disabled={isLoading}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={genes.length === 0 || isLoading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            size="lg"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            {isLoading ? "Analyzing..." : `Analyze ${genes.length} Gene${genes.length !== 1 ? 's' : ''}`}
          </Button>
        </div>

        {/* Guidelines */}
        <Alert className="bg-blue-50 border-blue-200">
          <AlertDescription className="text-blue-900 text-sm">
            <strong>Tips:</strong> For best results, use official gene symbols (e.g., BRCA1, not BRCA-1). 
            The analysis works best with 10-500 genes. Smaller sets may have limited enrichment, 
            while larger sets may be too general.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}