import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { apiClient } from '@genemap/shared';
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileText,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { safeModelMarkdownComponents } from '@/components/shared/safeModelMarkdown';

const ASSISTANTS = Object.freeze({
  anastasia: {
    name: 'Anastasia',
    description: 'Plain-language genetics and health education grounded in your saved context.',
    icon: UserRound,
    accent: 'from-violet-500 to-fuchsia-600',
  },
  robert: {
    name: 'Robert',
    description: 'Technical genomics and laboratory research support with explicit evidence boundaries.',
    icon: BrainCircuit,
    accent: 'from-blue-600 to-cyan-600',
  },
});

const markdownComponents = Object.freeze({
  ...safeModelMarkdownComponents,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1">{children}</ol>,
});

function usableAssistantRecord(record) {
  const content = record?.content;
  return Boolean(
    record?.id
    && content?.schemaVersion === 1
    && content?.parserVersion === 'health-document-1.0.0'
    && /^[a-f0-9]{64}$/u.test(String(content?.source?.sha256 || ''))
    && ['structured', 'text_only'].includes(content?.status)
    && (
      (Array.isArray(content?.observations) && content.observations.length > 0)
      || String(content?.extractedText || '').trim().length >= 24
    )
  );
}

function displayMessages(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => (
      item
      && ['user', 'assistant'].includes(item.role)
      && typeof item.content === 'string'
    ));
}

function ContextReceipt({ receipt }) {
  if (!receipt) return (
    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
      After a response, this panel shows exactly which server-owned context was used.
    </p>
  );
  const profileFields = Array.isArray(receipt.profileFields) ? receipt.profileFields : [];
  const records = Array.isArray(receipt.records) ? receipt.records : [];
  const research = receipt.research && typeof receipt.research === 'object'
    ? receipt.research
    : {};
  const matchedContextKinds = Array.isArray(receipt.responseReview?.matchedContextKinds)
    ? receipt.responseReview.matchedContextKinds
    : [];
  const requiredContextKinds = Array.isArray(receipt.responseReview?.requiredContextKinds)
    ? receipt.responseReview.requiredContextKinds
    : [];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2 text-emerald-800">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-semibold">Context receipt {receipt.contextVersion}</span>
      </div>
      {receipt.responseReview && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          Response review passed after {receipt.responseReview.generationAttempts} generation attempt{receipt.responseReview.generationAttempts === 1 ? '' : 's'}.
          {' '}Grounded in: {matchedContextKinds.join(', ').replaceAll('_', ' ') || 'no stored context available'}.
          {requiredContextKinds.length
            ? ` Required: ${requiredContextKinds.join(', ').replaceAll('_', ' ')}.`
            : ''}
        </p>
      )}
      <div>
        <p className="font-medium text-slate-900">Profile fields supplied</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profileFields.length
            ? profileFields.map((field) => <Badge key={field} className="bg-slate-100 text-slate-700">{field}</Badge>)
            : <span className="text-slate-500">No completed profile fields.</span>}
        </div>
      </div>
      <div>
        <p className="font-medium text-slate-900">Health context</p>
        <p className="mt-1 text-slate-600">Health profile: {receipt.healthProfileIncluded ? 'included' : 'not included'}</p>
        <div className="mt-2 space-y-2">
          {records.map((record) => (
            <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-medium text-slate-900">{record.title}</p>
              <p className="text-xs text-slate-500">
                {Number(record.observationCount) || 0} results · {String(record.extractionMethod || 'unknown').replaceAll('_', ' ')} · {record.parserVersion || 'unknown parser'}
              </p>
            </div>
          ))}
          {!records.length && <p className="text-slate-500">No lab record included.</p>}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Research context: {Number(research.geneSetCount) || 0} gene sets, {Number(research.projectCount) || 0} projects, {Number(research.recentSearchCount) || 0} recent searches.
      </p>
    </div>
  );
}

export default function Assistants() {
  const [searchParams] = useSearchParams();
  const requestedRecord = searchParams.get('record');
  const sendAttemptRef = useRef(0);
  const sendingRef = useRef(false);
  const [assistant, setAssistant] = useState('anastasia');
  const [records, setRecords] = useState([]);
  const [unavailableRecordCount, setUnavailableRecordCount] = useState(0);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const definition = ASSISTANTS[assistant];
  const AssistantIcon = definition.icon;

  useEffect(() => {
    let active = true;
    sendAttemptRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [labRecords, assistantConversations] = await Promise.all([
          apiClient.getMedicalData('lab_document'),
          apiClient.getConversations(assistant),
        ]);
        if (!active) return;
        const usableRecords = labRecords.filter(usableAssistantRecord);
        setRecords(usableRecords);
        setUnavailableRecordCount(labRecords.length - usableRecords.length);
        setConversations(assistantConversations.map((conversation) => ({
          ...conversation,
          title: typeof conversation.title === 'string' ? conversation.title : 'Conversation',
          messages: displayMessages(conversation.messages),
        })));
        setSelectedRecordIds((current) => {
          const available = new Set(usableRecords.map((record) => record.id));
          const preserved = current.filter((id) => available.has(id));
          if (preserved.length) return preserved;
          if (requestedRecord && available.has(requestedRecord)) return [requestedRecord];
          return [];
        });
        setConversationId(null);
        setMessages([]);
        setReceipt(null);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Assistant context could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      sendAttemptRef.current += 1;
      sendingRef.current = false;
    };
  }, [assistant, requestedRecord]);

  const selectedRecords = useMemo(
    () => records.filter((record) => selectedRecordIds.includes(record.id)),
    [records, selectedRecordIds],
  );

  const toggleRecord = (recordId, checked) => {
    setSelectedRecordIds((current) => (
      checked
        ? [...new Set([...current, recordId])].slice(0, 10)
        : current.filter((id) => id !== recordId)
    ));
  };

  const startNewConversation = () => {
    sendAttemptRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setConversationId(null);
    setMessages([]);
    setReceipt(null);
    setError('');
    setNotice('');
  };

  const resumeConversation = (conversation) => {
    sendAttemptRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setConversationId(conversation.id);
    setMessages(displayMessages(conversation.messages));
    setReceipt(conversation.metadata?.lastContextReceipt || null);
    setError('');
    setNotice('');
  };

  const deleteConversation = async (conversation) => {
    if (!conversation?.id || !window.confirm(`Delete “${conversation.title || 'this conversation'}”? This cannot be undone.`)) return;
    const deletingActiveConversation = conversation.id === conversationId;
    if (deletingActiveConversation) {
      sendAttemptRef.current += 1;
      sendingRef.current = false;
      setSending(false);
    }
    setDeletingConversationId(conversation.id);
    setError('');
    setNotice('');
    try {
      await apiClient.deleteConversation(conversation.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (deletingActiveConversation) {
        setConversationId(null);
        setMessages([]);
        setReceipt(null);
      }
      setNotice('Assistant conversation deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'The assistant conversation could not be deleted.');
    } finally {
      setDeletingConversationId(null);
    }
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || sendingRef.current) return;
    const attempt = sendAttemptRef.current + 1;
    sendAttemptRef.current = attempt;
    sendingRef.current = true;
    const assistantAtSend = assistant;
    const definitionAtSend = definition;
    const userMessage = { role: 'user', content: trimmed };
    const outboundMessages = [...messages, userMessage];
    setSending(true);
    setError('');
    setMessages(outboundMessages);
    setMessage('');
    try {
      const response = await apiClient.chatWithAssistant(assistantAtSend, {
        message: trimmed,
        conversationId: conversationId || undefined,
        recordIds: selectedRecordIds,
      });
      if (sendAttemptRef.current !== attempt) return;
      const nextMessages = [...outboundMessages, { role: 'assistant', content: response.message }];
      setConversationId(response.conversationId);
      setMessages(nextMessages);
      setReceipt(response.contextReceipt);
      setConversations((current) => {
        const existing = current.find((item) => item.id === response.conversationId);
        return [{
          id: response.conversationId,
          assistantType: assistantAtSend,
          title: existing?.title || trimmed.slice(0, 80),
          messages: nextMessages,
          metadata: { lastContextReceipt: response.contextReceipt },
        }, ...current.filter((item) => item.id !== response.conversationId)];
      });
    } catch (sendError) {
      if (sendAttemptRef.current !== attempt) return;
      setMessages(messages);
      setMessage(trimmed);
      setError(sendError?.message || `${definitionAtSend.name} could not complete the response.`);
    } finally {
      if (sendAttemptRef.current === attempt) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-2.5"><Bot className="h-6 w-6 text-indigo-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Profile-aware assistants</h1>
            <p className="text-sm text-slate-600">Responses are grounded server-side in your profile, research workspace, and selected parser-structured health records.</p>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Assistant request not completed</AlertTitle>
          <AlertDescription>
            {error}
            {error.includes('Consent required') && (
              <> <Link to="/healthdata" className="font-semibold underline">Review health-data consent.</Link></>
            )}
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved data updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(ASSISTANTS).map(([id, item]) => {
          const Icon = item.icon;
          const selected = assistant === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setAssistant(id)}
              className={`rounded-xl border p-4 text-left transition ${selected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`rounded-xl bg-gradient-to-br ${item.accent} p-2.5 text-white`}><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold text-slate-950">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-h-[640px]">
          <CardHeader className={`bg-gradient-to-r ${definition.accent} text-white`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AssistantIcon className="h-6 w-6" />
                <div>
                  <CardTitle>{definition.name}</CardTitle>
                  <CardDescription className="text-white/80">Contextual educational guidance</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={startNewConversation}>
                <MessageSquarePlus className="h-4 w-4" />New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[540px] flex-col gap-4 p-4 sm:p-6">
            <div className="flex-1 space-y-4 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:p-4">
              {!messages.length && (
                <div className="mx-auto max-w-lg py-14 text-center">
                  <AssistantIcon className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="mt-4 font-semibold text-slate-900">Ask a question that depends on your context</p>
                  <p className="mt-2 text-sm text-slate-600">
                    For example: “Which of my uploaded results are outside their document ranges, and what should I ask at my appointment?”
                  </p>
                </div>
              )}
              {messages.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${item.role === 'user' ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-800 shadow-sm'}`}>
                    {item.role === 'assistant'
                      ? <ReactMarkdown components={markdownComponents}>{item.content}</ReactMarkdown>
                      : <p className="whitespace-pre-wrap">{item.content}</p>}
                  </div>
                </div>
              ))}
              {sending && <p className="text-sm text-slate-500">{definition.name} is grounding the response in your current context…</p>}
            </div>
            <div className="space-y-3">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                rows={3}
                maxLength={8000}
                placeholder={`Ask ${definition.name} about your profile, research, or selected records…`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{selectedRecords.length} health record{selectedRecords.length === 1 ? '' : 's'} selected · educational use only</p>
                <Button onClick={sendMessage} disabled={sending || !message.trim()}><Send className="h-4 w-4" />Send</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Health records</CardTitle>
              <CardDescription>Only selected records that pass the health-document schema are requested.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && <p className="text-sm text-slate-500">Loading records…</p>}
              {!loading && !records.length && (
                <p className="text-sm text-slate-500">No parsed records. <Link to="/healthdata" className="font-medium text-blue-700 underline">Upload labwork</Link>.</p>
              )}
              {!loading && unavailableRecordCount > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {unavailableRecordCount} older record{unavailableRecordCount === 1 ? '' : 's'} cannot enter assistant context. Re-upload the source in Health Data to run the supported parser.
                </p>
              )}
              {records.map((record) => (
                <label key={record.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <Checkbox
                    checked={selectedRecordIds.includes(record.id)}
                    onCheckedChange={(checked) => toggleRecord(record.id, checked === true)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{record.title || 'Lab document'}</span>
                    <span className="block text-xs text-slate-500">{record.content?.summary?.total || 0} structured results</span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Context used</CardTitle>
              <CardDescription>The API returns this receipt independently of the model response.</CardDescription>
            </CardHeader>
            <CardContent><ContextReceipt receipt={receipt} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent {definition.name} conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!conversations.length && <p className="text-sm text-slate-500">No saved conversations.</p>}
              {conversations.slice(0, 5).map((conversation) => (
                <div key={conversation.id} className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
                  <button type="button" onClick={() => resumeConversation(conversation)} className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                    {conversation.title || 'Conversation'}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={deletingConversationId === conversation.id}
                    aria-label={`Delete ${conversation.title || 'assistant'} conversation`}
                    onClick={() => deleteConversation(conversation)}
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not medical advice</AlertTitle>
        <AlertDescription>Do not change treatment or medication based on an assistant response. Confirm source values and discuss medical decisions with a qualified clinician.</AlertDescription>
      </Alert>
    </div>
  );
}
