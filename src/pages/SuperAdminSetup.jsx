import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Crown, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function SuperAdminSetupPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);
    } catch (err) {
      console.error("Error loading user:", err);
      setError("Failed to load user information");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrantSuperAdmin = async () => {
    if (!searchEmail.trim()) {
      setError("Please enter an email address");
      return;
    }

    if (!confirm(`Grant administrator privileges to ${searchEmail}?`)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Call backend function to grant admin privileges
      const response = await base44.functions.invoke('grantAdminPrivileges', {
        targetEmail: searchEmail.trim()
      });

      if (response.error) {
        setError(response.error);
        return;
      }

      setSuccess(`Successfully granted administrator privileges to ${searchEmail}`);
      setSearchEmail("");

      // If granting to self, reload user and page
      if (searchEmail.trim() === currentUser.email) {
        setTimeout(async () => {
          await loadUser();
          window.location.reload(); // Reload page to refresh permissions
        }, 1000);
      }
    } catch (err) {
      console.error("Error granting admin:", err);
      setError(err.message || "Failed to grant privileges. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGrantPremium = async () => {
    if (!confirm('Grant yourself premium access?')) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await base44.functions.invoke('grantPremiumAccess');

      if (response.error) {
        setError(response.error);
        return;
      }

      setSuccess('Premium access granted! Reload the page to see changes.');
    } catch (err) {
      console.error("Error granting premium:", err);
      setError(err.message || "Failed to grant premium access.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Crown className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Administrator Setup
          </h1>
          <p className="text-lg text-slate-600">
            Grant administrator privileges to manage users and system settings
          </p>
        </div>

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

        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle>Grant Administrator Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <Input
                type="email"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Enter your email address..."
                onKeyDown={(e) => e.key === 'Enter' && handleGrantSuperAdmin()}
              />
            </div>

            <Button
              onClick={handleGrantSuperAdmin}
              disabled={isSaving || !searchEmail.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Granting Access...
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4 mr-2" />
                  Grant Administrator Privileges
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg mb-6 border-2 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-purple-600" />
              Grant Premium Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 mb-4">
              Grant yourself premium access to all features without payment.
            </p>
            <Button
              onClick={handleGrantPremium}
              disabled={isSaving}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Granting Access...
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4 mr-2" />
                  Grant Premium Access
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-2 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Your Current Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Email:</span>
                <span className="font-medium text-slate-900">{currentUser?.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Role:</span>
                <span className="font-medium text-slate-900">{currentUser?.role || "user"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Administrator:</span>
                {currentUser?.super_admin ? (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    Yes
                  </span>
                ) : (
                  <span className="text-slate-400">No</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-semibold text-amber-900 mb-2">⚠️ Administrator Privileges</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>• Full access to ban/unban any user</li>
            <li>• View all banned users and reasons</li>
            <li>• Access newsletter subscriber list</li>
            <li>• Complete control over platform moderation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}