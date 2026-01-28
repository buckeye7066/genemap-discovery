import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Sparkles, MessageSquare, Palette, Search, BarChart3, ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const tourSteps = [
  {
    id: "welcome",
    title: "Welcome to GeneMap! 🧬",
    description: "Let's take a quick tour of the key features to help you get started with your genomic research journey.",
    icon: Sparkles,
    position: "center",
    highlight: null
  },
  {
    id: "contact",
    title: "Message Dr. John White",
    description: "Need help? You can directly message Dr. John White, the creator of GeneMap, for support, feature requests, or questions.",
    icon: MessageSquare,
    position: "center",
    highlight: "contact-link",
    action: { label: "Try It Now", link: createPageUrl("ContactSupport") }
  },
  {
    id: "customize",
    title: "Personalize Your Experience",
    description: "Customize the messaging page with your preferred theme colors, font sizes, and styles. Your preferences are saved automatically!",
    icon: Palette,
    position: "center",
    highlight: "contact-link",
    action: { label: "Customize Now", link: createPageUrl("ContactSupport") }
  },
  {
    id: "search",
    title: "Discover Genes by Phenotype",
    description: "Search for candidate genes using phenotypes or clinical descriptions. Our AI-powered search connects you with relevant genomic data.",
    icon: Search,
    position: "center",
    highlight: "search-link",
    action: { label: "Start Searching", link: createPageUrl("Search") }
  },
  {
    id: "visualizations",
    title: "Visualize & Compare",
    description: "Access powerful visualization tools to compare genes, analyze expression patterns, and explore protein interactions.",
    icon: BarChart3,
    position: "center",
    highlight: "viz-link",
    action: { label: "Explore Visualizations", link: createPageUrl("VisualizationHub") }
  },
  {
    id: "complete",
    title: "You're All Set! 🎉",
    description: "You're ready to start your genomic discovery journey. Remember, you can always find help by contacting Dr. White directly.",
    icon: Sparkles,
    position: "center",
    highlight: null
  }
];

export default function OnboardingTour({ onComplete, forceShow = false }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Allow parent to force show the tour
  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      setCurrentStep(0);
    }
  }, [forceShow]);

  const checkOnboardingStatus = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);
      
      // Show tour if user hasn't completed onboarding
      if (!currentUser.onboarding_completed) {
        setIsVisible(true);
      }
    } catch (err) {
      console.log("Not logged in");
    }
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await markComplete();
    setIsVisible(false);
    if (onComplete) onComplete();
  };

  const handleComplete = async () => {
    await markComplete();
    setIsVisible(false);
    if (onComplete) onComplete();
  };

  const markComplete = async () => {
    try {
      // BACKEND_NEEDED: updateMe needs API implementation
      // await apiClient.updateMe({ onboarding_completed: true });
      console.log("Onboarding complete");
    } catch (err) {
      console.error("Failed to mark onboarding complete:", err);
    }
  };

  if (!isVisible) return null;

  const step = tourSteps[currentStep];
  const StepIcon = step.icon;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-sm" />

      {/* Tour Card */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <Card className="max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-300">
          <CardHeader className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2"
              onClick={handleSkip}
            >
              <X className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <StepIcon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl">{step.title}</CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Step {currentStep + 1} of {tourSteps.length}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-slate-700 leading-relaxed">
              {step.description}
            </p>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                  style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Action Button */}
            {step.action && (
              <Link to={step.action.link}>
                <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                  {step.action.label}
                </Button>
              </Link>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              {currentStep === tourSteps.length - 1 ? (
                <Button
                  onClick={handleComplete}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  Get Started
                  <Sparkles className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleNext} className="gap-2">
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="w-full text-slate-500"
            >
              Skip Tour
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}