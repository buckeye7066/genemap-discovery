import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
  Mail, 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock,
  Trash2,
  Info,
  Crown
} from "lucide-react";

export default function ProjectCollaboration({ project, onUpdate }) {
  const [collaborators, setCollaborators] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, [project.id]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const collabs = await base44.entities.ProjectCollaborator.filter({
        project_id: project.id
      });
      setCollaborators(collabs);
    } catch (err) {
      console.error("Error loading collaborators:", err);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      // Set permissions based on role
      const permissions = {
        owner: { can_edit: true, can_share: true, can_delete: true },
        editor: { can_edit: true, can_share: false, can_delete: false },
        viewer: { can_edit: false, can_share: false, can_delete: false }
      };

      await base44.entities.ProjectCollaborator.create({
        project_id: project.id,
        user_email: inviteEmail.trim(),
        role: inviteRole,
        invited_by: user.email,
        status: "pending",
        permissions: permissions[inviteRole]
      });

      // Send invitation email
      await base44.integrations.Core.SendEmail({
        to: inviteEmail.trim(),
        subject: `Invitation to collaborate on "${project.name}"`,
        body: `${user.full_name || user.email} has invited you to collaborate on the research project "${project.name}" on GeneMap.

Role: ${inviteRole}
Project: ${project.name}
Description: ${project.description || 'No description'}

Log in to GeneMap to accept this invitation and start collaborating!

Best regards,
GeneMap Team`
      });

      // Update project collaborative status
      if (!project.is_collaborative) {
        await base44.entities.ResearchProject.update(project.id, {
          is_collaborative: true
        });
      }

      setInviteEmail("");
      setInviteRole("viewer");
      setDialogOpen(false);
      await loadData();
      if (onUpdate) onUpdate();

    } catch (err) {
      console.error("Error sending invitation:", err);
      alert("Failed to send invitation. Please try again.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeAccess = async (collaboratorId) => {
    if (!window.confirm("Are you sure you want to revoke this user's access?")) {
      return;
    }

    try {
      await base44.entities.ProjectCollaborator.update(collaboratorId, {
        status: "revoked"
      });
      await loadData();
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-600" />;
      case 'declined': return <XCircle className="w-4 h-4 text-red-600" />;
      case 'revoked': return <XCircle className="w-4 h-4 text-slate-600" />;
      default: return null;
    }
  };

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
                Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Collaborator</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900 text-sm">
                    <strong>Secure Collaboration:</strong> Invited users will receive an email and 
                    can access the project once they accept. You can revoke access at any time.
                  </AlertDescription>
                </Alert>

                <div>
                  <Label htmlFor="invite-email">Collaborator Email *</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@university.edu"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="invite-role">Role *</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
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
                      <SelectItem value="owner">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4" />
                          <div>
                            <p className="font-medium">Owner</p>
                            <p className="text-xs text-slate-500">Full control</p>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Owners can delete, Editors can modify, Viewers can only read
                  </p>
                </div>

                <Button
                  onClick={handleInvite}
                  disabled={isInviting || !inviteEmail.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isInviting ? (
                    <>
                      <Mail className="w-4 h-4 mr-2 animate-pulse" />
                      Sending Invitation...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Invitation
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
            <p className="text-xs text-slate-400">Invite team members to collaborate on this project</p>
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
                    <p className="font-semibold text-slate-900 text-sm">{project.created_by}</p>
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
                    {getStatusIcon(collab.status)}
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 text-sm">{collab.user_email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-xs ${getRoleBadge(collab.role)}`}>
                          {collab.role}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {collab.status}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          by {collab.invited_by === user?.email ? 'you' : collab.invited_by}
                        </span>
                      </div>
                    </div>
                  </div>
                  {collab.invited_by === user?.email && collab.status !== 'revoked' && (
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

        {project.is_collaborative && (
          <Alert className="mt-4 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-900 text-sm">
              <strong>Collaborative Project:</strong> {collaborators.filter(c => c.status === 'active').length} active team member(s)
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}