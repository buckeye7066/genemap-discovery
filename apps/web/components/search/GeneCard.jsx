import React, { useState, memo } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import DnaIcon from "../icons/DnaIcon";
import {
  MapPin,
  Tag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  Info
} from "lucide-react";
import { exportGeneReport, exportJSON, copyShareableLink } from "../../lib/exportUtils";
import {
  claimProvenanceRole,
  groupScoreComponents,
  explainGeneRanking,
  RANKING_EXCLUSION_TEXT,
  RANKING_ROLE_TEXT,
  deriveRankingBasisFromClaims,
  partitionClaimsBySpecies,
  safeExternalHttpUrl,
} from "../../../../packages/shared/src/associationClaim.ts";
import { Download, Copy, Printer } from "lucide-react";
import PublicationState, { hasReusablePublicationContent } from "../shared/PublicationState";

// Session-scoped set of gene views already logged, so a (re)mount doesn't
// re-POST the same gene_view activity. Module-level on purpose: shared across
// every GeneCard instance.
const loggedGeneViews = new Set();
const MAX_ACTIVITY_ATTEMPTS = 3;
const ACTIVITY_RETRY_BASE_MS = 250;

// One colour vocabulary for the evidence classes, so a score component reads as
// the SAME kind of thing as the claim badge carrying that class. Keeping these
// visually distinct is the whole point: a reader must be able to see that a
// ranking was driven by animal-model evidence rather than human evidence.
const EVIDENCE_CLASS_STYLE = {
  human_verified: { bar: 'bg-emerald-500', text: 'text-emerald-900', label: 'Human' },
  animal_model: { bar: 'bg-orange-500', text: 'text-orange-900', label: 'Animal model' },
  literature: { bar: 'bg-violet-500', text: 'text-violet-900', label: 'Literature' },
  computational: { bar: 'bg-sky-500', text: 'text-sky-900', label: 'Computational' },
  external_followup: { bar: 'bg-slate-400', text: 'text-slate-700', label: 'Follow-up' },
  ai_lead: { bar: 'bg-amber-500', text: 'text-amber-900', label: 'AI lead' },
};

function evidenceClassStyle(evidenceClass) {
  return EVIDENCE_CLASS_STYLE[evidenceClass] || EVIDENCE_CLASS_STYLE.computational;
}

/**
 * Render a source's score AS ITS PARTS.
 *
 * The rolled-up aggregate never reaches this component - the API refuses to
 * publish one. What arrives is the decomposition, each part naming the evidence
 * class behind it, so a reader can see what produced the ranking instead of
 * being handed one unexplained number.
 *
 * A component that the source did not state is simply absent. It is never drawn
 * as a 0.00 bar, which would read as "measured and found to be nothing".
 */
function ScoreDecomposition({ components, scale }) {
  if (!Array.isArray(components) || components.length === 0) return null;
  const groups = groupScoreComponents(components);
  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
      <p className="text-[11px] font-medium text-slate-700">
        What produced this score
      </p>
      <p className="text-[10px] text-slate-500 mb-2">
        Source-published components, not a GeneMap calculation. Only the parts the
        source actually stated are shown{scale ? ` (scale: ${scale})` : ''}.
      </p>
      <ul className="space-y-1.5">
        {[...groups.entries()].map(([evidenceClass, parts]) => {
          const style = evidenceClassStyle(evidenceClass);
          return parts.map((component) => (
            <li key={`${evidenceClass}-${component.id}`} className="flex items-center gap-2">
              <span className={`w-28 shrink-0 text-[10px] font-medium ${style.text}`}>
                {component.label}
              </span>
              <span
                className="h-1.5 flex-1 rounded bg-slate-200 overflow-hidden"
                role="img"
                aria-label={`${component.label}: ${component.score.toFixed(2)} from ${style.label} evidence`}
              >
                <span
                  className={`block h-full rounded ${style.bar}`}
                  style={{ width: `${Math.round(component.score * 100)}%` }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-700">
                {component.score.toFixed(2)}
              </span>
              <Badge variant="outline" className={`text-[9px] ${style.text}`}>
                {style.label}
              </Badge>
            </li>
          ));
        })}
      </ul>
    </div>
  );
}

/**
 * "Why this gene?" and "What would change this ranking?"
 *
 * GeneMap's rank is GeneMap's opinion about which kinds of evidence outrank
 * which. It is therefore shown the same way a source score is: broken into the
 * inputs that produced it, and attributed to whoever produced it. Claims that
 * contributed nothing are listed WITH the reason - a rank whose losers are
 * hidden reads as arbitrary even when it is correct.
 */
function RankingExplanation({ claims }) {
  const explanation = explainGeneRanking(claims);
  if (explanation.contributions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <h5 className="text-xs font-semibold text-slate-900">Why this gene?</h5>
      <p className="text-[11px] text-slate-500 mb-2">{explanation.attribution}</p>

      {explanation.restsOnNothingRetrieved && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
          Nothing retrieved supports this gene for this query yet. It is on the list as a
          research lead only.
        </p>
      )}

      {/* The rank is the HIGHEST-ranking claim, not a total. Saying so stops the
          list below from reading as an additive breakdown. */}
      <p className="text-[11px] text-slate-500 mb-2">
        The rank is the highest-ranking claim, not a total of them.
      </p>

      <ul className="space-y-1">
        {explanation.contributions.map((row, idx) => {
          const determines = row.role === 'determines_rank';
          const tied = row.role === 'tied_for_rank';
          const topTier = determines || tied;
          const inert = row.role === 'cannot_contribute';
          const identity = row.recordId || row.claim;
          return (
            <li
              key={`${row.source}-${row.evidenceType}-${identity || idx}`}
              className="flex items-start gap-2 text-[11px]"
            >
              <span
                className={`w-9 shrink-0 text-right tabular-nums font-medium ${
                  inert ? 'text-slate-400' : evidenceClassStyle(row.evidenceClass).text
                }`}
              >
                {row.contribution}
              </span>
              <span className="flex-1">
                <span className={inert ? 'text-slate-500' : 'text-slate-800'}>
                  {displayClaimValue(row.source)}
                </span>
                {/* One provider can return several claims (the Monarch
                    ortholog grid returns up to three under one name), so every
                    row carries a record id or the claim text as a visible
                    fallback identity. */}
                <span className="text-slate-500">
                  {' · '}{displayClaimValue(row.evidenceType)}
                  {' · '}{displayClaimValue(identity, 'Claim identity not recorded')}
                </span>
                {topTier && (
                  <Badge className="ml-1 text-[9px] bg-slate-900 text-white border-slate-900">
                    {RANKING_ROLE_TEXT[row.role]}
                  </Badge>
                )}
                {row.role === 'considered_lower' && (
                  <span className="block text-slate-500">
                    {RANKING_ROLE_TEXT.considered_lower}
                  </span>
                )}
                {inert && row.excludedBecause && (
                  <span className="block text-slate-500">
                    {RANKING_EXCLUSION_TEXT[row.excludedBecause]}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {explanation.improvements.length > 0 && (
        <>
          <h5 className="text-xs font-semibold text-slate-900 mt-3">
            What would change this ranking?
          </h5>
          <ul className="mt-1 space-y-1">
            {explanation.improvements.map((improvement) => (
              <li key={improvement.evidenceClass} className="text-[11px] text-slate-600">
                {improvement.statement}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-slate-500 italic">
            {explanation.positionCaveat}
          </p>
        </>
      )}
    </div>
  );
}

function displayClaimValue(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return String(value);
}

function aiLeadStatus(claim) {
  if (claim?.isAiLead === true) return 'true';
  if (claim?.isAiLead === false) return 'false';
  return 'not recorded';
}

function provenanceRoleLabel(claim) {
  const role = claimProvenanceRole(claim);
  if (role === 'association_evidence') return 'Association evidence';
  if (role === 'ai_candidate_lead') return 'AI candidate lead (Unverified)';  // <== Enhanced UI to indicate unverified AI leads
  return 'Identity / ontology / follow-up metadata';
}

function groundedEvidenceSummary(partition = {}) {
  const associationCount = (list) =>
    (list || []).filter((c) => claimProvenanceRole(c) === 'association_evidence').length;
  const entries = [
    ['human', associationCount(partition.human)],
    ['model-organism', associationCount(partition.animal)],
    ['computed', associationCount(partition.computational)],
  ].filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return entries
    .map(([label, count]) => `${count} ${label} claim${count === 1 ? '' : 's'}`)
    .join(', ');
}

function GeneCard({ gene, rank, isSelected = false, onSelect = null }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { user } = useAuth();

  React.useEffect(() => {
    const geneSymbol = gene?.symbol;
    if (!geneSymbol) return undefined;

    const viewKey = `${user?.email || 'anon'}:${geneSymbol}`;
    let cancelled = false;
    let retryTimer = null;

    const logGeneView = async (attempt = 1) => {
      if (cancelled || loggedGeneViews.has(viewKey)) return;
      loggedGeneViews.add(viewKey);
      try {
        await apiClient.logActivity({
          activityType: "gene_view",
          entityType: "gene",
          entityId: geneSymbol,
          metadata: {
            gene_symbol: geneSymbol,
            ranking_basis: gene.rankingBasis || null,
            phenotypes: gene.phenotypes?.map(p => p.name) || []
          }
        });
      } catch (err) {
        // Do not poison session de-duplication after a failed write. Retry while
        // this card remains mounted, with a strict cap and exponential delay.
        loggedGeneViews.delete(viewKey);
        if (!cancelled && attempt < MAX_ACTIVITY_ATTEMPTS) {
          const delay = ACTIVITY_RETRY_BASE_MS * (2 ** (attempt - 1));
          retryTimer = setTimeout(() => {
            void logGeneView(attempt + 1);
          }, delay);
        } else if (!cancelled) {
          console.log("Could not track activity after bounded retries:", err);
        }
      }
    };

    void logGeneView();
    return function cleanup() {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [gene?.symbol, user?.email]);

  const claims = Array.isArray(gene.associationClaims) ? gene.associationClaims : [];
  // Use the shared partition contract so isAiLead always takes precedence over
  // contradictory evidenceClass/taxon fields in both data and fallback paths.
  const partition = gene.evidencePartition || partitionClaimsBySpecies(claims);
  const rankingBasis = gene.rankingBasis || deriveRankingBasisFromClaims(claims);
  const sourceEvidenceSummary = groundedEvidenceSummary(partition);
  const rankingLabel = rankingBasis === 'human_verified'
    ? 'Human-verified association evidence'
    : rankingBasis === 'computational'
      ? 'Computational association evidence'
      : rankingBasis === 'animal_model'
        ? 'Animal-model association evidence'
        : 'AI research lead';
  const rankingColor = rankingBasis === 'human_verified'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : rankingBasis === 'computational'
      ? 'bg-sky-100 text-sky-800 border-sky-200'
      : rankingBasis === 'animal_model'
        ? 'bg-orange-100 text-orange-800 border-orange-200'
        : 'bg-amber-100 text-amber-800 border-amber-200';
  const RankingIcon = rankingBasis === 'human_verified' ? CheckCircle
    : rankingBasis === 'computational' ? Info
      : rankingBasis === 'animal_model' ? Info
        : AlertTriangle;
  const candidateContentIsReusable = hasReusablePublicationContent(gene.candidatePublication);
  const profileContentIsReusable = hasReusablePublicationContent(gene.profilePublication)
    && gene.profileStatus === 'available';
  const displayName = gene.coordinatesVerified || candidateContentIsReusable ? gene.name : null;
  const candidateExplanation = candidateContentIsReusable ? gene.explanation : null;
  const profilePhenotypes = profileContentIsReusable && Array.isArray(gene.phenotypes)
    ? gene.phenotypes
    : [];
  const profileTakeaways = profileContentIsReusable && Array.isArray(gene.keyTakeaways)
    ? gene.keyTakeaways
    : [];

  return (
    <Card className={`shadow-md hover:shadow-lg transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50/30' : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {onSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                className="mt-1"
              />
            )}
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl font-bold text-blue-600">
              {rank}
            </div>
            <div>
              <CardTitle className="text-xl text-slate-900 flex items-center gap-2">
                <DnaIcon className="w-5 h-5 text-blue-600" />
                {gene.symbol}
              </CardTitle>
              {displayName && <p className="text-slate-600 text-sm">{displayName}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className={`${rankingColor} flex items-center gap-1`}>
              <RankingIcon className="w-3 h-3" />
              {rankingLabel}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              title="Export report"
              onClick={(e) => { e.stopPropagation(); exportGeneReport(gene); }}
            >
              <Printer className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Download JSON"
              onClick={(e) => { e.stopPropagation(); exportJSON(gene, `gene-${gene.symbol}`); }}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Copy summary"
              onClick={async (e) => { e.stopPropagation(); await copyShareableLink(gene, 'gene'); }}
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <PublicationState artifact={gene.candidatePublication} className="mb-4" />
        {isExpanded && (
          <div className="mb-4 bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-start gap-2">
              <RankingIcon className="w-5 h-5 mt-0.5 flex-shrink-0 text-slate-600" />
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-2">
                  Association-ranking basis
                </h4>
                <div className="text-sm text-slate-600">
                  <p className="mb-2">
                    Ranked by genuine gene-query association evidence (<strong>{rankingLabel}</strong>),
                    not by LLM self-scores, verified gene identity, coordinates, ontology records, or
                    database links. AI leads are research suggestions only, not diagnosis, personal risk,
                    treatment, or calibrated evidence grades.
                  </p>
                  {candidateExplanation && (
                    <p className="text-xs text-slate-500 italic">
                      {candidateExplanation}
                    </p>
                  )}
                  <RankingExplanation claims={claims} />
                </div>
              </div>
            </div>
          </div>
        )}

        {claims.length > 0 && (
          <div className="mb-4 border border-slate-200 rounded-lg p-3 bg-white" data-testid="association-claims">
            <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4" />
              Evidence and source provenance
            </h4>
            <p className="text-[11px] text-slate-500 mb-3">
              Each row states whether it is association evidence, an AI candidate lead, or source metadata.
              Identity, coordinate, ontology, and follow-up records do not verify a gene-query association.
            </p>
            <ul className="space-y-3">
              {claims.map((claim, idx) => {
                const safeLink = safeExternalHttpUrl(claim?.directLink);
                const role = claimProvenanceRole(claim);
                return (
                  <li key={`${claim.source}-${claim.recordId || idx}`} className="text-xs text-slate-700 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex flex-wrap gap-1 mb-2">
                      <Badge
                        className={role === 'association_evidence'
                          ? 'text-[10px] bg-emerald-100 text-emerald-900 border-emerald-200'
                          : role === 'ai_candidate_lead'
                            ? 'text-[10px] bg-amber-100 text-amber-900 border-amber-200'
                            : 'text-[10px] bg-slate-100 text-slate-800 border-slate-200'}
                      >
                        {provenanceRoleLabel(claim)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{displayClaimValue(claim.evidenceClass)}</Badge>
                      <Badge variant="outline" className="text-[10px]" title="Evidence type">
                        {displayClaimValue(claim.evidenceType)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" title="Evidence strength">
                        {displayClaimValue(claim.evidenceStrength)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" title="Species">
                        {displayClaimValue(claim.species)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" title="Taxon">
                        taxon {displayClaimValue(claim.taxon)}
                      </Badge>
                    </div>
                    <p className="font-medium text-slate-800">{displayClaimValue(claim.claim, 'Claim text not recorded')}</p>
                    <p className="text-xs text-slate-600">Provenance: {displayClaimValue(claim.provenance, 'Provenance not recorded')}</p>
                    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-slate-600">
                      <div><dt className="inline font-medium">Source: </dt><dd className="inline">{displayClaimValue(claim.source)}</dd></div>
                      <div><dt className="inline font-medium">Record ID: </dt><dd className="inline">{displayClaimValue(claim.recordId)}</dd></div>
                      <div><dt className="inline font-medium">Source release/version: </dt><dd className="inline">{displayClaimValue(claim.releaseVersion)}</dd></div>
                      <div><dt className="inline font-medium">Reference assembly: </dt><dd className="inline">{displayClaimValue(claim.referenceAssembly)}</dd></div>
                      <div><dt className="inline font-medium">Adapter retrieval date: </dt><dd className="inline">{displayClaimValue(claim.retrievalDate)}</dd></div>
                      <div><dt className="inline font-medium">AI lead: </dt><dd className="inline">{aiLeadStatus(claim)}</dd></div>
                    </dl>
                    <ScoreDecomposition
                      components={claim.scoreComponents}
                      scale={claim.scoreComponents?.[0]?.scale || null}
                    />
                    {safeLink ? (
                      <a
                        href={safeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open source record
                      </a>
                    ) : (
                      <span className="inline-block text-slate-500 mt-1">No validated HTTP(S) source link recorded</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {(partition.animal?.length > 0 || partition.external?.length > 0) && (
              <p className="text-[11px] text-slate-500 mt-2">
                External database links are follow-up sources, not automatic claim-level citations.
                Animal-model rows are displayed separately from human evidence.
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            {gene.coordinatesVerified ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Location:</span>
                  <span className="text-slate-600">
                    {gene.chromosome}:{gene.start?.toLocaleString()}-{gene.end?.toLocaleString()}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {gene.genomeBuild}
                  </Badge>
                  <Badge className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-200">
                    ✓ Ensembl/NCBI
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Verified IDs:</span>
                  <span className="text-slate-600">
                    {gene.entrezId && `ENTREZ:${gene.entrezId}`}
                    {gene.entrezId && gene.ensemblId && " | "}
                    {gene.ensemblId}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <MapPin className="w-4 h-4" />
                <span>Authoritative coordinates and identifiers unavailable</span>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4 text-slate-500" />
              <span className="font-medium">Sources:</span>
              <div className="flex gap-1">
                {(gene.sources || []).map((source, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {source}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Provenance: location/IDs are shown only after authoritative
            verification. Phenotype HP: ids are validated against HPO;
            unmatched/model-supplied identifiers are dropped. */}
        {gene.coordinatesVerified ? (
          <div className="mb-4 flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Coordinates &amp; IDs verified</strong> against MyGene.info (Ensembl/NCBI).{' '}
              {sourceEvidenceSummary ? (
                <>
                  Source-grounded association rows are shown separately ({sourceEvidenceSummary}).
                  The AI candidate lead, AI summary, and candidate phenotype terms remain model-generated
                  unless a provenance row identifies their source
                  {gene.hpoChecked ? "; HP: identifiers shown are term-validated" : ""}.
                </>
              ) : (
                <>
                  No source-grounded gene-query association was attached. The candidate association,
                  summary, and phenotype terms remain AI-generated research leads
                  {gene.hpoChecked ? "; HP: identifiers shown are term-validated" : ""}.
                </>
              )}{' '}
              Review the cited record, study design, context, contradictions, and limitations before
              research use; never use this output for diagnosis or clinical decisions.
            </span>
          </div>
        ) : (
          <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Authoritative identity metadata unavailable.</strong> Coordinates and identifiers
              are withheld.{' '}
              {sourceEvidenceSummary ? (
                <>
                  Separate source-grounded association rows are still shown ({sourceEvidenceSummary});
                  they do not validate the missing identity fields. The AI summary and candidate terms
                  remain model-generated.
                </>
              ) : (
                <>
                  No source-grounded association record was attached, so the candidate, summary, and
                  phenotype terms remain unverified AI research leads.
                </>
              )}{' '}
              Review primary records before research use and never use this output clinically.
            </span>
          </div>
        )}

        <div className="mb-4">
          <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Candidate Phenotype Terms
          </h4>
          <div className="flex flex-wrap gap-2">
            {profilePhenotypes.slice(0, 5).map((phenotype, idx) => (
              <Badge key={idx} variant="secondary" className="text-sm">
                {phenotype.name}
                {phenotype.hpoId && (
                  <span className={`ml-1 text-xs ${phenotype.hpoVerified ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                    ({phenotype.hpoId}{phenotype.hpoVerified ? " ✓" : ""})
                  </span>
                )}
              </Badge>
            ))}
            {profilePhenotypes.length > 5 && (
              <Badge variant="outline" className="text-sm">
                +{profilePhenotypes.length - 5} more
              </Badge>
            )}
            {profilePhenotypes.length === 0 && (
              <span className="text-sm text-slate-500 italic">
                {gene.detailsPending
                  ? 'Loading phenotype data...'
                  : 'No candidate phenotype terms are available for this research lead.'}
              </span>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100 mb-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 mb-2">AI Insights</h4>
              <PublicationState artifact={gene.profilePublication} className="mb-3" />
              {!gene.profilePublication && !gene.detailsPending && (
                <div className="mb-3 rounded-md border border-slate-300 bg-white/70 px-3 py-2 text-xs text-slate-700" data-publication-status="unavailable">
                  <strong>Profile publication unavailable.</strong> No generated profile content is reusable for this gene.
                </div>
              )}
              <p className="text-blue-800 text-sm leading-relaxed mb-3">
                {(profileContentIsReusable ? gene.aiSummary : null) || (gene.detailsPending
                  ? <span className="italic text-blue-500">Generating a detailed summary for {gene.symbol}…</span>
                  : <span className="italic text-blue-700">No reusable generated profile is available.</span>)}
              </p>
              
              {profileTakeaways.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <h5 className="text-xs font-semibold text-blue-900 uppercase mb-2">Key Takeaways</h5>
                  <ul className="space-y-1">
                    {profileTakeaways.map((takeaway, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-blue-800">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {gene.furtherReading && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
            <div className="flex items-start gap-2">
              <BookOpen className="w-5 h-5 text-slate-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-2">Further Reading</h4>
                <div className="space-y-2">
                  {gene.furtherReading.resources && gene.furtherReading.resources.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Recommended Resources:</p>
                      <div className="flex flex-wrap gap-2">
                        {gene.furtherReading.resources.map((resource, idx) => {
                          const safeUrl = safeExternalHttpUrl(resource?.url);
                          return safeUrl ? (
                            <a
                              key={idx}
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {resource.name}
                            </a>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {gene.furtherReading.pubmedSearchTerms && gene.furtherReading.pubmedSearchTerms.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">PubMed Search Terms:</p>
                      <div className="flex flex-wrap gap-2">
                        {gene.furtherReading.pubmedSearchTerms.map((term, idx) => (
                          <a
                            key={idx}
                            href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-white border border-slate-300 hover:border-green-400 hover:bg-green-50 px-2 py-1 rounded transition-colors"
                          >
                            "{term}"
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


      </CardContent>
    </Card>
  );
}

export const __test = { groundedEvidenceSummary };

export default memo(GeneCard);
