import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@genemap/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Calendar, Loader2, Settings, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildRenewalAlerts(licenses, now = new Date()) {
  return (Array.isArray(licenses) ? licenses : []).flatMap((license) => {
    const endDate = new Date(license.endDate);
    if (!Number.isFinite(endDate.getTime())) return [];
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS);
    if (daysRemaining > 30) return [];

    if (daysRemaining <= 0) {
      return [{
        id: license.id,
        severity: 'expired',
        title: `${license.organizationName} license expired`,
        detail: 'Seat access is no longer active. A new checkout is required to restore the license.',
        action: 'purchase',
      }];
    }

    const unit = daysRemaining === 1 ? 'day' : 'days';
    return [{
      id: license.id,
      severity: daysRemaining <= 7 ? 'critical' : 'warning',
      title: license.autoRenew
        ? `${license.organizationName} renews in ${daysRemaining} ${unit}`
        : `${license.organizationName} ends in ${daysRemaining} ${unit}`,
      detail: license.autoRenew
        ? 'Stripe renewal is scheduled. Billing status remains controlled by signed webhook updates.'
        : 'Automatic renewal is off. Open Stripe billing to review the subscription before access ends.',
      action: license.canManageBilling ? 'portal' : null,
    }];
  });
}

export default function RenewalNotifications() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [error, setError] = useState('');
  const [openingPortalFor, setOpeningPortalFor] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError('');
      try {
        const licenses = await apiClient.getMyLicenses();
        if (active) setAlerts(buildRenewalAlerts(licenses));
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Renewal status could not be loaded.');
      }
    };
    if (user?.id) void load();
    return () => { active = false; };
  }, [user?.id]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => !dismissed.includes(alert.id)),
    [alerts, dismissed],
  );

  const openBillingPortal = async (licenseId) => {
    setOpeningPortalFor(licenseId);
    setError('');
    try {
      const response = await apiClient.createPortalSession({ returnUrl: window.location.href });
      if (!response?.url) throw new Error('Stripe did not return a billing portal URL.');
      window.location.assign(response.url);
    } catch (portalError) {
      setError(portalError?.message || 'Stripe billing could not be opened.');
      setOpeningPortalFor(null);
    }
  };

  if (!visibleAlerts.length && !error) return null;

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Renewal action not completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {visibleAlerts.map((notification) => (
        <Alert
          key={notification.id}
          className={notification.severity === 'critical'
            ? 'border-red-300 bg-red-50 text-red-950'
            : notification.severity === 'expired'
              ? 'border-slate-300 bg-slate-50 text-slate-950'
              : 'border-amber-300 bg-amber-50 text-amber-950'}
        >
          {notification.severity === 'warning'
            ? <Calendar className="h-4 w-4" />
            : <AlertTriangle className="h-4 w-4" />}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <AlertTitle>{notification.title}</AlertTitle>
              <AlertDescription className="mt-1">{notification.detail}</AlertDescription>
              {notification.action === 'portal' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  disabled={openingPortalFor === notification.id}
                  onClick={() => openBillingPortal(notification.id)}
                >
                  {openingPortalFor === notification.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Settings className="h-4 w-4" />}
                  Manage Stripe billing
                </Button>
              )}
              {notification.action === 'purchase' && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to={createPageUrl('InstitutionalPricing')}>View institutional plans</Link>
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Dismiss ${notification.title}`}
              onClick={() => setDismissed((current) => [...current, notification.id])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
