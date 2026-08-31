import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { downloadBlob } from '@/lib/browserFiles';
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
  FileJson,
  Loader2,
  Info,
  CheckCircle,
  AlertCircle,
  Users
} from "lucide-react";
import ProjectCollaboration from "./ProjectCollaboration";
import ProjectVersionControl from "./ProjectVersionControl";

function ProjectAnnotations({ project }) {
  const [annotations, setAnnotations] = useState([]);
  const [newContent, setNewContent] = useState("");
  const [targetGene, setTargetGene] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadAnnotations();
  }, [project.id]);

  const loadAnnotations = async () => {
    try {
      // apiClient.getProjectAnnotations() already unwraps to Annotation[].
      // Reading `.annotations` off that array yielded undefined, so the list
      // was permanently empty.
      const list = await apiClient.getProjectAnnotations(project.id);
      setAnnotations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error loading annotations:", err);
    }
  };

  const handleSubmit = async () => {
    if (!newContent.trim()) return;
    setIsSubmitting(true);
    try {
      await apiClient.createAnnotation(project.id, {
        targetType: targetGene ? 'gene' : 'project',
        targetId: targetGene.trim() || project.id,
        content: newContent,
      });
      setNewContent("");
      setTargetGene("");
      await loadAnnotations();
    } catch (err) {
      console.error("Error creating annotation:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (annotationId) => {
    try {
      await apiClient.updateAnnotation(project.id, annotationId, { resolved: true });
      await loadAnnotations();
    } catch (err) {
      console.error("Error resolving annotation:", err);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Edit2 className="w-5 h-5 text-amber-600" />
          Annotations & Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New annotation form */}
        <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex gap-2">
            <Input
              placeholder="Gene symbol (optional, e.g. BRCA1)"
              value={targetGene}
              onChange={(e) => setTargetGene(e.target.value)}
              className="max-w-[200px]"
            />
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              {targetGene ? `Gene: ${targetGene}` : 'Project-wide'}
            </Badge>
          </div>
          <Textarea
            placeholder="Add a note, observation, or question for your team..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="h-20"
          />
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !newContent.trim()}
            className="bg-amber-600 hover:bg-amber-700 gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Annotation
          </Button>
        </div>

        {/* Annotations list */}
        {annotations.length === 0 ? (
          <div className="text-center py-8">
            <Edit2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 text-sm">No annotations yet</p>
            <p className="text-xs text-slate-400">Add notes on genes, variants, or observations for your team</p>
          </div>
        ) : (
          <div className="space-y-3">
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                className={`p-3 border rounded-lg ${annotation.resolved ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {annotation.targetType === 'gene' ? `Gene: ${annotation.targetId}` : 'Project'}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {annotation.user?.displayName || annotation.user?.email || 'Unknown'} •{' '}
                        {new Date(annotation.createdAt).toLocaleDateString()}
                      </span>
                      {annotation.resolved && (
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Resolved
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-800">{annotation.content}</p>
                  </div>
                  {!annotation.resolved && annotation.userId === user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResolve(annotation.id)}
                      title="Mark as resolved"
                    >
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectManager() {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { user } = useAuth();
  const [newProject, setNewProject] = useState({
    title: "",
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
      const userProjects = await apiClient.getProjects();
      setProjects(userProjects);
    } catch (err) {
      console.error("Error loading projects:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.title.trim()) {
      // Give explicit feedback instead of silently doing nothing when the
      // required title is blank.
      setCreateError("Please enter a project name to continue.");
      return;
    }
    setCreateError("");
    setIsCreating(true);

    try {
      // Matches POST /entities/projects exactly. `phenotypes` and `tags` are
      // not columns — they go in `metadata`, which the server does persist.
      // Sent as top-level keys they were silently discarded.
      const projectData = {
        title: newProject.title,
        description: newProject.description,
        genes: newProject.genes.split(/[\s,]+/).filter(Boolean),
        status: "active",
        metadata: {
          phenotypes: newProject.phenotypes.split(/[\s,]+/).filter(Boolean),
          tags: newProject.tags.split(/[\s,]+/).filter(Boolean),
        },
      };

      await apiClient.createProject(projectData);

      setNewProject({ title: "", description: "", genes: "", phenotypes: "", tags: "" });
      setCreateDialogOpen(false);
      await loadProjects();

    } catch (err) {
      console.error("Error creating project:", err);
      setCreateError(err?.message || "Failed to create project. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateProject = async (projectId, updates) => {
    try {
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Version numbering and the change note are derived SERVER-side from the
      // update body (PUT /entities/projects/:id writes the next version row
      // itself). The client used to compute a `current_version` and send it;
      // the server does not accept that key, so it was silently discarded on
      // every update while the UI acted as though it had been applied.
      await apiClient.updateProject(projectId, updates);

      await loadProjects();

    } catch (err) {
      console.error("Error updating project:", err);
      throw err;
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm("Are you sure you want to delete this project? This will also remove all collaborators and version history.")) {
      return;
    }

    try {
      await apiClient.deleteProject(projectId);
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
            <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (open) setCreateError(""); }}>
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
                    <Label htmlFor="project-title">Project Name *</Label>
                    <Input
                      id="project-title"
                      placeholder="e.g., BRCA1 Variant Study"
                      value={newProject.title}
                      onChange={(e) => {
                        setNewProject({ ...newProject, title: e.target.value });
                        if (createError) setCreateError("");
                      }}
                      aria-invalid={!!createError && !newProject.title.trim()}
                      className={`mt-1 ${createError && !newProject.title.trim() ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
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
                      placeholder="e.g., oncology, discovery"
                      value={newProject.tags}
                      onChange={(e) => setNewProject({ ...newProject, tags: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  {createError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={handleCreateProject}
                    disabled={isCreating}
                    className="w-full bg-green-600 hover:bg-green-700 gap-2"
                  >
                    {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
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
                        <h3 className="font-semibold text-slate-900">{project.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {/* Version count comes from the API's _count relation.
                              When it is absent we say nothing rather than
                              printing a made-up "v1". */}
                          {typeof project._count?.versions === 'number' && (
                            <>v{project._count.versions} • </>
                          )}
                          Updated {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Unknown'}
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

                    {project.collaborators?.length > 0 && (
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="collaboration">Team</TabsTrigger>
            <TabsTrigger value="annotations">Annotations</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="share">Share Data</TabsTrigger>
          </TabsList>

          <TabsContent value="collaboration">
            <ProjectCollaboration 
              project={selectedProject} 
              onUpdate={loadProjects}
            />
          </TabsContent>

          <TabsContent value="annotations">
            <ProjectAnnotations project={selectedProject} />
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
                    <strong>Research export:</strong> Download a plain JSON summary for use with
                    research collaborators. Review the project first and do not include personal,
                    patient, medical-record, or individual genomic data.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const projectSummary = {
                        title: selectedProject.title,
                        description: selectedProject.description,
                        genes: selectedProject.genes,
                        phenotypes: selectedProject.metadata?.phenotypes,
                        status: selectedProject.status,
                        version: selectedProject._count?.versions,
                        created: selectedProject.createdAt,
                        updated: selectedProject.updatedAt
                      };
                      
                      const blob = new Blob([JSON.stringify(projectSummary, null, 2)], { type: 'application/json' });
                      downloadBlob(
                        blob,
                        `${selectedProject.title.replace(/\s+/g, '-')}-summary.json`,
                      );
                    }}
                  >
                    <FileJson className="w-4 h-4" />
                    Export Project Summary (JSON)
                  </Button>

                  <div className="bg-slate-50 p-4 rounded border border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-2 text-sm">Sharing Options:</h4>
                    <ul className="space-y-1 text-xs text-slate-700">
                      <li>• JSON summary: Reviewable project metadata for research collaboration</li>
                      <li>• Team access: Invite collaborators in the Team tab</li>
                      <li>• Do not enter or export personal, patient, or individual genomic data</li>
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
