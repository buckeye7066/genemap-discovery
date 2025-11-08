
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
  ExternalLink
} from "lucide-react";

// Detect if running in iframe (Preview mode)
function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

export default function PremiumPage() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [isPreview] = useState(isInIframe()); // Preserve original isPreview state

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      try {
        const subs = await base44.entities.Subscription.filter({ 
          created_by: currentUser.email 
        });
        if (subs && subs.length > 0) {
          setSubscription(subs[0]);
        }
      } catch (subError) {
        console.log("No subscription found yet"); // Updated message as per outline
      }

      const urlParams = new URLSearchParams(window.location.search);
      const payment = urlParams.get('payment');
      if (payment === 'success') {
        setPaymentStatus({ type: 'success', message: 'Payment successful! Your subscription is now active.' });
        window.history.replaceState(null, '', window.location.pathname);
        // Reload subscription data after a short delay to ensure backend update
        setTimeout(() => loadData(), 1000); // Preserve original reload logic
      } else if (payment === 'cancelled') {
        setPaymentStatus({ type: 'error', message: 'Payment was cancelled. You can try again anytime.' });
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (err) {
      console.error("Load error:", err);
      setError("Unable to load page data");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubscribe() {
    setIsSubscribing(true);
    setError(null);
    
    try {
      const response = await base44.functions.invoke('createCheckoutSession', {});
      
      if (!response || !response.data) {
        throw new Error("No response from checkout");
      }

      const { sessionId, url } = response.data;

      if (!url) {
        throw new Error("No checkout URL returned");
      }

      // In Preview (iframe), open in new tab to escape iframe restrictions - Preserve original logic
      if (isPreview) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setPaymentStatus({ 
          type: 'info', 
          message: 'Checkout opened in a new tab. Complete your payment there and return here.' 
        });
        setIsSubscribing(false);
      } else {
        // In production, redirect in same window
        window.location.href = url;
      }
    } catch (err) {
      console.error("Subscribe error:", err);
      setError(err.message || "Failed to start checkout. Please try again.");
      setIsSubscribing(false);
    }
  }

  // Admin backdoor check
  const isAdmin = user?.email === "buckeye7066@gmail.com";
  const isPremium = isAdmin || (subscription?.status === "active" && subscription?.plan_type === "premium");

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
      <div className="max-w-4xl mx-auto">
        
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

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {paymentStatus && ( // Preserve original payment status alert logic
          <Alert 
            variant={paymentStatus.type === 'success' ? 'default' : paymentStatus.type === 'info' ? 'default' : 'destructive'} 
            className={paymentStatus.type === 'success' ? "mb-6 bg-green-50 border-green-200" : paymentStatus.type === 'info' ? "mb-6 bg-blue-50 border-blue-200" : "mb-6"}
          >
            {paymentStatus.type === 'success' && <Check className="h-4 w-4 text-green-600" />}
            {paymentStatus.type === 'info' && <ExternalLink className="h-4 w-4 text-blue-600" />}
            {paymentStatus.type === 'error' && <AlertCircle className="h-4 w-4" />}
            <AlertDescription className={paymentStatus.type === 'success' ? 'text-green-800' : paymentStatus.type === 'info' ? 'text-blue-800' : ''}>
              {paymentStatus.message}
            </AlertDescription>
          </Alert>
        )}

        {isPreview && ( // Preserve original isPreview alert
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <ExternalLink className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Preview Mode:</strong> Checkout will open in a new tab for security. After payment, return to this tab.
            </AlertDescription>
          </Alert>
        )}

        {isPremium ? (
          <Card className="mb-8 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6 text-amber-600" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900">
                    {isAdmin ? "Admin Access (Full Premium)" : "Premium Active"}
                  </h3>
                  <p className="text-sm text-amber-700">
                    {isAdmin ? "You have unlimited access to all premium features" : 
                     `Expires: ${subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'N/A'}`}
                  </p>
                </div>
                <Badge className="bg-amber-600 text-white">
                  {isAdmin ? "Admin" : "Active"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
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

        {!isPremium && (
          <Card className="text-center shadow-lg">
            <CardContent className="py-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Upgrade to Premium</h3>
              <p className="text-slate-600 mb-6 max-w-2xl mx-auto px-4">
                Get comprehensive genomic insights with population data, evolutionary history, 
                and treatment options.
              </p>
              
              <Button 
                size="lg" 
                onClick={handleSubscribe}
                disabled={isSubscribing}
                className="bg-amber-600 hover:bg-amber-700 px-8 py-3 min-h-[48px]" // Preserve original min-h
              >
                {isSubscribing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Opening Checkout... {/* Preserve original text */}
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Subscribe for $9.99/month
                    {isPreview && <ExternalLink className="w-4 h-4 ml-2" />} {/* Preserve original isPreview icon */}
                  </>
                )}
              </Button>
              
              <p className="text-xs text-slate-500 mt-4">
                Cancel anytime. Secure payment via Stripe.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mt-8">
          <h2 className="text-2xl font-bold text-center mb-6">Premium Examples</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-6">
                <Users className="w-8 h-8 text-blue-600 mb-2" />
                <h4 className="font-semibold mb-2">Population Data</h4>
                <p className="text-sm text-blue-700">
                  "1 in 175,000 births globally (OMIM, 2024)"
                </p>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="pt-6">
                <History className="w-8 h-8 text-purple-600 mb-2" />
                <h4 className="font-semibold mb-2">Gene History</h4>
                <p className="text-sm text-purple-700">
                  "Highly conserved, linked to hedgehog signaling..."
                </p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <Pill className="w-8 h-8 text-green-600 mb-2" />
                <h4 className="font-semibold mb-2">Treatments</h4>
                <p className="text-sm text-green-700">
                  "Surgical correction at 12-18 months recommended..."
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
