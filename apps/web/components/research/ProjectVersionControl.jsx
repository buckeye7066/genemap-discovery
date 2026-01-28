import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
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

  useEffect(() => {
    loadVersions();
  }, [project.id]);

  const loadVersions = async () => {
    try {
      // BACKEND_NEEDED: ProjectVersion entity needs API implementation
      // const projectVersions = await base44.entities.ProjectVersion.filter(
      //   { project_id: project.id },
      //   '-version_number',
      //   20
      // );
      const projectVersions = [];
      setVersions(projectVersions);
    } catch (err) {
      console.error("Error loading versions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (version) => {
    if (!window.confirm(`Restore project to version ${version.version_number}? This will create a new version with the restored data.`)) {
      return;
    }

    try {
      // Create new version with restored data
      const currentVersion = project.current_version || versions.length;
      
      // BACKEND_NEEDED: ResearchProject entity needs API implementation
      // await base44.entities.ResearchProject.update(project.id, {
      //   ...version.snapshot_data,
      //   current_version: currentVersion + 1
      // });

      // BACKEND_NEEDED: ProjectVersion entity needs API implementation
      // await base44.entities.ProjectVersion.create({
      //   project_id: project.id,
      //   version_number: currentVersion + 1,
      //   change_type: "metadata_updated",
      //   changes_description: `Restored from version ${version.version_number}`,
      //   snapshot_data: version.snapshot_data,
      //   modified_by: (await apiClient.getMe()).email
      // });

      if (onRestore) onRestore();
      await loadVersions();
      
    } catch (err) {
      console.error("Error restoring version:", err);
      alert("Failed to restore version. Please try again.");
    }
  };

  const getChangeIcon = (changeType) => {
    switch (changeType) {
      case 'created': return '🎉';
      case 'genes_updated': return '🧬';
      case 'notes_updated': return '📝';
      case 'analysis_added': return '📊';
      case 'status_changed': return '🔄';
      default: return '📄';
    }
  };

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
          Current version: {project.current_version || versions.length}
        </p>
      </CardHeader>
      <CardContent>
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
                        <div className="text-xl">{getChangeIcon(version.change_type)}</div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              v{version.version_number}
                            </Badge>
                            <Badge className="bg-blue-100 text-blue-800 text-xs">
                              {version.change_type.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-900 mt-1">
                            {version.changes_description}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {version.modified_by}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(version.created_date).toLocaleString()}
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
                      {version.snapshot_data && (
                        <div className="bg-slate-50 p-3 rounded text-xs">
                          <p className="font-semibold text-slate-900 mb-2">Snapshot Data:</p>
                          <pre className="text-slate-700 overflow-x-auto">
                            {JSON.stringify(version.snapshot_data, null, 2).substring(0, 500)}
                            {JSON.stringify(version.snapshot_data).length > 500 && '...'}
                          </pre>
                        </div>
                      )}
                      
                      {idx > 0 && (
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