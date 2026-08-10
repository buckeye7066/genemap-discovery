import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GitCompare, X, Dna, MapPin, Info } from "lucide-react";
import PublicationState, { hasReusablePublicationContent } from "../shared/PublicationState";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function geneSymbol(gene) {
  return normalizeText(gene?.symbol || gene?.gene || gene?.name) || "Unknown";
}

function phenotypeNames(gene) {
  return (gene?.phenotypes || [])
    .map((phenotype) => normalizeText(phenotype?.name || phenotype))
    .filter(Boolean);
}

function sourceNames(gene) {
  return (gene?.sources || [])
    .map((source) => normalizeText(source?.name || source?.source || source))
    .filter(Boolean);
}

function formatScore(score) {
  return typeof score === "number" ? `${Math.round(score * 100)}%` : "Not scored";
}

function formatLocation(gene) {
  const chromosome = normalizeText(gene?.chromosome);
  if (!chromosome) return "Not listed";
  const start = typeof gene?.start === "number" ? gene.start.toLocaleString() : null;
  const end = typeof gene?.end === "number" ? gene.end.toLocaleString() : null;
  return start && end ? `${chromosome}:${start}-${end}` : chromosome;
}

function intersection(lists) {
  if (lists.length === 0) return [];
  return [...lists[0]].filter((item) => lists.every((list) => list.has(item)));
}

export default function GeneComparison({ genes = [], onClose }) {
  const comparison = useMemo(() => {
    const rows = genes.map((gene) => {
      const candidateReusable = hasReusablePublicationContent(gene?.candidatePublication);
      const profileReusable = hasReusablePublicationContent(gene?.profilePublication)
        && gene?.profileStatus === 'available';
      return {
        gene,
        symbol: geneSymbol(gene),
        name: gene?.coordinatesVerified || candidateReusable ? normalizeText(gene?.name) : '',
        score: gene?.score,
        associationType: candidateReusable
          ? normalizeText(gene?.associationType || gene?.association_type)
          : '',
        location: gene?.coordinatesVerified ? formatLocation(gene) : 'Not listed',
        phenotypes: profileReusable ? phenotypeNames(gene) : [],
        sources: sourceNames(gene),
        explanation: (candidateReusable ? normalizeText(gene?.explanation) : '')
          || (profileReusable ? normalizeText(gene?.aiSummary) : ''),
      };
    });

    const scoredRows = rows.filter((row) => typeof row.score === "number");
    const phenotypeSets = rows
      .map((row) => new Set(row.phenotypes.map((item) => item.toLowerCase())));
    const sharedPhenotypeKeys = intersection(phenotypeSets);
    const sharedPhenotypes = sharedPhenotypeKeys
      .map((key) => rows.flatMap((row) => row.phenotypes).find((item) => item.toLowerCase() === key))
      .filter(Boolean);

    const chromosomes = rows.reduce((acc, row) => {
      const chromosome = normalizeText(row.gene?.chromosome) || "Unknown";
      acc[chromosome] = (acc[chromosome] || 0) + 1;
      return acc;
    }, {});

    const averageScore = scoredRows.length
      ? scoredRows.reduce((sum, row) => sum + row.score, 0) / scoredRows.length
      : null;

    return { rows, scoredRows, sharedPhenotypes, chromosomes, averageScore };
  }, [genes]);

  if (genes.length < 2) {
    return (
      <Card className="border-blue-200 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-blue-600" />
            Gene Comparison
          </CardTitle>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>Select at least two genes to compare side-by-side.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-blue-600" />
              Gene Comparison
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Comparing {genes.length} selected genes using the data already loaded in this search.
            </p>
          </div>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Selected</p>
              <p className="text-2xl font-bold text-slate-900">{genes.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Average Evidence</p>
              <p className="text-2xl font-bold text-slate-900">{formatScore(comparison.averageScore)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Shared Phenotypes</p>
              <p className="text-2xl font-bold text-slate-900">{comparison.sharedPhenotypes.length}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Gene</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Association</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Location</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Phenotypes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {comparison.rows.map((row) => (
                  <tr key={row.symbol}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">{row.symbol}</div>
                      {row.name && <div className="text-xs text-slate-500">{row.name}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">{formatScore(row.score)}</td>
                    <td className="px-4 py-3 align-top">{row.associationType || "Not listed"}</td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {row.location}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {row.phenotypes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.phenotypes.slice(0, 4).map((phenotype) => (
                            <Badge key={phenotype} variant="secondary" className="text-xs">
                              {phenotype}
                            </Badge>
                          ))}
                          {row.phenotypes.length > 4 && (
                            <Badge variant="outline" className="text-xs">
                              +{row.phenotypes.length - 4}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500">None loaded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Dna className="w-4 h-4 text-blue-600" />
                  Shared Phenotype Signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {comparison.sharedPhenotypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {comparison.sharedPhenotypes.map((phenotype) => (
                      <Badge key={phenotype} className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        {phenotype}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    No shared phenotype annotations are present in the loaded records.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chromosome Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(comparison.chromosomes).map(([chromosome, count]) => (
                    <Badge key={chromosome} variant="outline">
                      Chr {chromosome}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Per-Gene Evidence Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comparison.rows.map((row) => (
                <div key={row.symbol} className="rounded-md bg-slate-50 p-3">
                  <div className="font-semibold text-slate-900">{row.symbol}</div>
                  {row.gene?.candidatePublication && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-medium text-slate-600">Candidate publication</p>
                      <PublicationState artifact={row.gene.candidatePublication} showAvailable />
                    </div>
                  )}
                  {row.gene?.profilePublication && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-medium text-slate-600">Profile publication</p>
                      <PublicationState artifact={row.gene.profilePublication} showAvailable />
                    </div>
                  )}
                  <p className="text-sm text-slate-700 mt-1">
                    {row.explanation || "No evidence note was loaded for this gene."}
                  </p>
                  {row.sources.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">Sources: {row.sources.join(", ")}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
