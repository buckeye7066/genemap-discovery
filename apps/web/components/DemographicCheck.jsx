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
    if (isLoadingAuth || !user) return;

    const demographicPath = createPageUrl("DemographicCollection");
    if (location.pathname === demographicPath || location.pathname.includes('demographic')) {
      return;
    }

    if (!user.demographics_collected) {
      setShouldRedirect(true);
      navigate(demographicPath, { replace: true });
    }
  }, [user, isLoadingAuth, location.pathname, navigate]);

  if (isLoadingAuth || shouldRedirect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return children;
}