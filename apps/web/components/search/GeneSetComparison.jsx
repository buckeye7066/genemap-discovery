import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GitCompare, Info, Link2 } from "lucide-react";

function uniqueSymbols(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function percent(numerator, denominator) {
  if (denominator === 0 && numerator === 0) return "undefined";
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function GeneList({ genes = [], tone = "slate" }) {
  if (genes.length === 0) {
    return <p className="text-sm text-slate-500">None</p>;
  }

  const className = {
    blue: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    green: "bg-green-100 text-green-800 hover:bg-green-100",
    amber: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    slate: "bg-slate-100 text-slate-800 hover:bg-slate-100",
  }[tone] || "bg-slate-100 text-slate-800 hover:bg-slate-100";

  return (
    <div className="flex flex-wrap gap-2">
      {genes.map((gene) => (
        <Badge key={gene} className={className}>{gene}</Badge>
      ))}
    </div>
  );
}

export default function GeneSetComparison({ comparison }) {
  const metrics = useMemo(() => {
    const userGenes = uniqueSymbols(comparison?.userGenes);
    const phenotypeGenes = uniqueSymbols(comparison?.phenotypeGenes);
    const overlapping = uniqueSymbols(comparison?.overlapping);
    const uniqueToUser = uniqueSymbols(comparison?.uniqueToUser);
    const uniqueToPhenotype = uniqueSymbols(comparison?.uniqueToPhenotype);
    const union = new Set([...userGenes, ...phenotypeGenes]);

    return {
      userGenes,
      phenotypeGenes,
      overlapping,
      uniqueToUser,
      uniqueToPhenotype,
      unionSize: union.size,
      overlapRate: percent(overlapping.length, union.size),
      userCoverage: percent(overlapping.length, userGenes.length),
      phenotypeCoverage: percent(overlapping.length, phenotypeGenes.length),
    };
  }, [comparison]);

  if (!comparison) return null;

  return (
    <Card className="border-blue-200 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-blue-600" />
          Gene Set Comparison
        </CardTitle>
        <p className="text-sm text-slate-600">
          {comparison.phenotype
            ? `Comparing your gene set with phenotype-associated genes for "${comparison.phenotype}".`
            : "Comparing your gene set with the current phenotype-associated candidate genes."}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Overlap</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.overlapping.length}</p>
            <p className="text-xs text-slate-500">{metrics.overlapRate} of combined genes</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Your Set</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.userGenes.length}</p>
            <p className="text-xs text-slate-500">{metrics.userCoverage} found in phenotype list</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Phenotype Set</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.phenotypeGenes.length}</p>
            <p className="text-xs text-slate-500">{metrics.phenotypeCoverage} covered by your list</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase text-slate-500">Combined</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.unionSize}</p>
            <p className="text-xs text-slate-500">unique symbols</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-green-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Overlapping Genes</CardTitle>
            </CardHeader>
            <CardContent>
              <GeneList genes={metrics.overlapping} tone="green" />
            </CardContent>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unique To Your Set</CardTitle>
            </CardHeader>
            <CardContent>
              <GeneList genes={metrics.uniqueToUser} tone="blue" />
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Unique To Phenotype Results</CardTitle>
            </CardHeader>
            <CardContent>
              <GeneList genes={metrics.uniqueToPhenotype} tone="amber" />
            </CardContent>
          </Card>
        </div>

        {comparison.functionalRelationships?.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                Functional Relationships
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparison.functionalRelationships.map((relationship, index) => (
                <div key={`${relationship.gene1}-${relationship.gene2}-${index}`} className="rounded-md bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900">
                    {[relationship.gene1, relationship.gene2].filter(Boolean).join(" ↔ ") || "Relationship"}
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{relationship.relationship || "Relationship noted."}</p>
                  {relationship.evidence && (
                    <p className="text-xs text-slate-500 mt-2">Evidence: {relationship.evidence}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {comparison.analysis && (
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Robert's Analysis</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none text-slate-700">
              <ReactMarkdown>{String(comparison.analysis)}</ReactMarkdown>
            </CardContent>
          </Card>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This comparison uses the symbols returned by the current search and the genes you entered. It is research support only, not a diagnosis or medical advice.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
