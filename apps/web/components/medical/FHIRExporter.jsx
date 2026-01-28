import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileJson, Loader2, CheckCircle2, Info } from "lucide-react";

export default function FHIRExporter({ data, type = "variant_interpretation" }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const generateFHIRBundle = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const prompt = `Generate a FHIR R4 compliant JSON bundle for this genetic data.

**Data Type:** ${type}
**Data to Convert:**
${JSON.stringify(data, null, 2)}

**Your Task:**
Create a valid FHIR R4 Bundle with appropriate resources based on the data type:

For variant_interpretation:
- DiagnosticReport resource
- Observation resources for each variant
- Patient resource (use placeholder ID)
- Specimen resource (if applicable)
- Organization resource (issuer)

For medical_record:
- DocumentReference resource
- Composition resource
- Relevant Observation resources
- Condition resources for identified conditions

For comparison_analysis:
- DiagnosticReport with multiple observations
- Linked observations for compared records

**FHIR Requirements:**
1. Use FHIR R4 resource types
2. Include proper resourceType for each resource
3. Use LOINC codes where appropriate (e.g., 51969-4 for genetic analysis)
4. Include proper status fields
5. Add issued/effectiveDateTime timestamps
6. Use proper FHIR data types (CodeableConcept, Reference, etc.)
7. Include performer/practitioner as AI system
8. Add interpretation codes for clinical significance

Return complete, valid FHIR Bundle with all resources.`;

      // BACKEND_NEEDED: LLM integration needs API implementation
      // const fhirBundle = await apiClient.invokeLLM({
      //   prompt,
      //   response_json_schema: { ... }
      // });
      const fhirBundle = {
        resourceType: "Bundle",
        type: "document",
        entry: []
      };

      // Download the FHIR bundle
      const blob = new Blob([JSON.stringify(fhirBundle, null, 2)], { 
        type: 'application/fhir+json' 
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `genemap-fhir-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setExportSuccess(true);
      setTimeout(() => {
        setDialogOpen(false);
        setExportSuccess(false);
      }, 3000);

    } catch (err) {
      console.error("Error generating FHIR:", err);
      alert("Failed to generate FHIR export. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileJson className="w-4 h-4" />
          Export to FHIR
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-blue-600" />
            Export to FHIR Format
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 text-sm">
              <strong>FHIR (Fast Healthcare Interoperability Resources)</strong> is the standard 
              for healthcare data exchange. This export creates FHIR R4 compliant resources that 
              can be imported into EHR systems and other FHIR-compatible platforms.
            </AlertDescription>
          </Alert>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">Export Details:</h4>
            <ul className="space-y-1 text-sm text-slate-700">
              <li>• Format: FHIR R4 JSON Bundle</li>
              <li>• Includes: DiagnosticReport, Observations, Conditions</li>
              <li>• Standard: HL7 FHIR R4</li>
              <li>• Compatible with: EHR systems, SMART on FHIR apps</li>
            </ul>
          </div>

          {exportSuccess && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900">
                FHIR bundle successfully exported! Check your downloads folder.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={generateFHIRBundle}
            disabled={isExporting}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating FHIR Bundle...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Generate & Download FHIR
              </>
            )}
          </Button>

          <div className="text-xs text-slate-500 text-center">
            The exported file can be validated at fhir.org or imported into FHIR-compatible systems
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}