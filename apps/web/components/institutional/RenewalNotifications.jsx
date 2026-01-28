import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bell, Calendar, AlertTriangle, CheckCircle, X } from "lucide-react";

export default function RenewalNotifications() {
  const [licenses, setLicenses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    checkRenewals();
  }, []);

  const checkRenewals = async () => {
    try:
      const user = await apiClient.getMe();
      
      // BACKEND_NEEDED: InstitutionalLicense entity needs API implementation
      // const allLicenses = await apiClient.getInstitutionalLicenses();
      // const userLicenses = allLicenses.filter(license => 
      //   license.admin_users && license.admin_users.includes(user.email)
      // );
      const userLicenses = [];

      setLicenses(userLicenses);

      // Check for upcoming renewals or expirations
      const now = new Date();
      const alerts = [];

      userLicenses.forEach(license => {
        const endDate = new Date(license.end_date);
        const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        // Critical: 7 days or less
        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          alerts.push({
            id: license.id,
            severity: 'critical',
            message: `${license.organization_name} license expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}!`,
            action: license.auto_renew ? 'Will auto-renew' : 'Action required',
            license
          });
        }
        // Warning: 30 days or less
        else if (daysUntilExpiry <= 30 && daysUntilExpiry > 7) {
          alerts.push({
            id: license.id,
            severity: 'warning',
            message: `${license.organization_name} license expires in ${daysUntilExpiry} days`,
            action: license.auto_renew ? 'Auto-renewal enabled' : 'Review renewal',
            license
          });
        }
        // Expired
        else if (daysUntilExpiry <= 0) {
          alerts.push({
            id: license.id,
            severity: 'expired',
            message: `${license.organization_name} license has expired`,
            action: 'Renew now',
            license
          });
        }
      });

      setNotifications(alerts.filter(alert => !dismissed.includes(alert.id)));

    } catch (err) {
      console.error("Error checking renewals:", err);
    }
  };

  const handleDismiss = (alertId) => {
    setDismissed([...dismissed, alertId]);
    setNotifications(notifications.filter(n => n.id !== alertId));
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-300 text-red-900';
      case 'warning':
        return 'bg-amber-50 border-amber-300 text-amber-900';
      case 'expired':
        return 'bg-slate-50 border-slate-300 text-slate-900';
      default:
        return 'bg-blue-50 border-blue-300 text-blue-900';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
      case 'expired':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <Calendar className="h-4 w-4 text-amber-600" />;
      default:
        return <Bell className="h-4 w-4 text-blue-600" />;
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <Alert key={notification.id} className={getSeverityStyle(notification.severity)}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1">
              {getSeverityIcon(notification.severity)}
              <div className="flex-1">
                <AlertDescription>
                  <strong>{notification.message}</strong>
                  <p className="text-sm mt-1">{notification.action}</p>
                </AlertDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDismiss(notification.id)}
              className="ml-2"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}