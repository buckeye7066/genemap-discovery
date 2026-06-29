import React from "react";
import { Navigate } from "react-router-dom";

/**
 * `/home` is a legacy alias. It previously rendered a second copy of the
 * Dashboard, so both /home and /dashboard showed the same page. Redirect to the
 * canonical /dashboard route instead of duplicating it.
 */
export default function Home() {
  return <Navigate to="/dashboard" replace />;
}
