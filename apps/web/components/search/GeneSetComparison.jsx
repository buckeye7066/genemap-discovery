import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, BookmarkPlus, Check, Network } from "lucide-react";
import ReactMarkdown from "react-markdown";

// Markdown styling reused from the AI explainer flow for visual consistency.
const ANALYSIS_MD_COMPONENTS = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-blue-900 mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold text-blue-800 mt-5 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>,
  p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="space-y-2 my-3 ml-6 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-2 my-3 ml-6 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-blue-900">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-400 pl-4 my-3 italic text-blue-900">{children}</blockquote>
  ),
};

function GeneBadgeList({ label, genes, className }) {
  if (!genes || genes.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 mb-1">{label} ({genes.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {genes.map((g) => (
          <Badge key={g} variant="secondary" className={className}>{g}</Badge>
        ))}
      </div>
    </div>
  );
}

// Renders Robert's output for both flows:
//  - "gene-analysis": user input genes analyzed on their own (no phenotype)
//  - comparison:      user genes compared against phenotype-associated genes
export default function GeneSetComparison({ comparison, onSaveGeneSet }) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [showSave, setShowSave] = useState(false);

  if (!comparison) return null;

  const {
    mode,
    userGenes = [],
    phenotype,
    overlapping = [],
    uniqueToUser = [],
    uniqueToPhenotype = [],
    analysis,
    functionalRelationships = [],
  } = comparison;

  const isGeneOnly = mode === "gene-analysis" || !phenotype;

  const handleSave = () => {
    if (!onSaveGeneSet) return;
    const setName = name.trim() || `Gene set (${userGenes.length})`;
    onSaveGeneSet(setName, phenotype ? `Compared against: ${phenotype}` : "Analyzed with Robert", []);
    setSaved(true);
    setShowSave(false);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Sparkles className="w-5 h-5 text-blue-600" />
          {isGeneOnly
            ? `Robert's Analysis of ${userGenes.length} Gene${userGenes.length === 1 ? "" : "s"}`
            : "Robert's Gene Set Comparison"}
        </CardTitle>
        {phenotype && (
          <p className="text-sm text-slate-500">Phenotype context: {phenotype}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overlap summary — only meaningful when compared against a phenotype. */}
        {!isGeneOnly && (
          <div className="grid sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
            <GeneBadgeList label="Overlapping" genes={overlapping} className="bg-green-100 text-green-800" />
            <GeneBadgeList label="Unique to your set" genes={uniqueToUser} className="bg-blue-100 text-blue-800" />
            <GeneBadgeList label="Unique to phenotype" genes={uniqueToPhenotype} className="bg-amber-100 text-amber-800" />
          </div>
        )}

        {isGeneOnly && (
          <GeneBadgeList label="Your genes" genes={userGenes} className="bg-blue-100 text-blue-800" />
        )}

        {/* Robert's narrative analysis. */}
        {analysis && (
          <div className="prose-sm max-w-none">
            <ReactMarkdown components={ANALYSIS_MD_COMPONENTS}>
              {typeof analysis === "string" ? analysis : String(analysis)}
            </ReactMarkdown>
          </div>
        )}

        {/* Functional relationships between genes, when found. */}
        {functionalRelationships.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 mb-2">
              <Network className="w-4 h-4 text-purple-600" />
              Functional Relationships
            </h3>
            <ul className="space-y-2">
              {functionalRelationships.map((rel, i) => (
                <li key={i} className="text-sm text-slate-700 p-3 bg-purple-50 rounded-lg">
                  <span className="font-semibold text-purple-900">
                    {rel.gene1}{rel.gene2 ? ` ↔ ${rel.gene2}` : ""}
                  </span>
                  {rel.relationship ? `: ${rel.relationship}` : ""}
                  {rel.evidence && (
                    <span className="block text-xs text-slate-500 mt-1">Evidence: {rel.evidence}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Save the analyzed set for later. */}
        {onSaveGeneSet && userGenes.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            {saved ? (
              <p className="flex items-center gap-2 text-sm text-green-700">
                <Check className="w-4 h-4" /> Gene set saved.
              </p>
            ) : showSave ? (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="save-set-name" className="text-xs">Set name</Label>
                  <Input
                    id="save-set-name"
                    placeholder={`Gene set (${userGenes.length})`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
                  <BookmarkPlus className="w-4 h-4 mr-2" /> Save
                </Button>
                <Button variant="outline" onClick={() => setShowSave(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowSave(true)} className="gap-2">
                <BookmarkPlus className="w-4 h-4" /> Save this gene set
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
