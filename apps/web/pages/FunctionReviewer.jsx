import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../lib/AuthContext";
import { isAdminUser } from "../lib/roles";
import { KNOWN_FUNCTIONS, getFunctionById, getAllCategories } from "../components/functionRegistry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Code2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  Loader2,
  Lock,
  FileCode,
  Layers,
  Tag,
  GitBranch,
  FolderTree,
  Info,
  Github,
  Rocket
} from "lucide-react";

export default function FunctionReviewer() {
  const { user, isLoadingAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFunctionId, setSelectedFunctionId] = useState(null);
  const [functionDetails, setFunctionDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [copiedId, setCopiedId] = useState(null);
  const [expandedDeps, setExpandedDeps] = useState({});
  const [activeTab, setActiveTab] = useState("overview");
  const [showBeginScreen, setShowBeginScreen] = useState(true);

  // Get all categories
  const categories = useMemo(() => getAllCategories(), []);

  // Filter functions
  const filteredFunctions = useMemo(() => {
    return KNOWN_FUNCTIONS.filter(fn => {
      const matchesSearch = searchQuery === "" ||
        fn.functionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fn.filePath.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (fn.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === "all" || fn.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, categoryFilter]);

  // Current index in filtered list
  const currentIndex = useMemo(() => {
    return filteredFunctions.findIndex(fn => fn.functionId === selectedFunctionId);
  }, [filteredFunctions, selectedFunctionId]);

  useEffect(() => {
    if (user !== undefined) {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (selectedFunctionId) {
      loadFunctionDetails(selectedFunctionId);
    }
  }, [selectedFunctionId]);

  const handleBeginSync = () => {
    setError(null);
    setShowBeginScreen(false);
    if (KNOWN_FUNCTIONS.length > 0) {
      setSelectedFunctionId(KNOWN_FUNCTIONS[0].functionId);
    }
  };

  const handleSkipSync = () => {
    setShowBeginScreen(false);
    if (KNOWN_FUNCTIONS.length > 0) {
      setSelectedFunctionId(KNOWN_FUNCTIONS[0].functionId);
    }
  };

  const loadFunctionDetails = async (functionId) => {
    setIsLoadingDetails(true);
    setError(null);
    
    try {
      // getFunctionDetails is a cloud function; use local registry as primary source
      const localFn = getFunctionById(functionId);
      if (localFn) {
        setFunctionDetails({
          ...localFn,
          sourceCode: '// API call not available. View source in the codebase.',
          dependencies: [],
          sourceAvailable: false
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load function details');
      // Use local registry data as fallback
      const localFn = getFunctionById(functionId);
      if (localFn) {
        setFunctionDetails({
          ...localFn,
          sourceCode: '// API call failed. View source in codebase.',
          dependencies: [],
          sourceAvailable: false
        });
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setSelectedFunctionId(filteredFunctions[currentIndex - 1].functionId);
    }
  };

  const handleNext = () => {
    if (currentIndex < filteredFunctions.length - 1) {
      setSelectedFunctionId(filteredFunctions[currentIndex + 1].functionId);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleDependency = (depPath) => {
    setExpandedDeps(prev => ({
      ...prev,
      [depPath]: !prev[depPath]
    }));
  };

  const getCategoryColor = (category) => {
    const colors = {
      stripe: 'bg-purple-100 text-purple-800',
      user_management: 'bg-blue-100 text-blue-800',
      admin: 'bg-red-100 text-red-800',
      system: 'bg-green-100 text-green-800',
      shared: 'bg-yellow-100 text-yellow-800',
      service: 'bg-cyan-100 text-cyan-800',
      processor: 'bg-orange-100 text-orange-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAdminUser(user)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive">
            <Lock className="w-4 h-4" />
            <AlertDescription>
              Access Denied. This page requires administrator privileges.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // BEGIN SCREEN - GitHub Sync Launch
  if (showBeginScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <Card className="shadow-xl border border-slate-200 bg-white">
            <CardContent className="pt-12 pb-12 text-center">
              {/* Logo */}
              <div className="flex justify-center mb-8">
                <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-lg">
                  <Github className="w-14 h-14 text-white" />
                </div>
              </div>

              {/* Title */}
              <h1 className="text-4xl font-bold text-slate-900 mb-4">
                Function Reviewer
              </h1>
              <p className="text-xl text-slate-600 mb-8">
                Browse the registered function map
              </p>

              {/* Stats. Backend + Frontend are computed to always sum to the
                  total (Frontend = everything that isn't backend), so the
                  breakdown can't disagree with the "{N} registered functions"
                  line the way 24+5 vs 30 did. */}
              <div className="grid grid-cols-3 gap-4 mb-10">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-3xl font-bold text-cyan-600">{KNOWN_FUNCTIONS.filter(f => f.filePath?.startsWith('services/api/')).length}</p>
                  <p className="text-sm text-slate-500">Backend</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-3xl font-bold text-green-600">{KNOWN_FUNCTIONS.length - KNOWN_FUNCTIONS.filter(f => f.filePath?.startsWith('services/api/')).length}</p>
                  <p className="text-sm text-slate-500">Frontend</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-3xl font-bold text-purple-600">{getAllCategories().length}</p>
                  <p className="text-sm text-slate-500">Categories</p>
                </div>
              </div>

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* BEGIN Button */}
              <Button
                onClick={handleBeginSync}
                size="lg"
                className="w-full h-16 text-xl font-bold bg-gradient-to-r from-green-500 to-cyan-500 hover:from-green-600 hover:to-cyan-600 text-white shadow-lg shadow-green-500/30 mb-4"
              >
                <Rocket className="w-6 h-6 mr-3" />
                Open Function Browser
              </Button>

              {/* Skip Button */}
              <Button
                onClick={handleSkipSync}
                variant="ghost"
                className="text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                Browse registry only →
              </Button>

              {/* Info */}
              <p className="text-xs text-slate-500 mt-8">
                Shows {KNOWN_FUNCTIONS.length} registered functions. This page does not push source code to GitHub.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Code2 className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Function Reviewer
          </h1>
          <p className="text-slate-600">
            Browse and inspect all {KNOWN_FUNCTIONS.length} registered functions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Function List */}
          <div className="lg:col-span-1">
            <Card className="shadow-lg sticky top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderTree className="w-5 h-5" />
                  Functions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search functions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Category Filter */}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Function List */}
                <div className="max-h-[500px] overflow-y-auto space-y-1">
                  {filteredFunctions.map((fn) => (
                    <button
                      key={fn.functionId}
                      onClick={() => setSelectedFunctionId(fn.functionId)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                        selectedFunctionId === fn.functionId
                          ? 'bg-indigo-100 text-indigo-900 font-medium'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{fn.functionId}</span>
                      </div>
                      <Badge className={`mt-1 text-xs ${getCategoryColor(fn.category)}`}>
                        {fn.category}
                      </Badge>
                    </button>
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                    disabled={currentIndex <= 0}
                    className="flex-1"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={currentIndex >= filteredFunctions.length - 1}
                    className="flex-1"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>

                <p className="text-xs text-center text-slate-500">
                  {currentIndex + 1} of {filteredFunctions.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoadingDetails ? (
              <Card className="shadow-lg">
                <CardContent className="py-16 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </CardContent>
              </Card>
            ) : functionDetails ? (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <FileCode className="w-5 h-5 text-indigo-600" />
                        {functionDetails.functionId}
                      </CardTitle>
                      <p className="text-sm text-slate-500 mt-1">
                        {functionDetails.filePath}
                      </p>
                    </div>
                    <Badge className={getCategoryColor(functionDetails.category)}>
                      {functionDetails.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="source">Source Code</TabsTrigger>
                      <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                      <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4">
                      {functionDetails.description && (
                        <div className="p-4 bg-slate-50 rounded-lg">
                          <h4 className="font-medium text-slate-700 mb-1 flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            Description
                          </h4>
                          <p className="text-slate-600">{functionDetails.description}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-lg">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Export Type
                          </h4>
                          <Badge variant="outline">{functionDetails.exportType}</Badge>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Category
                          </h4>
                          <Badge className={getCategoryColor(functionDetails.category)}>
                            {functionDetails.category}
                          </Badge>
                        </div>
                      </div>

                      {functionDetails.namedExports && functionDetails.namedExports.length > 0 && (
                        <div className="p-4 bg-slate-50 rounded-lg">
                          <h4 className="font-medium text-slate-700 mb-2">Named Exports</h4>
                          <div className="flex flex-wrap gap-2">
                            {functionDetails.namedExports.map(exp => (
                              <Badge key={exp} variant="outline">{exp}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {functionDetails.dependencyPaths && functionDetails.dependencyPaths.length > 0 && (
                        <div className="p-4 bg-slate-50 rounded-lg">
                          <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <GitBranch className="w-4 h-4" />
                            Dependencies ({functionDetails.dependencyPaths.length})
                          </h4>
                          <ul className="space-y-1">
                            {functionDetails.dependencyPaths.map(dep => (
                              <li key={dep} className="text-sm text-slate-600 font-mono">
                                {dep}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </TabsContent>

                    {/* Source Code Tab */}
                    <TabsContent value="source">
                      <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(functionDetails.sourceCode, 'source')}
                            className="bg-white/80 backdrop-blur"
                          >
                            {copiedId === 'source' ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-auto text-sm font-mono" style={{ minHeight: '300px', maxHeight: '600px' }}>
                          <code>{functionDetails.sourceCode}</code>
                        </pre>
                        {!functionDetails.sourceAvailable && (
                          <Alert className="mt-3 bg-amber-50 border-amber-200">
                            <Info className="w-4 h-4 text-amber-600" />
                            <AlertDescription className="text-amber-800">
                              Source code is not available via API. View the file directly in the Base44 editor.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </TabsContent>

                    {/* Dependencies Tab */}
                    <TabsContent value="dependencies">
                      {(!functionDetails.dependencies || functionDetails.dependencies.length === 0) ? (
                        <div className="text-center py-8 text-slate-500">
                          <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>No dependencies registered for this function</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {functionDetails.dependencies.map((dep, idx) => (
                            <Collapsible
                              key={dep.filePath}
                              open={expandedDeps[dep.filePath]}
                              onOpenChange={() => toggleDependency(dep.filePath)}
                            >
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-between"
                                >
                                  <span className="font-mono text-sm">{dep.filePath}</span>
                                  {expandedDeps[dep.filePath] ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="relative mt-2">
                                  <div className="absolute top-2 right-2 z-10">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => copyToClipboard(dep.code, `dep-${idx}`)}
                                      className="bg-white/80 backdrop-blur"
                                    >
                                      {copiedId === `dep-${idx}` ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      ) : (
                                        <Copy className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </div>
                                  <pre className="bg-slate-800 text-slate-100 p-4 rounded-lg overflow-auto text-sm font-mono max-h-96">
                                    <code>{dep.code}</code>
                                  </pre>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    {/* Raw JSON Tab */}
                    <TabsContent value="raw">
                      <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(JSON.stringify(functionDetails, null, 2), 'raw')}
                            className="bg-white/80 backdrop-blur"
                          >
                            {copiedId === 'raw' ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <pre className="bg-slate-800 text-green-400 p-4 rounded-lg overflow-auto text-sm font-mono" style={{ minHeight: '300px', maxHeight: '600px' }}>
                          {JSON.stringify(functionDetails, null, 2)}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-lg">
                <CardContent className="py-16 text-center text-slate-500">
                  <Code2 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>Select a function from the list to view details</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
