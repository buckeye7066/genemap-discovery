import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@genemap/shared';
import { Button } from '@/components/ui/button';
import { Crown, AlertCircle } from 'lucide-react';

export default function UsageBanner() {
  const navigate = useNavigate();
  const [entitlements, setEntitlements] = useState(null);

  useEffect(() => {
    loadEntitlements();
  }, []);

  const loadEntitlements = async () => {
    try {
      const data = await apiClient.getEducationEntitlements();
      setEntitlements(data);
    } catch {
      // Not logged in or error
    }
  };

  if (!entitlements || entitlements.isPremium) return null;

  const usage = entitlements.todayUsage || {};
  const limits = entitlements.limits || {};
  const isNearLimit = Object.entries(usage).some(([key, val]) => {
    const limitKey = `${key}s_per_day`;
    const limit = limits[limitKey];
    return limit && val >= limit - 1;
  });

  if (!isNearLimit) return null;

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 p-3.5 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-amber-800 text-sm font-medium">
            You're approaching your daily free limit. Upgrade for unlimited access.
          </span>
        </div>
        <Button
          size="sm"
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 transition-shadow"
          onClick={() => navigate('/premium')}
        >
          <Crown className="w-3.5 h-3.5 mr-1" /> Upgrade
        </Button>
      </div>
    </div>
  );
}
