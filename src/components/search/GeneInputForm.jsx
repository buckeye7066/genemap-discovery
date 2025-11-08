import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Sparkles } from "lucide-react";

export default function GeneInputForm({ onGenesSubmit, isLoading, initialGenes = [] }) {
  const [geneInput, setGeneInput] = useState("");
  const [genes, setGenes] = useState(initialGenes);

  React.useEffect(() => {
    setGenes(initialGenes);
  }, [initialGenes]);

  const handleAddGene = () => {
    const newGene = geneInput.trim().toUpperCase();
    if (newGene && !genes.includes(newGene)) {
      setGenes([...genes, newGene]);
      setGeneInput("");
    }
  };

  const handleBulkAdd = (text) => {
    // Parse genes from comma, space, or newline separated text
    const newGenes = text
      .split(/[\s,\n]+/)
      .map(g => g.trim().toUpperCase())
      .filter(g => g && !genes.includes(g));
    
    if (newGenes.length > 0) {
      setGenes([...genes, ...newGenes]);
    }
  };

  const handleRemoveGene = (geneToRemove) => {
    setGenes(genes.filter(g => g !== geneToRemove));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (genes.length > 0) {
      onGenesSubmit(genes);
    }
  };

  const handleClear = () => {
    setGenes([]);
    setGeneInput("");
    onGenesSubmit([]);
  };

  const exampleGeneSets = [
    { name: "BRCA Family", genes: ["BRCA1", "BRCA2", "PALB2", "CHEK2"] },
    { name: "Cystic Fibrosis", genes: ["CFTR"] },
    { name: "Cardiac", genes: ["MYH7", "TNNT2", "MYBPC3", "SCN5A"] }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gene-input">Gene Symbols</Label>
        <div className="flex gap-2">
          <Input
            id="gene-input"
            placeholder="e.g., BRCA1, TP53, CFTR"
            value={geneInput}
            onChange={(e) => setGeneInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddGene();
              }
            }}
            disabled={isLoading}
          />
          <Button
            type="button"
            onClick={handleAddGene}
            disabled={!geneInput.trim() || isLoading}
            variant="outline"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Enter gene symbols one at a time, or paste multiple genes below
        </p>
      </div>

      {/* Bulk Input */}
      <div className="space-y-2">
        <Label htmlFor="bulk-input">Or Paste Multiple Genes</Label>
        <Textarea
          id="bulk-input"
          placeholder="Paste genes separated by commas, spaces, or new lines"
          className="h-20 font-mono text-sm"
          onChange={(e) => {
            if (e.target.value.trim()) {
              handleBulkAdd(e.target.value);
              e.target.value = "";
            }
          }}
          disabled={isLoading}
        />
      </div>

      {/* Current Genes */}
      {genes.length > 0 && (
        <div className="space-y-2">
          <Label>Your Genes ({genes.length})</Label>
          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg max-h-40 overflow-y-auto">
            {genes.map((gene) => (
              <Badge key={gene} variant="secondary" className="gap-1 pr-1">
                {gene}
                <button
                  type="button"
                  onClick={() => handleRemoveGene(gene)}
                  className="ml-1 hover:bg-slate-300 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Example Sets */}
      {genes.length === 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Quick Start Examples:</Label>
          <div className="flex flex-wrap gap-2">
            {exampleGeneSets.map((set) => (
              <Button
                key={set.name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGenes(set.genes)}
                disabled={isLoading}
                className="text-xs"
              >
                {set.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={genes.length === 0 || isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Analyze with Robert
        </Button>
        {genes.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={isLoading}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800">
        <strong>💡 Tip:</strong> Input genes you're researching, and Robert will compare them with phenotype-associated genes to reveal overlaps and relationships.
      </div>
    </form>
  );
}