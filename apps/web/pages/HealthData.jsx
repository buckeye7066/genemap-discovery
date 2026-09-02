import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@genemap/shared';
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  FileText,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { parseHealthDocument } from '@/lib/healthDocumentParser';

const STORAGE_CONSENT = 'medical_data_storage';
const AI_CONSENT = 'medical_data_ai_analysis';
const CONSENT_VERSION = '1.0';

const EMPTY_PROFILE = Object.freeze({
  conditions: '',
  medications: '',
  allergies: '',
  familyHistory: '',
  symptoms: '',
  goals: '',
  notes: '',
});

function lines(value) {
  return String(value || '').split(/\r?\n/u).map((item) => item.trim()).filter(Boolean);
}

function lineText(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function latestConsent(records, consentType) {
  return [...records]
    .filter((record) => record.consentType === consentType && record.version === CONSENT_VERSION)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]?.granted === true;
}

function flagStyle(flag) {
  if (flag === 'high' || flag === 'abnormal') return 'bg-rose-100 text-rose-800';
  if (flag === 'low') return 'bg-amber-100 text-amber-800';
  if (flag === 'normal') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

function ProfileField({ id, label, hint, value, onChange, rows = 3 }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={hint}
      />
      <p className="text-xs text-slate-500">One item per line.</p>
    </div>
  );
}

function ParsedPreview({ parsed }) {
  if (!parsed) return null;
  return (
    <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <p className="font-semibold text-slate-900">Extraction complete</p>
        <Badge className="bg-white text-blue-700">{parsed.source.extractionMethod.replaceAll('_', ' ')}</Badge>
        <Badge className="bg-white text-blue-700">{parsed.summary.total} structured results</Badge>
      </div>
      <p className="text-sm text-slate-700">{parsed.summary.text}</p>
      {parsed.observations.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Test</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Document range</th>
                <th className="px-3 py-2">Flag</th>
              </tr>
            </thead>
            <tbody>
              {parsed.observations.slice(0, 12).map((observation, index) => (
                <tr key={`${observation.name}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{observation.name}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {observation.value}{observation.unit ? ` ${observation.unit}` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{observation.referenceRange?.text || 'Not supplied'}</td>
                  <td className="px-3 py-2">
                    <Badge className={flagStyle(observation.flag)}>{observation.flag}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {parsed.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
          {parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function HealthData() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const parseAttemptRef = useRef(0);
  const [records, setRecords] = useState([]);
  const [profileRecord, setProfileRecord] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [storageConsent, setStorageConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [recordTitle, setRecordTitle] = useState('');
  const [parsed, setParsed] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const labRecords = useMemo(
    () => records.filter((record) => record.dataType === 'lab_document'),
    [records],
  );

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [medicalRecords, consentRecords] = await Promise.all([
        apiClient.getMedicalData(),
        apiClient.getConsentRecords(),
      ]);
      setRecords(medicalRecords);
      const currentProfile = medicalRecords.find((record) => record.dataType === 'health_profile') || null;
      setProfileRecord(currentProfile);
      if (currentProfile?.content) {
        setProfile({
          conditions: lineText(currentProfile.content.conditions),
          medications: lineText(currentProfile.content.medications),
          allergies: lineText(currentProfile.content.allergies),
          familyHistory: lineText(currentProfile.content.familyHistory),
          symptoms: lineText(currentProfile.content.symptoms),
          goals: lineText(currentProfile.content.goals),
          notes: currentProfile.content.notes || '',
        });
      } else {
        setProfile(EMPTY_PROFILE);
      }
      setStorageConsent(latestConsent(consentRecords, STORAGE_CONSENT));
      setAiConsent(latestConsent(consentRecords, AI_CONSENT));
    } catch (loadError) {
      setError(loadError?.message || 'Health data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveConsentChoices = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const recordedAt = new Date().toISOString();
      await apiClient.recordConsents([
        {
          consentType: STORAGE_CONSENT,
          version: CONSENT_VERSION,
          granted: storageConsent,
          metadata: { surface: 'health_data', recordedAt },
        },
        {
          consentType: AI_CONSENT,
          version: CONSENT_VERSION,
          granted: aiConsent,
          metadata: { surface: 'health_data', recordedAt },
        },
      ]);
      setNotice('Privacy choices saved. A later revocation supersedes an earlier grant.');
    } catch (saveError) {
      setError(saveError?.message || 'Privacy choices could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const ensureStorageConsent = async () => {
    if (!storageConsent) {
      throw new Error('Enable encrypted health-data storage before saving health information.');
    }
    await apiClient.recordConsent({
      consentType: STORAGE_CONSENT,
      version: CONSENT_VERSION,
      granted: true,
      metadata: { surface: 'health_data_write', recordedAt: new Date().toISOString() },
    });
  };

  const saveProfile = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await ensureStorageConsent();
      const content = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        conditions: lines(profile.conditions),
        medications: lines(profile.medications),
        allergies: lines(profile.allergies),
        familyHistory: lines(profile.familyHistory),
        symptoms: lines(profile.symptoms),
        goals: lines(profile.goals),
        notes: profile.notes.trim(),
      };
      if (profileRecord?.id) {
        await apiClient.updateMedicalData(profileRecord.id, { content });
      } else {
        await apiClient.createMedicalData({
          dataType: 'health_profile',
          title: 'Health profile',
          content,
          metadata: { schemaVersion: 1 },
        });
      }
      setNotice('Health profile saved and available to the assistants when AI access is granted.');
      await loadData();
    } catch (saveError) {
      setError(saveError?.message || 'Health profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = async (file) => {
    const attempt = parseAttemptRef.current + 1;
    parseAttemptRef.current = attempt;
    setSelectedFile(file || null);
    setParsed(null);
    setProgress(null);
    setError('');
    setNotice('');
    if (!file) return;
    setRecordTitle(file.name.replace(/\.[^.]+$/u, '').slice(0, 240));
    try {
      const result = await parseHealthDocument(file, {
        onProgress: (nextProgress) => {
          if (parseAttemptRef.current === attempt) setProgress(nextProgress);
        },
      });
      if (parseAttemptRef.current !== attempt) return;
      setParsed(result);
    } catch (parseError) {
      if (parseAttemptRef.current !== attempt) return;
      setError(parseError?.message || 'The health document could not be parsed.');
    }
  };

  const saveParsedRecord = async () => {
    if (!parsed) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await ensureStorageConsent();
      await apiClient.createMedicalData({
        dataType: 'lab_document',
        title: recordTitle.trim() || 'Lab document',
        content: parsed,
        metadata: {
          schemaVersion: parsed.schemaVersion,
          parserVersion: parsed.parserVersion,
          sourceSha256: parsed.source.sha256,
        },
      });
      setNotice('Parsed lab document saved. Its structured results can now be used by Anastasia or Robert.');
      setSelectedFile(null);
      setParsed(null);
      setProgress(null);
      setRecordTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (saveError) {
      setError(saveError?.message || 'The parsed document could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record) => {
    if (!record.id || !window.confirm(`Delete “${record.title || 'this health record'}”? This cannot be undone.`)) return;
    setError('');
    try {
      await apiClient.deleteMedicalData(record.id);
      setNotice('Health record deleted.');
      await loadData();
    } catch (deleteError) {
      setError(deleteError?.message || 'The health record could not be deleted.');
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl p-6 text-sm text-slate-600">Loading encrypted health data…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5"><FileSearch className="h-6 w-6 text-blue-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Health data</h1>
            <p className="text-sm text-slate-600">Parse lab documents locally, then store the structured result encrypted.</p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Action not completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-700" />Privacy choices</CardTitle>
          <CardDescription>Storage and assistant analysis are separate, versioned consent records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <Checkbox checked={storageConsent} onCheckedChange={(checked) => setStorageConsent(checked === true)} />
            <span>
              <span className="block font-medium text-slate-900">Allow encrypted health-data storage</span>
              <span className="block text-sm text-slate-600">Required to save a health profile or parsed lab document.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <Checkbox checked={aiConsent} onCheckedChange={(checked) => setAiConsent(checked === true)} />
            <span>
              <span className="block font-medium text-slate-900">Allow Anastasia and Robert to process health and genetics questions</span>
              <span className="block text-sm text-slate-600">Required before any assistant message, saved health context, or prior assistant history is sent to the configured model provider.</span>
            </span>
          </label>
          <Button onClick={saveConsentChoices} disabled={saving}>Save privacy choices</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-blue-700" />Upload and parse labwork</CardTitle>
          <CardDescription>
            PDF text layers, scanned PDF pages, images, CSV, TSV, JSON/FHIR, and text are processed in your browser. The original file is not uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.tsv,.json,.txt,.text,.png,.jpg,.jpeg,.webp,application/pdf,application/json,text/plain,text/csv,text/tab-separated-values,image/png,image/jpeg,image/webp"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          {selectedFile && <p className="text-xs text-slate-500">Selected: {selectedFile.name} ({Math.ceil(selectedFile.size / 1024).toLocaleString()} KB)</p>}
          {progress && !parsed && (
            <div className="space-y-2">
              <Progress value={Math.round(progress.progress * 100)} />
              <p className="text-sm text-slate-600">{progress.message}</p>
            </div>
          )}
          <ParsedPreview parsed={parsed} />
          {parsed && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="record-title">Record title</Label>
                <Input id="record-title" value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)} maxLength={240} />
              </div>
              <Button onClick={saveParsedRecord} disabled={saving || !storageConsent}>
                <LockKeyhole className="h-4 w-4" />Save encrypted result
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Health profile context</CardTitle>
          <CardDescription>Optional context the assistants can use alongside your account profile and lab records.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <ProfileField id="conditions" label="Conditions" hint="Type 2 diabetes" value={profile.conditions} onChange={(value) => setProfile((current) => ({ ...current, conditions: value }))} />
          <ProfileField id="medications" label="Medications" hint="Metformin 500 mg twice daily" value={profile.medications} onChange={(value) => setProfile((current) => ({ ...current, medications: value }))} />
          <ProfileField id="allergies" label="Allergies" hint="Penicillin" value={profile.allergies} onChange={(value) => setProfile((current) => ({ ...current, allergies: value }))} />
          <ProfileField id="family-history" label="Family history" hint="Parent with early coronary disease" value={profile.familyHistory} onChange={(value) => setProfile((current) => ({ ...current, familyHistory: value }))} />
          <ProfileField id="symptoms" label="Symptoms or concerns" hint="Fatigue for three weeks" value={profile.symptoms} onChange={(value) => setProfile((current) => ({ ...current, symptoms: value }))} />
          <ProfileField id="goals" label="Goals" hint="Understand my lipid panel" value={profile.goals} onChange={(value) => setProfile((current) => ({ ...current, goals: value }))} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="health-notes">Additional context</Label>
            <Textarea id="health-notes" rows={4} maxLength={5000} value={profile.notes} onChange={(event) => setProfile((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <div className="md:col-span-2"><Button onClick={saveProfile} disabled={saving || !storageConsent}>Save encrypted health profile</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Saved lab documents</CardTitle>
              <CardDescription>{labRecords.length} parser-structured record{labRecords.length === 1 ? '' : 's'}.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate('/assistants')} disabled={!labRecords.length}>
              <MessageCircle className="h-4 w-4" />Ask an assistant
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!labRecords.length && <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No parsed lab documents yet.</p>}
          {labRecords.map((record) => (
            <div key={record.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
              <FileText className="h-5 w-5 shrink-0 text-blue-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{record.title || 'Lab document'}</p>
                <p className="text-sm text-slate-600">{record.content?.summary?.text || 'Parsed record'}</p>
                <p className="mt-1 text-xs text-slate-500">Parser {record.content?.parserVersion || 'unknown'} · {record.content?.source?.extractionMethod?.replaceAll('_', ' ') || 'unknown extraction'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/assistants?record=${record.id}`)}>Ask about this</Button>
              <Button variant="ghost" size="icon" aria-label={`Delete ${record.title || 'health record'}`} onClick={() => deleteRecord(record)}>
                <Trash2 className="h-4 w-4 text-rose-600" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Educational support, not diagnosis</AlertTitle>
        <AlertDescription>OCR and source documents can contain errors. Confirm important values with the original report and a qualified healthcare professional.</AlertDescription>
      </Alert>
    </div>
  );
}
