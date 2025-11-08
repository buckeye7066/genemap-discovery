
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DnaIcon from "../components/icons/DnaIcon";
import AIConversation from "../components/AIConversation";
import { Search, Zap, Shield, Crown, ArrowRight, CheckCircle, LayoutDashboard } from "lucide-react";

export default function HomePage() {
  useEffect(() => {
    document.title = "GeneMap - Phenotype to Gene Discovery";
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Hero Section */}
      <div className="px-4 sm:px-6 py-8 sm:py-12 md:py-20">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl">
              <DnaIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-slate-900 mb-4 sm:mb-6 leading-tight">
            Discover Genes from
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600"> Phenotypes</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4">
            Advanced phenotype-to-gene mapping powered by comprehensive genomic databases.
            Search by free text or HPO terms to discover candidate genes, genomic locations, and associated traits.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8 sm:mb-12 px-4">
            <Link to={createPageUrl("Dashboard")}>
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 sm:px-8 py-3 text-lg shadow-lg w-full sm:w-auto min-h-[48px] touch-manipulation">
                <LayoutDashboard className="w-5 h-5 mr-2" />
                Go to Dashboard
              </Button>
            </Link>

            <Link to={createPageUrl("Search")}>
              <Button size="lg" variant="outline" className="px-6 sm:px-8 py-3 text-lg border-2 hover:bg-blue-50 w-full sm:w-auto min-h-[48px] touch-manipulation">
                <Search className="w-5 h-5 mr-2" />
                Start Gene Discovery
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-2 px-4">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              MyGene.info
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Ensembl REST
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              HPO Monarch
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              GWAS Catalog
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              UniProt
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              HPA
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              GTEx
            </Badge>
          </div>
        </div>
      </div>

      {/* AI Conversation Section */}
      <div className="px-4 sm:px-6 py-12 sm:py-16 bg-white/50">
        <div className="max-w-5xl mx-auto">
          <AIConversation />
        </div>
      </div>

      {/* Features Grid */}
      <div className="px-4 sm:px-6 py-12 sm:py-16 bg-gradient-to-b from-white/50 to-transparent">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-slate-900 mb-8 sm:mb-12">
            Comprehensive Genomic Platform
          </h2>

          <div className="grid gap-6 sm:gap-8 md:grid-cols-3 mb-12">
            {/* Gene Discovery */}
            <Card className="border-2 border-blue-200 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
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
            </Card>

            {/* Clinical Analysis */}
            <Card className="border-2 border-purple-200 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-purple-100 rounded-2xl flex items-center justify-center">
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
            </Card>

            {/* Clinical Trials */}
            <Card className="border-2 border-cyan-200 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-cyan-50 to-blue-50">
              <CardHeader className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-cyan-100 rounded-2xl flex items-center justify-center">
                  <Badge className="w-6 h-6 text-cyan-600">🧪</Badge>
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
            </Card>
          </div>

          {/* Free vs Premium Comparison */}
          <h3 className="text-xl sm:text-2xl font-bold text-center text-slate-900 mb-6 sm:mb-8">
            Free & Premium Features
          </h3>

          <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
            {/* Free Features */}
            <Card className="border-2 border-green-200 shadow-lg hover:shadow-xl transition-shadow duration-300">
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

            {/* Premium Features */}
            <Card className="border-2 border-amber-200 shadow-lg hover:shadow-xl transition-shadow duration-300 bg-gradient-to-br from-amber-50 to-yellow-50">
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
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 sm:mb-6">
            Ready to Accelerate Your Research?
          </h2>
          <p className="text-lg text-slate-600 mb-6 sm:mb-8 px-4">
            Join researchers worldwide using GeneMap for phenotype-to-gene discovery
          </p>

          <Link to={createPageUrl("Search")}>
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 px-6 sm:px-8 py-4 text-lg shadow-lg min-h-[48px] touch-manipulation">
              Begin Your Search
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
