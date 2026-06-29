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
    if (location.pathname === demographicPath || location.pathname.includes('demographic')) {
      // We've arrived on the demographic page — clear the redirect flag so the
      // page renders instead of an endless spinner. (Without this reset the
      // wrapper stayed on the spinner forever, the root cause of the hang.)
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