import React, { useState } from 'react';
import { apiClient } from '@genemap/shared';
import ReactMarkdown from 'react-markdown';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Info, Lightbulb, Loader2, Sparkles } from 'lucide-react';
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
import { safeModelMarkdownComponents } from '../shared/safeModelMarkdown';
import PublicationState, {
  enforcePublicationContentType,
  hasReusablePublicationContent,
  isCanonicalPublicationArtifact,
  publicationContent,
} from '../shared/PublicationState';
import {
  createPublicationArtifact,
  PUBLICATION_STATUSES,
  terminalPublicationArtifactFromError,
} from '@genemap/shared/publicationStatus';

const dataTypeOptions = Object.freeze([
  { key: 'wes', label: 'Whole-exome sequencing (WES)', icon: '🧬' },
  { key: 'wgs', label: 'Whole-genome sequencing (WGS)', icon: '🧬' },
  { key: 'rna_seq', label: 'RNA sequencing', icon: '📊' },
  { key: 'genotype', label: 'Aggregate genotype variables', icon: '🧪' },
  { key: 'phenotype', label: 'Aggregate phenotype variables', icon: '📋' },
  { key: 'treatment_response', label: 'Aggregate treatment-response variables', icon: '📈' },
  { key: 'cnv', label: 'Copy-number variants (CNVs)', icon: '🔬' },
  { key: 'proteomics', label: 'Proteomics', icon: '🔬' },
  { key: 'metabolomics', label: 'Metabolomics', icon: '⚗️' },
  { key: 'epigenomics', label: 'Epigenomics', icon: '🎯' },
]);

const generatedMarkdownComponents = Object.freeze({
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-2xl font-bold text-amber-900">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-xl font-semibold text-amber-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-semibold text-slate-900">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed text-slate-700">{children}</p>,
  ul: ({ children }) => <ul className="ml-5 mb-3 list-disc space-y-2">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 mb-3 list-decimal space-y-2">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-r border-l-4 border-amber-500 bg-amber-50 py-3 pl-4">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold text-amber-900">{children}</strong>,
  ...safeModelMarkdownComponents,
});

function selectedModalities(dataTypes) {
  return Object.entries(dataTypes)
    .filter(([, selected]) => Boolean(selected))
    .map(([type]) => type);
}

function researchHypothesisPublication(artifact) {
  if (isCanonicalPublicationArtifact(artifact)) {
    return enforcePublicationContentType(
      artifact,
      (content) => typeof content === 'string' && Boolean(content.trim()),
    );
  }
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.UNAVAILABLE,
    reasonCode: 'invalid_publication_artifact',
    correlationId: 'hypothesis:client-invalid-publication',
  });
}

export function describeResearchFocus(focus) {
  if (!focus) return 'None';
  if (focus.kind === 'curated_concept') {
    return `${focus.canonicalLabel} (${focus.conceptKind}; ${focus.conceptId}; ${focus.source}@${focus.version})`;
  }
  if (focus.kind === 'hpo') {
    return `${focus.identifier} (Human Phenotype Ontology identifier; server revalidated)`;
  }
  if (focus.kind === 'mondo') {
    return `${focus.identifier} (MONDO disease identifier; server revalidated)`;
  }
  return 'Unrecognized focus withheld';
}

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
    epigenomics: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [hypotheses, setHypotheses] = useState(null);
  const [error, setError] = useState('');

  const sampleCountIsValid = isValidAggregateSampleCount(sampleCount);
  const modalities = selectedModalities(dataTypes);

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
    setError('');
  };

  const changeFocusKind = (nextKind) => {
    setFocusKind(nextKind);
    setFocusConceptId('');
    setFocusHpoId('');
    setError('');
  };

  const handleGenerate = async () => {
    setError('');
    if (!sampleCountIsValid || modalities.length === 0) {
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
      modalities,
      objective,
      ...(focus ? { focus } : {}),
    };

    setIsGenerating(true);
    try {
      const response = await apiClient.invokePublicationTask(
        'research_hypothesis',
        taskInput,
      );
      const publication = researchHypothesisPublication(response?.publication);
      const generated = publicationContent(publication);
      setHypotheses({
        cohort: taskInput.cohort,
        focus: taskInput.focus || null,
        objective,
        dataTypes: modalities,
        publication,
        analysis: typeof generated === 'string' ? generated.trim() : null,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error generating hypotheses:', err);
      const recoveryPublication = terminalPublicationArtifactFromError(err);
      setHypotheses(recoveryPublication ? {
        cohort: taskInput.cohort,
        focus: taskInput.focus || null,
        objective,
        dataTypes: modalities,
        publication: recoveryPublication,
        analysis: null,
        generatedAt: new Date().toISOString(),
      } : null);
      setError(recoveryPublication
        ? ''
        : (err?.message || 'The structured research request could not be generated. Please try again.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!hypotheses || !hasReusablePublicationContent(hypotheses.publication)) return;
    const analysis = publicationContent(hypotheses.publication);
    if (typeof analysis !== 'string' || !analysis.trim()) return;
    const limitations = Array.isArray(hypotheses.publication.limitations)
      ? hypotheses.publication.limitations.filter((item) => typeof item === 'string' && item.trim())
      : [];
    const header = [
      '# GeneMap Discovery Research Hypothesis',
      '',
      `Generated: ${hypotheses.generatedAt}`,
      `Publication status: ${hypotheses.publication.status}`,
      `Publication correlation: ${hypotheses.publication.correlationId}`,
      ...(hypotheses.publication.reasonCode
        ? [`Publication reason: ${hypotheses.publication.reasonCode}`]
        : []),
      ...(limitations.length > 0
        ? ['Publication limitations:', ...limitations.map((item) => `- ${item}`)]
        : []),
      `Cohort: ${hypotheses.cohort.sampleCount} samples (${hypotheses.cohort.classification})`,
      `Control group present: ${hypotheses.cohort.hasControls ? 'Yes' : 'No'}`,
      `Focus: ${describeResearchFocus(hypotheses.focus)}`,
      `Objective: ${hypotheses.objective}`,
      `Modalities: ${hypotheses.dataTypes.join(', ')}`,
      '',
      'Education and exploratory research only. Verify every material claim in authoritative sources.',
      '',
    ].join('\n');
    const blob = new Blob([header, analysis], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `genemap-hypothesis-${Date.now()}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-600" />
            Guided Research Hypothesis Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-900">
              <strong>Exploratory research only:</strong> define a deidentified aggregate, synthetic, or public cohort using the guided fields. GeneMap sends only this structured specification. Do not enter patient-level data.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>Load a structured example</Label>
            <div className="grid gap-2">
              {MANDATED_RESEARCH_EXAMPLES.map((example, index) => (
                <Button
                  key={example}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal text-left"
                  onClick={() => loadExample(example)}
                  disabled={isGenerating}
                >
                  Example {index + 1}: {example}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="sample-count">Aggregate sample count</Label>
              <Input
                id="sample-count"
                type="number"
                min="2"
                max="1000000"
                step="1"
                value={sampleCount}
                onChange={(event) => setSampleCount(Number(event.target.value))}
                disabled={isGenerating}
                aria-invalid={!sampleCountIsValid}
              />
            </div>
            <div>
              <Label htmlFor="classification">Data classification</Label>
              <select
                id="classification"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                value={classification}
                onChange={(event) => setClassification(event.target.value)}
                disabled={isGenerating}
              >
                <option value="deidentified_aggregate">Deidentified aggregate cohort</option>
                <option value="synthetic">Synthetic cohort</option>
                <option value="public_dataset">Public dataset</option>
              </select>
            </div>
            <div>
              <Label htmlFor="objective">Research objective</Label>
              <select
                id="objective"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                disabled={isGenerating}
              >
                <option value="identify_variants">Identify cohort-level variants</option>
                <option value="association_analysis">Association-analysis design</option>
                <option value="compare_cohorts">Compare cohorts</option>
                <option value="multi_omic_hypothesis">Multi-omic hypotheses</option>
                <option value="covariate_design">Covariate design</option>
                <option value="cohort_summary">Cohort summary</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="has-controls"
                checked={hasControls}
                onCheckedChange={(checked) => setHasControls(Boolean(checked))}
                disabled={isGenerating}
              />
              <Label htmlFor="has-controls">A control group is present</Label>
            </div>
            <div>
              <Label htmlFor="focus-kind">Optional focus type</Label>
              <select
                id="focus-kind"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                value={focusKind}
                onChange={(event) => changeFocusKind(event.target.value)}
                disabled={isGenerating}
              >
                <option value="none">No specific concept</option>
                <option value="curated">Reviewed disease or phenotype</option>
                <option value="hpo">Exact HPO identifier (server verified)</option>
              </select>
            </div>
            <div>
              {focusKind === 'curated' ? (
                <>
                  <Label htmlFor="focus-concept">Reviewed concept</Label>
                  <select
                    id="focus-concept"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                    value={focusConceptId}
                    onChange={(event) => setFocusConceptId(event.target.value)}
                    disabled={isGenerating}
                  >
                    <option value="" disabled>Choose a reviewed concept</option>
                    {CURATED_PUBLICATION_CONCEPTS.map((concept) => (
                      <option key={concept.conceptId} value={concept.conceptId}>
                        {concept.canonicalLabel}
                      </option>
                    ))}
                  </select>
                </>
              ) : focusKind === 'hpo' ? (
                <>
                  <Label htmlFor="focus-hpo">Exact HPO identifier</Label>
                  <Input
                    id="focus-hpo"
                    maxLength={10}
                    placeholder="HP:0001250"
                    value={focusHpoId}
                    onChange={(event) => setFocusHpoId(event.target.value)}
                    disabled={isGenerating}
                  />
                </>
              ) : (
                <p className="pt-7 text-sm text-slate-600">No concept label will be sent.</p>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Aggregate data types</Label>
            <div className="grid gap-3 md:grid-cols-2">
              {dataTypeOptions.map((dataType) => (
                <div key={dataType.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={dataType.key}
                    checked={Boolean(dataTypes[dataType.key])}
                    onCheckedChange={(checked) => setDataTypes((current) => ({
                      ...current,
                      [dataType.key]: Boolean(checked),
                    }))}
                    disabled={isGenerating}
                  />
                  <Label htmlFor={dataType.key} className="cursor-pointer font-normal">
                    {dataType.icon} {dataType.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !sampleCountIsValid || modalities.length === 0}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating bounded hypotheses…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Research Hypotheses
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {hypotheses && (
        <Card className="border-2 border-amber-300 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-6 w-6 text-amber-600" />
                  Generated Research Hypotheses
                </CardTitle>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    Controls: {hypotheses.cohort.hasControls ? 'present' : 'absent'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Focus: {describeResearchFocus(hypotheses.focus)}
                  </Badge>
                  {hypotheses.dataTypes.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs">{type}</Badge>
                  ))}
                </div>
              </div>
              {hasReusablePublicationContent(hypotheses.publication) && (
                <Button type="button" variant="outline" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Markdown
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <PublicationState artifact={hypotheses.publication} />
            {hypotheses.analysis && hasReusablePublicationContent(hypotheses.publication) && (
              <>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown components={generatedMarkdownComponents}>
                    {hypotheses.analysis}
                  </ReactMarkdown>
                </div>
                <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  AI-generated research lead. Verify study design, assumptions, methods, and every scientific claim in authoritative sources before use.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
