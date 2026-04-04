import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Atom, ExternalLink, Info } from "lucide-react";

export default function ProteinStructure({ gene, userEducationLevel }) {
  const [structureInfo, setStructureInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadStructureInfo();
  }, [gene.symbol]);

  const loadStructureInfo = async () => {
    setIsLoading(true);
    try {
      const educationContext = getEducationContext(userEducationLevel);
      
      const prompt = `Provide protein structure information for gene ${gene.symbol} (${gene.name}).

**Your Task:**
1. Check if 3D structure is available in PDB (Protein Data Bank)
2. List PDB IDs if available
3. Describe the overall structure (e.g., alpha helices, beta sheets, domains)
4. Explain the structure-function relationship
5. Mention any notable structural features

Tailor explanation for ${educationContext}.

If no PDB structure exists, provide information about predicted structure or structure of homologs.`;

      const { result: raw } = await apiClient.invokeLLM(prompt + '\n\nReturn JSON: {"has_structure": boolean, "pdb_ids": ["..."], "structure_type": "...", "description": "...", "structural_features": ["..."], "function_relationship": "..."}');
      const response = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{"has_structure":false,"pdb_ids":[],"structure_type":"","description":"","structural_features":[],"function_relationship":""}') : raw;

      setStructureInfo(response);
    } catch (err) {
      console.error("Error loading structure info:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "a high school student - use simple analogies and avoid technical jargon";
    }
    if (level === 'undergraduate') {
      return "an undergraduate student - use basic biochemistry terms with explanations";
    }
    return "an advanced student/researcher - use technical structural biology terminology";
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-600 mr-2" />
            <span className="text-cyan-700">Loading structure information...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!structureInfo) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Atom className="w-5 h-5 text-cyan-600" />
          Protein Structure
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Structure Status */}
        <div className="flex items-center gap-2">
          <Badge className={structureInfo.has_structure ? "bg-green-600" : "bg-amber-600"}>
            {structureInfo.has_structure ? "Structure Available" : "Predicted/Homolog"}
          </Badge>
          {structureInfo.structure_type && (
            <Badge variant="outline">{structureInfo.structure_type}</Badge>
          )}
        </div>

        {/* PDB Links */}
        {structureInfo.pdb_ids && structureInfo.pdb_ids.length > 0 && (
          <div className="bg-white p-4 rounded-lg">
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">
              PDB Entries ({structureInfo.pdb_ids.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {structureInfo.pdb_ids.map((pdbId, idx) => (
                <a
                  key={idx}
                  href={`https://www.rcsb.org/structure/${pdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-100 text-cyan-800 rounded-md hover:bg-cyan-200 transition-colors text-sm font-medium"
                >
                  {pdbId}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Structure Description */}
        <div className="bg-white p-4 rounded-lg">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 mb-2 text-sm">
                Structure Description
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed">
                {structureInfo.description}
              </p>
            </div>
          </div>
        </div>

        {/* Structural Features */}
        {structureInfo.structural_features && structureInfo.structural_features.length > 0 && (
          <div className="bg-white p-4 rounded-lg">
            <h4 className="font-semibold text-slate-900 mb-2 text-sm">
              Key Structural Features
            </h4>
            <ul className="space-y-1">
              {structureInfo.structural_features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-cyan-600 mt-1">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Structure-Function Relationship */}
        {structureInfo.function_relationship && (
          <div className="bg-gradient-to-r from-cyan-100 to-blue-100 p-4 rounded-lg">
            <h4 className="font-semibold text-cyan-900 mb-2 text-sm">
              How Structure Relates to Function
            </h4>
            <p className="text-sm text-cyan-800 leading-relaxed">
              {structureInfo.function_relationship}
            </p>
          </div>
        )}

        {/* External Resources */}
        <div className="flex gap-2">
          <a
            href={`https://www.uniprot.org/uniprotkb?query=${gene.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-3 h-3" />
              UniProt
            </Button>
          </a>
          <a
            href={`https://www.rcsb.org/search?request=%7B%22query%22%3A%7B%22type%22%3A%22terminal%22%2C%22service%22%3A%22text%22%2C%22parameters%22%3A%7B%22value%22%3A%22${gene.symbol}%22%7D%7D%7D`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-3 h-3" />
              RCSB PDB
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}