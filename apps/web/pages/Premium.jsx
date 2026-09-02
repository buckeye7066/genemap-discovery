import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "@/lib/AuthContext";
import { isNativeApp } from "@/lib/platform";
import { pollCheckoutActivation } from "@/lib/checkoutActivation";
import {
  annualSavingsPercent,
  formatBillingPrice,
  lowestInstitutionalMonthlyPrice,
} from "@/lib/billingCatalog";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Crown,
  Check,
  X,
  Zap,
  Shield,
  AlertCircle,
  Loader2,
  CheckCircle,
  Settings,
  Building2,
  BookOpen,
  Brain,
  HelpCircle,
  MessageSquare,
  Infinity as InfinityIcon,
  GraduationCap,
} from "lucide-react";

export default function PremiumPage() {
  const { user, isLoadingAuth, applyUser } = useAuth();
  const [error, setError] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentCanceled, setPaymentCanceled] = useState(false);
  const [activationState, setActivationState] = useState('idle');
  const [checkoutSessionId, setCheckoutSessionId] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [billingCatalog, setBillingCatalog] = useState(null);
  const blockedFeature = new URLSearchParams(window.location.search).get('feature');
  const blockedFeatureLabel = {
    'research.search': 'Gene search and search history',
    'research.workspace': 'Research workspace',
    'health.records': 'Encrypted health records and document parsing',
    'assistants.profile_context': 'Profile-aware Anastasia and Robert assistants',
    'institution.manage': 'Institutional license administration',
  }[blockedFeature] || blockedFeature;

  const isAdmin = user?.entitlements?.isAdmin || user?.role === 'admin' || user?.role === 'super_admin';
  const hasPremiumAccess = activationState === 'active' || user?.entitlements?.isPremium || false;
  const access = user?.entitlements?.access;
  const isComplimentary = access?.source === 'complimentary';
  const canPurchasePersonal = !isAdmin && (!hasPremiumAccess || isComplimentary);
  const accessTitle = isAdmin
    ? 'Admin — Full Access'
    : access?.source === 'institutional'
      ? 'Institutional Premium'
      : access?.source === 'complimentary'
        ? 'Complimentary Premium'
        : 'Premium Active';
  const accessBadge = isAdmin
    ? 'Admin Privileges'
    : access?.source === 'institutional'
      ? 'Institutional Access'
      : access?.source === 'complimentary'
        ? 'Complimentary Access'
        : 'Paid Subscription';

  const loadEntitlements = useCallback(async () => {
    try {
      const data = await apiClient.getEducationEntitlements();
      setEntitlements(data);
    } catch {
      // Not critical
    }
  }, []);

  const loadBillingCatalog = useCallback(async () => {
    setCatalogError(null);
    try {
      const catalog = await apiClient.getBillingCatalog();
      setBillingCatalog(catalog);
    } catch (catalogLoadError) {
      setBillingCatalog(null);
      setCatalogError(catalogLoadError?.message || 'Current Stripe prices could not be verified.');
    }
  }, []);

  useEffect(() => {
    void loadEntitlements();
    if (!isNativeApp()) void loadBillingCatalog();
  }, [loadBillingCatalog, loadEntitlements]);

  const confirmCheckoutActivation = useCallback(async (sessionId, signal) => {
    setActivationState('confirming');
    setError(null);
    const result = await pollCheckoutActivation({
      sessionId,
      expectedKind: 'personal',
      getStatus: (id) => apiClient.getCheckoutActivationStatus(id),
      signal,
    });
    if (result.outcome === 'cancelled') return;
    if (result.outcome === 'wrong_kind') {
      setActivationState('invalid');
      return;
    }
    if (result.outcome !== 'active') {
      setActivationState('delayed');
      return;
    }

    setActivationState('active');
    window.history.replaceState({}, '', window.location.pathname);
    try {
      const freshUser = await apiClient.getMe();
      if (!signal?.aborted) applyUser(freshUser);
    } catch {
      if (!signal?.aborted) {
        setError('Your entitlement is active, but this page could not refresh your profile. Reload the page to refresh it.');
      }
    }
  }, [applyUser]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const sessionId = urlParams.get('session_id');

    if (success === 'true') {
      if (!sessionId) {
        setActivationState('invalid');
        return undefined;
      }
      setCheckoutSessionId(sessionId);
      const controller = new AbortController();
      void confirmCheckoutActivation(sessionId, controller.signal);
      return () => controller.abort();
    }

    if (canceled === 'true') {
      setPaymentCanceled(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    return undefined;
  }, [confirmCheckoutActivation]);

  const handleSubscribe = async (plan = 'monthly') => {
    if (!billingCatalog?.personal?.[plan]) {
      setError('Current Stripe pricing is not verified. Reload pricing before checkout.');
      return;
    }
    setIsProcessing(true);
    setError(null);

    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?canceled=true`;

      const response = await apiClient.createCheckoutSession({
        plan,
        successUrl,
        cancelUrl,
      });

      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (checkoutError) {
      setError(checkoutError?.message || "Failed to start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  const monthlyPrice = billingCatalog?.personal?.monthly || null;
  const yearlyPrice = billingCatalog?.personal?.yearly || null;
  const monthlyPriceLabel = formatBillingPrice(monthlyPrice);
  const yearlyPriceLabel = formatBillingPrice(yearlyPrice);
  const savingsPercent = annualSavingsPercent(monthlyPrice, yearlyPrice);
  const institutionalStartingPrice = formatBillingPrice(
    lowestInstitutionalMonthlyPrice(billingCatalog),
  );

  const handleManageSubscription = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const returnUrl = window.location.href;
      const response = await apiClient.createPortalSession({ returnUrl });

      if (response?.url) {
        window.location.href = response.url;
      } else {
        throw new Error("No portal URL returned");
      }
    } catch {
      setError("Failed to open customer portal. Please try again.");
      setIsProcessing(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-slate-600">Loading subscription status...</p>
        </div>
      </div>
    );
  }

  // Store policy: the installed app must not offer a purchase flow or point
  // at an external one, so native builds get a neutral notice instead of
  // plans, prices, or checkout.
  if (isNativeApp()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-xl mx-auto pt-16">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Crown className="w-6 h-6 text-blue-600" />
                <CardTitle>Subscriptions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-slate-700">
                Subscription upgrades aren&apos;t available in this app.
              </p>
              <p className="text-sm text-slate-500">
                If you already have a Premium subscription, simply log in with the
                same account — all of your Premium features work here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Learning Plans
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Unlock unlimited AI-powered genetics education with Premium
          </p>
        </div>

        {activationState === 'active' && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Premium activated.</strong> The checkout and signed-webhook entitlement are both confirmed.
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'confirming' && (
          <Alert className="mb-6 border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            <AlertDescription className="text-blue-900">
              Checkout returned successfully. Waiting for the verified webhook to activate your server entitlement…
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'delayed' && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900 flex items-center justify-between gap-3 flex-wrap">
              <span>Stripe checkout is not yet matched to an active server entitlement. Locked routes remain locked until webhook processing completes.</span>
              <Button size="sm" variant="outline" onClick={() => confirmCheckoutActivation(checkoutSessionId)}>
                Check again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'invalid' && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>The checkout return could not be matched to this personal-subscription flow. No access was granted.</AlertDescription>
          </Alert>
        )}

        {blockedFeatureLabel && !hasPremiumAccess && (
          <Alert className="mb-6 border-blue-300 bg-blue-50">
            <Crown className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-900">
              <strong>{blockedFeatureLabel}</strong> is not part of the free tier. The page and its API routes use the same server-issued entitlement.
            </AlertDescription>
          </Alert>
        )}

        {paymentCanceled && (
          <Alert className="mb-6 bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Payment was canceled. You can try again anytime!
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {catalogError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{catalogError} Checkout is disabled until the configured prices are verified.</span>
              <Button size="sm" variant="outline" onClick={loadBillingCatalog}>Reload pricing</Button>
            </AlertDescription>
          </Alert>
        )}

        {hasPremiumAccess && (
          <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : 'bg-green-600'}`}>
                    {isAdmin ? <Shield className="w-6 h-6 text-white" /> : <Crown className="w-6 h-6 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900 text-lg">
                      {accessTitle}
                    </h3>
                    <p className="text-sm text-green-700 flex items-center gap-2">
                      <Badge className={isAdmin ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'}>
                        {accessBadge}
                      </Badge>
                    </p>
                    {user?.entitlements?.licenseInfo && (
                      <p className="text-xs text-green-600 mt-1">
                        Via {user.entitlements.licenseInfo.organizationName}
                      </p>
                    )}
                    {access?.expiresAt && (
                      <p className="mt-1 text-xs text-green-700">
                        Current access through {new Date(access.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {!isAdmin && access?.canManageBilling && (
                  <Button
                    onClick={handleManageSubscription}
                    disabled={isProcessing}
                    variant="outline"
                    className="gap-2"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                    ) : (
                      <><Settings className="w-4 h-4" /> Manage Subscription</>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {!hasPremiumAccess && entitlements && entitlements.todayUsage && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Free Tier — Today's Usage</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Explanations', key: 'explanation', limitKey: 'explanations_per_day', icon: BookOpen },
                  { label: 'Quizzes', key: 'quiz', limitKey: 'quizzes_per_day', icon: HelpCircle },
                  { label: 'Chat Messages', key: 'chat', limitKey: 'chat_messages_per_day', icon: MessageSquare },
                ].map(({ label, key, limitKey, icon: Icon }) => {
                  const used = entitlements.todayUsage[key] || 0;
                  const limit = entitlements.limits?.[limitKey] || 0;
                  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                  return (
                    <div key={key} className="bg-white rounded-lg p-3 border border-blue-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-medium text-slate-700">{label}</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mb-1" />
                      <p className="text-xs text-slate-500">
                        {limit > 0 ? `${used}/${limit} used` : 'Limit unavailable'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="text-center pb-4">
              <div className="w-14 h-14 mx-auto mb-3 bg-slate-100 rounded-xl flex items-center justify-center">
                <Shield className="w-7 h-7 text-slate-600" />
              </div>
              <CardTitle className="text-xl">Free Learner</CardTitle>
              <p className="text-2xl font-bold text-slate-900 mt-2">$0<span className="text-sm font-normal text-slate-500">/month</span></p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">All 32 genetics topics</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">6 education levels</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Guided learning path</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm">5 AI explanations/day</span>
              </div>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm">3 quizzes/day</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm">10 tutor messages/day</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-400">Gene search & research tools</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-400">Health document parsing & profile-aware assistants</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-400 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
              RECOMMENDED
            </div>
            <CardHeader className="text-center pb-4">
              <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Crown className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl">Premium Learner</CardTitle>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {monthlyPriceLabel || 'Verifying…'}
                {monthlyPriceLabel && <span className="text-sm font-normal text-slate-500">/month</span>}
              </p>
              <p className="text-xs text-slate-500">
                {yearlyPriceLabel
                  ? `or ${yearlyPriceLabel}/year${savingsPercent ? ` (save ${savingsPercent}%)` : ''}`
                  : 'Stripe pricing verification in progress'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium">Everything in Free, plus:</span>
              </div>
              <div className="flex items-center gap-2">
                <InfinityIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm"><strong>Unlimited</strong> AI explanations</span>
              </div>
              <div className="flex items-center gap-2">
                <InfinityIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm"><strong>Unlimited</strong> quizzes & tutoring</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-sm">Advanced AI study and research tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Gene search & research mode</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Learning progress and advanced topic paths</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Saved gene sets & research projects</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm">Encrypted health profile and parsed lab records</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-sm">Profile-aware Anastasia and Robert with context receipts</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Server-enforced premium access on every protected API route</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {canPurchasePersonal && (
          <div className="text-center mb-8">
            <Card className="max-w-2xl mx-auto shadow-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="pt-8 pb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center">
                    <Crown className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                  {isComplimentary ? 'Keep Premium after your complimentary period' : 'Upgrade to Premium'}
                </h2>
                <p className="text-slate-600 mb-6">
                  {isComplimentary
                    ? 'Choose a paid plan now; Stripe billing begins through the checkout terms shown before payment.'
                    : 'Unlimited AI-powered genetics learning for every level'}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => handleSubscribe('monthly')}
                    disabled={isProcessing || activationState === 'confirming' || !monthlyPriceLabel}
                    size="lg"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><Crown className="w-5 h-5 mr-2" /> Monthly — {monthlyPriceLabel || 'Verifying…'}/mo</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleSubscribe('yearly')}
                    disabled={isProcessing || activationState === 'confirming' || !yearlyPriceLabel}
                    size="lg"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 px-8"
                  >
                    Yearly — {yearlyPriceLabel || 'Verifying…'}/yr
                    {savingsPercent && <Badge className="ml-2 bg-green-600 text-white text-xs">Save {savingsPercent}%</Badge>}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  Secure payment via Stripe &bull; Access begins after verified webhook activation
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl font-bold text-indigo-900 mb-1">
                  Classroom & Institutional Plans
                </h3>
                <p className="text-indigo-700 mb-2">
                  Premium access for your school, university, or organization with volume pricing, seat assignment, and server-side tier controls
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <Badge className="bg-indigo-600 text-white">
                    {institutionalStartingPrice
                      ? `Starting at ${institutionalStartingPrice}/seat/month`
                      : 'Verified volume pricing'}
                  </Badge>
                </div>
              </div>
              <Link to="/institutionalpricing">
                <Button className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                  <Building2 className="w-4 h-4" />
                  View Institutional Plans
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
