import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GitCompare, X, Dna, MapPin, Info, ExternalLink } from "lucide-react";
import {
  claimProvenanceRole,
  deriveRankingBasisFromClaims,
  evidenceClassPresence,
  partitionClaimsBySpecies,
  safeExternalHttpUrl,
} from "../../../../packages/shared/src/associationClaim.ts";
import PublicationState, { hasReusablePublicationContent } from "../shared/PublicationState";
import GeneNetwork from "./GeneNetwork";

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

function formatLocation(gene) {
  const chromosome = normalizeText(gene?.chromosome);
  if (!chromosome) return "Not recorded";
  const start = typeof gene?.start === "number" ? gene.start.toLocaleString() : null;
  const end = typeof gene?.end === "number" ? gene.end.toLocaleString() : null;
  return start && end ? `${chromosome}:${start}-${end}` : chromosome;
}

function intersection(lists) {
  if (lists.length === 0) return [];
  return [...lists[0]].filter((item) => lists.every((list) => list.has(item)));
}

function rankingLabel(value) {
  if (value === 'human_verified') return 'Human association evidence';
  if (value === 'animal_model') return 'Model-organism evidence';
  if (value === 'computational') return 'Computed association evidence';
  if (value === 'literature') return 'Literature-derived association evidence';
  return 'Unverified AI lead';
}

function sourceVersion(claim) {
  return claim.releaseVersion || 'release not recorded';
}

function retrievalLabel(claim) {
  return claim.retrievalDate || 'retrieval date not recorded';
}

function literatureEvidenceLabel(presence = {}) {
  const claims = presence.directClaims || 0;
  const components = presence.positiveScoreComponents || 0;
  const parts = [];
  if (claims > 0) parts.push(`${claims} claim${claims === 1 ? '' : 's'}`);
  if (components > 0) {
    parts.push(`${components} score component${components === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' + ') : '0';
}

function claimGroups(gene) {
  const claims = Array.isArray(gene?.associationClaims) ? gene.associationClaims : [];
  const partition = gene?.evidencePartition || partitionClaimsBySpecies(claims);
  const associationClaims = claims.filter((claim) => claimProvenanceRole(claim) === 'association_evidence');
  const metadataClaims = claims.filter((claim) => claimProvenanceRole(claim) === 'source_metadata');
  return { claims, partition, associationClaims, metadataClaims };
}

export default function GeneComparison({ genes = [], onClose }) {
  const comparison = useMemo(() => {
    const rows = genes.map((gene) => {
      const groups = claimGroups(gene);
      const candidateReusable = hasReusablePublicationContent(gene?.candidatePublication);
      const profileReusable = hasReusablePublicationContent(gene?.profilePublication)
        && gene?.profileStatus === 'available';
      return {
        gene,
        symbol: geneSymbol(gene),
        name: gene?.coordinatesVerified || candidateReusable ? normalizeText(gene?.name) : '',
        location: gene?.coordinatesVerified ? formatLocation(gene) : 'Not listed',
        phenotypes: profileReusable ? phenotypeNames(gene) : [],
        sources: sourceNames(gene),
        explanation: (candidateReusable ? normalizeText(gene?.explanation) : '')
          || (profileReusable ? normalizeText(gene?.aiSummary) : ''),
        rankingBasis: gene?.rankingBasis || deriveRankingBasisFromClaims(groups.claims),
        literaturePresence: evidenceClassPresence(groups.claims, 'literature'),
        ...groups,
      };
    });

    const phenotypeSets = rows
      .map((row) => new Set(row.phenotypes.map((item) => item.toLowerCase())));
    const sharedPhenotypeKeys = intersection(phenotypeSets);
    const sharedPhenotypes = sharedPhenotypeKeys
      .map((key) => rows.flatMap((row) => row.phenotypes).find((item) => item.toLowerCase() === key))
      .filter(Boolean);

    const totals = rows.reduce((acc, row) => {
      acc.human += row.partition.human?.length || 0;
      acc.animal += row.partition.animal?.length || 0;
      acc.computational += row.partition.computational?.length || 0;
      acc.literatureClaims += row.literaturePresence.directClaims;
      acc.literatureComponents += row.literaturePresence.positiveScoreComponents;
      return acc;
    }, {
      human: 0,
      animal: 0,
      computational: 0,
      literatureClaims: 0,
      literatureComponents: 0,
    });

    return { rows, sharedPhenotypes, totals };
  }, [genes]);

  if (genes.length < 2) {
    return (
      <Card className="border-blue-200 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-blue-600" />
            Gene Evidence Comparison
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
            <AlertDescription>Select at least two genes to compare source-grounded evidence.</AlertDescription>
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
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-blue-600" />
              Gene Evidence Comparison
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Human, model-organism, and computed claims stay separate; literature-derived source score parts remain labeled inside their computed claim.
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase text-slate-500">Selected genes</p>
              <p className="text-2xl font-bold text-slate-900">{genes.length}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-medium uppercase text-emerald-700">Human claims</p>
              <p className="text-2xl font-bold text-emerald-900">{comparison.totals.human}</p>
            </div>
            <div className="rounded-md border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-medium uppercase text-violet-700">Model-organism claims</p>
              <p className="text-2xl font-bold text-violet-900">{comparison.totals.animal}</p>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-medium uppercase text-blue-700">Computed claims</p>
              <p className="text-2xl font-bold text-blue-900">{comparison.totals.computational}</p>
            </div>
            <div className="rounded-md border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-medium uppercase text-violet-700">Literature evidence</p>
              <p className="text-lg font-bold text-violet-900">
                {literatureEvidenceLabel({
                  directClaims: comparison.totals.literatureClaims,
                  positiveScoreComponents: comparison.totals.literatureComponents,
                })}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Gene</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Current ranking basis</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Human</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Model organism</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Computed</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Literature evidence</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {comparison.rows.map((row) => (
                  <tr key={row.symbol}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-900">{row.symbol}</div>
                      {row.name && <div className="text-xs text-slate-500">{row.name}</div>}
                    </td>
                    <td className="px-4 py-3 align-top">{rankingLabel(row.rankingBasis)}</td>
                    <td className="px-4 py-3 align-top">{row.partition.human?.length || 0}</td>
                    <td className="px-4 py-3 align-top">{row.partition.animal?.length || 0}</td>
                    <td className="px-4 py-3 align-top">{row.partition.computational?.length || 0}</td>
                    <td className="px-4 py-3 align-top">{literatureEvidenceLabel(row.literaturePresence)}</td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {row.location}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <GeneNetwork symbols={comparison.rows.map((row) => row.symbol)} />

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Dna className="w-4 h-4 text-blue-600" />
                Claim-level evidence and provenance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {comparison.rows.map((row) => (
                <section key={row.symbol} aria-labelledby={`comparison-${row.symbol}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`comparison-${row.symbol}`} className="font-semibold text-slate-900">{row.symbol}</h3>
                    <Badge variant="outline">{rankingLabel(row.rankingBasis)}</Badge>
                  </div>

                  {row.associationClaims.length > 0 ? (
                    <ul className="mt-3 space-y-3">
                      {row.associationClaims.map((claim, index) => {
                        const directLink = safeExternalHttpUrl(claim.directLink);
                        return (
                          <li key={`${claim.source}:${claim.recordId || index}:${claim.evidenceType}`} className="rounded-md bg-slate-50 p-3">
                            <p className="text-sm text-slate-800">{claim.claim}</p>
                            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                              <div><dt className="inline font-semibold">Class:</dt> <dd className="inline">{claim.evidenceClass}</dd></div>
                              <div><dt className="inline font-semibold">Type:</dt> <dd className="inline">{claim.evidenceType}</dd></div>
                              <div><dt className="inline font-semibold">Species:</dt> <dd className="inline">{claim.species || 'not recorded'} ({claim.taxon || 'taxon not recorded'})</dd></div>
                              <div><dt className="inline font-semibold">Source:</dt> <dd className="inline">{claim.source}</dd></div>
                              <div><dt className="inline font-semibold">Release:</dt> <dd className="inline">{sourceVersion(claim)}</dd></div>
                              <div><dt className="inline font-semibold">Retrieved:</dt> <dd className="inline">{retrievalLabel(claim)}</dd></div>
                            </dl>
                            {Array.isArray(claim.scoreComponents) && claim.scoreComponents.length > 0 && (
                              <div className="mt-3 rounded border border-slate-200 bg-white p-2">
                                <p className="text-xs font-semibold text-slate-700">
                                  Source score components
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  Source-published parts of this computed claim, not calibrated probabilities.
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-slate-700">
                                  {claim.scoreComponents.map((component, componentIndex) => (
                                    <li key={`${component.id || 'component'}:${componentIndex}`}>
                                      {component.label || component.id || 'Unlabeled component'}:{' '}
                                      {Number.isFinite(component.score)
                                        ? component.score.toFixed(2)
                                        : 'not recorded'}
                                      {' · '}class {component.evidenceClass || 'not recorded'}
                                      {' · '}scale {component.scale || 'not recorded'}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {directLink ? (
                              <a
                                href={directLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                              >
                                Open source record <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <p className="mt-2 text-xs text-slate-500">Direct source link not recorded.</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">
                      No source-grounded gene-query association claim is loaded. This candidate remains an AI lead.
                    </p>
                  )}

                  {row.metadataClaims.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">
                        Source metadata and follow-up records ({row.metadataClaims.length})
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                        {row.metadataClaims.map((claim, index) => (
                          <li key={`${claim.evidenceType}:${claim.recordId || index}`}>{claim.claim}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Shared phenotype annotations</CardTitle>
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
                  <p className="text-sm text-slate-600">No shared phenotype annotations are present in the loaded records.</p>
                )}
              </CardContent>
            </Card>

            <Alert role="note" className="border-amber-200 bg-amber-50">
              <Info className="h-4 w-4 text-amber-700" />
              <AlertDescription className="text-amber-900">
                Claim counts are not calibrated probabilities. Review source design, contradictions, tissue/context, release, and missingness before using a lead in research planning.
              </AlertDescription>
            </Alert>
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

export const __test = {
  claimGroups,
  geneSymbol,
  literatureEvidenceLabel,
  rankingLabel,
};
