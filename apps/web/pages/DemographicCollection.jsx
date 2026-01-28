import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@genemap/shared";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DnaIcon from "../components/icons/DnaIcon";
import { UserCircle, Phone, Mail, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

export default function DemographicCollectionPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mailingListOptIn, setMailingListOptIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);

      // If already collected, redirect to home
      if (currentUser.demographics_collected) {
        navigate(createPageUrl("Home"));
        return;
      }

      // Pre-fill phone if exists
      if (currentUser.phone_number) {
        setPhoneNumber(currentUser.phone_number);
      }
      if (currentUser.mailing_list_opt_in) {
        setMailingListOptIn(currentUser.mailing_list_opt_in);
      }
    } catch (err) {
      console.error("Error loading user:", err);
      setError("Failed to load user information");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!phoneNumber.trim()) {
      setError("Phone number is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // BACKEND_NEEDED: User profile update API needs implementation
      // await apiClient.updateMe({
      //   phone_number: phoneNumber,
      //   mailing_list_opt_in: mailingListOptIn,
      //   demographics_collected: true
      // });

      // For now, just navigate (will need proper implementation)
      setError('User profile update API not yet implemented');
      // navigate(createPageUrl("Home"));
    } catch (err) {
      console.error("Error saving demographics:", err);
      setError("Failed to save information. Please try again.");
      setIsSaving(false);
    }
  };



  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <DnaIcon className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <p className="text-slate-600 text-sm mt-2">
            Please provide the following information to access GeneMap
          </p>
          <p className="text-red-600 text-xs mt-1 font-medium">
            * All fields are required
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Display Name and Email (from authentication) */}
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-800 mb-2 font-medium">
                ✓ Account Information (from your login)
              </div>
              <div className="flex items-center gap-2 text-sm">
                <UserCircle className="w-4 h-4 text-blue-600" />
                <span className="text-slate-600">Name:</span>
                <span className="font-medium text-slate-900">{user?.full_name || "Not provided"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-slate-600">Email:</span>
                <span className="font-medium text-slate-900">{user?.email}</span>
              </div>
              <p className="text-xs text-blue-700 mt-2">
                You can log in anytime using your email and password
              </p>
            </div>

            {/* Phone Number Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Mailing List Opt-in */}
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="mailing-list"
                  checked={mailingListOptIn}
                  onCheckedChange={setMailingListOptIn}
                />
                <div className="flex-1">
                  <label
                    htmlFor="mailing-list"
                    className="text-sm font-medium text-slate-900 cursor-pointer"
                  >
                    Join Axiom Biolabs Mailing List
                  </label>
                  <p className="text-xs text-slate-600 mt-1">
                    Receive updates about new features, research insights, and exclusive offers from Axiom Biolabs
                  </p>
                </div>
              </div>

              <a
                href="https://www.axiombiolabs.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                Visit Axiom Biolabs Website
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Sponsorship Note */}
            <div className="text-center text-xs text-slate-500 p-3 bg-slate-50 rounded-lg">
              <p>
                GeneMap was created by <span className="font-semibold text-slate-700">Dr. John White</span>
              </p>
              <p className="mt-1">
                Proudly sponsored by <span className="font-semibold text-blue-600">Axiom Biolabs</span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={isSaving || !phoneNumber.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Continue to GeneMap
                  </>
                )}
              </Button>
              
              <p className="text-center text-xs text-slate-500">
                This information is required to access the application
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}