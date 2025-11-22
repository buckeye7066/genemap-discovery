import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GeneFilters({ filters, onFilterChange, onClearFilters, resultCount }) {
  const chromosomes = [
    "All", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "X", "Y", "MT"
  ];

  const handleFilterChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const activeFilterCount = Object.values(filters).filter(v => 
    v && v !== "All" && v !== "" && !(Array.isArray(v) && v[0] === 0)
  ).length;

  return (
    <Card className="shadow-lg border-2 border-blue-100">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-900">Filter Results</h3>
            {activeFilterCount > 0 && (
              <Badge className="bg-blue-600 text-white">
                {activeFilterCount} active
              </Badge>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-slate-600 hover:text-slate-900"
            >
              <X className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Gene Symbol */}
          <div className="space-y-2">
            <Label htmlFor="symbol-filter" className="text-sm font-medium">
              Gene Symbol
            </Label>
            <Input
              id="symbol-filter"
              placeholder="e.g., BRCA1, TP53"
              value={filters.symbol || ""}
              onChange={(e) => handleFilterChange("symbol", e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Gene Name */}
          <div className="space-y-2">
            <Label htmlFor="name-filter" className="text-sm font-medium">
              Gene Name
            </Label>
            <Input
              id="name-filter"
              placeholder="e.g., tumor protein"
              value={filters.name || ""}
              onChange={(e) => handleFilterChange("name", e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Chromosome */}
          <div className="space-y-2">
            <Label htmlFor="chromosome-filter" className="text-sm font-medium">
              Chromosome
            </Label>
            <Select
              value={filters.chromosome || "All"}
              onValueChange={(value) => handleFilterChange("chromosome", value)}
            >
              <SelectTrigger id="chromosome-filter" className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chromosomes.map((chr) => (
                  <SelectItem key={chr} value={chr}>
                    {chr === "All" ? "All Chromosomes" : `Chr ${chr}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Phenotype Keywords */}
          <div className="space-y-2">
            <Label htmlFor="phenotype-filter" className="text-sm font-medium">
              Phenotype Keywords
            </Label>
            <Input
              id="phenotype-filter"
              placeholder="e.g., seizure, autism"
              value={filters.phenotype || ""}
              onChange={(e) => handleFilterChange("phenotype", e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Confidence Score */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Minimum Confidence Score
              </Label>
              <Badge variant="outline" className="text-xs">
                {filters.minScore || 0}%
              </Badge>
            </div>
            <Slider
              value={[filters.minScore || 0]}
              onValueChange={(value) => handleFilterChange("minScore", value[0])}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-slate-500">
              Filter genes by their association confidence score
            </p>
          </div>
        </div>

        {resultCount !== undefined && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Showing <span className="font-semibold text-slate-900">{resultCount}</span> {resultCount === 1 ? 'gene' : 'genes'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}