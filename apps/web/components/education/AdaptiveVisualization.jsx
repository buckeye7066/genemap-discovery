import React, { Suspense, lazy } from 'react';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getComplexitySettings } from '@/lib/adaptiveContent';

const VISUALIZATION_MAP = {
  chromosome: lazy(() => import('@/components/visualizations/ChromosomeView')),
  proteinStructure: lazy(() => import('@/components/visualizations/ProteinStructure')),
  proteinDomains: lazy(() => import('@/components/visualizations/ProteinDomains')),
  geneExpression: lazy(() => import('@/components/visualizations/GeneExpressionChart')),
  proteinInteractions: lazy(() => import('@/components/visualizations/ProteinInteractions')),
  phenotypeNetwork: lazy(() => import('@/components/visualizations/PhenotypeNetwork')),
  manhattanPlot: lazy(() => import('@/components/visualizations/ManhattanPlot')),
  expressionHeatmap: lazy(() => import('@/components/visualizations/ExpressionHeatmap')),
  circosPlot: lazy(() => import('@/components/visualizations/CircosPlot')),
  pathwayEnrichment: lazy(() => import('@/components/visualizations/PathwayEnrichmentViz')),
};

const LEVEL_DESCRIPTIONS = {
  elementary: 'Simplified view with basic labels',
  middle_school: 'Standard view with key terms explained',
  high_school: 'Detailed view with scientific labels',
  undergraduate: 'Full view with molecular detail',
  graduate: 'Advanced view with research annotations',
  postgraduate: 'Expert view with full data access',
};

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

export default function AdaptiveVisualization({ type, title, data, ...extraProps }) {
  const { level, levelConfig } = useEducationLevel();
  const VisualizationComponent = VISUALIZATION_MAP[type];
  const complexity = getComplexitySettings(level);

  if (!VisualizationComponent) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-slate-400">
          Unknown visualization type: {type}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-700">{title}</h3>
          <Badge variant="outline" className="text-xs">
            {LEVEL_DESCRIPTIONS[level] || 'Standard view'}
          </Badge>
        </div>
      )}
      <Suspense fallback={<LoadingFallback />}>
        <VisualizationComponent
          userEducationLevel={level}
          {...data}
          {...extraProps}
        />
      </Suspense>
    </div>
  );
}

export function useAdaptiveVizProps() {
  const { level } = useEducationLevel();
  const complexity = getComplexitySettings(level);
  return {
    userEducationLevel: level,
    ...complexity,
  };
}
