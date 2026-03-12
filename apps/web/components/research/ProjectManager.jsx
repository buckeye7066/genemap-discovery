import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Beaker, 
  Plus, 
  Edit2, 
  Trash2,
  Share2,
  Download,
  FileJson,
  Loader2,
  Info,
  CheckCircle
} from "lucide-react";
import ProjectCollaboration from "./ProjectCollaboration";
import ProjectVersionControl from "./ProjectVersionControl";
import FHIRExporter from "../medical/FHIRExporter";

export default function ProjectManager() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { user } = useAuth();
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    genes: "",
    phenotypes: "",
    tags: ""
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      // BACKEND_NEEDED: ResearchProject entity needs API implementation
      // const userProjects = await base44.entities.ResearchProject.filter(
      //   {},
      //   '-updated_date'
      // );
      const userProjects = [];
      setProjects(userProjects);
    } catch (err) {
      console.error("Error loading projects:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) return;

    try {
      const projectData = {
        name: newProject.name,
        description: newProject.description,
        genes: newProject.genes.split(/[\s,]+/).filter(Boolean),
        phenotypes: newProject.phenotypes.split(/[\s,]+/).filter(Boolean),
        tags: newProject.tags.split(/[\s,]+/).filter(Boolean),
        status: "active",
        current_version: 1
      };

      // BACKEND_NEEDED: ResearchProject entity needs API implementation
      // const created = await base44.entities.ResearchProject.create(projectData);
      const created = { id: Date.now() };

      // BACKEND_NEEDED: ProjectVersion entity needs API implementation
      // await base44.entities.ProjectVersion.create({
      //   project_id: created.id,
      //   version_number: 1,
      //   change_type: "created",
      //   changes_description: "Project created",
      //   snapshot_data: projectData,
      //   modified_by: user?.email
      // });

      setNewProject({ name: "", description: "", genes: "", phenotypes: "", tags: "" });
      setCreateDialogOpen(false);
      await loadProjects();
      
    } catch (err) {
      console.error("Error creating project:", err);
      alert("Failed to create project. Please try again.");
    }
  };

  const handleUpdateProject = async (projectId, updates) => {
    try {
      const project = projects.find(p => p.id === projectId);
      
      // Determine change type
      let changeType = "metadata_updated";
      if (updates.genes && JSON.stringify(updates.genes) !== JSON.stringify(project.genes)) {
        changeType = "genes_updated";
      } else if (updates.notes && updates.notes !== project.notes) {
        changeType = "notes_updated";
      } else if (updates.status && updates.status !== project.status) {
        changeType = "status_changed";
      }

      const newVersion = (project.current_version || 1) + 1;
      
      // BACKEND_NEEDED: ResearchProject entity needs API implementation
      // await base44.entities.ResearchProject.update(projectId, {
      //   ...updates,
      //   current_version: newVersion
      // });

      // BACKEND_NEEDED: ProjectVersion entity needs API implementation
      // await base44.entities.ProjectVersion.create({
      //   project_id: projectId,
      //   version_number: newVersion,
      //   change_type: changeType,
      //   changes_description: `${changeType.replace('_', ' ')} by ${user?.email}`,
      //   snapshot_data: { ...project, ...updates },
      //   modified_by: user?.email
      // });

      await loadProjects();
      
    } catch (err) {
      console.error("Error updating project:", err);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Are you sure you want to delete this project? This will also remove all collaborators and version history.")) {
      return;
    }

    try {
      // BACKEND_NEEDED: ResearchProject entity needs API implementation
      // await base44.entities.ResearchProject.delete(projectId);
      await loadProjects();
      setSelectedProject(null);
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'paused': return 'bg-amber-100 text-amber-800';
      case 'completed': return 'bg-purple-100 text-purple-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading research projects...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-green-600" />
              Research Projects
            </CardTitle>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 gap-2">
                  <Plus className="w-4 h-4" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Research Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="project-name">Project Name *</Label>
                    <Input
                      id="project-name"
                      placeholder="e.g., BRCA1 Variant Study"
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="project-description">Description</Label>
                    <Textarea
                      id="project-description"
                      placeholder="Brief description of your research project..."
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                      className="mt-1 h-20"
                    />
                  </div>

                  <div>
                    <Label htmlFor="project-genes">Genes (comma or space separated)</Label>
                    <Input
                      id="project-genes"
                      placeholder="e.g., BRCA1, BRCA2, TP53"
                      value={newProject.genes}
                      onChange={(e) => setNewProject({ ...newProject, genes: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="project-phenotypes">Phenotypes</Label>
                    <Input
                      id="project-phenotypes"
                      placeholder="e.g., breast cancer, ovarian cancer"
                      value={newProject.phenotypes}
                      onChange={(e) => setNewProject({ ...newProject, phenotypes: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="project-tags">Tags</Label>
                    <Input
                      id="project-tags"
                      placeholder="e.g., oncology, clinical"
                      value={newProject.tags}
                      onChange={(e) => setNewProject({ ...newProject, tags: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <Button
                    onClick={handleCreateProject}
                    disabled={!newProject.name.trim()}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Create Project
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <Beaker className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                No Research Projects
              </h3>
              <p className="text-slate-500 mb-4">
                Create your first research project to organize genes, analyses, and collaborations
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedProject?.id === project.id ? 'ring-2 ring-green-500 bg-green-50' : ''
                  }`}
                  onClick={() => setSelectedProject(project)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{project.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          v{project.current_version || 1} • Updated {new Date(project.updated_date).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                    </div>

                    {project.description && (
                      <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    {project.genes && project.genes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {project.genes.slice(0, 5).map((gene, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {gene}
                          </Badge>
                        ))}
                        {project.genes.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{project.genes.length - 5}
                          </Badge>
                        )}
                      </div>
                    )}

                    {project.is_collaborative && (
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        Collaborative
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProject && (
        <Tabs defaultValue="collaboration" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="collaboration">Team</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="share">Share Data</TabsTrigger>
          </TabsList>

          <TabsContent value="collaboration">
            <ProjectCollaboration 
              project={selectedProject} 
              onUpdate={loadProjects}
            />
          </TabsContent>

          <TabsContent value="versions">
            <ProjectVersionControl 
              project={selectedProject}
              onRestore={loadProjects}
            />
          </TabsContent>

          <TabsContent value="share">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-purple-600" />
                  Share Project Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-purple-50 border-purple-200">
                  <Info className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-900 text-sm">
                    <strong>Secure Data Sharing:</strong> Export aggregated project data as FHIR-compliant 
                    bundles for secure sharing with healthcare systems or research collaborators.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <FHIRExporter
                    data={{
                      project_id: selectedProject.id,
                      project_name: selectedProject.name,
                      genes: selectedProject.genes,
                      phenotypes: selectedProject.phenotypes,
                      status: selectedProject.status,
                      analysis_results: selectedProject.analysis_results,
                      version: selectedProject.current_version
                    }}
                    type="research_project"
                  />

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const projectSummary = {
                        name: selectedProject.name,
                        description: selectedProject.description,
                        genes: selectedProject.genes,
                        phenotypes: selectedProject.phenotypes,
                        status: selectedProject.status,
                        version: selectedProject.current_version,
                        created: selectedProject.created_date,
                        updated: selectedProject.updated_date
                      };
                      
                      const blob = new Blob([JSON.stringify(projectSummary, null, 2)], { type: 'application/json' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${selectedProject.name.replace(/\s+/g, '-')}-summary.json`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      a.remove();
                    }}
                  >
                    <FileJson className="w-4 h-4" />
                    Export Project Summary (JSON)
                  </Button>

                  <div className="bg-slate-50 p-4 rounded border border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-2 text-sm">Sharing Options:</h4>
                    <ul className="space-y-1 text-xs text-slate-700">
                      <li>• FHIR Bundle: For clinical systems integration</li>
                      <li>• JSON Summary: For data sharing with collaborators</li>
                      <li>• Team Access: Invite collaborators in Team tab</li>
                      <li>• All exports exclude PHI unless explicitly included</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}