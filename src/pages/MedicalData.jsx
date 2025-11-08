
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Upload, 
  FileText, 
  Camera, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Trash2,
  Eye,
  Download,
  MessageSquare,
  Shield, 
  TrendingUp, 
  Info,
  Brain, // New import
  AlertTriangle, // New import
  Sparkles // New import
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import MedicalDataComparison from "../components/medical/MedicalDataComparison";

export default function MedicalDataPage() {
  const [user, setUser] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedRecords, setSelectedRecords] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareWithEmail, setShareWithEmail] = useState("");
  const [sharePurpose, setSharePurpose] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [sharedRecords, setSharedRecords] = useState([]);

  const [uploadForm, setUploadForm] = useState({
    file: null,
    fileType: "genetic_test",
    notes: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      const records = await base44.entities.MedicalData.filter(
        { created_by: currentUser.email },
        '-created_date'
      );
      setMedicalRecords(records);

      // Load shared records the user has access to
      try {
        const shares = await base44.entities.MedicalDataShare.filter({
          shared_with_email: currentUser.email,
          status: 'active'
        });
        
        // Get the actual records that were shared
        // For now, we'll just track the shares objects, as fetching actual records by ID list
        // might require a different backend API or multiple calls.
        setSharedRecords(shares);
      } catch (err) {
        console.log("No shared records found for current user or error fetching shares:", err.message);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load medical records");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadForm({ ...uploadForm, file });
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!uploadForm.file) {
      setError("Please select a file to upload");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress("Uploading file...");

    try {
      // Upload file
      const uploadResult = await base44.integrations.Core.UploadFile({
        file: uploadForm.file
      });

      const fileUrl = uploadResult.file_url;
      setUploadProgress("Analyzing file with Robert...");

      // Determine JSON schema based on file type
      const schema = getSchemaForFileType(uploadForm.fileType);

      // Extract data from file
      const extractionResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: schema
      });

      if (extractionResult.status === "error") {
        throw new Error(extractionResult.details || "Failed to extract data from file");
      }

      setUploadProgress("Generating insights...");

      // Generate AI summary and identify relevant genes/phenotypes
      const analysisResult = await analyzeExtractedData(
        extractionResult.output,
        uploadForm.fileType
      );

      // Save to database
      await base44.entities.MedicalData.create({
        file_type: uploadForm.fileType,
        file_url: fileUrl,
        // The display code expects key_findings, risks, recommendations inside extracted_data.
        // We combine the original extracted data with the new AI analysis components
        // into the 'extracted_data' field.
        extracted_data: {
          ...extractionResult.output, // Raw extracted data
          key_findings: analysisResult.key_findings,
          risks: analysisResult.risks,
          recommendations: analysisResult.recommendations,
        },
        // Keep these as top-level for backward compatibility and direct access
        summary: analysisResult.summary,
        relevant_genes: analysisResult.genes,
        phenotypes_identified: analysisResult.phenotypes,
        notes: uploadForm.notes
      });

      setSuccess("Medical data uploaded and analyzed successfully! Visit Anastasia AI for detailed counseling.");
      setUploadForm({ file: null, fileType: "genetic_test", notes: "" });
      
      // Reset file input
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = '';

      // Reload data
      await loadData();

    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload and analyze file");
    } finally {
      setIsUploading(false);
      setUploadProgress("");
    }
  };

  const getSchemaForFileType = (fileType) => {
    const schemas = {
      genetic_test: {
        type: "object",
        properties: {
          variants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                gene: { type: "string" },
                rsid: { type: "string" },
                genotype: { type: "string" },
                chromosome: { type: "string" }
              }
            }
          },
          test_type: { type: "string" },
          test_date: { type: "string" }
        }
      },
      blood_test: {
        type: "object",
        properties: {
          test_name: { type: "string" },
          test_date: { type: "string" },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                marker: { type: "string" },
                value: { type: "number" },
                unit: { type: "string" },
                reference_range: { type: "string" },
                status: { type: "string" }
              }
            }
          }
        }
      },
      photo: {
        type: "object",
        properties: {
          visible_features: {
            type: "array",
            items: { type: "string" }
          },
          potential_conditions: {
            type: "array",
            items: { type: "string" }
          }
        }
      },
      medical_report: {
        type: "object",
        properties: {
          report_type: { type: "string" },
          date: { type: "string" },
          findings: {
            type: "array",
            items: { type: "string" }
          },
          diagnoses: {
            type: "array",
            items: { type: "string" }
          }
        }
      },
      other: {
        type: "object",
        properties: {
          content: { type: "string" },
          key_findings: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    };

    return schemas[fileType] || schemas.other;
  };

  const analyzeExtractedData = async (extractedData, fileType) => {
    const educationContext = getEducationContext(user?.education_level);
    
    const prompt = `You are Robert, an AI medical data analysis assistant. Analyze this ${fileType} data and provide a comprehensive, personalized summary.

**Patient Context:**
- Age: ${user?.age || 'Not specified'}
- Education Level: ${educationContext}

**Extracted Data:**
${JSON.stringify(extractedData, null, 2)}

**Your Task - Generate Comprehensive Analysis:**

1.  **Concise Summary** (2-3 sentences)
    - What type of data is this?
    - Most important finding(s)
    - Overall impression
    - Adapted for ${educationContext}

2.  **Key Findings** (3-5 bullet points)
    - Most significant genetic variants (if genetic test)
    - Critical lab values (if lab test)
    - Important observations (if report/photo)
    - Clinical significance of each

3.  **Relevant Genes** (list)
    - Extract gene symbols mentioned
    - Include both genes with variants and genes discussed
    - Return as array

4.  **Identified Phenotypes/Conditions** (list)
    - Medical conditions mentioned
    - Phenotypic traits identified
    - Disease associations
    - Return as array

5.  **Potential Risks** (if applicable)
    - Health risks identified
    - Risk level (low/moderate/high)
    - Time sensitivity (urgent/routine/monitoring)

6.  **Recommendations**
    - Next steps
    - Follow-up actions
    - Specialist consultations needed
    - Timeline for action

**Critical Guidelines:**
- Adapt language complexity to ${educationContext}
- Be clear about certainty levels
- Highlight urgent findings prominently
- Use supportive, non-alarming tone while being honest
- Focus on actionable information
- Distinguish facts from interpretations

Return structured analysis with all sections.`;

    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          key_findings: {
            type: "array",
            items: { type: "string" }
          },
          genes: {
            type: "array",
            items: { type: "string" }
          },
          phenotypes: {
            type: "array",
            items: { type: "string" }
          },
          risks: {
            type: "object",
            properties: {
              identified: { type: "boolean" },
              level: { type: "string" },
              description: { type: "string" },
              urgency: { type: "string" }
            }
          },
          recommendations: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    return {
      summary: analysis.summary,
      key_findings: analysis.key_findings || [],
      genes: analysis.genes || [],
      phenotypes: analysis.phenotypes || [],
      risks: analysis.risks || null,
      recommendations: analysis.recommendations || []
    };
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "high school student - use simple, everyday language";
    }
    if (level === 'undergraduate') {
      return "undergraduate student - use clear scientific terms with explanations";
    }
    if (level === 'graduate' || level === 'phd') {
      return "graduate/PhD student - use technical scientific language";
    }
    if (level === 'medical_professional') {
      return "medical professional - use clinical terminology";
    }
    return "researcher - use comprehensive scientific language";
  };

  const handleDelete = async (recordId) => {
    if (!window.confirm("Are you sure you want to delete this record?")) {
      return;
    }

    try {
      await base44.entities.MedicalData.delete(recordId);
      setSuccess("Record deleted successfully");
      await loadData();
    } catch (err) {
      setError("Failed to delete record");
    }
  };

  const toggleRecordSelection = (recordId) => {
    setSelectedRecords(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId);
      } else {
        return [...prev, recordId];
      }
    });
  };

  const handleCompareRecords = () => {
    // Filter medicalRecords based on selectedRecords IDs.
    // This is already done inside the `if (showComparison)` block for rendering.
    setShowComparison(true);
  };

  const handleShareRecords = async () => {
    if (!shareWithEmail.trim() || !sharePurpose.trim()) {
      setError("Please enter recipient email and purpose");
      return;
    }

    if (selectedRecords.length === 0) {
      setError("Please select records to share");
      return;
    }

    setIsSharing(true);
    setError(null);
    setSuccess(null);
    try {
      // Create share permissions for each selected record
      for (const recordId of selectedRecords) {
        await base44.entities.MedicalDataShare.create({
          record_id: recordId,
          shared_with_email: shareWithEmail.trim(),
          shared_by_email: user.email,
          permission_level: 'compare', // As specified in the outline
          purpose: sharePurpose.trim(),
          status: 'active'
        });
      }

      setSuccess(`Successfully shared ${selectedRecords.length} record(s) with ${shareWithEmail}`);
      setShareDialogOpen(false);
      setShareWithEmail("");
      setSharePurpose("");
      setSelectedRecords([]); // Clear selection after sharing
    } catch (err) {
      console.error("Error sharing records:", err);
      setError("Failed to share records. Please try again. " + err.message);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRevokeShare = async (shareId) => {
    if (!window.confirm("Are you sure you want to revoke this sharing permission?")) {
      return;
    }

    try {
      await base44.entities.MedicalDataShare.update(shareId, {
        status: 'revoked'
      });
      setSuccess("Sharing permission revoked successfully");
      await loadData(); // Reload to reflect changes
    } catch (err) {
      setError("Failed to revoke sharing permission");
    }
  };

  const fileTypeLabels = {
    genetic_test: "Genetic Test (23andMe, AncestryDNA, etc.)",
    blood_test: "Blood Test (CBC, BMP, etc.)",
    photo: "Photo (Physical Features)",
    medical_report: "Medical Report",
    other: "Other Medical Data"
  };

  const fileTypeIcons = {
    genetic_test: "🧬",
    blood_test: "💉",
    photo: "📸",
    medical_report: "📄",
    other: "📋"
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-600">Loading your medical data...</p>
        </div>
      </div>
    );
  }

  if (showComparison) {
    const recordsToCompare = medicalRecords.filter(r => selectedRecords.includes(r.id));
    return (
      <MedicalDataComparison
        records={recordsToCompare}
        onClose={() => {
          setShowComparison(false);
          setSelectedRecords([]);
        }}
        userEducationLevel={user?.education_level}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
              <FileText className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Medical Data Upload
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Upload genetic tests, blood work, photos, or medical reports for Robert analysis
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Anastasia CTA */}
        <Card className="mb-6 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 mb-1">
                  Need help understanding your results?
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Anastasia, our AI genetic counseling assistant, can provide personalized explanations and guidance.
                </p>
                <Link to={createPageUrl("Anastasia")}>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Chat with Anastasia
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Comparison Selection Mode */}
        {selectedRecords.length > 0 && (
          <Card className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold text-purple-900 mb-1">
                    {selectedRecords.length} record{selectedRecords.length > 1 ? 's' : ''} selected
                  </h3>
                  <p className="text-sm text-purple-700">
                    Compare records or share with approved users
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedRecords([])}
                    className="min-h-[44px]"
                  >
                    Clear
                  </Button>
                  
                  <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="min-h-[44px] gap-2"
                      >
                        <Shield className="w-4 h-4" />
                        Share
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Share Medical Records (HIPAA Compliant)</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <Alert className="bg-amber-50 border-amber-200">
                          <Shield className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-900 text-xs">
                            <strong>Privacy Notice:</strong> You are about to share {selectedRecords.length} medical record(s). 
                            Only share with trusted individuals. You can revoke access at any time.
                          </AlertDescription>
                        </Alert>

                        <div>
                          <Label htmlFor="share-email">Recipient Email *</Label>
                          <Input
                            id="share-email"
                            type="email"
                            placeholder="user@example.com"
                            value={shareWithEmail}
                            onChange={(e) => setShareWithEmail(e.target.value)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="share-purpose">Purpose of Sharing *</Label>
                          <Textarea
                            id="share-purpose"
                            placeholder="e.g., Second opinion, family member access, research collaboration"
                            value={sharePurpose}
                            onChange={(e) => setSharePurpose(e.target.value)}
                            className="mt-1 h-20"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            This helps maintain an audit trail for compliance
                          </p>
                        </div>

                        <Button
                          onClick={handleShareRecords}
                          disabled={isSharing || !shareWithEmail.trim() || !sharePurpose.trim()}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          {isSharing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sharing...
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4 mr-2" />
                              Share Records
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    onClick={handleCompareRecords}
                    disabled={selectedRecords.length < 2}
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px] gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Compare ({selectedRecords.length})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Form */}
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Upload className="w-5 h-5 text-green-600" />
              Upload Medical Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="file-type" className="text-base font-medium">
                  Data Type
                </Label>
                <Select 
                  value={uploadForm.fileType} 
                  onValueChange={(value) => setUploadForm({ ...uploadForm, fileType: value })}
                >
                  <SelectTrigger id="file-type" className="text-lg py-3">
                    <SelectValue placeholder="Select type of medical data" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fileTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {fileTypeIcons[value]} {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-upload" className="text-base font-medium">
                  File
                </Label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <Input
                    id="file-upload"
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png,.csv,.txt"
                    className="hidden"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        {uploadForm.fileType === 'photo' ? (
                          <Camera className="w-6 h-6 text-blue-600" />
                        ) : (
                          <FileText className="w-6 h-6 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {uploadForm.file ? uploadForm.file.name : "Click to upload"}
                        </p>
                        <p className="text-sm text-slate-500">
                          PDF, JPG, PNG, CSV, or TXT (max 10MB)
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base font-medium">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Add any relevant notes about this data..."
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  className="h-24"
                />
              </div>

              <Button
                type="submit"
                disabled={isUploading || !uploadForm.file}
                className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {uploadProgress}
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload & Analyze
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How It Works</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Robert extracts key data from your uploaded files</li>
                <li>• Identifies relevant genes and phenotypes</li>
                <li>• Generates personalized insights based on your profile</li>
                <li>• All data is private and encrypted</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Uploaded Records */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Your Medical Records</h2>
            {medicalRecords.length > 1 && (
              <Badge variant="outline" className="text-xs">
                Select records to compare or share
              </Badge>
            )}
          </div>
          
          {medicalRecords.length === 0 ? (
            <Card className="border-2 border-dashed border-slate-200">
              <CardContent className="text-center py-12">
                <FileText className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">
                  No Records Yet
                </h3>
                <p className="text-slate-500">
                  Upload your first medical data file to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            medicalRecords.map((record) => (
              <Card key={record.id} className={`shadow-md hover:shadow-lg transition-shadow ${
                selectedRecords.includes(record.id) ? 'ring-2 ring-purple-500 bg-purple-50/30' : ''
              }`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {medicalRecords.length > 1 && (
                        <Checkbox
                          checked={selectedRecords.includes(record.id)}
                          onCheckedChange={() => toggleRecordSelection(record.id)}
                        />
                      )}
                      <div className="text-3xl">{fileTypeIcons[record.file_type]}</div>
                      <div>
                        <CardTitle className="text-lg">
                          {fileTypeLabels[record.file_type]}
                        </CardTitle>
                        <p className="text-sm text-slate-500">
                          Uploaded {new Date(record.created_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link to={createPageUrl("Anastasia")}>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-purple-600 hover:text-purple-700"
                          title="Discuss with Anastasia"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(record.file_url, '_blank')}
                        className="h-9 w-9"
                        title="View original file"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(record.id)}
                        className="h-9 w-9 text-red-600 hover:text-red-700"
                        title="Delete record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* AI Summary Section */}
                  {record.summary && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2 mb-2">
                        <Brain className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <h4 className="font-semibold text-blue-900">Robert's AI Summary</h4>
                      </div>
                      <p className="text-blue-800 text-sm leading-relaxed">{record.summary}</p>
                    </div>
                  )}

                  {/* Key Findings */}
                  {record.extracted_data?.key_findings && record.extracted_data.key_findings.length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h4 className="font-semibold text-slate-900 mb-2 text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Key Findings
                      </h4>
                      <ul className="space-y-1">
                        {record.extracted_data.key_findings.map((finding, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                            <span className="text-blue-600 mt-1">•</span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risk Assessment */}
                  {record.extracted_data?.risks?.identified && (
                    <Alert className={`${
                      record.extracted_data.risks.level === 'high' 
                        ? 'bg-red-50 border-red-300' 
                        : record.extracted_data.risks.level === 'moderate'
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <AlertTriangle className={`h-4 w-4 ${
                        record.extracted_data.risks.level === 'high' 
                          ? 'text-red-600' 
                          : record.extracted_data.risks.level === 'moderate'
                          ? 'text-amber-600'
                          : 'text-blue-600'
                      }`} />
                      <AlertDescription className={`${
                        record.extracted_data.risks.level === 'high' 
                          ? 'text-red-900' 
                          : record.extracted_data.risks.level === 'moderate'
                          ? 'text-amber-900'
                          : 'text-blue-900'
                      }`}>
                        <strong className="text-sm">
                          Risk Level: {record.extracted_data.risks.level?.toUpperCase() || 'Unknown'}
                          {record.extracted_data.risks.urgency && ` (${record.extracted_data.risks.urgency})`}
                        </strong>
                        <p className="text-xs mt-1">{record.extracted_data.risks.description}</p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Recommendations */}
                  {record.extracted_data?.recommendations && record.extracted_data.recommendations.length > 0 && (
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <h4 className="font-semibold text-purple-900 mb-2 text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        Recommendations
                      </h4>
                      <ul className="space-y-1">
                        {record.extracted_data.recommendations.map((rec, idx) => (
                          <li key={idx} className="text-sm text-purple-800 flex items-start gap-2">
                            <span className="text-purple-600 mt-1">→</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {record.relevant_genes && record.relevant_genes.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2 text-sm">Relevant Genes</h4>
                      <div className="flex flex-wrap gap-2">
                        {record.relevant_genes.map((gene, idx) => (
                          <Badge key={idx} className="bg-green-100 text-green-800">
                            {gene}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.phenotypes_identified && record.phenotypes_identified.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2 text-sm">Phenotypes Identified</h4>
                      <div className="flex flex-wrap gap-2">
                        {record.phenotypes_identified.map((phenotype, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {phenotype}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {record.notes && (
                    <div className="text-sm text-slate-600 border-t pt-3">
                      <strong>Notes:</strong> {record.notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Shared Records Section */}
        {sharedRecords.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-600" />
              Records Shared With You
            </h2>
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900 text-sm">
                These records have been shared with you by other users. You can review the sharing details and revoke access if needed.
              </AlertDescription>
            </Alert>

            {sharedRecords.map((share) => (
              <Card key={share.id} className="border-blue-200">
                <CardContent className="pt-6 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-slate-900">
                      Shared by: {share.shared_by_email}
                    </p>
                    <p className="text-sm text-slate-600">
                      Purpose: {share.purpose}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Shared: {new Date(share.created_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {share.permission_level}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevokeShare(share.id)}
                      title="Revoke sharing access"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Revoke
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
