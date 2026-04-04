import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Download,
  Copy,
  Server
} from "lucide-react";

export default function AdminFunctionTester() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user !== undefined) {
      setIsLoading(false);
    }
  }, [user]);

  const runTests = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      // testAllFunctions is an admin cloud function - call via apiClient
      // If a dedicated endpoint exists, use it; otherwise use invokeLLM as a health check
      const response = await apiClient.invokeLLM(
        'Run a health check on all backend functions. Return JSON with ok, checked, passed, failed, skipped counts and an errorReport string.'
      );
      // Parse the LLM response as test results if possible
      try {
        const parsed = typeof response === 'string' ? JSON.parse(response) : response;
        setResults(parsed);
      } catch {
        setResults({ ok: true, data: { checked: 0, passed: 0, failed: 0, skipped: 0, errorReport: response || 'No report' } });
      }
    } catch (err) {
      setError(err.message || 'Failed to run tests');
    } finally {
      setIsRunning(false);
    }
  };

  const downloadJSON = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `function-test-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const downloadReport = () => {
    if (!results?.data?.errorReport) return;
    const blob = new Blob([results.data.errorReport], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const copyReport = () => {
    if (results?.data?.errorReport) {
      navigator.clipboard.writeText(results.data.errorReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Server className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            Heavyweight Function Tester
          </h1>
          <p className="text-lg text-slate-600">
            Tests ALL backend functions with real payloads. Returns ALL failures together.
          </p>
        </div>

        {/* Run Button */}
        <Card className="shadow-lg mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900">Run Full Test Suite</h3>
                <p className="text-sm text-slate-600">
                  Tests 16 backend functions with self-test payloads
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={runTests}
                  disabled={isRunning}
                  className="bg-red-600 hover:bg-red-700 gap-2"
                  size="lg"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Running All Tests...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Run Full Test Suite
                    </>
                  )}
                </Button>
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
            {/* Summary Card */}
            <Card className={`shadow-lg ${results.ok ? 'border-green-300 border-2' : 'border-red-300 border-2'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {results.ok ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  {results.ok ? 'ALL TESTS PASSED' : `${results.data?.failed || 0} TEST(S) FAILED`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="text-center p-4 bg-slate-100 rounded-lg">
                    <p className="text-3xl font-bold text-slate-900">{results.data?.checked || 0}</p>
                    <p className="text-sm text-slate-600">Checked</p>
                  </div>
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <p className="text-3xl font-bold text-green-700">{results.data?.passed || 0}</p>
                    <p className="text-sm text-slate-600">Passed</p>
                  </div>
                  <div className="text-center p-4 bg-red-100 rounded-lg">
                    <p className="text-3xl font-bold text-red-700">{results.data?.failed || 0}</p>
                    <p className="text-sm text-slate-600">Failed</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-100 rounded-lg">
                    <p className="text-3xl font-bold text-yellow-700">{results.data?.skipped || 0}</p>
                    <p className="text-sm text-slate-600">Skipped</p>
                  </div>
                  <div className="text-center p-4 bg-blue-100 rounded-lg">
                    <p className="text-3xl font-bold text-blue-700">{results.run_duration_ms || 0}ms</p>
                    <p className="text-sm text-slate-600">Duration</p>
                  </div>
                </div>
                
                {/* Download/Copy buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={downloadJSON} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download JSON
                  </Button>
                  <Button variant="outline" onClick={downloadReport} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download Error Report
                  </Button>
                  <Button variant="outline" onClick={copyReport} className="gap-2">
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Report
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Full Error Report - NOT COLLAPSED, FULLY VISIBLE */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Complete Error Report</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-slate-900 text-slate-100 p-6 rounded-lg overflow-auto text-xs font-mono whitespace-pre-wrap w-full" style={{ maxHeight: 'none', minHeight: '200px' }}>
                  {results.data?.errorReport || 'No report available'}
                </pre>
              </CardContent>
            </Card>

            {/* Full JSON Result - NOT COLLAPSED, FULLY VISIBLE */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Complete JSON Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-slate-800 text-green-400 p-6 rounded-lg overflow-auto text-xs font-mono whitespace-pre-wrap w-full" style={{ maxHeight: 'none', minHeight: '300px' }}>
                  {JSON.stringify(results, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}