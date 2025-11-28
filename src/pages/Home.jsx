import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DnaIcon from "../components/icons/DnaIcon";
import AIConversation from "../components/AIConversation";
import DNAHelix3D from "../components/3d/DNAHelix3D";
import MoleculeViewer3D from "../components/3d/MoleculeViewer3D";
import { Search, Zap, Shield, Crown, ArrowRight, CheckCircle, LayoutDashboard, Sparkles, X } from "lucide-react";

const testimonials = [
  { name: "Dr. L. Patel", role: "Clinical Geneticist", text: "GeneMap accelerated my differential diagnoses by hours." },
  { name: "Dr. A. Morrison", role: "Research Scientist", text: "Phenotype-to-gene mapping is incredibly intuitive." },
  { name: "Dr. Kim", role: "Molecular Biologist", text: "Finally a tool that unifies HPO, genome databases, and AI." },
  { name: "Dr. J. Chen", role: "Pediatric Geneticist", text: "Essential for rare disease investigations." },
  { name: "Dr. S. Williams", role: "Genomics Researcher", text: "The AI explanations save me hours of literature review." },
];

// Animated counter component
function AnimatedCounter({ target, duration = 2 }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const increment = target / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [target, duration]);
  
  return <span>{count}</span>;
}

export default function HomePage() {
  const [showDemo, setShowDemo] = useState(false);
  const [showResearchPrep, setShowResearchPrep] = useState(false);

  useEffect(() => {
    document.title = "GeneMap - Phenotype to Gene Discovery";
  }, []);

  // Feature card wrapper component
  const FeatureCard = ({ children, borderColor, className = "" }) => (
    <motion.div
      whileHover={{
        scale: 1.05,
        rotateX: 8,
        rotateY: -8,
        boxShadow: "0 20px 60px rgba(41, 98, 255, 0.3)"
      }}
      transition={{ type: "spring", stiffness: 220, damping: 15 }}
      className="group"
      style={{ perspective: 1000 }}
    >
      <Card className={`border-2 ${borderColor} shadow-lg hover:shadow-xl transition-all duration-300 ${className}`}>
        {children}
      </Card>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">

      {/* Hero Section with 3D */}
      <div className="px-4 sm:px-6 py-8 sm:py-12 md:py-20 relative overflow-hidden">
        
        {/* Floating nucleotide particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(25)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 bg-blue-500/30 rounded-full"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 0.6, 0],
                scale: [0, 1.2, 0],
                x: [0, Math.random() * 600 - 300],
                y: [0, Math.random() * 600 - 300],
              }}
              transition={{
                duration: 10 + Math.random() * 8,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: "easeInOut"
              }}
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Rotating 3D DNA Parallax Overlay */}
        <motion.div
          className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
        >
          <DNAHelix3D width={400} height={400} />
        </motion.div>

        {/* 3D DNA Background */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 opacity-30 hidden lg:block pointer-events-none">
          <DNAHelix3D width={300} height={500} />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-30 hidden lg:block pointer-events-none">
          <DNAHelix3D width={300} height={500} />
        </div>

        <div className="max-w-6xl mx-auto text-center relative z-10">
          {/* Interactive 3D DNA */}
          <motion.div 
            className="flex justify-center mb-6"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 rounded-full blur-3xl scale-150"></div>
              <motion.div
                animate={{ 
                  boxShadow: [
                    "0 0 20px rgba(59, 130, 246, 0.3)",
                    "0 0 60px rgba(99, 102, 241, 0.5)",
                    "0 0 20px rgba(59, 130, 246, 0.3)"
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
                className="rounded-full"
              >
                <DNAHelix3D width={180} height={180} className="relative z-10" />
              </motion.div>
            </div>
          </motion.div>

          <motion.h1 
            className="text-3xl sm:text-4xl md:text-6xl font-bold text-slate-900 mb-2 sm:mb-4 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Discover Genes from
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600"> Phenotypes</span>
          </motion.h1>

          {/* Science Tagline */}
          <motion.p 
            className="text-xl sm:text-2xl text-slate-600 mt-2 italic font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            "Where Phenotype Meets Precision."
          </motion.p>

          <motion.p 
            className="text-lg sm:text-xl text-slate-600 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4 mt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            Advanced phenotype-to-gene mapping powered by comprehensive genomic databases.
            Search by free text or HPO terms to discover candidate genes, genomic locations, and associated traits.
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4 px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <Link to={createPageUrl("Dashboard")}>
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 sm:px-8 py-3 text-lg shadow-lg w-full sm:w-auto min-h-[48px] touch-manipulation hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all">
                <LayoutDashboard className="w-5 h-5 mr-2" />
                Go to Dashboard
              </Button>
            </Link>

            <Link to={createPageUrl("Search")}>
              <Button size="lg" variant="outline" className="px-6 sm:px-8 py-3 text-lg border-2 hover:bg-blue-50 w-full sm:w-auto min-h-[48px] touch-manipulation hover:border-blue-600 hover:shadow-xl transition-all">
                <Search className="w-5 h-5 mr-2" />
                Start Gene Discovery
              </Button>
            </Link>

            <Button 
              size="lg" 
              variant="outline" 
              onClick={() => setShowDemo(true)}
              className="px-6 sm:px-8 py-3 text-lg border-2 border-purple-300 hover:border-purple-600 hover:bg-purple-50 w-full sm:w-auto min-h-[48px] touch-manipulation hover:shadow-xl transition-all"
            >
              <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
              Try Live Demo
            </Button>
          </motion.div>

          {/* Research Prep Button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mb-8"
          >
            <Button
              variant="ghost"
              className="underline text-blue-700 hover:text-blue-800"
              onClick={() => setShowResearchPrep(true)}
            >
              Prepare for Analysis 🧬
            </Button>
          </motion.div>

          {/* Animated Data Sources Counter */}
          <motion.div 
            className="flex flex-wrap justify-center gap-2 px-4 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <Badge variant="secondary" className="bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 px-4 py-2 text-sm">
              <span className="font-bold text-blue-700 text-lg mr-1">
                <AnimatedCounter target={7} duration={2} />
              </span>
              Data Sources Integrated
            </Badge>
          </motion.div>

          <motion.div 
            className="flex flex-wrap justify-center gap-2 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            {['MyGene.info', 'Ensembl REST', 'HPO Monarch', 'GWAS Catalog', 'UniProt', 'HPA', 'GTEx'].map((source, i) => (
              <motion.div
                key={source}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 + i * 0.1 }}
              >
                <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 transition-colors cursor-default">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {source}
                </Badge>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Testimonial Carousel */}
      <motion.div
        className="overflow-hidden py-16 bg-white/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <h3 className="text-2xl font-bold text-center text-slate-900 mb-8">What Researchers Say</h3>
        <div className="relative">
          <motion.div
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
            className="flex gap-6 w-max"
          >
            {[...testimonials, ...testimonials].map((t, i) => (
              <Card key={i} className="w-80 p-6 shadow-xl border border-slate-200 bg-white/80 backdrop-blur flex-shrink-0">
                <p className="italic mb-3 text-slate-700">"{t.text}"</p>
                <p className="font-bold text-blue-600">{t.name}</p>
                <p className="text-slate-500 text-sm">{t.role}</p>
              </Card>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Interactive Molecules Section */}
      <div className="px-4 sm:px-6 py-12 sm:py-16 bg-white/50">
        <div className="max-w-6xl mx-auto">
          <motion.h2 
            className="text-2xl sm:text-3xl font-bold text-center text-slate-900 mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Interactive Molecular Viewer
          </motion.h2>
          <p className="text-center text-slate-600 mb-8 max-w-2xl mx-auto">
            Explore 3D molecular structures. Click and drag to rotate.
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 justify-items-center mb-12">
            {['water', 'methane', 'benzene', 'caffeine', 'adenine'].map((mol, i) => (
              <motion.div 
                key={mol} 
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.05 }}
              >
                <div className="bg-white rounded-2xl shadow-lg p-2 hover:shadow-xl transition-shadow border border-slate-100 hover:border-blue-200">
                  <MoleculeViewer3D molecule={mol} width={140} height={140} />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-700 capitalize">{mol}</p>
              </motion.div>
            ))}
          </div>

          <AIConversation />
        </div>
      </div>

      {/* Features Grid */}
      <div className="px-4 sm:px-6 py-12 sm:py-16 bg-gradient-to-b from-white/50 to-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.h2 
            className="text-2xl sm:text-3xl font-bold text-center text-slate-900 mb-8 sm:mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Comprehensive Genomic Platform
          </motion.h2>

          <div className="grid gap-6 sm:gap-8 md:grid-cols-3 mb-12">
            {/* Gene Discovery */}
            <FeatureCard borderColor="border-blue-200">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center group-hover:shadow-[0_0_25px_rgba(0,102,255,0.7)] transition-all">
                  <Search className="w-6 h-6 text-blue-600" />
                </div>
                <CardTitle className="text-lg text-slate-900">Gene Discovery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Phenotype-to-gene mapping</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Disease-gene associations</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">AI-powered insights</p>
                </div>
              </CardContent>
            </FeatureCard>

            {/* Clinical Analysis */}
            <FeatureCard borderColor="border-purple-200">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-purple-100 rounded-2xl flex items-center justify-center group-hover:shadow-[0_0_25px_rgba(147,51,234,0.7)] transition-all">
                  <Shield className="w-6 h-6 text-purple-600" />
                </div>
                <CardTitle className="text-lg text-slate-900">Clinical Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Medical data analysis</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Variant interpretation</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Drug interaction screening</p>
                </div>
              </CardContent>
            </FeatureCard>

            {/* Clinical Trials */}
            <FeatureCard borderColor="border-cyan-200" className="bg-gradient-to-br from-cyan-50 to-blue-50">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-cyan-100 rounded-2xl flex items-center justify-center group-hover:shadow-[0_0_25px_rgba(6,182,212,0.7)] transition-all">
                  <span className="text-xl">🧪</span>
                </div>
                <CardTitle className="text-lg text-slate-900">Clinical Trials</CardTitle>
                <Badge className="bg-cyan-600 text-white mt-2 text-xs">NEW</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">ClinicalTrials.gov search</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Personalized matching</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-700">Eligibility assessment</p>
                </div>
              </CardContent>
            </FeatureCard>
          </div>

          {/* Free vs Premium Comparison */}
          <h3 className="text-xl sm:text-2xl font-bold text-center text-slate-900 mb-6 sm:mb-8">
            Free & Premium Features
          </h3>

          <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
            {/* Free Features */}
            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Card className="border-2 border-green-200 shadow-lg hover:shadow-xl transition-shadow duration-300 h-full">
                <CardHeader className="text-center">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 bg-green-100 rounded-2xl flex items-center justify-center">
                    <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl text-slate-900">Free Tier</CardTitle>
                  <p className="text-slate-600">Essential gene discovery tools</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Candidate Gene Discovery</p>
                      <p className="text-sm text-slate-600">Find genes implicated in phenotypes</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Genomic Locations</p>
                      <p className="text-sm text-slate-600">Chromosome coordinates with build info</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">AI Explanations</p>
                      <p className="text-sm text-slate-600">Concise, source-aware summaries</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Premium Features */}
            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Card className="border-2 border-amber-200 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-amber-50 to-yellow-50 h-full">
                <CardHeader className="text-center">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 bg-amber-100 rounded-2xl flex items-center justify-center">
                    <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
                  </div>
                  <CardTitle className="text-xl sm:text-2xl text-slate-900">Premium Tier</CardTitle>
                  <p className="text-slate-600">Advanced research insights</p>
                  <Badge className="bg-amber-600 text-white mt-2">$9.99/month</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Population Prevalence</p>
                      <p className="text-sm text-slate-600">Frequency estimates with sources</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Gene History</p>
                      <p className="text-sm text-slate-600">Evolutionary background & gene families</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Mutations & Diseases</p>
                      <p className="text-sm text-slate-600">Known variants and disease links</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Treatment Information</p>
                      <p className="text-sm text-slate-600">Current therapies with citations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="px-4 sm:px-6 py-12 sm:py-16">
        <motion.div 
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 sm:mb-6">
            Ready to Accelerate Your Research?
          </h2>
          <p className="text-lg text-slate-600 mb-6 sm:mb-8 px-4">
            Join researchers worldwide using GeneMap for phenotype-to-gene discovery
          </p>

          <Link to={createPageUrl("Search")}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 px-6 sm:px-8 py-4 text-lg shadow-lg min-h-[48px] touch-manipulation hover:shadow-[0_0_40px_rgba(59,130,246,0.5)] transition-all">
                Begin Your Search
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          </Link>
        </motion.div>
      </div>

      {/* Live Demo Modal */}
      {showDemo && (
        <motion.div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowDemo(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <Card className="w-full max-w-2xl p-6 bg-white shadow-2xl">
              <CardHeader className="relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-0 top-0"
                  onClick={() => setShowDemo(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-purple-600" />
                  Live Gene Discovery Demo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-700">
                  Example phenotype: <strong className="text-blue-600">"progressive muscle weakness"</strong>
                </p>
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-800 mb-2">
                    <strong>Candidate Genes:</strong>{" "}
                    <span className="font-mono text-blue-700">DYSF, CAPN3, SGCA, DMD, LMNA</span>
                  </p>
                  <p className="text-sm text-slate-800 mb-2">
                    <strong>Pathways:</strong> Sarcomere / Membrane Repair / Dystrophin-associated
                  </p>
                  <p className="text-sm text-slate-800">
                    <strong>Features:</strong> Likelihood Scores, Gene Locations, AI Summaries
                  </p>
                </div>
                <div className="text-center pt-4">
                  <Link to={createPageUrl("Search")}>
                    <Button className="bg-blue-600 hover:bg-blue-700 mr-2">
                      Try It Now
                    </Button>
                  </Link>
                  <Button variant="outline" onClick={() => setShowDemo(false)}>Close</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {/* Research Prep Modal */}
      {showResearchPrep && (
        <motion.div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowResearchPrep(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={e => e.stopPropagation()}
          >
            <Card className="w-full max-w-xl p-8 bg-white shadow-xl">
              <CardHeader className="relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute right-0 top-0"
                  onClick={() => setShowResearchPrep(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
                <CardTitle className="flex items-center gap-2">
                  🧬 Before You Begin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-700 leading-relaxed">
                  "Take a moment to define your phenotype carefully. 
                  The clarity of your description will shape the precision of your gene discovery."
                </p>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-slate-600">
                    <strong>Tip:</strong> Include severity, onset, body systems, and modifiers for best results.
                  </p>
                </div>
                <div className="text-center pt-2">
                  <Button onClick={() => setShowResearchPrep(false)}>Begin Analysis</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}