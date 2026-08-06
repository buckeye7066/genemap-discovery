import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb, Loader2, Sparkles, Info } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import {
  MANDATED_RESEARCH_EXAMPLES,
  isValidAggregateSampleCount,
  parseAggregateResearchExample,
  researchFocusControls,
} from '@/lib/researchTaskFixtures';
import {
  CURATED_PUBLICATION_CONCEPTS,
  publicationConceptById,
  publicationHpoReference,
} from '@/lib/publicationConceptCatalog';

const dataTypeOptions = [
  { key: 'wes', label: 'Whole-exome sequencing (WES)', icon: '🧬' },
  { key: 'wgs', label: 'Whole-genome sequencing (WGS)', icon: '🧬' },
  { key: 'rna_seq', label: 'RNA sequencing', icon: '📊' },
  { key: 'genotype', label: 'Aggregate genotype variables', icon: '🧪' },
  { key: 'phenotype', label: 'Aggregate phenotype variables', icon: '📋' },
  { key: 'treatment_response', label: 'Aggregate treatment-response variables', icon: '📈' },
  { key: 'cnv', label: 'Copy-number variants (CNVs)', icon: '🔬' },
  { key: 'proteomics', label: 'Proteomics', icon: '🔬' },
  { key: 'metabolomics', label: 'Metabolomics (metabolite profiles)', icon: '⚗️' },
  { key: 'epigenomics', label: 'Epigenomics', icon: '🎯' }
];

export default function HypothesisGenerator() {
  const [sampleCount, setSampleCount] = useState(50);
  const [classification, setClassification] = useState('deidentified_aggregate');
  const [hasControls, setHasControls] = useState(true);
  const [objective, setObjective] = useState('identify_variants');
  const [focusKind, setFocusKind] = useState('curated');
  const [focusConceptId, setFocusConceptId] = useState('phenotype:early-onset-symptoms');
  const [focusHpoId, setFocusHpoId] = useState('');
  const [dataTypes, setDataTypes] = useState({
    wes: true,
    wgs: false,
    rna_seq: false,
    genotype: false,
    phenotype: true,
    treatment_response: false,
    cnv: false,
    proteomics: false,
    metabolomics: false,
    epigenomics: false
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [hypotheses, setHypotheses] = useState(null);
  const [error, setError] = useState('');
  const sampleCountIsValid = isValidAggregateSampleCount(sampleCount);

  const loadExample = (example) => {
    const parsed = parseAggregateResearchExample(example);
    if (!parsed) return;
    setSampleCount(parsed.cohort.sampleCount);
    setClassification(parsed.cohort.classification);
    setHasControls(parsed.cohort.hasControls);
    setObjective(parsed.objective);
    const nextFocus = researchFocusControls(parsed.focus);
    setFocusKind(nextFocus.focusKind);
    setFocusConceptId(nextFocus.focusConceptId);
    setFocusHpoId(nextFocus.focusHpoId);
    setDataTypes(Object.fromEntries(dataTypeOptions.map(({ key }) => [
      key,
      parsed.modalities.includes(key),
    ])));
  };

  const changeFocusKind = (nextKind) => {
    // A type change is a new explicit selection. Never carry an HPO id or
    // reviewed concept across modes where it could be paired with a new label.
    setFocusKind(nextKind);
    setFocusConceptId('');
    setFocusHpoId('');
  };

  const handleGenerate = async () => {
    setError('');
    setIsGenerating(true);
    try {
      const selectedDataTypes = Object.entries(dataTypes)
        .filter(([_, selected]) => selected)
        .map(([type]) => type);
      if (!sampleCountIsValid || selectedDataTypes.length === 0) {
        setError('Enter an integer from 2 to 1,000,000 and select at least one aggregate data type.');
        return;
      }
      const focus = focusKind === 'curated'
        ? publicationConceptById(focusConceptId)
        : focusKind === 'hpo'
          ? publicationHpoReference(focusHpoId)
          : null;
      if (focusKind !== 'none' && !focus) {
        setError('Choose a reviewed concept or enter an exact HPO identifier such as HP:0001250.');
        return;
      }
      const taskInput = {
        version: 1,
        cohort: {
          sampleCount: Number(sampleCount),
          classification,
          hasControls,
        },
        modalities: selectedDataTypes,
        objective,
        ...(focus ? { focus } : {}),
      };
      const { result: response } = await apiClient.invokePublicationTask(
        'research_hypothesis',
        taskInput,
      );

      setHypotheses({
        cohort: taskInput.cohort,
        objective,
        data_types: selectedDataTypes,
        analysis: response
      });

    } catch (err) {
      console.error("Error generating hypotheses:", err);
      setError(err?.message || 'The structured research request could not be generated.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-600" />
            AI-Powered Hypothesis Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm">
              <strong>Exploratory research only:</strong> Define a deidentified aggregate, synthetic, or public cohort using the guided fields. GeneMap sends only this structured specification and does not accept patient-level data or free-form clinical requests here.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Load a structured example</Label>
            <div className="grid gap-2">
              {MANDATED_RESEARCH_EXAMPLES.map((example, index) => (
                <Button key={example} type="button" variant="outline" className="h-auto whitespace-normal text-left justify-start" onClick={() => loadExample(example)}>
                  Example {index + 1}: {example}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sample-count">Aggregate sample count</Label>
              <Input id="sample-count" type="number" min="2" max="1000000" step="1" value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))} disabled={isGenerating} aria-invalid={!sampleCountIsValid} />
            </div>
            <div>
              <Label htmlFor="classification">Data classification</Label>
              <select id="classification" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={classification} onChange={(event) => setClassification(event.target.value)} disabled={isGenerating}>
                <option value="deidentified_aggregate">Deidentified aggregate cohort</option>
                <option value="synthetic">Synthetic cohort</option>
                <option value="public_dataset">Public dataset</option>
              </select>
            </div>
            <div>
              <Label htmlFor="objective">Research objective</Label>
              <select id="objective" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={objective} onChange={(event) => setObjective(event.target.value)} disabled={isGenerating}>
                <option value="identify_variants">Identify cohort-level variants</option>
                <option value="association_analysis">Association-analysis design</option>
                <option value="compare_cohorts">Compare cohorts</option>
                <option value="multi_omic_hypothesis">Multi-omic hypotheses</option>
                <option value="covariate_design">Covariate design</option>
                <option value="cohort_summary">Cohort summary</option>
              </select>
            </div>
            <div className="flex items-end pb-2 gap-2">
              <Checkbox id="has-controls" checked={hasControls} onCheckedChange={(checked) => setHasControls(Boolean(checked))} />
              <Label htmlFor="has-controls">A control group is present</Label>
            </div>
            <div>
              <Label htmlFor="focus-kind">Optional focus type</Label>
              <select id="focus-kind" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={focusKind} onChange={(event) => changeFocusKind(event.target.value)} disabled={isGenerating}>
                <option value="none">No specific concept</option>
                <option value="curated">Reviewed disease or phenotype</option>
                <option value="hpo">Exact HPO identifier (server verified)</option>
              </select>
            </div>
            <div>
              {focusKind === 'curated' ? (
                <>
                  <Label htmlFor="focus-concept">Reviewed concept</Label>
                  <select id="focus-concept" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3" value={focusConceptId} onChange={(event) => setFocusConceptId(event.target.value)} disabled={isGenerating}>
                    <option value="" disabled>Choose a reviewed concept</option>
                    {CURATED_PUBLICATION_CONCEPTS.map((concept) => (
                      <option key={concept.conceptId} value={concept.conceptId}>{concept.canonicalLabel}</option>
                    ))}
                  </select>
                </>
              ) : focusKind === 'hpo' ? (
                <>
                  <Label htmlFor="focus-hpo">Exact HPO identifier</Label>
                  <Input id="focus-hpo" maxLength={10} placeholder="HP:0001250" value={focusHpoId} onChange={(event) => setFocusHpoId(event.target.value)} disabled={isGenerating} />
                </>
              ) : (
                <p className="pt-7 text-sm text-slate-600">No concept label will be sent.</p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Available Data Types</Label>
            <div className="grid md:grid-cols-2 gap-3">
              {dataTypeOptions.map((dataType) => (
                <div key={dataType.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={dataType.key}
                    checked={dataTypes[dataType.key]}
                    onCheckedChange={(checked) => setDataTypes({ ...dataTypes, [dataType.key]: checked })}
                  />
                  <label htmlFor={dataType.key} className="text-sm cursor-pointer">
                    {dataType.icon} {dataType.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !sampleCountIsValid || !Object.values(dataTypes).some(Boolean)}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Hypotheses...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Research Hypotheses
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {hypotheses && (
        <Card className="shadow-lg border-2 border-amber-300">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-amber-600" />
              <div>
                <CardTitle>Generated Research Hypotheses</CardTitle>
                <div className="flex gap-2 mt-2">
                  {hypotheses.data_types.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold text-amber-900 mt-6 mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-amber-900 mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-700 mb-3 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="ml-4 mb-3 space-y-2 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-amber-500 pl-4 my-4 bg-amber-50 py-3 rounded-r">
                      {children}
                    </blockquote>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-amber-900">{children}</strong>,
                }}
              >
                {hypotheses.analysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
