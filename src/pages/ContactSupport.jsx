import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  MessageSquare,
  Send,
  Sparkles,
  Loader2,
  CheckCircle2,
  Mail
} from "lucide-react";

export default function ContactSupport() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isIssue, setIsIssue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleAIAssist = async () => {
    if (!subject.trim()) {
      setError("Please enter a subject first so AI can help draft your message");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const prompt = `You are helping a user write a message to Dr. John White about their genomics platform issue.

Subject: ${subject}

Write a clear, professional message describing the issue. Include:
1. What the user was trying to do
2. What went wrong or what they need help with
3. Any relevant context

Keep it concise (3-4 sentences) and professional but friendly.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      setMessage(response);
    } catch (err) {
      setError("Failed to generate message. Please write it manually.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!subject.trim() || !message.trim()) {
      setError("Please fill in both subject and message");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await base44.entities.Message.create({
        subject,
        message,
        is_issue: isIssue,
        status: "open"
      });

      setSuccess(true);
      setSubject("");
      setMessage("");
      setIsIssue(false);

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err.message || "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Contact Dr. John White
          </h1>
          <p className="text-lg text-slate-600">
            Send a message about the platform, request features, or report issues
          </p>
        </div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Message sent successfully! Dr. White will respond to you soon.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              New Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Brief description of your message"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="message">Message</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAIAssist}
                    disabled={isGenerating || !subject.trim() || !isIssue}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        AI Draft
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="message"
                  placeholder="Describe your question, feedback, or issue in detail..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="h-40"
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is-issue"
                  checked={isIssue}
                  onCheckedChange={setIsIssue}
                  disabled={isSubmitting}
                />
                <Label
                  htmlFor="is-issue"
                  className="text-sm font-normal cursor-pointer"
                >
                  This is a technical issue or bug report
                  {isIssue && (
                    <Badge variant="outline" className="ml-2">
                      AI assist available
                    </Badge>
                  )}
                </Label>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !subject.trim() || !message.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Message to Dr. White
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-slate-900 mb-2">About Response Times</h3>
            <p className="text-sm text-slate-700">
              Dr. John White personally reviews and responds to all messages. 
              You'll typically receive a response within 24-48 hours. 
              For urgent technical issues, please mark them as such.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}