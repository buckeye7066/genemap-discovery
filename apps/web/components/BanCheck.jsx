import React, { useEffect, useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldOff, LogOut } from "lucide-react";

export default function BanCheck({ children }) {
  const [user, setUser] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    checkBanStatus();
  }, []);

  const checkBanStatus = async () => {
    try {
      // BACKEND_NEEDED: Pre-ban check function needs API implementation
      // First check if user matches any pre-bans and ban them if they do
      // try {
      //   const preBanCheck = await base44.functions.invoke('checkPreBanOnLogin');
      //   console.log("Pre-ban check result:", preBanCheck);
      //   
      //   if (preBanCheck.banned) {
      //     console.log("User was pre-banned, reloading user data...");
      //     // Wait a moment for the ban to propagate
      //     await new Promise(resolve => setTimeout(resolve, 1000));
      //   }
      // } catch (preBanError) {
      //   console.error("Pre-ban check error:", preBanError);
      // }

      // Then check current ban status (after pre-ban check completed)
      const currentUser = await apiClient.getMe();
      setUser(currentUser);

      console.log("Current user status:", { 
        email: currentUser.email, 
        banned: currentUser.banned,
        ban_reason: currentUser.ban_reason 
      });

      if (currentUser.banned === true) {
        console.log("User is banned, showing ban screen");
        setIsBanned(true);
      }
    } catch (err) {
      // User not logged in or error - allow access
      console.log("Ban check skipped:", err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleLogout = () => {
    apiClient.logout();
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-md border-2 border-red-200 shadow-xl">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-2xl flex items-center justify-center">
              <ShieldOff className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-3">
              Account Suspended
            </h1>
            <p className="text-slate-600 mb-2">
              Your account has been suspended and you no longer have access to this application.
            </p>
            {user?.ban_reason && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
                <p className="text-sm font-semibold text-red-900 mb-1">Reason:</p>
                <p className="text-sm text-red-800">{user.ban_reason}</p>
              </div>
            )}
            <div className="mt-6 text-xs text-slate-500">
              If you believe this is an error, please contact support.
            </div>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="mt-6"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
}