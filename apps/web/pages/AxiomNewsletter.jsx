import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  Download,
  Search,
  User as UserIcon,
  Phone,
  Calendar,
  ShieldOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Filter
} from "lucide-react";
import { format } from "date-fns";

export default function AxiomNewsletterPage() {
  const { user: currentUser } = useAuth();
  const [subscribedUsers, setSubscribedUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [statsFilter, setStatsFilter] = useState("all"); // all, with_phone, without_phone

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchQuery, subscribedUsers, statsFilter]);

  const loadData = async () => {
    try {
      if (!currentUser?.super_admin) {
        setError("Access denied. Administrator privileges required.");
        setIsLoading(false);
        return;
      }

      const response = await apiClient.getUsers();
      const data = response.data || response;
      if (data.error) {
        throw new Error(data.error);
      }
      const users = (data.users || []).filter(u => u.mailing_list_opt_in);
      setSubscribedUsers(users);
      setFilteredUsers(users);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load newsletter subscribers");
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = subscribedUsers;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(user => 
        user.email?.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query) ||
        user.phone_number?.toLowerCase().includes(query)
      );
    }

    // Apply stats filter
    if (statsFilter === "with_phone") {
      filtered = filtered.filter(user => user.phone_number);
    } else if (statsFilter === "without_phone") {
      filtered = filtered.filter(user => !user.phone_number);
    }

    setFilteredUsers(filtered);
  };

  const handleExportCSV = () => {
    try {
      // Prepare CSV content
      const headers = ["Email", "Full Name", "Phone Number", "Role", "Joined Date"];
      const rows = filteredUsers.map(user => [
        user.email || "",
        user.full_name || "",
        user.phone_number || "",
        user.role || "",
        user.created_date ? format(new Date(user.created_date), "yyyy-MM-dd") : ""
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `axiom-newsletter-subscribers-${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccess(`Exported ${filteredUsers.length} subscribers to CSV`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export data. Please try again.");
    }
  };

  const handleExportJSON = () => {
    try {
      const exportData = filteredUsers.map(user => ({
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        role: user.role,
        joined_date: user.created_date
      }));

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `axiom-newsletter-subscribers-${format(new Date(), "yyyy-MM-dd")}.json`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccess(`Exported ${filteredUsers.length} subscribers to JSON`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export data. Please try again.");
    }
  };

  const getStats = () => {
    const withPhone = subscribedUsers.filter(u => u.phone_number).length;
    const withoutPhone = subscribedUsers.length - withPhone;
    const admins = subscribedUsers.filter(u => u.role === 'admin').length;
    
    return { withPhone, withoutPhone, admins };
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
              <p className="text-slate-600">Administrator privileges required to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Mail className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Axiom Biolabs Newsletter Subscribers
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Users who opted in to receive the Axiom Biolabs newsletter
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

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card 
            className={`cursor-pointer transition-all ${statsFilter === "all" ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setStatsFilter("all")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{subscribedUsers.length}</div>
              <p className="text-sm text-slate-600">Total Subscribers</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all ${statsFilter === "with_phone" ? "ring-2 ring-green-500" : ""}`}
            onClick={() => setStatsFilter("with_phone")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-xl flex items-center justify-center">
                <Phone className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{stats.withPhone}</div>
              <p className="text-sm text-slate-600">With Phone</p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all ${statsFilter === "without_phone" ? "ring-2 ring-amber-500" : ""}`}
            onClick={() => setStatsFilter("without_phone")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{stats.withoutPhone}</div>
              <p className="text-sm text-slate-600">Without Phone</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-xl flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{stats.admins}</div>
              <p className="text-sm text-slate-600">Admin Users</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Export */}
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search & Export
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportCSV}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
                <Button
                  onClick={handleExportJSON}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export JSON
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Search className="w-5 h-5 text-slate-400 absolute left-9 top-3" />
              <Input
                placeholder="Search by email, name, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {statsFilter !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => setStatsFilter("all")}
                  className="gap-2"
                >
                  <Filter className="w-4 h-4" />
                  Clear Filter
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subscribers List */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Subscribers ({filteredUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Mail className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium mb-2">No subscribers found</p>
                <p className="text-sm">
                  {searchQuery ? "Try adjusting your search query" : "No users have opted into the newsletter yet"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <Card key={user.id} className="border-2 hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <UserIcon className="w-4 h-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">
                              {user.full_name || "No name provided"}
                            </span>
                            <Badge variant="outline">{user.role}</Badge>
                            {!user.phone_number && (
                              <Badge variant="destructive" className="text-xs">
                                No Phone
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="w-4 h-4" />
                              <span className="font-mono">{user.email}</span>
                            </div>
                            
                            {user.phone_number && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone className="w-4 h-4" />
                                <span className="font-mono">{user.phone_number}</span>
                              </div>
                            )}
                            
                            {user.created_date && (
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Calendar className="w-3 h-3" />
                                Joined {format(new Date(user.created_date), "MMM d, yyyy 'at' h:mm a")}
                              </div>
                            )}

                            {user.demographics_collected && (
                              <div className="mt-2">
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Demographics Collected
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm text-blue-900 font-medium mb-1">
                  About This Data
                </p>
                <p className="text-sm text-blue-800">
                  This list contains all users who opted in to receive the Axiom Biolabs newsletter during the demographic collection process. 
                  Use the export buttons to download this data for use in your email marketing platform.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}