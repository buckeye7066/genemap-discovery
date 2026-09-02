import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
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
import { 
  Users, 
  UserPlus, 
  Shield, 
  CheckCircle, 
  Trash2,
  Info,
  Crown
} from "lucide-react";

export default function ProjectCollaboration({ project, onUpdate }) {
  const [collaborators, setCollaborators] = useState([]);
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [collaboratorRole, setCollaboratorRole] = useState("viewer");
  const [isAdding, setIsAdding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { user } = useAuth();
  // Only the owner may add or remove collaborators; the server enforces this
  // too (requireProjectAccess(..., ['owner'])). Hiding the control keeps the
  // UI from offering an action that will always 403.
  const isOwner = Boolean(user?.email) && project.user?.email === user.email;

  useEffect(() => {
    loadCollaborators();
  }, [project.id]);

  const loadCollaborators = async () => {
    try {
      const collabs = (await apiClient.getProjects()).find(p => p.id === project.id)?.collaborators || [];
      setCollaborators(collabs);
    } catch (err) {
      console.error("Error loading collaborators:", err);
    }
  };

  const handleAddCollaborator = async () => {
    if (!collaboratorEmail.trim()) return;

    setIsAdding(true);
    try {
      // POST /entities/projects/:id/collaborators takes exactly { userEmail, role }.
      // This used to send `user_email` (400 every time) plus a `permissions`
      // object the server has no column for. `role` IS the permission model,
      // and it is validated server-side against COLLABORATOR_ROLES.
      await apiClient.addCollaborator(project.id, {
        userEmail: collaboratorEmail.trim(),
        role: collaboratorRole,
      });

      setCollaboratorEmail("");
      setCollaboratorRole("viewer");
      setDialogOpen(false);
      await loadCollaborators();
      if (onUpdate) onUpdate();

    } catch (err) {
      console.error("Error adding collaborator:", err);
      alert(err?.message || "Failed to add collaborator. Confirm they already have a GeneMap account and try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRevokeAccess = async (collaboratorId) => {
    if (!window.confirm("Are you sure you want to revoke this user's access?")) {
      return;
    }

    try {
      await apiClient.removeCollaborator(project.id, collaboratorId);
      await loadCollaborators();
    } catch (err) {
      console.error("Error revoking access:", err);
    }
  };

  const getRoleBadge = (role) => {
    const styles = {
      owner: "bg-purple-600 text-white",
      editor: "bg-blue-600 text-white",
      viewer: "bg-slate-600 text-white"
    };
    return styles[role] || styles.viewer;
  };

  // NOTE: there is deliberately no getStatusIcon() any more. It switched over
  // pending / declined / revoked states that the collaborator model does not
  // have — POST /collaborators upserts a live membership row, so the only two
  // states are "is a collaborator" and "is not".

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Team Collaboration
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
                <UserPlus className="w-4 h-4" />
                Add collaborator
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add registered collaborator</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900 text-sm">
                    <strong>Direct membership:</strong> This immediately adds an existing GeneMap account by exact email. No invitation email or acceptance step exists. You can revoke access at any time.
                  </AlertDescription>
                </Alert>

                <div>
                  <Label htmlFor="collaborator-email">Collaborator Email *</Label>
                  <Input
                    id="collaborator-email"
                    type="email"
                    placeholder="colleague@university.edu"
                    value={collaboratorEmail}
                    onChange={(e) => setCollaboratorEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="collaborator-role">Role *</Label>
                  <Select value={collaboratorRole} onValueChange={setCollaboratorRole}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          <div>
                            <p className="font-medium">Viewer</p>
                            <p className="text-xs text-slate-500">Can view project data</p>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="editor">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          <div>
                            <p className="font-medium">Editor</p>
                            <p className="text-xs text-slate-500">Can edit and analyze</p>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Editors can modify project content; Viewers can only read it. Ownership cannot be delegated.
                  </p>
                </div>

                <Button
                  onClick={handleAddCollaborator}
                  disabled={isAdding || !collaboratorEmail.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isAdding ? (
                    <>
                      <UserPlus className="w-4 h-4 mr-2 animate-pulse" />
                      Adding collaborator...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add collaborator
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {collaborators.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500 text-sm mb-3">No collaborators yet</p>
            <p className="text-xs text-slate-400">Add registered team members by exact account email</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Project Owner */}
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                    <Crown className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {project.user?.displayName || project.user?.email || 'Project owner'}
                    </p>
                    <p className="text-xs text-slate-600">Project Owner</p>
                  </div>
                </div>
                <Badge className="bg-purple-600 text-white">Owner</Badge>
              </div>
            </div>

            {/* Collaborators */}
            {collaborators.map((collab, idx) => (
              <div key={idx} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div className="flex-1">
                      {/* A collaborator row IS the membership: the server creates
                          it directly, so there is no pending/revoked lifecycle
                          and no `status` column to render. The email comes from
                          the included user relation, not a `user_email` field. */}
                      <p className="font-medium text-slate-900 text-sm">
                        {collab.user?.displayName || collab.user?.email || 'Collaborator'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-xs ${getRoleBadge(collab.role)}`}>
                          {collab.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevokeAccess(collab.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {collaborators.length > 0 && (
          <Alert className="mt-4 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900 text-sm">
              <strong>Collaborative Project:</strong> {collaborators.length} team member(s)
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
