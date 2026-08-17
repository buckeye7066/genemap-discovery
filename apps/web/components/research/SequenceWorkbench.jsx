import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dna, FlaskConical, LockKeyhole } from 'lucide-react';
import {
  MAX_ALIGNMENT_LENGTH,
  MAX_SEQUENCE_LENGTH,
  analyzeDna,
  globalAlign,
} from '@/lib/sequenceAnalysis';

const SYNTHETIC_EXAMPLE = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG';

function SequenceLine({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <code className="block break-all rounded bg-slate-950 p-3 font-mono text-xs text-emerald-300">
        {children || '—'}
      </code>
    </div>
  );
}

export default function SequenceWorkbench() {
  const [sequence, setSequence] = useState(SYNTHETIC_EXAMPLE);
  const [comparison, setComparison] = useState('ATGGCCATTGTAATGAGCCGCTGAAAGGGTGCCCGATAG');
  const [frame, setFrame] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [alignment, setAlignment] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  const [alignmentError, setAlignmentError] = useState('');

  const runAnalysis = () => {
    setAnalysisError('');
    setAlignmentError('');
    setAlignment(null);
    try {
      setAnalysis(analyzeDna(sequence, frame));
    } catch (err) {
      setAnalysis(null);
      setAnalysisError(err?.message || 'The sequence could not be analyzed.');
    }
  };

  const runAlignment = () => {
    setAnalysisError('');
    setAlignmentError('');
    let nextAnalysis;
    try {
      nextAnalysis = analyzeDna(sequence, frame);
    } catch (err) {
      setAnalysis(null);
      setAlignment(null);
      setAnalysisError(err?.message || 'The sequence could not be analyzed.');
      return;
    }

    setAnalysis(nextAnalysis);
    try {
      setAlignment(globalAlign(nextAnalysis.sequence, comparison));
    } catch (err) {
      setAlignment(null);
      setAlignmentError(err?.message || 'The sequences could not be aligned.');
    }
  };

  return (
    <div className="space-y-6">
      <Alert className="border-indigo-200 bg-indigo-50">
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>Local educational analysis</AlertTitle>
        <AlertDescription>
          Processing happens in this browser. Use synthetic or public teaching sequences only—do not paste personal genomic data or use these results for diagnosis or treatment.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Dna className="h-5 w-5" /> Sequence workbench</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="teaching-sequence">DNA or FASTA ({MAX_SEQUENCE_LENGTH} bases maximum)</Label>
            <Textarea
              id="teaching-sequence"
              value={sequence}
              onChange={(event) => setSequence(event.target.value)}
              className="min-h-32 font-mono"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="reading-frame">Reading frame</Label>
              <select
                id="reading-frame"
                value={frame}
                onChange={(event) => setFrame(Number(event.target.value))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={0}>Frame 1</option>
                <option value={1}>Frame 2</option>
                <option value={2}>Frame 3</option>
              </select>
            </div>
            <Button onClick={runAnalysis}><FlaskConical className="mr-2 h-4 w-4" /> Analyze sequence</Button>
          </div>

          {analysisError && (
            <Alert variant="destructive"><AlertDescription>{analysisError}</AlertDescription></Alert>
          )}

          {analysis && (
            <div className="space-y-4" aria-live="polite">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{analysis.length} bases</Badge>
                <Badge variant="outline">GC {analysis.gcPercent}%</Badge>
                <Badge variant="outline">{analysis.ambiguousBases} ambiguous</Badge>
              </div>
              <SequenceLine label="Normalized DNA">{analysis.sequence}</SequenceLine>
              <SequenceLine label="Reverse complement">{analysis.reverseComplement}</SequenceLine>
              <SequenceLine label="RNA transcript">{analysis.transcript}</SequenceLine>
              <SequenceLine label={`Protein · frame ${analysis.frame + 1}`}>{analysis.protein}</SequenceLine>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Short pairwise alignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comparison-sequence">Comparison DNA ({MAX_ALIGNMENT_LENGTH} bases per sequence)</Label>
            <Textarea
              id="comparison-sequence"
              value={comparison}
              onChange={(event) => setComparison(event.target.value)}
              className="min-h-24 font-mono"
              spellCheck={false}
            />
          </div>
          <Button variant="outline" onClick={runAlignment}>Align teaching sequences</Button>
          {alignmentError && (
            <Alert variant="destructive"><AlertDescription>{alignmentError}</AlertDescription></Alert>
          )}
          {alignment && (
            <div className="space-y-2 overflow-x-auto" aria-live="polite">
              <Badge variant="outline">Identity {alignment.identityPercent}% · score {alignment.score}</Badge>
              <pre className="min-w-max rounded bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100">
                {alignment.first}{'\n'}{alignment.comparison}{'\n'}{alignment.second}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
