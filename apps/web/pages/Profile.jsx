import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  Mail,
  Calendar,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  GraduationCap,
  Sparkles,
  Camera,
  Link as LinkIcon,
  Microscope,
  FileText
} from "lucide-react";

export default function ProfilePage() {
  const { user, isLoadingAuth } = useAuth();
  const [age, setAge] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [researchInterests, setResearchInterests] = useState("");
  const [currentProjects, setCurrentProjects] = useState("");
  const [publications, setPublications] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [orcidId, setOrcidId] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setAge(user.age || "");
      setEducationLevel(user.education_level || "");
      setFieldOfStudy(user.field_of_study || "");
      setResearchInterests(user.research_interests || "");
      setCurrentProjects(user.current_projects || "");
      setPublications(user.publications || "");
      setLinkedinUrl(user.linkedin_url || "");
      setOrcidId(user.orcid_id || "");
      setProfilePicture(user.profile_picture || "");
    }
  }, [user]);

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setIsUploadingPicture(true);
    setError(null);

    // BACKEND_NEEDED: File upload needs API implementation
    setError("Profile picture upload is not yet available");
    setIsUploadingPicture(false);

    // try {
    //   const { file_url } = await base44.integrations.Core.UploadFile({ file });
    //   setProfilePicture(file_url);
    //   
    //   await apiClient.updateMe({ profile_picture: file_url });
    //   setSuccess(true);
    //   setTimeout(() => setSuccess(false), 3000);
    // } catch (err) {
    //   setError(err.message || "Failed to upload profile picture");
    // } finally {
    //   setIsUploadingPicture(false);
    // }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    // BACKEND_NEEDED: User profile update needs API implementation
    setError("Profile updates are not yet available");
    setIsSaving(false);

    // try {
    //   await apiClient.updateMe({
    //     age,
    //     education_level: educationLevel,
    //     field_of_study: fieldOfStudy,
    //     research_interests: researchInterests,
    //     current_projects: currentProjects,
    //     publications: publications,
    //     linkedin_url: linkedinUrl,
    //     orcid_id: orcidId,
    //   });
    //
    //   setSuccess(true);
    //   setTimeout(() => setSuccess(false), 3000);
    // } catch (err) {
    //   setError(err.message || "Failed to update profile");
    // } finally {
    //   setIsSaving(false);
    // }
  };

  const handleLogout = () => {
    apiClient.logout();
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Your Profile
          </h1>
          <p className="text-lg text-slate-600">
            Manage your account settings and personalize your experience
          </p>
        </div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Profile updated successfully!
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-4 pb-4 border-b">
                <div className="relative">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-cover border-4 border-blue-200"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center">
                      <User className="w-12 h-12 text-white" />
                    </div>
                  )}
                  <label
                    htmlFor="profile-picture"
                    className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    {isUploadingPicture ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-white" />
                    )}
                  </label>
                  <input
                    id="profile-picture"
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureUpload}
                    className="hidden"
                    disabled={isUploadingPicture}
                  />
                </div>
                <p className="text-xs text-slate-500 text-center">
                  Click camera to upload (max 5MB)
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Email:</span>
                  <span className="text-slate-700 break-all">{user.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Member since:</span>
                  <span className="text-slate-700">
                    {new Date(user.created_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-slate-500" />
                  <span className="font-medium">Role:</span>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role || "user"}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-600" />
                AI Personalization & Research Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Basic Information
                  </h3>
                  
                  <div>
                    <Label htmlFor="age">Age (Optional)</Label>
                    <Input
                      id="age"
                      type="number"
                      placeholder="Your age"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="education">Education Level</Label>
                    <Select value={educationLevel} onValueChange={setEducationLevel}>
                      <SelectTrigger id="education" className="mt-1">
                        <SelectValue placeholder="Select your education level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high_school">High School</SelectItem>
                        <SelectItem value="undergraduate">Undergraduate</SelectItem>
                        <SelectItem value="graduate">Graduate</SelectItem>
                        <SelectItem value="phd">PhD</SelectItem>
                        <SelectItem value="medical">Medical Professional</SelectItem>
                        <SelectItem value="researcher">Research Scientist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="field">Field of Study</Label>
                    <Input
                      id="field"
                      placeholder="e.g., Biology, Medicine, Genetics"
                      value={fieldOfStudy}
                      onChange={(e) => setFieldOfStudy(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Microscope className="w-4 h-4" />
                    Research Profile
                  </h3>

                  <div>
                    <Label htmlFor="interests">Research Interests</Label>
                    <Textarea
                      id="interests"
                      placeholder="Describe your research interests (e.g., cancer genomics, rare diseases, population genetics)"
                      value={researchInterests}
                      onChange={(e) => setResearchInterests(e.target.value)}
                      className="mt-1 h-20"
                    />
                  </div>

                  <div>
                    <Label htmlFor="projects">Current Projects</Label>
                    <Textarea
                      id="projects"
                      placeholder="List your current research projects or areas of focus"
                      value={currentProjects}
                      onChange={(e) => setCurrentProjects(e.target.value)}
                      className="mt-1 h-20"
                    />
                  </div>

                  <div>
                    <Label htmlFor="publications">Publications & Achievements</Label>
                    <Textarea
                      id="publications"
                      placeholder="Notable publications, presentations, or research achievements"
                      value={publications}
                      onChange={(e) => setPublications(e.target.value)}
                      className="mt-1 h-24"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Professional Profiles
                  </h3>

                  <div>
                    <Label htmlFor="linkedin">LinkedIn Profile</Label>
                    <div className="relative mt-1">
                      <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input
                        id="linkedin"
                        placeholder="https://linkedin.com/in/yourprofile"
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="orcid">ORCID iD</Label>
                    <div className="relative mt-1">
                      <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input
                        id="orcid"
                        placeholder="0000-0000-0000-0000"
                        value={orcidId}
                        onChange={(e) => setOrcidId(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Your unique researcher identifier
                    </p>
                  </div>
                </div>

                <Alert className="bg-blue-50 border-blue-200">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900 text-sm">
                    This information helps our AI assistants provide personalized explanations
                    and helps connect you with relevant research opportunities.
                  </AlertDescription>
                </Alert>

                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Save Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}