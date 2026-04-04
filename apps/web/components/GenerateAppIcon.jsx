import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, Sparkles } from "lucide-react";

export default function GenerateAppIcon() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [iconUrl, setIconUrl] = useState(null);

  useEffect(() => {
    // Auto-generate on mount
    generateIcon();
  }, []);

  const generateIcon = async () => {
    setIsGenerating(true);
    try {
      const result = await apiClient.llmImage(
        `Modern app icon inspired by Leonardo da Vinci's Vitruvian Man for a genomics application.
        Design features:
        - Minimalist silhouette of human figure in anatomical proportions
        - Geometric circle and square framework (Da Vinci's proportional planes)
        - DNA double helix pattern integrated into the design
        - Gradient color scheme: deep blue (#2563eb) to indigo (#4f46e5)
        - Clean, professional, scientific aesthetic
        - White/light blue figure on gradient background
        - Subtle golden ratio geometric lines
        - High contrast for app icon clarity
        - Perfect for 512x512px app icon
        - No text, pure icon design
        Style: Renaissance meets modern genomics, clean lines, professional medical/scientific feel, Leonardo da Vinci anatomical study meets DNA research`,
        { size: '1024x1024', quality: 'hd' }
      );
      setIconUrl(result.url);
    } catch (error) {
      console.error("Failed to generate icon:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardContent className="pt-6">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="text-xl font-semibold">GeneMap App Icon</h3>
          </div>
          <p className="text-sm text-slate-600">Inspired by Da Vinci's Vitruvian Man</p>
        </div>
        
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
            <p className="text-slate-600">Creating your masterpiece...</p>
            <p className="text-xs text-slate-500 mt-2">This may take 10-20 seconds</p>
          </div>
        ) : iconUrl ? (
          <div className="space-y-6">
            <div className="relative group">
              <img 
                src={iconUrl} 
                alt="GeneMap App Icon - Da Vinci Inspired" 
                className="w-full max-w-md mx-auto rounded-3xl shadow-2xl border-4 border-slate-200"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = iconUrl;
                  a.download = 'genemap-icon-davinci.png';
                  a.click();
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Icon
              </Button>
              <Button onClick={generateIcon} variant="outline">
                <Sparkles className="w-4 h-4 mr-2" />
                Generate New
              </Button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-900">
                <strong>Icon ready!</strong> Use this as your app icon by uploading it to your project settings.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}