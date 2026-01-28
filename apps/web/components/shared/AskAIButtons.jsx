import React from "react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

/**
 * Reusable AI explanation buttons for Robert and Anastasia
 * Can be added to any visualization or data display component
 */
export default function AskAIButtons({ 
  context, // e.g. "gene_expression", "protein_domains", "chromosome_location"
  gene,    // gene symbol or name
  topic,   // optional: specific topic like "BRCA1 expression in brain"
  className = ""
}) {
  const buildUrl = (assistant) => {
    const params = new URLSearchParams();
    if (context) params.set("context", context);
    if (gene) params.set("gene", gene);
    if (topic) params.set("topic", topic);
    params.set("assistant", assistant);
    return createPageUrl("AIAssistants") + "?" + params.toString();
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 hover:bg-blue-100 min-h-[40px] text-sm"
        onClick={() => window.location.href = buildUrl("robert")}
      >
        <span className="text-base mr-1.5">🧠</span>
        Ask Robert
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300 hover:bg-purple-100 min-h-[40px] text-sm"
        onClick={() => window.location.href = buildUrl("anastasia")}
      >
        <span className="text-base mr-1.5">💜</span>
        Ask Anastasia
      </Button>
    </div>
  );
}