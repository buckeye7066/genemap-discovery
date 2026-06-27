import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Dna, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/lib/AuthContext";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isRegister = mode === "register";
  const redirectFrom = location.state?.from;
  const hasProtectedRedirect = Boolean(redirectFrom?.pathname && redirectFrom.pathname !== "/login");
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
      setError(err?.message || "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <Card className="w-full border-slate-800 bg-slate-900 shadow-2xl">
          <CardHeader className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-500 text-slate-950">
              <Dna className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">GeneMap Discovery</CardTitle>
              <p className="mt-1 text-sm text-slate-400">
                {isRegister ? "Create your research account" : "Sign in to continue"}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 rounded-md border border-slate-700 p-1">
              <Button
                type="button"
                variant={isRegister ? "ghost" : "default"}
                className={isRegister ? "text-slate-300" : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"}
                aria-pressed={!isRegister}
                onClick={() => changeMode("login")}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </Button>
              <Button
                type="button"
                variant={isRegister ? "default" : "ghost"}
                className={isRegister ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400" : "text-slate-300"}
                aria-pressed={isRegister}
                onClick={() => changeMode("register")}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Register
              </Button>
            </div>

            {hasProtectedRedirect && (
              <Alert className="mb-4 border-cyan-900/70 bg-cyan-950/40 text-cyan-50">
                <AlertDescription>
                  Sign in to continue to <span className="font-medium">{redirectTo}</span>.
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
                  className="border-slate-700 bg-slate-950 text-white"
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
                  className="border-slate-700 bg-slate-950 text-white"
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
                className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
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
      </div>
    </div>
  );
}
