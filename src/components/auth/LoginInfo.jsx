import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Lock, Mail, User, Shield } from "lucide-react";

export default function LoginInfo() {
  return (
    <Card className="shadow-lg border-2 border-blue-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lock className="w-5 h-5 text-blue-600" />
          Authentication & Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Your account credentials allow you to log in and access GeneMap.</strong>
          </AlertDescription>
        </Alert>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-slate-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Email & Password Login</p>
              <p className="text-slate-600 text-xs">
                Use your email address and password to log in from any device
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-slate-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Required Profile Information</p>
              <p className="text-slate-600 text-xs">
                Name, email, and phone number are required to access the platform
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-slate-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Secure Access</p>
              <p className="text-slate-600 text-xs">
                Your account is protected with industry-standard security
              </p>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t text-xs text-slate-500">
          <p className="mb-1">
            <strong>Created by:</strong> Dr. John White
          </p>
          <p>
            <strong>Sponsored by:</strong> <a href="https://www.axiombiolabs.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">Axiom Biolabs</a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}