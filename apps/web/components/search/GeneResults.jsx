import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DnaIcon from "../icons/DnaIcon";
import {
  CheckSquare,
  Database,
  Loader2,
  Microscope,
  MousePointer2,
  ShieldQuestion,
} from "lucide-react";
import GeneCard from "./GeneCard";
import GeneFilters from "./GeneFilters";
import { fetchAssociationEvidence } from "@/lib/associationEvidenceClient";
import { resolvePublicationSearchReference } from "@/lib/publicationConceptCatalog";
import {
  deriveRankingBasisFromClaims,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  claimSortKey,
} from "../../../../packages/shared/src/associationClaim.ts";

function queryReferenceForResults(query, queryType) {
  const mode = queryType === 'disease'
    ? 'disease'
    : queryType === 'phenotype'
      ? 'phenotype'
      : 'free_text';
  return resolvePublicationSearchReference(query, mode, null);
}

function claimKey(claim = {}) {
  return [
    claim.source,
    claim.recordId,
    claim.evidenceType,
    claim.taxon,
    claim.claim,
  ].map((value) => String(value || '')).join('|');
}

function mergeAssociationEvidence(genes, evidence) {
  const claimsByGene = evidence?.claimsByGene && typeof evidence.claimsByGene === 'object'
    ? evidence.claimsByGene
    : {};
  const merged = (genes || []).map((gene) => {
    const existing = Array.isArray(gene.associationClaims) ? gene.associationClaims : [];
    const sourceClaims = Array.isArray(claimsByGene[gene.symbol])
      ? claimsByGene[gene.symbol]
      : [];
    const seen = new Set();
    const associationClaims = [...sourceClaims, ...existing].filter((claim) => {
      const key = claimKey(claim);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const sources = [...new Set([
      ...(Array.isArray(gene.sources) ? gene.sources : []),
      ...sourceClaims.map((claim) => claim?.source).filter(Boolean),
    ])];
    return {
      ...gene,
      sources,
      associationClaims,
      evidencePartition: partitionClaimsBySpecies(associationClaims),
      rankingBasis: deriveRankingBasisFromClaims(associationClaims),
      associationEvidenceStatus: evidence?.sourceStatus || 'unavailable',
    };
  });
  return rankGenesByProvenance(merged);
}

function summarizeEvidence(genes) {
  const counts = {
    human: 0,
    animal: 0,
    computational: 0,
    aiLead: 0,
  };
  for (const gene of genes || []) {
    const partition = gene.evidencePartition || partitionClaimsBySpecies(gene.associationClaims || []);
    // Count only genuine association evidence (exclude identity/ontology/follow-up and AI leads)
    if ((partition.human || []).some((claim) => claimSortKey(claim) > 0)) counts.human += 1;
    if ((partition.animal || []).some((claim) => claimSortKey(claim) > 0)) counts.animal += 1;
    if ((partition.computational || []).some((claim) => claimSortKey(claim) > 0)) counts.computational += 1;
    if (partition.aiLeads?.length) counts.aiLead += 1;
  }
  return counts;
}

function geneMatchesEvidenceBasis(gene, evidenceBasis = 'all') {
  if (!evidenceBasis || evidenceBasis === 'all') return true;
  const claims = Array.isArray(gene?.associationClaims) ? gene.associationClaims : [];
  const partition = gene?.evidencePartition || partitionClaimsBySpecies(claims);
  const hasHuman = (partition.human || []).some((claim) => claimSortKey(claim) > 0);
  const hasAnimal = (partition.animal || []).some((claim) => claimSortKey(claim) > 0);
  const hasComputational = (partition.computational || []).some((claim) => claimSortKey(claim) > 0);

  if (evidenceBasis === 'human') return hasHuman;
  if (evidenceBasis === 'animal') return hasAnimal;
  if (evidenceBasis === 'computational') return hasComputational;
  if (evidenceBasis === 'unverified') return !hasHuman && !hasAnimal && !hasComputational;
  return true;
}

function geneMatchesFilters(gene, filters = {}) {
  if (filters.symbol && !gene.symbol?.toLowerCase().includes(filters.symbol.toLowerCase())) {
    return false;
  }

  if (filters.name && !gene.name?.toLowerCase().includes(filters.name.toLowerCase())) {
    return false;
  }

  if (filters.chromosome && filters.chromosome !== "All") {
    const geneChromosome = gene.genomic_pos?.chr?.toString() || gene.chromosome?.toString() || "";
    if (geneChromosome !== filters.chromosome) return false;
  }

  if (filters.phenotype) {
    if (!Array.isArray(gene.phenotypes)) return false;
    const needle = filters.phenotype.toLowerCase();
    const phenotypeMatch = gene.phenotypes.some((phenotype) => {
      const label = typeof phenotype === 'string' ? phenotype : phenotype?.name;
      return label?.toLowerCase().includes(needle);
    });
    if (!phenotypeMatch) return false;
  }

  return geneMatchesEvidenceBasis(gene, filters.evidenceBasis);
}

export default function GeneResults({
  results,
  selectedGenes = [],
  onGeneSelect,
  onEvidenceGenesChange,
}) {
  const { query, candidateGenes, isPremium, queryType, publicationReference } = results;
  const [filters, setFilters] = useState({
    symbol: "",
    name: "",
    chromosome: "All",
    phenotype: "",
    evidenceBasis: "all",
  });
  const [evidenceState, setEvidenceState] = useState({
    status: 'idle',
    result: null,
  });

  const selectedSymbolSet = useMemo(
    () => new Set(selectedGenes.map((gene) => gene.symbol)),
    [selectedGenes]
  );

  const handleGeneSelect = useCallback(
    (gene) => { if (onGeneSelect) onGeneSelect(gene); },
    [onGeneSelect]
  );

  const candidateSymbolKey = useMemo(
    () => (candidateGenes || []).map((gene) => gene.symbol).filter(Boolean).join('|'),
    [candidateGenes],
  );

  useEffect(() => {
    const symbols = candidateSymbolKey ? candidateSymbolKey.split('|') : [];
    const reference = publicationReference || queryReferenceForResults(query, queryType);
    if (!reference || symbols.length === 0) {
      setEvidenceState({ status: 'unavailable', result: null });
      return undefined;
    }

    let active = true;
    // Never retain evidence from a previous phenotype while a new source query
    // is in flight, even when some candidate symbols overlap.
    setEvidenceState({ status: 'loading', result: null });
    fetchAssociationEvidence(reference, symbols).then((result) => {
      if (!active) return;
      setEvidenceState({
        status: result.sourceStatus || 'unavailable',
        result,
      });
    });
    return () => {
      active = false;
    };
  }, [candidateSymbolKey, query, queryType, publicationReference]);

  const evidenceGenes = useMemo(
    () => mergeAssociationEvidence(candidateGenes, evidenceState.result),
    [candidateGenes, evidenceState.result],
  );
  const evidenceSummary = useMemo(
    () => summarizeEvidence(evidenceGenes),
    [evidenceGenes],
  );

  useEffect(() => {
    if (onEvidenceGenesChange) onEvidenceGenesChange(evidenceGenes);
  }, [evidenceGenes, onEvidenceGenesChange]);

  const sourceHealth = useMemo(() => {
    const sources = evidenceState.result?.sources || {};
    return Object.entries(sources).map(([key, source]) => ({
      key,
      label: key === 'openTargets' ? 'Open Targets' : key === 'myGene' ? 'MyGene identity' : 'Monarch',
      status: source?.status || 'unavailable',
      truncated: source?.truncated === true,
      retrievedAt: source?.retrievedAt || null,
    }));
  }, [evidenceState.result?.sources]);

  const filteredGenes = useMemo(
    () => evidenceGenes.filter((gene) => geneMatchesFilters(gene, filters)),
    [evidenceGenes, filters],
  );

  const handleClearFilters = () => {
    setFilters({
      symbol: "",
      name: "",
      chromosome: "All",
      phenotype: "",
      evidenceBasis: "all",
    });
  };

  const getQueryTypeLabel = () => {
    if (queryType === 'disease') {
      return '🩺 Disease Candidate Evidence';
    }
    if (queryType === 'hpo_term') {
      return '🧬 HPO Candidate Evidence';
    }
    return '🔬 Phenotype Candidate Evidence';
  };

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <Card className="bg-white/90 backdrop-blur-sm shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl text-slate-900 flex items-center gap-2">
                <DnaIcon className="w-6 h-6 text-blue-600" />
                {getQueryTypeLabel()}
              </CardTitle>
              <p className="text-slate-600 mt-1">
                Generated {(candidateGenes || []).length} AI candidate leads to verify for "{query}"
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              <ShieldQuestion className="w-3 h-3 mr-1" />
              {evidenceSummary.aiLead} AI lead{evidenceSummary.aiLead === 1 ? '' : 's'}
            </Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">
              <Database className="w-3 h-3 mr-1" />
              {evidenceSummary.human} with human association evidence
            </Badge>
            <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200">
              <MousePointer2 className="w-3 h-3 mr-1" />
              {evidenceSummary.animal} with model-organism evidence
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200">
              <Microscope className="w-3 h-3 mr-1" />
              {evidenceSummary.computational} with computed evidence
            </Badge>
            {onGeneSelect && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <CheckSquare className="w-3 h-3 mr-1" />
                Select to Compare
              </Badge>
            )}
          </div>

          {evidenceState.status === 'loading' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking source-grounded human, model-organism, and computational associations…
            </div>
          )}
          {evidenceState.status === 'available' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              {evidenceState.result?.claimCount || 0} source-grounded association claim{evidenceState.result?.claimCount === 1 ? '' : 's'} retrieved. Each card shows source, record, species, evidence type, release status, retrieval date, and limitations.
            </div>
          )}
          {evidenceState.status === 'partial_coverage' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
              Source coverage was incomplete because at least one provider was unavailable or returned only a bounded window. Claims that were retrieved are shown, but absence from this result is not evidence that no association exists.
            </div>
          )}
          {evidenceState.status === 'no_matching_associations' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
              Every applicable source completed within its declared coverage bound and returned no matching association record for these candidate symbols. They remain unverified AI research leads.
            </div>
          )}
          {(evidenceState.status === 'unavailable' || evidenceState.status === 'unresolved_query') && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" role="status">
              Association sources are unavailable or the reviewed reference could not be revalidated. No negative conclusion was drawn and no candidate was promoted; all remain AI research leads.
            </div>
          )}
          {sourceHealth.length > 0 && evidenceState.status !== 'loading' && (
            <dl className="grid gap-2 sm:grid-cols-2" aria-label="Association source health">
              {sourceHealth.map((source) => (
                <div key={source.key} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-semibold text-slate-900">{source.label}</dt>
                    <dd className="font-medium">
                      {source.status === 'not_applicable' ? 'Not applicable'
                        : source.status === 'available' ? 'Available'
                          : source.status === 'partial' ? 'Partial coverage'
                            : 'Unavailable'}
                    </dd>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {source.truncated ? 'Bounded result window; absence is inconclusive.'
                      : source.retrievedAt ? `Retrieved ${new Date(source.retrievedAt).toLocaleString()}`
                        : 'No successful source retrieval recorded.'}
                  </p>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <GeneFilters
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={handleClearFilters}
        resultCount={filteredGenes.length}
      />

      {/* Gene Cards */}
      {filteredGenes.length === 0 ? (
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-900 font-medium mb-2">No genes match your filters</p>
            <p className="text-sm text-amber-700">Try adjusting or clearing your filter criteria</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGenes.map((gene, index) => (
            <GeneCard
              key={gene.symbol}
              gene={gene}
              rank={index + 1}
              isPremium={isPremium}
              isSelected={selectedSymbolSet.has(gene.symbol)}
              onSelect={onGeneSelect ? handleGeneSelect : null}
            />
          ))}
        </div>
      )}

      {/* Search Tips */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-6">
          <h4 className="font-medium text-slate-900 mb-3">How to interpret these results</h4>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• The candidate list begins as bounded AI research leads, not findings or diagnoses.</li>
            <li>• Human, model-organism, and computed claims are shown separately and may disagree.</li>
            <li>• Identity records and HPO term validation do not prove a gene-query association.</li>
            <li>• Missing source version, record, date, or link remains visibly “Not recorded.”</li>
            <li>• Open each source record and review study design, context, contradictions, and limitations.</li>
            {onGeneSelect && <li>• Select multiple genes to compare their evidence side by side.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export const __test = {
  claimKey,
  geneMatchesEvidenceBasis,
  geneMatchesFilters,
  mergeAssociationEvidence,
  queryReferenceForResults,
  summarizeEvidence,
};
