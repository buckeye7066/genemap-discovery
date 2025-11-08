
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Crown,
  Check,
  X,
  Users,
  History,
  Pill,
  Zap,
  CreditCard,
  Shield,
  AlertCircle,
  Loader2,
  ExternalLink,
  CheckCircle,
  Settings,
  Building2 // New icon import
} from "lucide-react";
import Link from "next/link"; // New import for navigation

import { createCheckoutSession } from "@/functions/createCheckoutSession";
import { createPortalSession } from "@/functions/createPortalSession";

// New helper function for creating page URLs (assuming Next.js routing)
const createPageUrl = (pageName) => {
  switch (pageName) {
    case "InstitutionalPricing":
      return "/institutional-pricing"; // Or the actual path for institutional pricing
    default:
      return `/${pageName.toLowerCase().replace(/ /g, '-')}`; // Fallback for other pages
  }
};

export default function PremiumPage() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentCanceled, setPaymentCanceled] = useState(false);

  useEffect(() => {
    checkSubscriptionStatus();
    checkPaymentStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const subscriptions = await base44.entities.Subscription.filter({
        created_by: currentUser.email
      });

      if (subscriptions.length > 0) {
        const sub = subscriptions[0];
        setSubscription(sub);
        setHasActiveSubscription(
          sub.status === 'active' || sub.status === 'trialing'
        );
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
      setError("Failed to load subscription status.");
    } finally {
      setIsLoading(false);
    }
  };

  const checkPaymentStatus = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');

    if (success === 'true') {
      setPaymentSuccess(true);
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        checkSubscriptionStatus(); // Reload subscription data after success
      }, 3000);
    }

    if (canceled === 'true') {
      setPaymentCanceled(true);
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }, 5000);
    }
  };

  const handleSubscribe = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Use the new createCheckoutSession function
      const response = await createCheckoutSession({
        priceId: Deno.env.get("STRIPE_PRICE_ID_MONTHLY") // Placeholder for Deno.env, assumes it's available or mocked
      });

      if (response.data && response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error("Subscribe error:", err);
      setError("Failed to start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const response = await createPortalSession({});

      if (response.data && response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch (err) {
      console.error("Portal error:", err);
      setError("Failed to open customer portal. Please try again.");
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-600">Loading subscription status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Crown className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Premium Features
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto px-4">
            Unlock advanced research capabilities with comprehensive genomic insights
          </p>
        </div>

        {/* Payment Success */}
        {paymentSuccess && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Payment Successful!</strong> Your premium subscription is now active.
              Refreshing subscription status...
            </AlertDescription>
          </Alert>
        )}

        {/* Payment Canceled */}
        {paymentCanceled && (
          <Alert className="mb-6 bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Payment was canceled. You can try again anytime!
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Subscription Status */}
        {hasActiveSubscription && subscription && (
          <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900 text-lg">Premium Active</h3>
                    <p className="text-sm text-green-700">
                      Status: <Badge className="bg-green-600 text-white">{subscription.status}</Badge>
                    </p>
                    {subscription.expires_at && (
                      <p className="text-xs text-green-600 mt-1">
                        Renews: {new Date(subscription.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleManageSubscription}
                  disabled={isProcessing}
                  variant="outline"
                  className="gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Settings className="w-4 h-4" />
                      Manage Subscription
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Free Tier status if no active subscription */}
        {!hasActiveSubscription && (
          <Card className="mb-8 bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-600" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900">Free Tier</h3>
                  <p className="text-sm text-blue-700">Basic gene discovery features</p>
                </div>
                <Badge variant="outline" className="border-blue-300 text-blue-700">Free</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Institutional License CTA - NEW */}
        <Card className="mb-8 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl font-bold text-indigo-900 mb-1">
                  Institutional Licensing for Teams
                </h3>
                <p className="text-indigo-700 mb-2">
                  Get premium access for your entire organization with volume discounts, admin controls, and dedicated support
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <Badge className="bg-indigo-600 text-white">Starting at $5.99/user/month</Badge>
                  <Badge className="bg-green-600 text-white">Save up to 40%</Badge>
                </div>
              </div>
              <Link href={createPageUrl("InstitutionalPricing")}>
                <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  <Building2 className="w-4 h-4" />
                  View Institutional Plans
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Individual vs Team comparison grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">

          <Card>
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-slate-600" />
              </div>
              <CardTitle>Free Tier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Candidate gene discovery</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Genomic coordinates</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Associated phenotypes</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">AI explanations</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400">Population data</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400">Gene history</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-400">Treatment info</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 rounded-xl flex items-center justify-center">
                <Crown className="w-6 h-6 text-amber-600" />
              </div>
              <CardTitle>Premium Tier</CardTitle>
              <Badge className="bg-amber-600 text-white mt-2">$9.99/month</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium">All Free features</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Population prevalence</span>
              </div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Gene evolutionary history</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Mutation data</span>
              </div>
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Treatment information</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Enhanced AI insights</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Priority support</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription CTA */}
        {!hasActiveSubscription && (
          <div className="text-center mt-12">
            <Card className="max-w-2xl mx-auto shadow-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
              <CardContent className="pt-8 pb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-amber-600 rounded-2xl flex items-center justify-center">
                    <Crown className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-3">
                  Upgrade to Premium
                </h2>
                <p className="text-lg text-slate-600 mb-6">
                  Unlock advanced genomic insights for just <strong className="text-amber-600">$9.99/month</strong>
                </p>
                <Button
                  onClick={handleSubscribe}
                  disabled={isProcessing}
                  size="lg"
                  className="bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white px-8 py-6 text-lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crown className="w-5 h-5 mr-2" />
                      Subscribe Now - $9.99/month
                    </>
                  )}
                </Button>
                <p className="text-xs text-slate-500 mt-4">
                  Cancel anytime • Secure payment • Instant access
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
