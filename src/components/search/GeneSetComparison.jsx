import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  GitCompare, 
  Lightbulb, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  BookmarkPlus,
  Network
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

export default function GeneSetComparison({ comparison, onSaveGeneSet }) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [setName, setSetName] = useState("");
  const [setDescription, setSetDescription] = useState("");

  const handleSave = () => {
    if (setName.trim()) {
      onSaveGeneSet(setName, setDescription, []);
      setSaveDialogOpen(false);
      setSetName("");
      setSetDescription("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <GitCompare className="w-6 h-6 text-purple-600" />
              Gene Set Comparison Analysis
            </CardTitle>
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700 gap-2">
                  <BookmarkPlus className="w-4 h-4" />
                  Save Gene Set
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Gene Set</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="set-name">Set Name *</Label>
                    <Input
                      id="set-name"
                      value={setName}
                      onChange={(e) => setSetName(e.target.value)}
                      placeholder="e.g., Breast Cancer Genes"
                    />
                  </div>
                  <div>
                    <Label htmlFor="set-description">Description</Label>
                    <Textarea
                      id="set-description"
                      value={setDescription}
                      onChange={(e) => setSetDescription(e.target.value)}
                      placeholder="Optional description..."
                      className="h-20"
                    />
                  </div>
                  <Button 
                    onClick={handleSave} 
                    className="w-full"
                    disabled={!setName.trim()}
                  >
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-slate-700">
            Comparing <strong>{comparison.userGenes.length}</strong> user genes with{" "}
            <strong>{comparison.phenotypeGenes.length}</strong> phenotype-associated genes
            {comparison.phenotype && ` for "${comparison.phenotype}"`}
          </p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Overlapping Genes */}
        <Card className="bg-green-50 border-green-200 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Overlapping Genes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 mb-3">
              {comparison.overlapping.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {comparison.overlapping.map((gene) => (
                <Badge key={gene} className="bg-green-600 text-white">
                  {gene}
                </Badge>
              ))}
              {comparison.overlapping.length === 0 && (
                <p className="text-sm text-slate-500 italic">No direct overlaps found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Unique to User Input */}
        <Card className="bg-blue-50 border-blue-200 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Your Unique Genes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 mb-3">
              {comparison.uniqueToUser.length}
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {comparison.uniqueToUser.map((gene) => (
                <Badge key={gene} variant="outline" className="border-blue-300 text-blue-700">
                  {gene}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Unique to Phenotype */}
        <Card className="bg-amber-50 border-amber-200 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Phenotype-Specific
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600 mb-3">
              {comparison.uniqueToPhenotype.length}
            </div>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {comparison.uniqueToPhenotype.slice(0, 10).map((gene) => (
                <Badge key={gene} variant="outline" className="border-amber-300 text-amber-700">
                  {gene}
                </Badge>
              ))}
              {comparison.uniqueToPhenotype.length > 10 && (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  +{comparison.uniqueToPhenotype.length - 10} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Robert's Analysis */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            Robert's Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-blue-900">{children}</strong>,
                ul: ({ children }) => <ul className="ml-4 mb-3 space-y-1 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="ml-4 mb-3 space-y-1 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="text-slate-700">{children}</li>,
                h3: ({ children }) => <h3 className="text-lg font-semibold text-blue-900 mt-4 mb-2">{children}</h3>,
              }}
            >
              {comparison.analysis}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Functional Relationships */}
      {comparison.functionalRelationships && comparison.functionalRelationships.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Network className="w-5 h-5 text-purple-600" />
              Functional Relationships
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {comparison.functionalRelationships.map((rel, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-600">{rel.gene1}</Badge>
                    <span className="text-slate-400">↔</span>
                    <Badge className="bg-blue-600">{rel.gene2}</Badge>
                  </div>
                  <p className="text-sm text-slate-700">{rel.relationship}</p>
                  {rel.evidence && (
                    <p className="text-xs text-slate-500 mt-1">
                      <strong>Evidence:</strong> {rel.evidence}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}