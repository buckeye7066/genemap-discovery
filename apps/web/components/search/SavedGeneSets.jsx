import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Library, 
  ArrowLeft, 
  Trash2, 
  Search,
  Loader2,
  FileText
} from "lucide-react";

export default function SavedGeneSets({ onLoad, onClose }) {
  const [geneSets, setGeneSets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    loadGeneSets();
  }, [user?.email]);

  const loadGeneSets = async () => {
    try {
      const sets = await apiClient.getGeneSets();
      setGeneSets(sets);
    } catch (err) {
      console.error("Error loading gene sets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (setId) => {
    if (!window.confirm("Are you sure you want to delete this gene set?")) {
      return;
    }

    try {
      await apiClient.deleteGeneSet(setId);
      await loadGeneSets();
    } catch (err) {
      console.error("Error deleting gene set:", err);
    }
  };

  const filteredSets = geneSets.filter(set => 
    set.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    set.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    set.genes.some(g => g.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading your gene sets...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Library className="w-6 h-6 text-blue-600" />
              Saved Gene Sets
            </CardTitle>
            <Button variant="outline" onClick={onClose} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search gene sets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredSets.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">
                {searchTerm ? "No gene sets match your search" : "No saved gene sets yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSets.map((set) => (
                <Card key={set.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-slate-900 mb-1">
                          {set.name}
                        </h3>
                        {set.description && (
                          <p className="text-sm text-slate-600 mb-2">{set.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{set.genes.length} genes</span>
                          {set.phenotype_context && (
                            <>
                              <span>•</span>
                              <span>Context: {set.phenotype_context}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{new Date(set.created_date).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onLoad(set)}
                        >
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(set.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {set.genes.slice(0, 15).map((gene) => (
                        <Badge key={gene} variant="secondary" className="text-xs">
                          {gene}
                        </Badge>
                      ))}
                      {set.genes.length > 15 && (
                        <Badge variant="outline" className="text-xs">
                          +{set.genes.length - 15} more
                        </Badge>
                      )}
                    </div>

                    {set.tags && set.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {set.tags.map((tag, idx) => (
                          <Badge key={idx} className="text-xs bg-purple-100 text-purple-800">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}