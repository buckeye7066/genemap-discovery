import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Crown } from "lucide-react";

export default function FeatureSpotlight({ feature, isPremium = false }) {
  return (
    <Card className={`shadow-lg border-2 ${
      isPremium 
        ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-300' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300'
    }`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPremium ? 'bg-amber-600' : 'bg-blue-600'
          }`}>
            {feature.icon && <feature.icon className="w-6 h-6 text-white" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-slate-900">{feature.title}</h3>
              {isPremium && (
                <Badge className="bg-amber-600 text-white text-xs">
                  <Crown className="w-3 h-3 mr-1" />
                  Premium
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {feature.description}
            </p>
            {feature.benefits && (
              <ul className="mt-3 space-y-1">
                {feature.benefits.map((benefit, idx) => (
                  <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                    <Zap className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}