import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Network, Dna, Activity, Stethoscope, Lightbulb } from "lucide-react";

/**
 * Renders the rich GSEA enrichment object produced by the analysis prompt:
 *   { pathways[], goTerms{ biologicalProcess[], molecularFunction[], cellularComponent[] },
 *     diseases[], summary{}, geneInteractions[] }
 *
 * Previously this was a stub that (a) was passed the data under the wrong prop
 * name (`data` vs `results`) and (b) called `.map()` assuming a flat array, so
 * it always showed "No enrichment results to display." It now accepts `data`
 * and renders each section defensively.
 */
function formatP(value) {
  return typeof value === "number" ? value.toExponential(2) : "—";
}

function PathwayTable({ pathways }) {
  if (!Array.isArray(pathways) || pathways.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Network className="w-5 h-5 text-indigo-600" /> Enriched Pathways
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-4 font-medium">Pathway</th>
              <th className="py-2 pr-4 font-medium">Source</th>
              <th className="py-2 pr-4 font-medium">Genes</th>
              <th className="py-2 pr-4 font-medium">p-value</th>
              <th className="py-2 pr-4 font-medium">FDR</th>
            </tr>
          </thead>
          <tbody>
            {pathways.map((p, i) => (
              <tr key={p.id || i} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-4">
                  <div className="font-medium text-slate-900">{p.name || p.id || "—"}</div>
                  {p.description && <div className="text-xs text-slate-500 max-w-md">{p.description}</div>}
                </td>
                <td className="py-2 pr-4">{p.database || "—"}</td>
                <td className="py-2 pr-4">
                  {Array.isArray(p.genes) ? p.genes.length : (p.geneCount ?? "—")}
                  {p.totalGenes ? <span className="text-slate-400">/{p.totalGenes}</span> : null}
                </td>
                <td className="py-2 pr-4">{formatP(p.pValue)}</td>
                <td className="py-2 pr-4">{formatP(p.adjustedPValue ?? p.fdr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GoSection({ goTerms }) {
  if (!goTerms || typeof goTerms !== "object") return null;
  const groups = [
    ["Biological Process", goTerms.biologicalProcess],
    ["Molecular Function", goTerms.molecularFunction],
    ["Cellular Component", goTerms.cellularComponent],
  ].filter(([, terms]) => Array.isArray(terms) && terms.length > 0);
  if (groups.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Dna className="w-5 h-5 text-emerald-600" /> Gene Ontology
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {groups.map(([label, terms]) => (
          <div key={label}>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">{label}</h4>
            <ul className="space-y-1.5">
              {terms.map((t, i) => (
                <li key={t.id || i} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{t.term || t.id}</span>
                  {typeof t.pValue === "number" && (
                    <span className="text-slate-400"> · p={formatP(t.pValue)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DiseaseList({ diseases }) {
  if (!Array.isArray(diseases) || diseases.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Stethoscope className="w-5 h-5 text-rose-600" /> Disease Associations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {diseases.map((d, i) => (
          <div key={d.name || i} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{d.name || "—"}</span>
              {d.association && (
                <Badge variant="secondary" className="text-xs">{d.association}</Badge>
              )}
            </div>
            {d.evidence && <p className="text-xs text-slate-500 mt-1">{d.evidence}</p>}
            {Array.isArray(d.genes) && d.genes.length > 0 && (
              <p className="text-xs text-slate-400 mt-1">Genes: {d.genes.join(", ")}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Summary({ summary }) {
  if (!summary || typeof summary !== "object") return null;
  const { mainFunctions, biologicalContext, clinicalRelevance, novelInsights } = summary;
  const hasContent = biologicalContext || clinicalRelevance || novelInsights ||
    (Array.isArray(mainFunctions) && mainFunctions.length > 0);
  if (!hasContent) return null;

  return (
    <Card className="shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="w-5 h-5 text-amber-500" /> Interpretation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        {Array.isArray(mainFunctions) && mainFunctions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mainFunctions.map((f, i) => (
              <Badge key={i} className="bg-indigo-100 text-indigo-700">{f}</Badge>
            ))}
          </div>
        )}
        {biologicalContext && <p><strong>Biological context:</strong> {biologicalContext}</p>}
        {clinicalRelevance && <p><strong>Clinical relevance:</strong> {clinicalRelevance}</p>}
        {novelInsights && <p><strong>Novel insights:</strong> {novelInsights}</p>}
      </CardContent>
    </Card>
  );
}

export default function EnrichmentResults({ data, geneList = [], onReset }) {
  const hasAnything =
    data &&
    typeof data === "object" &&
    ((Array.isArray(data.pathways) && data.pathways.length > 0) ||
      (data.goTerms && Object.values(data.goTerms).some((v) => Array.isArray(v) && v.length > 0)) ||
      (Array.isArray(data.diseases) && data.diseases.length > 0) ||
      (data.summary && Object.keys(data.summary).length > 0));

  if (!hasAnything) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm text-slate-500">
            No enrichment results could be generated for this gene set. Try again or refine your gene list.
          </p>
          {onReset && (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="w-4 h-4 mr-1" /> Start over
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Activity className="w-4 h-4 text-indigo-600" />
          Analyzed {geneList.length} gene{geneList.length === 1 ? "" : "s"}
          {geneList.length > 0 && <span className="text-slate-400">: {geneList.join(", ")}</span>}
        </div>
        {onReset && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4 mr-1" /> New Analysis
          </Button>
        )}
      </div>

      <Summary summary={data.summary} />
      <PathwayTable pathways={data.pathways} />
      <GoSection goTerms={data.goTerms} />
      <DiseaseList diseases={data.diseases} />
    </div>
  );
}
