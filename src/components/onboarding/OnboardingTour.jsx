
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Rocket, 
  Search, 
  BarChart3, 
  Beaker, 
  Users, 
  Crown,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  CheckCircle,
  ArrowRight
} from "lucide-react";

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: '🎉 Welcome to GeneMap!',
    icon: Rocket,
    content: `Hi there! I'm here to show you around GeneMap - your personal genomics research platform.

**What we'll cover in this quick tour:**
• How to search for genes
• Exploring the Visualization Hub
• Creating research projects
• Working with your team
• Unlocking premium features

**Let's get started!** This will only take 2 minutes.`,
    action: null,
    highlight: null
  },
  {
    id: 'gene-search',
    title: '🔍 Gene Search - Your Starting Point',
    icon: Search,
    content: `The **Gene Search** is where your journey begins!

**You can search by:**
• Disease names (e.g., "Rheumatoid Arthritis")
• Phenotypes (e.g., "polydactyly", "seizures")
• HPO terms (e.g., "HP:0001250")
• Or just input specific genes you're interested in

**What you'll get:**
• Candidate genes ranked by confidence
• Chromosomal locations
• AI-powered explanations from Robert
• Associated phenotypes and diseases

**Try it:** After this tour, search for "breast cancer" to see it in action!`,
    action: 'Gene Search',
    actionUrl: 'Search',
    highlight: 'search'
  },
  {
    id: 'visualization-hub',
    title: '📊 Visualization Hub - See Your Data',
    icon: BarChart3,
    content: `The **Visualization Hub** brings your genes to life with interactive plots!

**What you can visualize:**
• Expression levels across tissues
• Protein domains and structures
• Gene interaction networks
• Chromosomal locations
• Manhattan plots (GWAS data)
• Expression heatmaps
• Circos plots (genome overview)

**Interactive features:**
• Click any gene to highlight it across ALL plots
• Filter data in real-time
• Zoom and explore details
• Save your visualization setups
• Export high-quality images (PNG/SVG)

**Pro tip:** Select 2+ genes and compare them side-by-side!`,
    action: 'Visualization Hub',
    actionUrl: 'VisualizationHub',
    highlight: 'visualization'
  },
  {
    id: 'research-projects',
    title: '🧪 Research Projects - Stay Organized',
    icon: Beaker,
    content: `**Research Projects** help you organize your work and collaborate with others.

**What you can do:**
• Create projects for different studies
• Add genes, phenotypes, and notes
• Track your analysis results
• Tag and categorize projects
• Set project status (planning, active, paused, completed)

**Version Control:**
Every change is automatically saved as a version - you can restore any previous state!

**Perfect for:**
• Organizing multiple research streams
• Long-term studies
• Manuscript preparation
• Grant applications

**Available in:** Research Mode (for researchers and clinicians)`,
    action: 'Research Mode',
    actionUrl: 'ResearchMode',
    highlight: 'projects'
  },
  {
    id: 'collaboration',
    title: '👥 Team Collaboration - Work Together',
    icon: Users,
    content: `Science is better together! **Collaborate** with your team on GeneMap.

**Collaboration features:**
• Invite team members by email
• Assign roles (Owner, Editor, Viewer)
• Share research projects securely
• Track who made what changes
• Export data summaries (FHIR bundles)

**Role-based permissions:**
• **Owner:** Full control, can delete
• **Editor:** Can modify data and run analyses
• **Viewer:** Can view but not change

**Security:**
• Invitation-only access
• Revocable at any time
• Full audit trail
• HIPAA-compliant data handling

**Great for:** Multi-center studies, lab groups, clinical teams`,
    action: null,
    actionUrl: null,
    highlight: 'collaboration'
  },
  {
    id: 'premium',
    title: '👑 Premium Features - Unlock More',
    icon: Crown,
    content: `**Upgrade to Premium** for advanced research capabilities!

**Premium includes:**
• Population prevalence data
• Gene evolutionary history
• Detailed mutation databases
• Treatment information with citations
• Unlimited searches
• Priority support

**Additional benefits:**
• Advanced pharmacogenomics screening
• Clinical trial matching
• Bulk VCF analysis
• Pathway enrichment tools
• AI hypothesis generation

**Pricing:** Just **$4.99/month**

**Special access:** Researchers and clinicians may qualify for institutional licenses!`,
    action: 'View Premium',
    actionUrl: 'Premium',
    highlight: 'premium'
  },
  {
    id: 'complete',
    title: '🎯 You\'re All Set!',
    icon: CheckCircle,
    content: `**Congratulations!** You've completed the GeneMap tour.

**Quick recap of what's available:**
✅ Gene Search - Discover genes from phenotypes
✅ Visualization Hub - Interactive genomic plots
✅ Research Projects - Organize your work
✅ Team Collaboration - Work with colleagues
✅ Medical Data Upload - Analyze your health data
✅ AI Assistants - Robert & Anastasia for guidance

**Where to start:**
1. Try a gene search with "BRCA1" or "diabetes"
2. Upload medical data for personalized insights
3. Explore the Visualization Hub
4. Create your first research project

**Need help?** Chat with Robert or Anastasia anytime!

**Ready to discover?** 🧬`,
    action: 'Start Exploring',
    actionUrl: 'Search',
    highlight: null
  }
];

export default function OnboardingTour({ onComplete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      if (!currentUser.onboarding_completed) {
        setTimeout(() => setIsOpen(true), 1000);
      }
    } catch (err) {
      console.log("Not logged in");
    }
  };

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
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
    setIsOpen(false);
  };

  const handleComplete = async () => {
    await markComplete();
    setIsOpen(false);
    if (onComplete) onComplete();
  };

  const markComplete = async () => {
    try {
      await base44.auth.updateMe({
        onboarding_completed: true,
        onboarding_step: TOUR_STEPS.length
      });
    } catch (err) {
      console.error("Error updating onboarding status:", err);
    }
  };

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;
  const StepIcon = step.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <StepIcon className="w-6 h-6 text-blue-600" />
              {step.title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-slate-500 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </span>
              <span className="text-sm font-medium text-blue-600">
                {Math.round(progress)}% Complete
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Content */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
            <div className="prose prose-sm max-w-none">
              {step.content.split('\n\n').map((paragraph, idx) => {
                if (paragraph.startsWith('**')) {
                  const parts = paragraph.split('**');
                  return (
                    <div key={idx} className="mb-3">
                      {parts.map((part, i) => 
                        i % 2 === 1 ? (
                          <strong key={i} className="text-blue-900 font-semibold">{part}</strong>
                        ) : (
                          <span key={i} className="text-slate-800">{part}</span>
                        )
                      )}
                    </div>
                  );
                }
                if (paragraph.startsWith('•')) {
                  return (
                    <ul key={idx} className="ml-4 mb-3 space-y-1">
                      {paragraph.split('\n').filter(line => line.startsWith('•')).map((item, i) => (
                        <li key={i} className="text-slate-700">
                          {item.substring(2)}
                        </li>
                      ))}
                    </ul>
                  );
                }
                if (paragraph.startsWith('✅')) {
                  return (
                    <div key={idx} className="space-y-2 mb-3">
                      {paragraph.split('\n').filter(line => line.startsWith('✅')).map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-700 text-sm">{item.substring(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <p key={idx} className="text-slate-800 mb-3 leading-relaxed">
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Step Indicators */}
          <div className="flex justify-center gap-2">
            {TOUR_STEPS.map((s, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all ${
                  idx === currentStep 
                    ? 'w-8 bg-blue-600' 
                    : idx < currentStep 
                    ? 'w-2 bg-green-600' 
                    : 'w-2 bg-slate-300'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <div className="flex gap-2">
              {currentStep < TOUR_STEPS.length - 1 && (
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-slate-600"
                >
                  Skip Tour
                </Button>
              )}
              
              {step.action && step.actionUrl && currentStep < TOUR_STEPS.length - 1 ? (
                <Link to={createPageUrl(step.actionUrl)} onClick={handleComplete}>
                  <Button className="bg-blue-600 hover:bg-blue-700 gap-2">
                    {step.action}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <Button
                  onClick={handleNext}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Finish Tour
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
