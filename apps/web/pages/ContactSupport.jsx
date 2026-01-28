import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  Sparkles,
  Loader2,
  CheckCircle2,
  Mail,
  Palette
} from "lucide-react";

export default function ContactSupport() {
  const [user, setUser] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isIssue, setIsIssue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [showCustomize, setShowCustomize] = useState(false);
  
  // Customization options
  const [themeColor, setThemeColor] = useState("blue");
  const [fontSize, setFontSize] = useState("medium");
  const [fontFamily, setFontFamily] = useState("default");

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);
      
      // Load saved preferences
      if (currentUser.message_theme_color) setThemeColor(currentUser.message_theme_color);
      if (currentUser.message_font_size) setFontSize(currentUser.message_font_size);
      if (currentUser.message_font_family) setFontFamily(currentUser.message_font_family);
    } catch (err) {
      console.log("Not logged in");
    }
  };

  const saveCustomization = async () => {
    try {
      // BACKEND_NEEDED: User preferences update needs API implementation
      // await base44.auth.updateMe({
      //   message_theme_color: themeColor,
      //   message_font_size: fontSize,
      //   message_font_family: fontFamily
      // });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError("Failed to save customization");
    }
  };

  const getThemeClasses = () => {
    const themes = {
      blue: "from-blue-600 to-indigo-600",
      purple: "from-purple-600 to-pink-600",
      green: "from-green-600 to-emerald-600",
      red: "from-red-600 to-rose-600",
      orange: "from-orange-600 to-amber-600",
      slate: "from-slate-600 to-gray-600"
    };
    return themes[themeColor] || themes.blue;
  };

  const getButtonTheme = () => {
    const themes = {
      blue: "bg-blue-600 hover:bg-blue-700",
      purple: "bg-purple-600 hover:bg-purple-700",
      green: "bg-green-600 hover:bg-green-700",
      red: "bg-red-600 hover:bg-red-700",
      orange: "bg-orange-600 hover:bg-orange-700",
      slate: "bg-slate-600 hover:bg-slate-700"
    };
    return themes[themeColor] || themes.blue;
  };

  const getFontSizeClass = () => {
    const sizes = {
      small: "text-sm",
      medium: "text-base",
      large: "text-lg"
    };
    return sizes[fontSize] || sizes.medium;
  };

  const getFontFamilyClass = () => {
    const fonts = {
      default: "font-sans",
      serif: "font-serif",
      mono: "font-mono"
    };
    return fonts[fontFamily] || fonts.default;
  };

  const handleAIAssist = async () => {
    if (!subject.trim()) {
      setError("Please enter a subject first so AI can help draft your message");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // BACKEND_NEEDED: Core LLM integration needs API implementation
      // const prompt = `You are helping a user write a message to Dr. John White about their genomics platform issue.

      // Subject: ${subject}

      // Write a clear, professional message describing the issue. Include:
      // 1. What the user was trying to do
      // 2. What went wrong or what they need help with
      // 3. Any relevant context

      // Keep it concise (3-4 sentences) and professional but friendly.`;

      // const response = await base44.integrations.Core.InvokeLLM({
      //   prompt,
      //   add_context_from_internet: false
      // });

      // setMessage(response);
      setError("AI assist not yet implemented. Please write it manually.");
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
      // BACKEND_NEEDED: Message entity needs API implementation
      // await base44.entities.Message.create({
      //   subject,
      //   message,
      //   is_issue: isIssue,
      //   status: "open"
      // });

      // setSuccess(true);
      // setSubject("");
      // setMessage("");
      // setIsIssue(false);

      // setTimeout(() => setSuccess(false), 5000);
      setError("Message sending not yet implemented");
    } catch (err) {
      setError(err.message || "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 ${getFontFamilyClass()}`}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-2 mb-4">
            <div className={`w-16 h-16 bg-gradient-to-r ${getThemeClasses()} rounded-2xl flex items-center justify-center shadow-lg`}>
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCustomize(!showCustomize)}
              className="gap-2"
            >
              <Palette className="w-4 h-4" />
              Customize
            </Button>
          </div>
          <h1 className={`text-4xl font-bold text-slate-900 mb-4 ${getFontSizeClass()}`}>
            Contact Dr. John White
          </h1>
          <p className={`text-lg text-slate-600 ${getFontSizeClass()}`}>
            Send a message about the platform, request features, or report issues
          </p>
        </div>

        {/* Customization Panel */}
        {showCustomize && (
          <Card className="mb-6 shadow-lg border-2 border-purple-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-600" />
                Customize Your Messaging Experience
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Theme Color</Label>
                  <Select value={themeColor} onValueChange={setThemeColor}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blue">Blue</SelectItem>
                      <SelectItem value="purple">Purple</SelectItem>
                      <SelectItem value="green">Green</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="orange">Orange</SelectItem>
                      <SelectItem value="slate">Slate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Font Size</Label>
                  <Select value={fontSize} onValueChange={setFontSize}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Font Style</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (Sans)</SelectItem>
                      <SelectItem value="serif">Serif</SelectItem>
                      <SelectItem value="mono">Monospace</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={saveCustomization} className={`w-full ${getButtonTheme()} gap-2`}>
                <CheckCircle2 className="w-4 h-4" />
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        )}

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
                className={`w-full ${getButtonTheme()} gap-2`}
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

        <Card className={`mt-6 ${themeColor === 'blue' ? 'bg-blue-50 border-blue-200' : themeColor === 'purple' ? 'bg-purple-50 border-purple-200' : themeColor === 'green' ? 'bg-green-50 border-green-200' : themeColor === 'red' ? 'bg-red-50 border-red-200' : themeColor === 'orange' ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
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