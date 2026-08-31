import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, Dna, Loader2, LogIn, UserPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@genemap/shared";
import { LOGIN_MAINTENANCE } from "@/lib/maintenance";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const accountDeletedParam = new URLSearchParams(location.search).get('accountDeleted');
  const accountDeleted = accountDeletedParam === '1';
  if (accountDeletedParam && accountDeletedParam !== '1') {
    console.warn("Unexpected 'accountDeleted' parameter value: ", accountDeletedParam);
  }

  // Runtime maintenance status. Render the static fallback immediately (no
  // flash of the wrong state), then follow the server's answer — the switch
  // is the API's LOGIN_MAINTENANCE env var, so flipping it needs no frontend
  // rebuild. If the probe fails the fallback stands: with the API down,
  // sign-in couldn't succeed anyway.
  const [maintenance, setMaintenance] = useState(LOGIN_MAINTENANCE);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .request("/auth/maintenance")
      .then((status) => {
        if (cancelled || !status || typeof status.active !== "boolean") return;
        setMaintenance({ ...LOGIN_MAINTENANCE, ...status });
      })
      .catch(() => { /* keep the static fallback */ });
    return () => { cancelled = true; };
  }, []);

  const isRegister = mode === "register";
  const redirectFrom = location.state?.from;
  const hasProtectedRedirect = Boolean(
    redirectFrom?.pathname &&
    redirectFrom.pathname !== "/login" &&
    redirectFrom.pathname !== "/"
  );
  const redirectTo = hasProtectedRedirect
    ? `${redirectFrom.pathname}${redirectFrom.search || ""}${redirectFrom.hash || ""}`
    : "/";

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const credentials = { email, password };
      if (isRegister) {
        await register(credentials);
      } else {
        await login(credentials);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error(err);
      setError("Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (maintenance.active) {
    const maintenanceTitle = maintenance.title || "Maintenance Ongoing";
    const maintenanceMessage = maintenance.message || "The system is currently under maintenance.";
    const maintenanceEta = maintenance.etaText || "Estimated time of return is unavailable.";
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col items-center justify-center">
          <Card className="w-full border-slate-800 bg-slate-900 shadow-2xl">
            <CardHeader className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500 text-slate-950">
                <Dna className="h-7 w-7" />
              </div>
              <CardTitle className="text-2xl text-white">GeneMap Discovery</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                role="status"
                className="rounded-lg border border-amber-500/60 bg-amber-950/40 p-4 text-sm text-amber-100"
              >
                <div className="flex items-start gap-3">
                  <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-amber-50">{maintenance.title}</p>
                    <p className="mt-1">{maintenanceMessage}</p>
                    <p className="mt-2 font-medium text-amber-50">{maintenanceEta}</p>
                    <p className="mt-2">
                      Sign-in and registration are disabled until the upgrade completes. No action
                      is needed on your part.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col items-center justify-center">
        <Card className="w-full border-slate-800 bg-slate-900 shadow-2xl">
          <CardHeader className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500 text-slate-950">
              <Dna className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">GeneMap Discovery</CardTitle>
              <p className="mt-1 text-sm text-slate-300">
                {isRegister ? "Create your research account" : "Sign in to continue"}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {accountDeleted && (
              <Alert className="mb-4 border-emerald-500/70 bg-emerald-950/60 text-emerald-50 [&_*]:text-emerald-50" role="status">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Your GeneMap account was permanently deleted and the signed-in session was closed.
                </AlertDescription>
              </Alert>
            )}

            <div className="mb-5 grid grid-cols-2 rounded-md border border-slate-700 p-1">
              <Button
                type="button"
                variant={isRegister ? "ghost" : "default"}
                className={`min-h-11 ${isRegister ? "!text-slate-300" : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"}`}
                aria-pressed={!isRegister}
                onClick={() => changeMode("login")}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
              <Button
                type="button"
                variant={isRegister ? "default" : "ghost"}
                className={`min-h-11 ${isRegister ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "!text-slate-300"}`}
                aria-pressed={isRegister}
                onClick={() => changeMode("register")}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Register
              </Button>
            </div>

            {hasProtectedRedirect && (
              <Alert className="mb-4 border-cyan-600/70 bg-cyan-950/70 text-cyan-50 [&_*]:text-cyan-50">
                <AlertDescription className="text-cyan-50">
                  Sign in to continue to <span className="font-semibold text-white">{redirectTo}</span>.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mb-4" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form className="space-y-4" onSubmit={handleSubmit} aria-busy={isSubmitting}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="min-h-11 border-slate-700 bg-slate-950 text-base text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  aria-describedby={isRegister ? "password-help" : undefined}
                  className="min-h-11 border-slate-700 bg-slate-950 text-base text-white"
                />
                {isRegister && (
                  <p id="password-help" className="text-xs text-slate-400">
                    Use at least 8 characters.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isRegister ? (
                  <UserPlus className="mr-2 h-4 w-4" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                {isRegister ? "Create Account" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          By continuing you agree to our{" "}
          <Link to="/termsofservice" className="text-blue-500 hover:underline">Terms of Service</Link>{" "}
          and{" "}
          <Link to="/privacypolicy" className="text-blue-500 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
