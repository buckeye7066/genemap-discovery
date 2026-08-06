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
  TrendingUp,
  AlertTriangle,
  Info
} from "lucide-react";
import { exportGeneReport, exportJSON, copyShareableLink } from "../../lib/exportUtils";
import { Download, Copy, Printer } from "lucide-react";

// Session-scoped set of gene views already logged, so a (re)mount doesn't
// re-POST the same gene_view activity. Module-level on purpose: shared across
// every GeneCard instance.
const loggedGeneViews = new Set();

function GeneCard({ gene, rank, isSelected = false, onSelect = null }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { user } = useAuth();

  React.useEffect(() => {
    // Track gene view activity
    if (gene && gene.symbol) {
      trackGeneView(gene.symbol);
    }
  }, [gene?.symbol, user?.email]);

  const trackGeneView = async (geneSymbol) => {
    // De-dupe within the session: the same gene_view was being POSTed on every
    // (re)mount, contributing to the activity flood. Log each gene once.
    const viewKey = `${user?.email || 'anon'}:${geneSymbol}`;
    if (loggedGeneViews.has(viewKey)) return;
    loggedGeneViews.add(viewKey);
    try {
      await apiClient.logActivity({
        // Backend contract is camelCase activityType + entityType/entityId; the
        // old activity_type/gene_symbol shape failed validation ("activityType
        // is required") so gene views were never recorded.
        activityType: "gene_view",
        entityType: "gene",
        entityId: geneSymbol,
        metadata: {
          gene_symbol: geneSymbol,
          confidence_score: gene.score,
          phenotypes: gene.phenotypes?.map(p => p.name) || []
        }
      });
    } catch (err) {
      // Silently fail - activity tracking shouldn't break the app
      console.log("Could not track activity:", err);
    }
  };

  const confidenceColor = gene.score >= 0.9 ? "bg-green-100 text-green-800 border-green-200" :
                         gene.score >= 0.7 ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                         "bg-orange-100 text-orange-800 border-orange-200";

  const confidenceIcon = gene.score >= 0.9 ? TrendingUp : 
                        gene.score >= 0.7 ? Info : 
                        AlertTriangle;

  const ConfidenceIcon = confidenceIcon;

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
              <p className="text-slate-600 text-sm">{gene.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge className={`${confidenceColor} flex items-center gap-1`}>
              <ConfidenceIcon className="w-3 h-3" />
              {Math.round(gene.score * 100)}% AI relevance
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
        {isExpanded && (
          <div className="mb-4 bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
            <div className="flex items-start gap-2">
              <ConfidenceIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                gene.score >= 0.9 ? 'text-green-600' : 
                gene.score >= 0.7 ? 'text-yellow-600' : 
                'text-orange-600'
              }`} />
              <div className="flex-1">
                <h4 className="font-medium text-slate-900 mb-2">
                  About this AI ranking
                </h4>
                
                <div className="text-sm text-slate-600">
                  <p className="mb-2">
                    <strong>AI relevance score:</strong> {Math.round(gene.score * 100)}%. This is
                    a model-generated ordering aid, not a calibrated probability, evidence grade,
                    diagnosis, or measure of personal risk.
                  </p>
                  {gene.explanation && (
                    <p className="text-xs text-slate-500 italic">
                      {gene.explanation}
                    </p>
                  )}
                </div>
              </div>
            </div>
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
                    {gene.species && gene.taxId === 9606
                      ? `${gene.species} · ${gene.genomeBuild}`
                      : gene.genomeBuild}
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
              <strong>Coordinates &amp; IDs verified</strong> against MyGene.info (Ensembl/NCBI).
              Gene–phenotype associations and the summary are AI-suggested
              {gene.hpoChecked ? "; HP: ids shown are HPO-validated" : ""}. Verify each association
              in the cited primary database record before research use; do not use this output medically.
            </span>
          </div>
        ) : (
          <div className="mb-4 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Authoritative metadata unavailable.</strong> Coordinates and identifiers are
              withheld. Candidate associations and summaries remain AI-suggested research leads;
              verify them in official databases before research use and never use them clinically.
            </span>
          </div>
        )}

        <div className="mb-4">
          <h4 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Candidate Phenotype Terms
          </h4>
          <div className="flex flex-wrap gap-2">
            {gene.phenotypes?.slice(0, 5).map((phenotype, idx) => (
              <Badge key={idx} variant="secondary" className="text-sm">
                {phenotype.name}
                {phenotype.hpoId && (
                  <span className={`ml-1 text-xs ${phenotype.hpoVerified ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                    ({phenotype.hpoId}{phenotype.hpoVerified ? " ✓" : ""})
                  </span>
                )}
              </Badge>
            ))}
            {gene.phenotypes?.length > 5 && (
              <Badge variant="outline" className="text-sm">
                +{gene.phenotypes.length - 5} more
              </Badge>
            )}
            {(!gene.phenotypes || gene.phenotypes.length === 0) && (
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
              <p className="text-blue-800 text-sm leading-relaxed mb-3">
                {gene.aiSummary || (gene.detailsPending
                  ? <span className="italic text-blue-500">Generating a detailed summary for {gene.symbol}…</span>
                  : null)}
              </p>
              
              {gene.keyTakeaways && gene.keyTakeaways.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <h5 className="text-xs font-semibold text-blue-900 uppercase mb-2">Key Takeaways</h5>
                  <ul className="space-y-1">
                    {gene.keyTakeaways.map((takeaway, idx) => (
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
                        {gene.furtherReading.resources.map((resource, idx) => (
                          <a
                            key={idx}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {resource.name}
                          </a>
                        ))}
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

export default memo(GeneCard);
