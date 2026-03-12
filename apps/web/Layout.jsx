import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import DnaIcon from "./components/icons/DnaIcon";
import BanCheck from "./components/BanCheck";
import DemographicCheck from "./components/DemographicCheck";
import MelissaBanner from "./components/MelissaBanner";
import PlatformCompatibility from "./components/PlatformCompatibility";
import UniversalLinkHandler from "./components/UniversalLinkHandler";
import { getBrowserEnvironment } from "./components/shared/safeNavigate";
import { Search, User, Crown, History, Home, FileText, Heart, Shield, BarChart3, Microscope, LayoutDashboard, MessageSquare, Building2, ShieldOff, Mail, Crown as CrownIcon, Users, Sparkles, Server, Code2, BookOpen, GraduationCap, HelpCircle, Route } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import MobileOptimization from "./components/MobileOptimization";
import { useEducationLevel, EDUCATION_LEVELS } from "./lib/EducationLevelContext";

const educationNav = [
  { title: "Learn Genetics", url: createPageUrl("LearnGenetics"), icon: BookOpen },
  { title: "Learning Path", url: createPageUrl("LearningPath"), icon: GraduationCap },
  { title: "Take a Quiz", url: createPageUrl("QuizMode"), icon: HelpCircle },
];

const researchNav = [
  { title: "Home", url: createPageUrl("Home"), icon: Home },
  { title: "Dashboard", url: createPageUrl("Dashboard"), icon: LayoutDashboard },
  { title: "Gene Search", url: createPageUrl("Search"), icon: Search },
  { title: "GSEA", url: createPageUrl("GSEA"), icon: Sparkles },
  { title: "AI Assistants", url: createPageUrl("AIAssistants"), icon: MessageSquare },
  { title: "VCF Analysis", url: createPageUrl("VCFAnalysis"), icon: FileText },
  { title: "Visualization Hub", url: createPageUrl("VisualizationHub"), icon: BarChart3 },
  { title: "Research Mode", url: createPageUrl("ResearchMode"), icon: Microscope },
];

const personalNav = [
  { title: "Robert Clinical", url: createPageUrl("RobertClinical"), icon: Shield },
  { title: "Anastasia", url: createPageUrl("Anastasia"), icon: Heart },
  { title: "Medical Data", url: createPageUrl("MedicalData"), icon: FileText },
  { title: "Search History", url: createPageUrl("History"), icon: History },
  { title: "Contact Support", url: createPageUrl("ContactSupport"), icon: Mail },
];

const adminNav = [
  { title: "License Manager", url: createPageUrl("InstitutionalAdmin"), icon: Building2, badge: "Teams" },
  { title: "Banned Users", url: createPageUrl("BannedUsers"), icon: ShieldOff },
  { title: "Function Tester", url: createPageUrl("AdminFunctionTester"), icon: Server },
  { title: "Function Reviewer", url: createPageUrl("FunctionReviewer"), icon: Code2 },
  { title: "Admin Setup", url: createPageUrl("SuperAdminSetup"), icon: Crown },
  { title: "Newsletter Subs", url: createPageUrl("AxiomNewsletter"), icon: Mail },
  { title: "Users Log", url: createPageUrl("UsersLog"), icon: Users },
  { title: "Analytics", url: createPageUrl("AdminAnalytics"), icon: BarChart3 },
  { title: "User Messages", url: createPageUrl("AdminMessages"), icon: MessageSquare },
];

const accountNav = [
  { title: "Profile", url: createPageUrl("Profile"), icon: User },
  { title: "Premium", url: createPageUrl("Premium"), icon: Crown },
];

function NavGroup({ label, items, location, accent = 'slate' }) {
  const accentColors = {
    blue: { active: 'bg-blue-50 text-blue-700 font-medium', hover: 'hover:bg-blue-50/60 hover:text-blue-700', icon: 'text-blue-600' },
    purple: { active: 'bg-purple-50 text-purple-700 font-medium', hover: 'hover:bg-slate-50 hover:text-slate-900', icon: 'text-purple-600' },
    slate: { active: 'bg-slate-100 text-slate-900 font-medium', hover: 'hover:bg-slate-50 hover:text-slate-900', icon: 'text-slate-600' },
  };
  const colors = accentColors[accent] || accentColors.slate;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-1.5">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={`transition-all duration-150 rounded-lg mb-0.5 touch-manipulation ${
                    isActive ? colors.active : colors.hover
                  }`}
                >
                  <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5 min-h-[40px]">
                    {item.icon && <item.icon className={`w-[18px] h-[18px] ${isActive ? colors.icon : 'text-slate-400'}`} />}
                    <span className="text-[13px]">{item.title}</span>
                    {item.badge && (
                      <Badge className="ml-auto bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 py-0">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const { level, levelConfig } = useEducationLevel();

  // Add PWA meta tags and initialize cross-platform fixes
  useEffect(() => {
    const env = getBrowserEnvironment();
    
    // Add PWA meta tags dynamically
    const addMetaTag = (name, content, httpEquiv = false) => {
      let meta = document.querySelector(`meta[name="${name}"]`) || 
                 document.querySelector(`meta[http-equiv="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        if (httpEquiv) {
          meta.setAttribute('http-equiv', name);
        } else {
          meta.setAttribute('name', name);
        }
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // PWA and iOS support
    addMetaTag('apple-mobile-web-app-capable', 'yes');
    addMetaTag('apple-mobile-web-app-title', 'GeneMap');
    addMetaTag('apple-mobile-web-app-status-bar-style', 'default');
    addMetaTag('theme-color', '#1e3a8a');
    addMetaTag('format-detection', 'telephone=no');
    
    // Security for embedded browsers
    addMetaTag('referrer', 'no-referrer-when-downgrade');
    
    // Add manifest link
    let manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.setAttribute('rel', 'manifest');
      manifestLink.setAttribute('href', '/manifest.json');
      document.head.appendChild(manifestLink);
    }

    // Add apple-touch-icon
    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.setAttribute('rel', 'apple-touch-icon');
      appleIcon.setAttribute('href', '/icons/icon-192.png');
      document.head.appendChild(appleIcon);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        // Service worker registration failed, non-critical
      });
    }
  }, []);

  return (
    <BanCheck>
      <DemographicCheck>
        <PlatformCompatibility />
        <UniversalLinkHandler />
        <MelissaBanner />
        <SidebarProvider>
          <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Sidebar className="border-r border-slate-200/50">
          <SidebarHeader className="border-b border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center">
                <DnaIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg tracking-tight">GeneMap</h2>
                <p className="text-[11px] text-slate-400 font-medium">Genetics Education</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-2 scrollbar-thin">
            <NavGroup label="Education" items={educationNav} location={location} accent="blue" />
            <NavGroup label="Research Tools" items={researchNav} location={location} accent="slate" />
            <NavGroup label="Personal" items={personalNav} location={location} accent="slate" />
            <NavGroup label="Admin" items={adminNav} location={location} accent="purple" />
            <NavGroup label="Account" items={accountNav} location={location} accent="slate" />
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-100 p-3">
            <div className="space-y-3">
              {levelConfig && (
                <Link to="/learngenetics" className="block p-2.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 hover:border-blue-200 transition-all hover:shadow-sm group">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                      <GraduationCap className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-900">{levelConfig.label}</p>
                      <p className="text-[10px] text-blue-500">Change level</p>
                    </div>
                  </div>
                </Link>
              )}

              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <p className="text-[11px] text-slate-400 text-center">
                  Created by <span className="font-medium text-slate-500">Dr. John White</span>
                </p>
                <div className="text-center">
                  <a
                    href="https://www.axiombiolabs.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-500 hover:text-blue-600 font-medium inline-flex items-center gap-1 transition-colors"
                  >
                    Axiom Biolabs
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/50 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-3 rounded-lg transition-colors duration-200 touch-manipulation min-h-[48px] min-w-[48px] flex items-center justify-center" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <DnaIcon className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900">GeneMap</h1>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            <div className="block sm:hidden p-4">
              <MobileOptimization />
            </div>
            
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
      </DemographicCheck>
    </BanCheck>
  );
}