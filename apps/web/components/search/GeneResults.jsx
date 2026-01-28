import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DnaIcon from "../icons/DnaIcon";
import {
  Crown,
  Star,
  TrendingUp,
  CheckSquare
} from "lucide-react";
import GeneCard from "./GeneCard";
import GeneFilters from "./GeneFilters";

export default function GeneResults({ results, selectedGenes = [], onGeneSelect }) {
  const { query, candidateGenes, isPremium, queryType } = results;
  const [filters, setFilters] = useState({
    symbol: "",
    name: "",
    chromosome: "All",
    phenotype: "",
    minScore: 0
  });

  // Apply filters to gene results
  const filteredGenes = useMemo(() => {
    return candidateGenes.filter((gene) => {
      // Symbol filter
      if (filters.symbol && !gene.symbol?.toLowerCase().includes(filters.symbol.toLowerCase())) {
        return false;
      }

      // Name filter
      if (filters.name && !gene.name?.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }

      // Chromosome filter
      if (filters.chromosome && filters.chromosome !== "All") {
        const geneChromosome = gene.genomic_pos?.chr?.toString() || gene.chromosome?.toString() || "";
        if (geneChromosome !== filters.chromosome) {
          return false;
        }
      }

      // Phenotype filter
      if (filters.phenotype && gene.phenotypes) {
        const phenotypeMatch = gene.phenotypes.some(p =>
          p.toLowerCase().includes(filters.phenotype.toLowerCase())
        );
        if (!phenotypeMatch) {
          return false;
        }
      }

      // Confidence score filter
      if (filters.minScore > 0 && gene.confidence_score) {
        if (gene.confidence_score < filters.minScore) {
          return false;
        }
      }

      return true;
    });
  }, [candidateGenes, filters]);

  const handleClearFilters = () => {
    setFilters({
      symbol: "",
      name: "",
      chromosome: "All",
      phenotype: "",
      minScore: 0
    });
  };

  const getQueryTypeLabel = () => {
    if (queryType === 'disease') {
      return '🩺 Disease-Associated Genes';
    }
    if (queryType === 'hpo_term') {
      return '🧬 HPO Term Results';
    }
    return '🔬 Phenotype Search Results';
  };

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <Card className="bg-white/90 backdrop-blur-sm shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-slate-900 flex items-center gap-2">
                <DnaIcon className="w-6 h-6 text-blue-600" />
                {getQueryTypeLabel()}
              </CardTitle>
              <p className="text-slate-600 mt-1">
                Found {candidateGenes.length} {queryType === 'disease' ? 'associated' : 'candidate'} genes for "{query}"
              </p>
            </div>

            {isPremium && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                <Crown className="w-3 h-3 mr-1" />
                Premium Search
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <TrendingUp className="w-3 h-3 mr-1" />
              Ranked by Evidence
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <Star className="w-3 h-3 mr-1" />
              Robert Insights
            </Badge>
            {onGeneSelect && (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <CheckSquare className="w-3 h-3 mr-1" />
                Select to Compare
              </Badge>
            )}
            {queryType === 'disease' && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                🩺 All Disease Genes
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <GeneFilters
        filters={filters}
        onFilterChange={setFilters}
        onClearFilters={handleClearFilters}
        resultCount={filteredGenes.length}
      />

      {/* Gene Cards */}
      {filteredGenes.length === 0 ? (
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-center">
            <p className="text-amber-900 font-medium mb-2">No genes match your filters</p>
            <p className="text-sm text-amber-700">Try adjusting or clearing your filter criteria</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGenes.map((gene, index) => (
            <GeneCard
              key={gene.symbol}
              gene={gene}
              rank={index + 1}
              isPremium={isPremium}
              isSelected={selectedGenes.some(g => g.symbol === gene.symbol)}
              onSelect={onGeneSelect ? () => onGeneSelect(gene) : null}
            />
          ))}
        </div>
      )}

      {/* Search Tips */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-6">
          <h4 className="font-medium text-slate-900 mb-3">Search Tips</h4>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Search by disease name (e.g., "Rheumatoid Arthritis", "Trisomy 21") to find all associated genes</li>
            <li>• Use phenotype terms (e.g., "polydactyly") for specific features</li>
            <li>• Try HPO terms (HP:0001234) for more precise results</li>
            <li>• Premium searches include population data and treatment info</li>
            {onGeneSelect && <li>• Select multiple genes to compare them side-by-side</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}