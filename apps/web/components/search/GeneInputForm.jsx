import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus, Sparkles } from "lucide-react";

const exampleGeneSets = [
  { name: "BRCA Family", genes: ["BRCA1", "BRCA2", "PALB2", "CHEK2"] },
  { name: "Cystic Fibrosis", genes: ["CFTR"] },
  { name: "Cardiac", genes: ["MYH7", "TNNT2", "MYBPC3", "SCN5A"] }
];

export default function GeneInputForm({ onGenesSubmit, isLoading, initialGenes = [] }) {
  const [geneInput, setGeneInput] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [genes, setGenes] = useState(initialGenes);
  const inputRef = useRef(null);

  React.useEffect(() => {
    setGenes(initialGenes);
  }, [initialGenes]);

  const parseGeneList = (text) =>
    String(text || '')
      .split(/[\s,\n]+/)
      .map((g) => g.trim().toUpperCase())
      .filter(Boolean);

  const mergeGenes = (prev, additions) => {
    const merged = [...prev];
    for (const g of additions) if (!merged.includes(g)) merged.push(g);
    return merged;
  };

  const handleAddGene = () => {
    const newGene = geneInput.trim().toUpperCase();
    if (!newGene) return;
    // Functional update (never read the array from a stale closure) + keep
    // focus in the input. Clicking the "+" button moves focus to the button,
    // so without this refocus the user's next keystrokes went nowhere and the
    // second consecutive add silently did nothing.
    setGenes((prev) => (prev.includes(newGene) ? prev : [...prev, newGene]));
    setGeneInput("");
    inputRef.current?.focus();
  };

  const handleBulkAdd = (text) => {
    const parsed = parseGeneList(text);
    if (parsed.length > 0) {
      setGenes((prev) => mergeGenes(prev, parsed));
    }
  };

  const handleRemoveGene = (geneToRemove) => {
    setGenes((prevGenes) => {
      if (!prevGenes.includes(geneToRemove)) {
        return prevGenes;
      }
      // Keep the state updater pure: StrictMode may call it more than once.
      return prevGenes.filter(g => g !== geneToRemove);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Flush any text still in the bulk box (pasted then "Search" clicked
    // without blurring) so the genes aren't lost.
    let finalGenes = genes;
    if (bulkText.trim()) {
      finalGenes = mergeGenes(genes, parseGeneList(bulkText));
      setGenes(finalGenes);
      setBulkText("");
    }
    if (finalGenes.length > 0) {
      onGenesSubmit(finalGenes);
    } else {
      // Prevent submitting an empty gene list
      return;
    }
  };

  const handleClear = () => {
    setGenes([]);
    setGeneInput("");
    setBulkText("");
    onGenesSubmit([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="gene-input">Gene Symbols</Label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
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
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          onBlur={() => {
            // Parse on blur, NOT on every keystroke. The old onChange handler
            // ran handleBulkAdd on each character and cleared the field, so
            // typing "TP53 BRCA1" produced single-character "genes" (T, P, 5…).
            if (bulkText.trim()) {
              handleBulkAdd(bulkText);
              setBulkText("");
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
                onClick={() => {
                  if (geneInput.trim() || bulkText.trim() || genes.length > 0) {
                    if (window.confirm('You have unsaved changes. Do you want to overwrite with an example set?')) {
                      setGenes(set.genes);
                    }
                  } else {
                    setGenes(set.genes);
                  }
                }}
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
          Analyze with AI
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
