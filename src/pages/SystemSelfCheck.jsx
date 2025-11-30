import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  Database,
  Server,
  Lock,
  Zap,
  Clock,
  RefreshCw,
  Copy,
  FileText
} from "lucide-react";

export default function SystemSelfCheck() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [previousLogs, setPreviousLogs] = useState([]);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      if (currentUser.role === 'admin') {
        loadPreviousLogs();
      }
    } catch (err) {
      console.error("Auth error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPreviousLogs = async () => {
    try {
      const logs = await base44.entities.SystemCheckLog.filter(
        {},
        '-created_date',
        10
      );
      setPreviousLogs(logs);
    } catch (err) {
      console.log("No previous logs found");
    }
  };

  const runDiagnostic = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      const response = await base44.functions.invoke('systemSelfCheck', {});
      setResults(response.data || response);
      loadPreviousLogs();
    } catch (err) {
      setError(err.message || 'Failed to run diagnostic');
    } finally {
      setIsRunning(false);
    }
  };

  const downloadReport = () => {
    if (!results) return;
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-check-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'database': return <Database className="w-4 h-4" />;
      case 'backend_function': return <Server className="w-4 h-4" />;
      case 'rls': return <Lock className="w-4 h-4" />;
      case 'environment': return <Zap className="w-4 h-4" />;
      case 'integration': return <RefreshCw className="w-4 h-4" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const groupChecksByCategory = (checks) => {
    return checks.reduce((acc, check) => {
      const cat = check.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(check);
      return acc;
    }, {});
  };

  const copyErrorReport = () => {
    if (results?.combinedErrorReport) {
      navigator.clipboard.writeText(results.combinedErrorReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearResults = () => {
    setClearing(true);
    setResults(null);
    setError(null);
    setTimeout(() => setClearing(false), 300);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive">
            <Lock className="w-4 h-4" />
            <AlertDescription>
              Access Denied. This page requires administrator privileges.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const groupedChecks = results?.checks ? groupChecksByCategory(results.checks) : {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            System Self-Check
          </h1>
          <p className="text-lg text-slate-600">
            Comprehensive diagnostic for all application layers
          </p>
        </div>

        {/* Run Button */}
        <Card className="shadow-lg mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">Run Full System Diagnostic</h3>
                <p className="text-sm text-slate-600">
                  Tests backend functions, database, RLS policies, integrations, and cross-contamination
                </p>
              </div>
              <div className="flex gap-2">
                {results && (
                  <Button variant="outline" onClick={clearResults} disabled={clearing} className="gap-2">
                    Clear Results
                  </Button>
                )}
                <Button
                  onClick={runDiagnostic}
                  disabled={isRunning}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Diagnostic
                    </>
                  )}
                </Button>
                {results && (
                  <Button variant="outline" onClick={downloadReport} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download JSON
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <XCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Summary */}
            <Card className={`shadow-lg ${results.ok ? 'border-green-200' : 'border-red-200'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {results.ok ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <p className="text-3xl font-bold text-slate-900">{results.summary.total}</p>
                    <p className="text-sm text-slate-600">Total Checks</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-3xl font-bold text-green-600">{results.summary.passed}</p>
                    <p className="text-sm text-slate-600">Passed</p>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-3xl font-bold text-red-600">{results.summary.failed}</p>
                    <p className="text-sm text-slate-600">Failed</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">
                      {results.run_duration_ms ? `${results.run_duration_ms}ms` : '-'}
                    </p>
                    <p className="text-sm text-slate-600">Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Combined Error Report */}
            {results.combinedErrorReport && (
              <Card className="shadow-lg border-slate-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-600" />
                      Combined Error Report
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyErrorReport}
                      className="gap-2"
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Full Report
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {results.combinedErrorReport}
                  </pre>
                </CardContent>
              </Card>
            )}

            {/* Contamination Results */}
            <Card className={`shadow-lg ${results.contamination?.ok ? 'border-green-200' : 'border-red-200'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {results.contamination?.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  Cross-Contamination Detection
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.contamination?.ok ? (
                  <p className="text-green-700">No data leakage detected. RLS policies are functioning correctly.</p>
                ) : (
                  <div className="space-y-3">
                    {results.contamination?.results?.map((item, idx) => (
                      <Alert key={idx} variant="destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          <strong>{item.functionName}</strong>: {item.description}
                          <br />
                          <span className="text-xs">File: {item.filePath}</span>
                          {item.offendingCode && (
                            <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto">
                              {item.offendingCode}
                            </pre>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed Checks by Category */}
            {Object.entries(groupedChecks).map(([category, checks]) => (
              <Card key={category} className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    {getCategoryIcon(category)}
                    {category.replace('_', ' ')} Checks
                    <Badge variant={checks.every(c => c.ok) ? 'default' : 'destructive'}>
                      {checks.filter(c => c.ok).length}/{checks.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Status</TableHead>
                        <TableHead>Check Name</TableHead>
                        <TableHead>File Path</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checks.map((check, idx) => (
                        <React.Fragment key={idx}>
                          <TableRow className={!check.ok ? 'bg-red-50' : ''}>
                            <TableCell>
                              {check.ok ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-600" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{check.name}</TableCell>
                            <TableCell className="text-sm text-slate-600">
                              {check.filePath || '-'}
                            </TableCell>
                            <TableCell>
                              {(check.error || check.stack) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleRow(`${category}-${idx}`)}
                                >
                                  {expandedRows[`${category}-${idx}`] ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedRows[`${category}-${idx}`] && (check.error || check.stack) && (
                            <TableRow>
                              <TableCell colSpan={4} className="bg-slate-50">
                                <div className="p-3">
                                  {check.error && (
                                    <div className="mb-2">
                                      <p className="text-sm font-medium text-red-700">Error:</p>
                                      <p className="text-sm text-red-600">{check.error}</p>
                                    </div>
                                  )}
                                  {check.stack && (
                                    <div>
                                      <p className="text-sm font-medium text-slate-700">Stack Trace:</p>
                                      <pre className="text-xs bg-slate-100 p-2 rounded overflow-x-auto mt-1">
                                        {check.stack}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Previous Logs */}
        {previousLogs.length > 0 && (
          <Card className="shadow-lg mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-slate-600" />
                Previous Check Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {previousLogs.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {log.summary?.failed === 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {log.summary?.passed || 0}/{log.summary?.total || 0} passed
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(log.created_date).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={log.summary?.failed === 0 ? 'default' : 'destructive'}>
                      {log.run_duration_ms ? `${log.run_duration_ms}ms` : '-'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}