import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

export default function DemographicCheck({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    checkDemographics();
  }, [location.pathname]);

  const checkDemographics = async () => {
    // Don't check on the demographic collection page itself
    if (location.pathname === createPageUrl("DemographicCollection")) {
      setIsChecking(false);
      return;
    }

    try {
      const user = await base44.auth.me();

      // If demographics not collected, redirect
      if (!user.demographics_collected) {
        setShouldRedirect(true);
        navigate(createPageUrl("DemographicCollection"));
        return;
      }
    } catch (err) {
      // User not logged in - allow access
      console.log("Demographic check skipped:", err);
    } finally {
      setIsChecking(false);
    }
  };

  if (isChecking || shouldRedirect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return children;
}