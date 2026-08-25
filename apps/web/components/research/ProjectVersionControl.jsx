import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  History,
  Clock,
  User,
  FileText,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ReactMarkdown from 'react-markdown';

export default function ProjectVersionControl({ project, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedVersion, setExpandedVersion] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    if (project.id) {
      loadVersions();
    }
  }, [project.id]);

  const loadVersions = async () => {
    try {
      const projectVersions = await apiClient.getProjectVersions(project.id);
      setVersions(projectVersions);
    } catch (err) {
      console.error("Error loading versions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (version) => {
    setRestoreError("");

    // FAIL LOUDLY, NEVER SILENTLY. Versions written before snapshot capture
    // (migration 20260825120000) carry only a delta in `changes`, which cannot
    // be replayed into a project state. This previously spread `undefined` into
    // the payload; the server ignores unknown keys, returned 200, and the UI
    // reported a restore that never happened. Refuse instead, and say why.
    if (!version.snapshot) {
      setRestoreError(
        `Version ${version.version} cannot be restored: it was recorded before this `
        + `project stored full version snapshots, so there is no saved state to `
        + `restore. Nothing has been changed.`
      );
      return;
    }

    if (!window.confirm(
      `Restore project to version ${version.version}? This will create a new version with the restored data.`
    )) {
      return;
    }

    try {
      // The snapshot is exactly the field set PUT /entities/projects/:id
      // accepts. The server assigns the new version number itself.
      await apiClient.updateProject(project.id, version.snapshot);

      if (onRestore) onRestore();
      await loadVersions();

    } catch (err) {
      console.error("Error restoring version:", err);
      setRestoreError(err?.message || "Failed to restore version. Please try again.");
    }
  };

  // The server records a delta in `changes`; a project's first version is
  // tagged { type: 'initial' }. Everything else is a field update, so the icon
  // is derived from what the delta actually touched rather than from a
  // `change_type` column that does not exist.
  const getChangeIcon = (version) => {
    const changes = version?.changes;
    if (changes?.type === 'initial') return '🎉';
    if (changes && typeof changes === 'object') {
      if ('genes' in changes) return '🧬';
      if ('status' in changes) return '🔄';
      if ('description' in changes || 'title' in changes) return '📝';
    }
    return '📄';
  };

  // "Updated: title, genes" is written server-side into `notes`.
  const changeSummary = (version) =>
    version?.notes || (version?.changes?.type === 'initial' ? 'Project created' : 'Updated');

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardContent className="py-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          Version History
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Current version: {versions.length > 0
            ? Math.max(...versions.map((v) => v.version))
            : '—'}
        </p>
      </CardHeader>
      <CardContent>
        {restoreError && (
          <Alert variant="destructive" className="mb-4" role="alert">
            <AlertDescription className="text-sm">{restoreError}</AlertDescription>
          </Alert>
        )}
        {versions.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 text-sm">No version history yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((version, idx) => (
              <Collapsible
                key={idx}
                open={expandedVersion === version.id}
                onOpenChange={() => setExpandedVersion(expandedVersion === version.id ? null : version.id)}
              >
                <div className="border border-slate-200 rounded-lg">
                  <CollapsibleTrigger className="w-full p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">{getChangeIcon(version)}</div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              v{version.version}
                            </Badge>
                            {!version.snapshot && (
                              <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                                no snapshot
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-900 mt-1">
                            {changeSummary(version)}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {version.createdBy}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(version.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {expandedVersion === version.id ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-3 pb-3 border-t border-slate-200 pt-3 mt-3">
                      {version.snapshot ? (
                        <div className="bg-slate-50 p-3 rounded text-xs">
                          <p className="font-semibold text-slate-900 mb-2">Snapshot Data:</p>
                          <pre className="text-slate-700 overflow-x-auto">
                            {JSON.stringify(version.snapshot, null, 2).substring(0, 500)}
                            {JSON.stringify(version.snapshot).length > 500 && '...'}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                          This version was recorded before full snapshots were stored, so its
                          state cannot be shown or restored.
                        </p>
                      )}

                      {idx > 0 && version.snapshot && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(version)}
                          className="mt-3 gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restore This Version
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}

        <Alert className="mt-4 bg-indigo-50 border-indigo-200">
          <Info className="h-4 w-4 text-indigo-600" />
          <AlertDescription className="text-indigo-900 text-sm">
            All changes are automatically versioned. Restore any previous version to recover data or track project evolution.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}