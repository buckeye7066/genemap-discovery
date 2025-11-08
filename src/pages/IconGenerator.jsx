import React from "react";
import GenerateAppIcon from "../components/GenerateAppIcon";

export default function IconGeneratorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            GeneMap App Icon Generator
          </h1>
          <p className="text-slate-600">
            Generate a professional icon for the GeneMap Discovery app
          </p>
        </div>
        
        <GenerateAppIcon />
      </div>
    </div>
  );
}