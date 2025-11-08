import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, CheckCircle, Loader2, Brain } from "lucide-react";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    age: "",
    education_level: "",
    field_of_study: ""
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      setFormData({
        age: currentUser.age || "",
        education_level: currentUser.education_level || "",
        field_of_study: currentUser.field_of_study || ""
      });
    } catch (err) {
      console.error("Error loading user:", err);
      setError("Failed to load profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await base44.auth.updateMe({
        age: formData.age ? parseInt(formData.age) : null,
        education_level: formData.education_level || null,
        field_of_study: formData.field_of_study || null
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const educationLevels = [
    { value: "high_school", label: "High School" },
    { value: "undergraduate", label: "Undergraduate Student" },
    { value: "graduate", label: "Graduate Student" },
    { value: "phd", label: "PhD/Doctorate" },
    { value: "medical_professional", label: "Medical Professional" },
    { value: "researcher", label: "Researcher/Scientist" }
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <User className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Your Profile
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Customize your experience - AI explanations will be tailored to your background
          </p>
        </div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Profile saved successfully! Your search results will now be tailored to your background.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Email</Label>
              <p className="text-slate-900 mt-1">{user?.email}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Full Name</Label>
              <p className="text-slate-900 mt-1">{user?.full_name}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Role</Label>
              <p className="text-slate-900 mt-1 capitalize">{user?.role}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Brain className="w-5 h-5 text-blue-600" />
              AI Personalization Settings
            </CardTitle>
            <p className="text-sm text-slate-600 mt-2">
              Help us tailor gene explanations to your knowledge level
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="age" className="text-base font-medium">
                  Age (Optional)
                </Label>
                <Input
                  id="age"
                  type="number"
                  min="13"
                  max="120"
                  placeholder="Enter your age"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  className="text-lg py-3"
                />
                <p className="text-xs text-slate-500">
                  Helps us adjust complexity of explanations
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="education_level" className="text-base font-medium">
                  Education Level
                </Label>
                <Select 
                  value={formData.education_level} 
                  onValueChange={(value) => setFormData({ ...formData, education_level: value })}
                >
                  <SelectTrigger id="education_level" className="text-lg py-3">
                    <SelectValue placeholder="Select your education level" />
                  </SelectTrigger>
                  <SelectContent>
                    {educationLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Determines the depth and technical language used
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="field_of_study" className="text-base font-medium">
                  Field of Study (Optional)
                </Label>
                <Input
                  id="field_of_study"
                  type="text"
                  placeholder="e.g., Biology, Medicine, Genetics, Computer Science"
                  value={formData.field_of_study}
                  onChange={(e) => setFormData({ ...formData, field_of_study: e.target.value })}
                  className="text-lg py-3"
                />
                <p className="text-xs text-slate-500">
                  Helps us provide relevant context and examples
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">How This Works</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>High School:</strong> Simple explanations with everyday language</li>
                  <li>• <strong>Undergraduate:</strong> More detail with basic scientific terms</li>
                  <li>• <strong>Graduate/PhD:</strong> Technical language and advanced concepts</li>
                  <li>• <strong>Medical/Research:</strong> Clinical focus with specialized terminology</li>
                </ul>
              </div>

              <Button
                type="submit"
                disabled={isSaving}
                className="w-full bg-blue-600 hover:bg-blue-700 py-6 text-lg"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Save Profile
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}