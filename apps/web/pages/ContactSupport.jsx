import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@genemap/shared';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function messageTime(value) {
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable';
}

export default function ContactSupport() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isIssue, setIsIssue] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadMessages = useCallback(async () => {
    setIsLoadingMessages(true);
    try {
      const records = await apiClient.getMyMessages();
      setMessages(Array.isArray(records) ? records : []);
    } catch (loadError) {
      setError(loadError?.message || 'Support messages could not be loaded.');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const repliesByParent = useMemo(() => {
    const output = new Map();
    for (const record of messages) {
      if (!record.parentId || record.direction !== 'received') continue;
      const list = output.get(record.parentId) || [];
      list.push(record);
      output.set(record.parentId, list);
    }
    return output;
  }, [messages]);

  const threads = useMemo(() => messages.filter((record) => (
    !record.parentId && record.direction === 'sent'
  )), [messages]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject || !cleanMessage) {
      setError('Enter both a subject and message.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      await apiClient.sendMessage({
        subject: cleanSubject,
        body: cleanMessage,
        isIssue,
      });
      setSubject('');
      setMessage('');
      setIsIssue(false);
      setNotice('Your message was delivered to the support inbox. Replies will appear below.');
      await loadMessages();
    } catch (sendError) {
      setError(sendError?.message || 'The support message could not be sent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
            <MessageSquare className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Contact support</h1>
          <p className="mt-2 text-slate-600">Ask about the platform, request a feature, or report a technical issue.</p>
        </div>

        {notice && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Message delivered</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Action not completed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />New support message</CardTitle>
            <CardDescription>Messages are stored in your account so you can see the reply in this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={300}
                  placeholder="Brief description of your message"
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={20000}
                  rows={7}
                  placeholder="Describe your question, feedback, or issue in detail."
                  disabled={isSubmitting}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={isIssue}
                  onCheckedChange={(checked) => setIsIssue(checked === true)}
                  disabled={isSubmitting}
                />
                This is a technical issue or bug report
              </label>
              <Button
                type="submit"
                className="w-full bg-blue-700 hover:bg-blue-800"
                disabled={isSubmitting || !subject.trim() || !message.trim()}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSubmitting ? 'Sending…' : 'Send to support'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Your support messages</CardTitle>
              <CardDescription>Administrator replies appear inside the original thread.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadMessages} disabled={isLoadingMessages}>
              <RefreshCw className={`h-4 w-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingMessages && !threads.length && <p className="text-sm text-slate-500">Loading support messages…</p>}
            {!isLoadingMessages && !threads.length && <p className="text-sm text-slate-500">No support messages yet.</p>}
            {threads.map((thread) => {
              const replies = repliesByParent.get(thread.id) || [];
              return (
                <article key={thread.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">{thread.subject}</h2>
                    <span className="text-xs text-slate-500">{messageTime(thread.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{thread.body}</p>
                  <div className="mt-3 flex gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{thread.status || 'open'}</span>
                    {thread.isIssue && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">technical issue</span>}
                  </div>
                  {replies.map((reply) => (
                    <div key={reply.id} className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-blue-950">Support reply</p>
                        <span className="text-xs text-blue-700">{messageTime(reply.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-blue-950">{reply.body}</p>
                    </div>
                  ))}
                </article>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
