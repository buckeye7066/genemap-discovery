import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { createPageUrl } from "@/utils";

export default function DemographicCheck({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoadingAuth } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (isLoadingAuth || !user) {
      // Not logged in (or still resolving auth): never hold the redirect spinner.
      if (shouldRedirect) setShouldRedirect(false);
      return;
    }

    const demographicPath = createPageUrl("DemographicCollection");
    const accountSettingsPath = createPageUrl("AccountSettings");
    const isDemographicPage = location.pathname === demographicPath
      || location.pathname.includes('demographic');
    const isAccountPrivacyPage = location.pathname === accountSettingsPath;
    if (isDemographicPage || isAccountPrivacyPage) {
      // Optional profile questions must never become a condition for reaching
      // privacy controls or permanent account deletion. Clear any previous
      // redirect spinner when the user is on either exempt route.
      if (shouldRedirect) setShouldRedirect(false);
      return;
    }

    if (!user.demographics_collected) {
      setShouldRedirect(true);
      navigate(demographicPath, { replace: true });
    } else if (shouldRedirect) {
      setShouldRedirect(false);
    }
  }, [user, isLoadingAuth, location.pathname, navigate, shouldRedirect]);

  if (isLoadingAuth || shouldRedirect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return children;
}