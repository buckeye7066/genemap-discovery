import React, { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Clock,
  User,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

export default function AdminMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (user?.role !== 'admin' && !user?.super_admin) {
        setError('Admin access required');
        return;
      }

      // BACKEND_NEEDED: Message entity needs API implementation
      // const allMessages = await base44.entities.Message.filter({}, '-created_date', 500);
      // setMessages(allMessages || []);
      setMessages([]);
    } catch (err) {
      console.error('Error loading messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespond = async (message) => {
    if (!response.trim()) {
      setError('Please write a response');
      return;
    }

    setIsResponding(true);
    setError(null);

    try {
      // BACKEND_NEEDED: Message entity needs API implementation
      // await base44.entities.Message.update(message.id, {
      //   response,
      //   response_by: user.email,
      //   response_date: new Date().toISOString(),
      //   status: 'responded'
      // });

      // setSuccess('Response sent successfully!');
      // setResponse("");
      // setSelectedMessage(null);
      // await loadData();

      // setTimeout(() => setSuccess(null), 3000);
      setError('Response functionality not yet implemented');
    } catch (err) {
      setError(err.message || 'Failed to send response');
    } finally {
      setIsResponding(false);
    }
  };

  const handleMarkClosed = async (message) => {
    try {
      // BACKEND_NEEDED: Message entity needs API implementation
      // await base44.entities.Message.update(message.id, {
      //   status: 'closed'
      // });
      // await loadData();
      setError('Close message functionality not yet implemented');
    } catch (err) {
      setError('Failed to close message');
    }
  };

  const openMessages = messages.filter(m => m.status === 'open');
  const respondedMessages = messages.filter(m => m.status === 'responded');
  const closedMessages = messages.filter(m => m.status === 'closed');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (user?.role !== 'admin' && !user?.super_admin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Admin access required</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <MessageSquare className="w-10 h-10 text-blue-600" />
            User Messages
          </h1>
          <p className="text-slate-600">
            Messages from GeneMap users - Dr. John White
          </p>
        </div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Mail className="w-8 h-8 mx-auto mb-2 text-amber-600" />
                <div className="text-2xl font-bold text-slate-900">{openMessages.length}</div>
                <div className="text-xs text-slate-600">Open Messages</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold text-slate-900">{respondedMessages.length}</div>
                <div className="text-xs text-slate-600">Responded</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <div className="text-2xl font-bold text-slate-900">{closedMessages.length}</div>
                <div className="text-xs text-slate-600">Closed</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="open" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="open">
              Open ({openMessages.length})
            </TabsTrigger>
            <TabsTrigger value="responded">
              Responded ({respondedMessages.length})
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed ({closedMessages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            <div className="space-y-4">
              {openMessages.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Mail className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">No open messages</p>
                  </CardContent>
                </Card>
              ) : (
                openMessages.map((msg) => (
                  <Card key={msg.id} className="shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-2">{msg.subject}</CardTitle>
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <div className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {msg.created_by}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {format(new Date(msg.created_date), 'MMM d, yyyy h:mm a')}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={msg.is_issue ? "destructive" : "secondary"}>
                            {msg.is_issue ? 'Issue' : 'Message'}
                          </Badge>
                          <Badge className="bg-amber-100 text-amber-800">
                            Open
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-slate-50 p-4 rounded-lg mb-4">
                        <p className="text-slate-800 whitespace-pre-wrap">{msg.message}</p>
                      </div>

                      {selectedMessage?.id === msg.id ? (
                        <div className="space-y-4">
                          <Textarea
                            placeholder="Write your response to the user..."
                            value={response}
                            onChange={(e) => setResponse(e.target.value)}
                            className="h-32"
                            disabled={isResponding}
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleRespond(msg)}
                              disabled={isResponding || !response.trim()}
                              className="bg-blue-600 hover:bg-blue-700 gap-2"
                            >
                              {isResponding ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4" />
                                  Send Response
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedMessage(null);
                                setResponse("");
                              }}
                              disabled={isResponding}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => setSelectedMessage(msg)}
                          className="gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Respond
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="responded">
            <div className="space-y-4">
              {respondedMessages.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">No responded messages</p>
                  </CardContent>
                </Card>
              ) : (
                respondedMessages.map((msg) => (
                  <Card key={msg.id} className="shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-2">{msg.subject}</CardTitle>
                          <div className="flex items-center gap-3 text-sm text-slate-600">
                            <div className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              {msg.created_by}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {format(new Date(msg.created_date), 'MMM d, yyyy')}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge className="bg-green-100 text-green-800">
                            Responded
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkClosed(msg)}
                          >
                            Mark Closed
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">Original Message:</p>
                        <div className="bg-slate-50 p-3 rounded text-sm text-slate-800">
                          {msg.message}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          Your Response ({format(new Date(msg.response_date), 'MMM d, yyyy')}):
                        </p>
                        <div className="bg-blue-50 p-3 rounded text-sm text-slate-800">
                          {msg.response}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="closed">
            <div className="space-y-4">
              {closedMessages.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">No closed messages</p>
                  </CardContent>
                </Card>
              ) : (
                closedMessages.map((msg) => (
                  <Card key={msg.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg mb-2">{msg.subject}</CardTitle>
                          <p className="text-sm text-slate-600">{msg.created_by}</p>
                        </div>
                        <Badge className="bg-slate-100 text-slate-600">
                          Closed
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-600">
                      <p>Closed conversation from {format(new Date(msg.created_date), 'MMM d, yyyy')}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}