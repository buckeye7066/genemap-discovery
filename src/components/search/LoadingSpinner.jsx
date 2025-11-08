import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import DnaIcon from "../icons/DnaIcon";

export default function LoadingSpinner({ query }) {
  return (
    <Card className="mb-8 border-blue-200 bg-blue-50/50">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="flex justify-center items-center mb-6">
            <div className="relative">
              <DnaIcon className="w-12 h-12 text-blue-600 animate-pulse" />
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute -top-1 -right-1" />
            </div>
          </div>
          
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            Analyzing: "{query}"
          </h3>
          
          <div className="space-y-2 text-sm text-slate-600">
            <p>• Querying genomic databases...</p>
            <p>• Mapping phenotypes to genes...</p>
            <p>• Compiling source citations...</p>
          </div>

          <div className="mt-6 w-64 mx-auto bg-slate-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: "70%" }}></div>
          </div>
          
          <p className="mt-4 text-xs text-slate-500">
            This may take 10-30 seconds depending on data complexity
          </p>
        </div>
      </CardContent>
    </Card>
  );
}