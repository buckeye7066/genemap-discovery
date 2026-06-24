import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Crown, CheckCircle, AlertCircle, Loader2, LogOut, Gift, Users, XCircle } from "lucide-react";

/**
 * Super-admin bootstrap page.
 *
 * The previous implementation routed everything through `apiClient.updateProfile`
 * with `_adminAction` flags — there is no such backend contract. The API
 * exposes `/admin/grant-admin` and `/admin/grant-premium` (gated on
 * super_admin / admin) and `/admin/search-users` for finding the target by
 * email. Use those.
 */
export default function SuperAdminSetupPage() {
  const navigate = useNavigate();
  const { user: currentUser, checkAuth } = useAuth();
  const [searchEmail, setSearchEmail] = useState("");
  const [freeEmail, setFreeEmail] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!currentUser) {
      navigate(createPageUrl("Home"));
      return;
    }
    if (!isSuperAdmin) {
      navigate(createPageUrl("Home"));
      return;
    }
    setIsLoading(false);
  }, [currentUser, isSuperAdmin, navigate]);

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } finally {
      window.location.href = '/login';
    }
  };

  const handleGrantSuperAdmin = async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) {
      setError("Please enter an email address");
      return;
    }

    if (!confirm(`Grant administrator privileges to ${email}?`)) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const searchResult = await apiClient.searchUsers(email);
      const target = (searchResult.users || []).find((u) => u.email?.toLowerCase() === email)
        || (searchResult.users || [])[0];

      if (!target?.id) {
        setError("User not found. The target must register before being promoted.");
        return;
      }

      await apiClient.grantAdmin(target.id);
      setSuccess(`Granted administrator privileges to ${target.email}`);
      setSearchEmail("");

      if (target.email?.toLowerCase() === currentUser.email?.toLowerCase()) {
        await checkAuth();
        setTimeout(() => window.location.reload(), 750);
      }
    } catch (err) {
      console.error("Error granting admin:", err);
      setError(err?.message || "Failed to grant privileges. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGrantPremium = async () => {
    if (!confirm('Grant yourself premium access?')) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.grantPremium(currentUser.id);
      setSuccess('Premium access granted! Reload the page to see changes.');
      await checkAuth();
    } catch (err) {
      console.error("Error granting premium:", err);
      setError(err?.message || "Failed to grant premium access.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGrantFreePeriod = async (period) => {
    const email = freeEmail.trim().toLowerCase();
    if (!email) {
      setError("Please enter an email address");
      return;
    }

    if (!confirm(`Grant a free ${period} to ${email}?`)) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const searchResult = await apiClient.searchUsers(email);
      const target = (searchResult.users || []).find((u) => u.email?.toLowerCase() === email)
        || (searchResult.users || [])[0];

      if (!target?.id) {
        setError("User not found. The target must register before being comped.");
        return;
      }

      const res = await apiClient.grantFreePeriod(target.id, period);
      const until = res?.currentPeriodEnd
        ? new Date(res.currentPeriodEnd).toLocaleDateString()
        : "";
      setSuccess(`Granted a free ${period} to ${target.email}${until ? ` — premium until ${until}` : ""}.`);
      setFreeEmail("");
    } catch (err) {
      console.error("Error granting free period:", err);
      setError(err?.message || `Failed to grant free ${period}. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeFreePeriod = async () => {
    const email = freeEmail.trim().toLowerCase();
    if (!email) {
      setError("Please enter an email address");
      return;
    }

    if (!confirm(`End the free period for ${email}?`)) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const searchResult = await apiClient.searchUsers(email);
      const target = (searchResult.users || []).find((u) => u.email?.toLowerCase() === email)
        || (searchResult.users || [])[0];

      if (!target?.id) {
        setError("User not found.");
        return;
      }

      const res = await apiClient.revokeFreePeriod(target.id);
      setSuccess(
        res?.revoked > 0
          ? `Ended the free period for ${target.email}.`
          : `${target.email} had no active free period.`
      );
      setFreeEmail("");
    } catch (err) {
      console.error("Error revoking free period:", err);
      setError(err?.message || "Failed to end the free period. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGrantFreePeriodAll = async (period) => {
    if (!confirm(`Give EVERY user a free ${period}? This affects all non-banned accounts.`)) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.grantFreePeriodAll(period);
      setSuccess(
        `Granted a free ${period} to ${res.total} user${res.total === 1 ? "" : "s"} ` +
          `(${res.created} new, ${res.extended} extended).`
      );
    } catch (err) {
      console.error("Error granting free period to all:", err);
      setError(err?.message || `Failed to grant a free ${period} to all users.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeFreePeriodAll = async () => {
    if (!confirm("End ALL active free periods? Paid subscriptions are not affected.")) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.revokeFreePeriodAll();
      setSuccess(`Ended ${res.revoked} active free period${res.revoked === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error("Error revoking all free periods:", err);
      setError(err?.message || "Failed to end all free periods.");
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
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1"></div>
            <div className="flex justify-center flex-1">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Crown className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="flex-1 flex justify-end">
              <Button onClick={handleLogout} variant="outline" size="sm" className="gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
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
                placeholder="Enter user email address..."
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

        <Card className="shadow-lg mb-6 border-2 border-emerald-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-600" />
              Grant Free Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Comp a user a free week or month of premium. The window expires
              automatically — repeated grants stack and never shorten existing access.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                User Email Address
              </label>
              <Input
                type="email"
                value={freeEmail}
                onChange={(e) => setFreeEmail(e.target.value)}
                placeholder="Enter user email address..."
              />
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => handleGrantFreePeriod("week")}
                disabled={isSaving || !freeEmail.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4 mr-2" />
                )}
                Free Week
              </Button>
              <Button
                onClick={() => handleGrantFreePeriod("month")}
                disabled={isSaving || !freeEmail.trim()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4 mr-2" />
                )}
                Free Month
              </Button>
            </div>
            <Button
              onClick={handleRevokeFreePeriod}
              disabled={isSaving || !freeEmail.trim()}
              variant="outline"
              className="w-full text-slate-600 hover:text-red-600 hover:border-red-300"
            >
              <XCircle className="w-4 h-4 mr-2" />
              End Free Period
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg mb-6 border-2 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              All Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Comp <span className="font-medium">every non-banned user</span> at once — useful for
              a launch promo or an apology credit. Paid subscriptions are never affected.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => handleGrantFreePeriodAll("week")}
                disabled={isSaving}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4 mr-2" />
                )}
                Give All a Week
              </Button>
              <Button
                onClick={() => handleGrantFreePeriodAll("month")}
                disabled={isSaving}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="w-4 h-4 mr-2" />
                )}
                Give All a Month
              </Button>
            </div>
            <Button
              onClick={handleRevokeFreePeriodAll}
              disabled={isSaving}
              variant="outline"
              className="w-full text-slate-600 hover:text-red-600 hover:border-red-300"
            >
              <XCircle className="w-4 h-4 mr-2" />
              End All Free Periods
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
                {isSuperAdmin ? (
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
          <h3 className="font-semibold text-amber-900 mb-2">Administrator Privileges</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>- Full access to ban/unban any user</li>
            <li>- View all banned users and reasons</li>
            <li>- Access newsletter subscriber list</li>
            <li>- Complete control over platform moderation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
