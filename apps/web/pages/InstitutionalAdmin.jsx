import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Building2,
  Users,
  TrendingUp,
  Calendar,
  Crown,
  UserPlus,
  Mail,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Settings,
  BarChart3,
  Clock,
  XCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import RenewalNotifications from "../components/institutional/RenewalNotifications";

export default function InstitutionalAdminPage() {
  const { user } = useAuth();
  const [licenses, setLicenses] = useState([]);
  const [selectedLicense, setSelectedLicense] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [usageLogs, setUsageLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Invitation state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [bulkInviteMode, setBulkInviteMode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedLicense) {
      loadLicenseDetails(selectedLicense.id);
    }
  }, [selectedLicense]);

  const loadData = async () => {
    try {
      const licensesData = await apiClient.getMyLicenses();
      const userLicenses = licensesData || [];
      setLicenses(userLicenses);
      if (userLicenses.length > 0) {
        setSelectedLicense(userLicenses[0]);
      }

    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load license data");
    } finally {
      setIsLoading(false);
    }
  };

  const loadLicenseDetails = async (licenseId) => {
    try {
      // Reload license details with includes for assignments and usage
      const licenseData = await apiClient.getMyLicenses();
      const license = (licenseData || []).find(l => l.id === licenseId);
      setAssignments(license?.assignments || []);
      setUsageLogs(license?.usageLogs || []);

    } catch (err) {
      console.error("Error loading license details:", err);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim() && !bulkEmails.trim()) {
      setError("Please enter at least one email address");
      return;
    }

    setIsInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const emails = bulkInviteMode 
        ? bulkEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e)
        : [inviteEmail.trim()];

      // Check if we have enough seats
      const availableSeats = selectedLicense.max_seats - selectedLicense.assigned_seats;
      if (emails.length > availableSeats) {
        throw new Error(`Not enough seats available. You have ${availableSeats} seats remaining.`);
      }

      for (const email of emails) {
        await apiClient.assignLicenseSeat(selectedLicense.id, {
          userEmail: email,
          department: inviteDepartment || null
        });
      }

      setSuccess(`Successfully invited ${emails.length} user${emails.length > 1 ? 's' : ''}!`);
      setInviteDialogOpen(false);
      setInviteEmail("");
      setBulkEmails("");
      setInviteDepartment("");

      // Reload data
      await loadData();
      await loadLicenseDetails(selectedLicense.id);

    } catch (err) {
      console.error("Error inviting users:", err);
      setError(err.message || "Failed to invite users");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevokeAccess = async (assignmentId, userEmail) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${userEmail}?`)) {
      return;
    }

    try {
      await apiClient.removeLicenseSeat(selectedLicense.id, assignmentId);

      setSuccess(`Access revoked for ${userEmail}`);
      await loadData();
      await loadLicenseDetails(selectedLicense.id);

    } catch (err) {
      console.error("Error revoking access:", err);
      setError("Failed to revoke access");
    }
  };

  const exportUsageReport = () => {
    const report = {
      license: {
        organization: selectedLicense.organization_name,
        type: selectedLicense.license_type,
        period: `${new Date(selectedLicense.start_date).toLocaleDateString()} - ${new Date(selectedLicense.end_date).toLocaleDateString()}`
      },
      summary: {
        total_seats: selectedLicense.max_seats,
        assigned_seats: selectedLicense.assigned_seats,
        active_users: assignments.filter(a => a.status === 'active').length
      },
      users: assignments.map(a => ({
        email: a.user_email,
        status: a.status,
        department: a.department,
        assigned_date: a.created_date
      })),
      usage: usageLogs.map(log => ({
        user: log.user_email,
        activity: log.activity_type,
        timestamp: log.timestamp || log.created_date
      }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-report-${selectedLicense.organization_name}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const getLicenseStatusBadge = (status) => {
    const colors = {
      active: "bg-green-100 text-green-800 border-green-200",
      expired: "bg-red-100 text-red-800 border-red-200",
      suspended: "bg-amber-100 text-amber-800 border-amber-200",
      trial: "bg-blue-100 text-blue-800 border-blue-200",
      pending_payment: "bg-slate-100 text-slate-800 border-slate-200"
    };
    return colors[status] || colors.pending_payment;
  };

  const getUsageStats = () => {
    if (!usageLogs.length) return {};

    const stats = {
      total_activities: usageLogs.length,
      unique_users: new Set(usageLogs.map(log => log.user_email)).size,
      by_type: {}
    };

    usageLogs.forEach(log => {
      stats.by_type[log.activity_type] = (stats.by_type[log.activity_type] || 0) + 1;
    });

    return stats;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-600">Loading institutional dashboard...</p>
        </div>
      </div>
    );
  }

  if (licenses.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg">
            <CardContent className="pt-6 text-center py-12">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                No Institutional Licenses
              </h3>
              <p className="text-slate-600 mb-6">
                You don't have access to any institutional licenses yet.
              </p>
              <Link to={createPageUrl("InstitutionalPricing")}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Crown className="w-4 h-4 mr-2" />
                  Explore Institutional Licensing
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stats = getUsageStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-blue-600" />
                License Management
              </h1>
              <p className="text-lg text-slate-600 mt-2">
                Manage your team's GeneMap licenses and users
              </p>
            </div>
            <Link to={createPageUrl("InstitutionalPricing")}>
              <Button variant="outline" className="gap-2">
                <Crown className="w-4 h-4" />
                View Pricing
              </Button>
            </Link>
          </div>

          {/* License Selector */}
          {licenses.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {licenses.map(license => (
                <Button
                  key={license.id}
                  variant={selectedLicense?.id === license.id ? "default" : "outline"}
                  onClick={() => setSelectedLicense(license)}
                  className="whitespace-nowrap"
                >
                  {license.organization_name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Renewal Notifications - NEW */}
        <div className="mb-6">
          <RenewalNotifications />
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {selectedLicense && (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">
                        {selectedLicense.assigned_seats}/{selectedLicense.max_seats}
                      </p>
                      <p className="text-xs text-slate-600">Seats Used</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">
                        {assignments.filter(a => a.status === 'active').length}
                      </p>
                      <p className="text-xs text-slate-600">Active Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">
                        {stats.total_activities || 0}
                      </p>
                      <p className="text-xs text-slate-600">Total Activities</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {new Date(selectedLicense.end_date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-600">Expires</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="users" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 h-auto">
                <TabsTrigger value="users" className="flex-col gap-1 py-3">
                  <Users className="w-5 h-5" />
                  <span className="text-xs">Users</span>
                </TabsTrigger>
                <TabsTrigger value="usage" className="flex-col gap-1 py-3">
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-xs">Usage</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-col gap-1 py-3">
                  <Settings className="w-5 h-5" />
                  <span className="text-xs">Settings</span>
                </TabsTrigger>
              </TabsList>

              {/* Users Tab */}
              <TabsContent value="users">
                <Card className="shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        User Management ({assignments.length})
                      </CardTitle>
                      <div className="flex gap-2">
                        <Button
                          onClick={exportUsageReport}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Export Report
                        </Button>
                        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
                              <UserPlus className="w-4 h-4" />
                              Invite Users
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Invite Users to {selectedLicense.organization_name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <Alert className="bg-blue-50 border-blue-200">
                                <AlertCircle className="h-4 w-4 text-blue-600" />
                                <AlertDescription className="text-blue-900 text-sm">
                                  Available seats: <strong>{selectedLicense.max_seats - selectedLicense.assigned_seats}</strong> of {selectedLicense.max_seats}
                                </AlertDescription>
                              </Alert>

                              <div className="flex gap-2">
                                <Button
                                  variant={!bulkInviteMode ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setBulkInviteMode(false)}
                                >
                                  Single User
                                </Button>
                                <Button
                                  variant={bulkInviteMode ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setBulkInviteMode(true)}
                                >
                                  Bulk Invite
                                </Button>
                              </div>

                              {!bulkInviteMode ? (
                                <div>
                                  <Label htmlFor="invite-email">Email Address</Label>
                                  <Input
                                    id="invite-email"
                                    type="email"
                                    placeholder="user@example.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="mt-1"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <Label htmlFor="bulk-emails">Email Addresses (one per line or comma-separated)</Label>
                                  <textarea
                                    id="bulk-emails"
                                    placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                                    value={bulkEmails}
                                    onChange={(e) => setBulkEmails(e.target.value)}
                                    className="w-full h-32 mt-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  />
                                </div>
                              )}

                              <div>
                                <Label htmlFor="department">Department (Optional)</Label>
                                <Input
                                  id="department"
                                  placeholder="e.g., Research, Clinical, IT"
                                  value={inviteDepartment}
                                  onChange={(e) => setInviteDepartment(e.target.value)}
                                  className="mt-1"
                                />
                              </div>

                              <Button
                                onClick={handleInviteUser}
                                disabled={isInviting || (!inviteEmail.trim() && !bulkEmails.trim())}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                              >
                                {isInviting ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending Invitations...
                                  </>
                                ) : (
                                  <>
                                    <Mail className="w-4 h-4 mr-2" />
                                    Send Invitation{bulkInviteMode ? 's' : ''}
                                  </>
                                )}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {assignments.length === 0 ? (
                        <div className="text-center py-12">
                          <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                          <p className="text-slate-500">No users assigned yet</p>
                        </div>
                      ) : (
                        assignments.map((assignment) => (
                          <Card key={assignment.id} className="border border-slate-200">
                            <CardContent className="pt-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <p className="font-medium text-slate-900">{assignment.user_email}</p>
                                    <Badge className={
                                      assignment.status === 'active' ? 'bg-green-100 text-green-800' :
                                      assignment.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                      assignment.status === 'revoked' ? 'bg-red-100 text-red-800' :
                                      'bg-slate-100 text-slate-800'
                                    }>
                                      {assignment.status}
                                    </Badge>
                                    {assignment.role === 'admin' && (
                                      <Badge className="bg-blue-100 text-blue-800">
                                        <Shield className="w-3 h-3 mr-1" />
                                        License Manager
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-4 text-xs text-slate-600">
                                    {assignment.department && (
                                      <span>Department: {assignment.department}</span>
                                    )}
                                    <span>Assigned: {new Date(assignment.created_date).toLocaleDateString()}</span>
                                    {assignment.accepted_date && (
                                      <span>Accepted: {new Date(assignment.accepted_date).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>
                                {assignment.status !== 'revoked' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRevokeAccess(assignment.id, assignment.user_email)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Usage Tab */}
              <TabsContent value="usage">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-600" />
                      Usage Analytics (Last 30 Days)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {usageLogs.length === 0 ? (
                      <div className="text-center py-12">
                        <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500">No usage data yet</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="bg-slate-50 p-4 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Total Activities</p>
                            <p className="text-2xl font-bold text-slate-900">{stats.total_activities}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Active Users</p>
                            <p className="text-2xl font-bold text-slate-900">{stats.unique_users}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Avg per User</p>
                            <p className="text-2xl font-bold text-slate-900">
                              {stats.unique_users ? Math.round(stats.total_activities / stats.unique_users) : 0}
                            </p>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold text-slate-900 mb-3">Activity Breakdown</h4>
                          <div className="space-y-2">
                            {Object.entries(stats.by_type || {}).map(([type, count]) => (
                              <div key={type} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                                <span className="text-sm text-slate-700 capitalize">{type.replace('_', ' ')}</span>
                                <Badge variant="outline">{count}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-semibold text-slate-900 mb-3">Recent Activity</h4>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {usageLogs.slice(0, 50).map((log, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 text-sm border-b border-slate-200">
                                <div className="flex items-center gap-3">
                                  <Clock className="w-4 h-4 text-slate-400" />
                                  <span className="text-slate-700">{log.user_email}</span>
                                  <Badge variant="outline" className="text-xs">{log.activity_type}</Badge>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {new Date(log.timestamp || log.created_date).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-slate-600" />
                      License Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <Label className="text-sm font-medium text-slate-700">Organization</Label>
                        <p className="text-lg font-semibold text-slate-900 mt-1">
                          {selectedLicense.organization_name}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-700">License Type</Label>
                        <p className="text-lg font-semibold text-slate-900 mt-1 capitalize">
                          {selectedLicense.license_type}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-700">Status</Label>
                        <Badge className={getLicenseStatusBadge(selectedLicense.status) + " mt-1"}>
                          {selectedLicense.status}
                        </Badge>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-slate-700">Auto-Renew</Label>
                        <p className="text-lg font-semibold text-slate-900 mt-1">
                          {selectedLicense.auto_renew ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h4 className="font-semibold text-slate-900 mb-3">License Period</h4>
                      <div className="grid md:grid-cols-3 gap-4">
                        <div>
                          <Label className="text-xs text-slate-600">Start Date</Label>
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(selectedLicense.start_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">End Date</Label>
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(selectedLicense.end_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Days Remaining</Label>
                          <p className="text-sm font-medium text-slate-900">
                            {Math.ceil((new Date(selectedLicense.end_date) - new Date()) / (1000 * 60 * 60 * 24))} days
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6">
                      <h4 className="font-semibold text-slate-900 mb-3">Contact Information</h4>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-slate-600">Primary Contact</Label>
                          <p className="text-sm text-slate-900">{selectedLicense.contact_name || 'Not specified'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">Email</Label>
                          <p className="text-sm text-slate-900">{selectedLicense.contact_email}</p>
                        </div>
                      </div>
                    </div>

                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-900 text-sm">
                        Need to modify your license or add more seats? Contact support at support@genemap.com
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}