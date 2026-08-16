import React, { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import NavBar from "./src/components/layout/NavBar.jsx";
import AppRoutes from "./src/routes/index.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <NavBar />
        <main id="main-content" className="outline-none">
          <Suspense
            fallback={
              <div className="mx-auto flex min-h-[50vh] max-w-4xl items-center justify-center px-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-slate-950">Getting this page ready…</p>
                  <p className="mt-2 text-slate-700">Thanks for waiting a moment.</p>
                </div>
              </div>
            }
          >
            <AppRoutes />
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
