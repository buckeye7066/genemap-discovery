
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Upload, 
  FileText, 
  Camera, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Trash2,
  Eye,
  Download,
  MessageSquare
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function MedicalDataPage() {
  const [user, setUser] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

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
        extracted_data: extractionResult.output,
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
    const prompt = `
Analyze this ${fileType} data and provide:
1. A concise summary for the patient (2-3 sentences)
2. List of relevant genes mentioned or implicated
3. List of phenotypes or medical conditions identified

Data: ${JSON.stringify(extractedData, null, 2)}

Focus on medically relevant information and genetic associations.
`;

    const analysis = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          genes: {
            type: "array",
            items: { type: "string" }
          },
          phenotypes: {
            type: "array",
            items: { type: "string" }
          }
        }
      }
    });

    return analysis;
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
          <h2 className="text-2xl font-bold text-slate-900">Your Medical Records</h2>
          
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
              <Card key={record.id} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
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
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDelete(record.id)}
                        className="h-9 w-9 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {record.summary && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-900 mb-2">Robert Summary</h4>
                      <p className="text-blue-800 text-sm">{record.summary}</p>
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
      </div>
    </div>
  );
}
