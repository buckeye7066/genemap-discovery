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
import { Search, User, Crown, History, Home, FileText, Heart, Shield, BarChart3, Microscope, LayoutDashboard, MessageSquare, Building2, ShieldOff, Mail, Crown as CrownIcon, Users, Sparkles } from "lucide-react";
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

const navigationItems = [
  {
    title: "Home",
    url: createPageUrl("Home"),
    icon: Home,
  },
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: LayoutDashboard,
    highlight: true,
    badge: "New"
  },
  {
    title: "Gene Search",
    url: createPageUrl("Search"),
    icon: Search,
  },
  {
    title: "GSEA",
    url: createPageUrl("GSEA"),
    icon: Sparkles,
    highlight: true,
    badge: "New"
  },
  {
    title: "AI Assistants",
    url: createPageUrl("AIAssistants"),
    icon: MessageSquare,
    highlight: true,
    badge: "Voice" // Changed from "Chat" to "Voice"
  },
  {
    title: "VCF Analysis",
    url: createPageUrl("VCFAnalysis"),
    icon: FileText,
    highlight: true,
    badge: "New"
  },
  {
    title: "Visualization Hub",
    url: createPageUrl("VisualizationHub"),
    icon: BarChart3,
    highlight: true,
  },
  {
    title: "Research Mode",
    url: createPageUrl("ResearchMode"),
    icon: Microscope,
    highlight: true,
    badge: "Research"
  },
  {
    title: "Robert Clinical",
    url: createPageUrl("RobertClinical"),
    icon: Shield,
  },
  {
    title: "Anastasia",
    url: createPageUrl("Anastasia"),
    icon: Heart,
  },
  {
    title: "Medical Data",
    url: createPageUrl("MedicalData"),
    icon: FileText,
  },
  {
    title: "Search History",
    url: createPageUrl("History"),
    icon: History,
  },
  {
    title: "License Manager",
    url: createPageUrl("InstitutionalAdmin"),
    icon: Building2,
    highlight: true,
    badge: "Teams"
  },
  {
    title: "Banned Users",
    url: createPageUrl("BannedUsers"),
    icon: ShieldOff,
    highlight: true,
    badge: "Admin"
  },
  {
    title: "Admin Setup",
    url: createPageUrl("SuperAdminSetup"),
    icon: Crown,
    highlight: true,
    badge: "Setup"
  },
  {
    title: "Newsletter Subs",
    url: createPageUrl("AxiomNewsletter"),
    icon: Mail,
    highlight: true,
    badge: "Admin"
  },
  {
    title: "Users Log",
    url: createPageUrl("UsersLog"),
    icon: Users,
    highlight: true,
    badge: "Admin"
  },
  {
    title: "Analytics",
    url: createPageUrl("AdminAnalytics"),
    icon: BarChart3,
    highlight: true,
    badge: "Admin"
  },
  {
    title: "User Messages",
    url: createPageUrl("AdminMessages"),
    icon: MessageSquare,
    highlight: true,
    badge: "Admin"
  },
  {
    title: "Contact Support",
    url: createPageUrl("ContactSupport"),
    icon: Mail,
  },
  {
    title: "Profile",
    url: createPageUrl("Profile"),
    icon: User,
  },
  {
    title: "Premium",
    url: createPageUrl("Premium"),
    icon: Crown,
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();

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
          <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50">
        <Sidebar className="border-r border-slate-200/50">
          <SidebarHeader className="border-b border-slate-200/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg flex items-center justify-center">
                <DnaIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">GeneMap</h2>
                <p className="text-xs text-slate-500">Phenotype → Gene Discovery</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                Navigation
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-xl mb-1 touch-manipulation ${
                          location.pathname === item.url ? 'bg-blue-100 text-blue-700 font-medium shadow-sm' : ''
                        }${item.highlight ? ' bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200' : ''}`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-4 py-4 min-h-[48px]">
                          {item.icon && <item.icon className={`w-5 h-5 ${item.highlight ? 'text-purple-600' : ''}`} />}
                          <span>{item.title}</span>
                          {item.badge && (
                            <Badge className="ml-auto bg-purple-600 text-white text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                Data Sources
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="px-4 py-2 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">MyGene.info</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">Ensembl REST</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">HPO Monarch</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">GWAS Catalog</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">UniProt</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">HPA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-slate-600">GTEx</span>
                  </div>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200/50 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">Research User</p>
                  <p className="text-xs text-slate-500 truncate">Gene discovery platform</p>
                </div>
              </div>
              
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <p className="text-xs text-slate-500 text-center">
                  Created by <span className="font-medium text-slate-700">Dr. John White</span>
                </p>
                <div className="text-center">
                  <a
                    href="https://www.axiombiolabs.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                  >
                    Sponsored by Axiom Biolabs
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