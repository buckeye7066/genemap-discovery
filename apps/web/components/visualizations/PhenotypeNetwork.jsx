import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Network, Info } from "lucide-react";
import AskAIButtons from "../shared/AskAIButtons";

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

function PhenotypeTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
        <p className="font-medium text-slate-900">{payload[0].name}</p>
        <p className="text-sm text-slate-600">
          {payload[0].value} phenotype{payload[0].value !== 1 ? 's' : ''} ({payload[0].payload.percent}%)
        </p>
      </div>
    );
  }
  return null;
}

function renderCustomLabel(entry) {
  if (entry.percent > 10) {
    return `${entry.name} (${entry.percent}%)`;
  }
  return '';
}

export default function PhenotypeNetwork({ phenotypes, userEducationLevel }) {
  if (!phenotypes || phenotypes.length === 0) {
    return null;
  }

  // Group phenotypes by category (simplified)
  const categorizePheno = (phenoName) => {
    const name = phenoName.toLowerCase();
    if (name.includes('cognitive') || name.includes('intellectual') || name.includes('developmental delay')) {
      return 'Cognitive/Developmental';
    }
    if (name.includes('skeletal') || name.includes('bone') || name.includes('limb')) {
      return 'Skeletal';
    }
    if (name.includes('cardiac') || name.includes('heart')) {
      return 'Cardiac';
    }
    if (name.includes('neurological') || name.includes('seizure') || name.includes('brain')) {
      return 'Neurological';
    }
    if (name.includes('facial') || name.includes('craniofacial')) {
      return 'Craniofacial';
    }
    return 'Other';
  };

  const { categoryCount, chartData } = useMemo(() => {
    const counts = {};
    phenotypes.forEach(pheno => {
      const category = categorizePheno(pheno.name);
      counts[category] = (counts[category] || 0) + 1;
    });

    const data = Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      percent: ((value / phenotypes.length) * 100).toFixed(1)
    }));

    return { categoryCount: counts, chartData: data };
  }, [phenotypes]);

  const getExplanation = () => {
    if (!userEducationLevel || userEducationLevel === 'high_school') {
      return "This chart groups the health conditions linked to this gene by body system.";
    }
    if (userEducationLevel === 'undergraduate') {
      return "Distribution of phenotypic manifestations across physiological systems.";
    }
    return "Phenotypic spectrum organized by organ system involvement and developmental domains.";
  };

  return (
    <Card className="bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Network className="w-5 h-5 text-cyan-600" />
          Phenotype Distribution
        </CardTitle>
        <p className="text-xs text-slate-600 mt-1">
          {getExplanation()}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PhenotypeTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend & Details */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-900 text-sm mb-3">
              Total: {phenotypes.length} Associated Phenotypes
            </h4>
            {chartData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-slate-700">{item.name}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {item.value} ({item.percent}%)
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Sample Phenotypes */}
        <div className="mt-4 pt-4 border-t border-cyan-200">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="text-xs font-semibold text-slate-900 mb-2">Example Phenotypes:</h5>
              <div className="flex flex-wrap gap-1">
                {phenotypes.slice(0, 6).map((pheno, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {pheno.name}
                  </Badge>
                ))}
                {phenotypes.length > 6 && (
                  <Badge variant="outline" className="text-xs">
                    +{phenotypes.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI Explanation Buttons */}
        <AskAIButtons 
          context="phenotype_network" 
          topic={`phenotype distribution and associated conditions`}
          className="mt-4 pt-4 border-t border-cyan-200"
        />
      </CardContent>
    </Card>
  );
}