import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  Search,
  Mail,
  Calendar,
  Shield,
  UserCheck,
  UserX,
  Phone,
  Loader2,
  AlertCircle,
  Download,
  Filter,
  Trash2
} from "lucide-react";
import { deleteUser } from "@/functions/deleteUser";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function UsersLogPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletingUser, setDeletingUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, roleFilter, statusFilter, users]);

  const loadData = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      if (!user.super_admin) {
        setError("Access denied. Administrator privileges required.");
        setIsLoading(false);
        return;
      }

      // Fetch all users and activity from multiple sources
      const [response, allActivities, allSearches, allConversations, allMessages] = await Promise.all([
        base44.functions.invoke('getAllUsers'),
        base44.entities.UserActivity.filter({}, '-created_date', 10000).catch(() => []),
        base44.entities.SearchHistory.filter({}, '-created_date', 10000).catch(() => []),
        base44.entities.AIConversation.filter({}, '-updated_date', 10000).catch(() => []),
        base44.entities.Message.filter({}, '-created_date', 10000).catch(() => [])
      ]);

      const data = response.data || response;
      
      if (data.error) {
        setError(data.error);
      } else {
        // Map last activity to each user from multiple sources
        const usersWithActivity = (data.users || []).map(user => {
          const activityDates = [];
          
          // Check UserActivity
          const userActivities = allActivities.filter(a => a.created_by === user.email);
          if (userActivities.length > 0) activityDates.push(new Date(userActivities[0].created_date));
          
          // Check SearchHistory
          const userSearches = allSearches.filter(s => s.created_by === user.email);
          if (userSearches.length > 0) activityDates.push(new Date(userSearches[0].created_date));
          
          // Check AIConversation (use updated_date for ongoing conversations)
          const userConversations = allConversations.filter(c => c.created_by === user.email);
          if (userConversations.length > 0) {
            activityDates.push(new Date(userConversations[0].updated_date || userConversations[0].created_date));
          }
          
          // Check Messages
          const userMessages = allMessages.filter(m => m.created_by === user.email);
          if (userMessages.length > 0) activityDates.push(new Date(userMessages[0].created_date));
          
          // Get the most recent activity date
          const lastActivity = activityDates.length > 0 
            ? new Date(Math.max(...activityDates)).toISOString()
            : null;
          
          return { ...user, last_active: lastActivity };
        });

        setUsers(usersWithActivity);
        setFilteredUsers(usersWithActivity);
      }
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.email?.toLowerCase().includes(query) ||
          user.full_name?.toLowerCase().includes(query) ||
          user.phone_number?.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    // Status filter
    if (statusFilter === "active") {
      filtered = filtered.filter((user) => !user.banned);
    } else if (statusFilter === "banned") {
      filtered = filtered.filter((user) => user.banned);
    }

    setFilteredUsers(filtered);
  };

  const exportToCSV = () => {
    const headers = ["Name", "Email", "Phone", "Role", "Status", "Join Date", "Super Admin"];
    const rows = filteredUsers.map((user) => [
      user.full_name || "",
      user.email || "",
      user.phone_number || "",
      user.role || "user",
      user.banned ? "Banned" : "Active",
      user.created_date ? format(new Date(user.created_date), "yyyy-MM-dd") : "",
      user.super_admin ? "Yes" : "No"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const getStats = () => {
    return {
      total: users.length,
      active: users.filter((u) => !u.banned).length,
      banned: users.filter((u) => u.banned).length,
      admins: users.filter((u) => u.role === "admin" || u.super_admin).length,
      superAdmins: users.filter((u) => u.super_admin).length
    };
  };

  const formatEST = (dateString) => {
    const date = new Date(dateString);
    // Convert to EST (UTC-5) or EDT (UTC-4) depending on daylight saving
    const estString = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${estString} EST`;
  };

  const handleDeleteUser = async (userEmail) => {
    if (!confirm(`Are you sure you want to PERMANENTLY DELETE user ${userEmail}? This will delete the user and ALL their data. This action CANNOT be undone.`)) {
      return;
    }

    setDeletingUser(userEmail);
    try {
      await deleteUser({ email: userEmail });
      setError(null);
      await loadData();
      alert(`User ${userEmail} deleted successfully`);
    } catch (err) {
      setError(`Failed to delete user: ${err.message || 'Unknown error'}`);
    } finally {
      setDeletingUser(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!currentUser?.super_admin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border-2 border-red-200">
            <CardContent className="pt-12 pb-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-red-600" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
              <p className="text-slate-600">Administrator privileges required to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Users className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Users Log
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Complete list of all registered users
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                <div className="text-xs text-slate-600">Total Users</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <UserCheck className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold text-slate-900">{stats.active}</div>
                <div className="text-xs text-slate-600">Active</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <UserX className="w-8 h-8 mx-auto mb-2 text-red-600" />
                <div className="text-2xl font-bold text-slate-900">{stats.banned}</div>
                <div className="text-xs text-slate-600">Banned</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Shield className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                <div className="text-2xl font-bold text-slate-900">{stats.admins}</div>
                <div className="text-xs text-slate-600">Admins</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Shield className="w-8 h-8 mx-auto mb-2 text-indigo-600" />
                <div className="text-2xl font-bold text-slate-900">{stats.superAdmins}</div>
                <div className="text-xs text-slate-600">Super Admins</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-slate-600">
                Showing {filteredUsers.length} of {users.length} users
              </p>
              <Button onClick={exportToCSV} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <Card key={user.id} className="border">
                    <CardContent className="pt-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-slate-900">
                              {user.full_name || "No name"}
                            </span>
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                              {user.role || "user"}
                            </Badge>
                            {user.super_admin && (
                              <Badge className="bg-indigo-600">Super Admin</Badge>
                            )}
                            {user.banned ? (
                              <Badge variant="destructive">Banned</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800">Active</Badge>
                            )}
                          </div>

                          <div className="space-y-1 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              {user.email}
                            </div>
                            {user.phone_number && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                {user.phone_number}
                              </div>
                            )}
                            {user.created_date && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Joined {format(new Date(user.created_date), "MMM d, yyyy")}
                              </div>
                            )}
                            {user.last_active ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <UserCheck className="w-4 h-4" />
                                Last active {formatEST(user.last_active)}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-slate-400">
                                <UserX className="w-4 h-4" />
                                Never active
                              </div>
                            )}
                          </div>

                          {user.banned && user.ban_reason && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                              <strong>Ban Reason:</strong> {user.ban_reason}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 items-end">
                          <div className="text-xs text-slate-500">
                            ID: {user.id}
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(user.email)}
                            disabled={deletingUser === user.email || user.email === currentUser?.email}
                            className="gap-1"
                          >
                            {deletingUser === user.email ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3 h-3" />
                                Delete
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}