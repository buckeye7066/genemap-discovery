import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ShieldOff,
  UserX,
  Search,
  Ban,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
  Mail,
  User as UserIcon,
  Undo2,
  Phone
} from "lucide-react";
import { format } from "date-fns";

export default function BannedUsersPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [banReason, setBanReason] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      // Check if user is super admin
      if (!user.super_admin) {
        setError("Access denied. Super administrator privileges required.");
        setIsLoading(false);
        return;
      }

      // Load all banned users
      const users = await base44.asServiceRole.entities.User.filter({ banned: true });
      setBannedUsers(users);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load banned users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Please enter a name, email, or phone number to search");
      return;
    }

    setIsSearching(true);
    setError(null);
    setSearchResults([]);

    try {
      // Search by email, name, or phone
      const emailResults = await base44.asServiceRole.entities.User.filter({
        email: { $regex: searchQuery, $options: 'i' }
      });

      const nameResults = await base44.asServiceRole.entities.User.filter({
        full_name: { $regex: searchQuery, $options: 'i' }
      });

      const phoneResults = await base44.asServiceRole.entities.User.filter({
        phone_number: { $regex: searchQuery, $options: 'i' }
      });

      // Combine and deduplicate results
      const combined = [...emailResults, ...nameResults, ...phoneResults];
      const unique = Array.from(new Map(combined.map(u => [u.id, u])).values());

      // Filter out already banned users
      const notBanned = unique.filter(u => !u.banned);

      setSearchResults(notBanned);

      if (notBanned.length === 0) {
        setError("No users found matching your search (excluding already banned users)");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleBanUser = async (user) => {
    if (!banReason.trim()) {
      setError("Please provide a reason for banning this user");
      return;
    }

    if (!confirm(`Are you sure you want to ban ${user.full_name || user.email}?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await base44.asServiceRole.entities.User.update(user.id, {
        banned: true,
        ban_reason: banReason,
        banned_date: new Date().toISOString(),
        banned_by: currentUser.email
      });

      setSuccess(`Successfully banned ${user.full_name || user.email}`);
      setBanReason("");
      setSelectedUser(null);
      setSearchResults([]);
      setSearchQuery("");

      // Reload banned users list
      await loadData();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Ban error:", err);
      setError("Failed to ban user. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnbanUser = async (user) => {
    if (!confirm(`Are you sure you want to unban ${user.full_name || user.email}?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await base44.asServiceRole.entities.User.update(user.id, {
        banned: false,
        ban_reason: null,
        banned_date: null,
        banned_by: null
      });

      setSuccess(`Successfully unbanned ${user.full_name || user.email}`);

      // Reload banned users list
      await loadData();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Unban error:", err);
      setError("Failed to unban user. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-center py-20">
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
              <ShieldOff className="w-16 h-16 mx-auto mb-4 text-red-600" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
              <p className="text-slate-600">Super administrator privileges required to access this page.</p>
              <p className="text-xs text-slate-500 mt-4">
                Only the system owner has access to user ban management.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-red-600 to-red-700 rounded-2xl flex items-center justify-center shadow-lg">
              <ShieldOff className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            User Ban Management
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Search and ban users who violate terms of service
          </p>
        </div>

        {/* Messages */}
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

        {/* Search Section */}
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name, email, or phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3 mt-4">
                  <h3 className="font-semibold text-slate-900">Search Results</h3>
                  {searchResults.map((user) => (
                    <Card key={user.id} className="border-2">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <UserIcon className="w-4 h-4 text-slate-500" />
                              <span className="font-semibold text-slate-900">
                                {user.full_name || "No name"}
                              </span>
                              <Badge variant="outline">{user.role}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="w-4 h-4" />
                              {user.email}
                            </div>
                            {user.phone_number && (
                              <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                                <Phone className="w-4 h-4" />
                                {user.phone_number}
                              </div>
                            )}
                            {user.created_date && (
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                <Calendar className="w-3 h-3" />
                                Joined {format(new Date(user.created_date), "MMM d, yyyy")}
                              </div>
                            )}
                          </div>

                          <Button
                            onClick={() => setSelectedUser(user)}
                            variant="destructive"
                            size="sm"
                            className="ml-4"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Ban User
                          </Button>
                        </div>

                        {selectedUser?.id === user.id && (
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <Textarea
                              placeholder="Reason for banning (required)..."
                              value={banReason}
                              onChange={(e) => setBanReason(e.target.value)}
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleBanUser(user)}
                                variant="destructive"
                                disabled={!banReason.trim()}
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Confirm Ban
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedUser(null);
                                  setBanReason("");
                                }}
                                variant="outline"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Banned Users List */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5" />
              Banned Users ({bannedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bannedUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <UserX className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No banned users</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bannedUsers.map((user) => (
                  <Card key={user.id} className="border-2 border-red-200 bg-red-50/30">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <UserX className="w-4 h-4 text-red-600" />
                            <span className="font-semibold text-slate-900">
                              {user.full_name || "No name"}
                            </span>
                            <Badge variant="destructive">Banned</Badge>
                            {user.role === 'admin' && (
                              <Badge variant="outline">Admin</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                            <Mail className="w-4 h-4" />
                            {user.email}
                          </div>
                          {user.phone_number && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                              <Phone className="w-4 h-4" />
                              {user.phone_number}
                            </div>
                          )}
                          {user.ban_reason && (
                            <div className="text-sm text-slate-700 mb-2 p-2 bg-white rounded border border-red-200">
                              <strong>Reason:</strong> {user.ban_reason}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                            {user.banned_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Banned {format(new Date(user.banned_date), "MMM d, yyyy")}
                              </div>
                            )}
                            {user.banned_by && (
                              <div>
                                By: {user.banned_by}
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={() => handleUnbanUser(user)}
                          variant="outline"
                          size="sm"
                          className="ml-4 text-green-600 hover:bg-green-50 border-green-200"
                        >
                          <Undo2 className="w-4 h-4 mr-2" />
                          Unban
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}