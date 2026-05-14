import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "@/lib/AuthContext";
import { useEducationLevel } from "@/lib/EducationLevelContext";
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
  Image,
  HelpCircle,
  MessageSquare,
  Infinity as InfinityIcon,
  GraduationCap,
} from "lucide-react";

export default function PremiumPage() {
  const { user, isLoadingAuth } = useAuth();
  const { levelConfig } = useEducationLevel();
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentCanceled, setPaymentCanceled] = useState(false);
  const [entitlements, setEntitlements] = useState(null);

  const isAdmin = user?.entitlements?.isAdmin || user?.role === 'admin' || user?.role === 'super_admin';
  const hasActiveSubscription = user?.entitlements?.isPremium || false;

  useEffect(() => {
    checkPaymentStatus();
    loadEntitlements();
  }, []);

  const loadEntitlements = async () => {
    try {
      const data = await apiClient.getEducationEntitlements();
      setEntitlements(data);
    } catch {
      // Not critical
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
        window.location.reload();
      }, 3000);
    }

    if (canceled === 'true') {
      setPaymentCanceled(true);
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }, 5000);
    }
  };

  const handleSubscribe = async (plan = 'monthly') => {
    setIsProcessing(true);
    setError(null);

    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?success=true`;
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
    } catch (err) {
      setError(err.message || "Failed to start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

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
    } catch (err) {
      setError(err.message || "Failed to open customer portal. Please try again.");
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

        {paymentSuccess && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Payment Successful!</strong> Your premium subscription is now active. Enjoy unlimited learning!
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

        {hasActiveSubscription && (
          <Card className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-gradient-to-r from-purple-600 to-indigo-600' : 'bg-green-600'}`}>
                    {isAdmin ? <Shield className="w-6 h-6 text-white" /> : <Crown className="w-6 h-6 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-900 text-lg">
                      {isAdmin ? 'Admin — Full Access' : 'Premium Active'}
                    </h3>
                    <p className="text-sm text-green-700 flex items-center gap-2">
                      <Badge className={isAdmin ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'}>
                        {isAdmin ? 'Admin Privileges' : 'Unlimited Access'}
                      </Badge>
                    </p>
                    {user?.entitlements?.licenseInfo && (
                      <p className="text-xs text-green-600 mt-1">
                        Via {user.entitlements.licenseInfo.organizationName}
                      </p>
                    )}
                  </div>
                </div>
                {!isAdmin && !user?.entitlements?.licenseInfo && (
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

        {!hasActiveSubscription && entitlements && entitlements.todayUsage && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Free Tier — Today's Usage</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Explanations', key: 'explanation', limit: 5, icon: BookOpen },
                  { label: 'Images', key: 'image', limit: 2, icon: Image },
                  { label: 'Quizzes', key: 'quiz', limit: 3, icon: HelpCircle },
                  { label: 'Chat Messages', key: 'chat', limit: 10, icon: MessageSquare },
                ].map(({ label, key, limit, icon: Icon }) => {
                  const used = entitlements.todayUsage[key] || 0;
                  const pct = Math.min((used / limit) * 100, 100);
                  return (
                    <div key={key} className="bg-white rounded-lg p-3 border border-blue-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-medium text-slate-700">{label}</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mb-1" />
                      <p className="text-xs text-slate-500">{used}/{limit} used</p>
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
                <Image className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-sm">2 AI illustrations/day</span>
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
                <span className="text-sm text-slate-400">Advanced visualizations</span>
              </div>
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-slate-300 flex-shrink-0" />
                <span className="text-sm text-slate-400">Gene search & research tools</span>
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
              <p className="text-2xl font-bold text-slate-900 mt-2">$9.99<span className="text-sm font-normal text-slate-500">/month</span></p>
              <p className="text-xs text-slate-500">or $99.99/year (save 17%)</p>
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
                <span className="text-sm"><strong>Unlimited</strong> AI illustrations</span>
              </div>
              <div className="flex items-center gap-2">
                <InfinityIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm"><strong>Unlimited</strong> quizzes & tutoring</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-sm">Advanced AI models (GPT-4o & Claude)</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm">Gene search & research mode</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">All visualization tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">VCF analysis & clinical tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm">Priority support</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {!hasActiveSubscription && (
          <div className="text-center mb-8">
            <Card className="max-w-2xl mx-auto shadow-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50">
              <CardContent className="pt-8 pb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center">
                    <Crown className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                  Upgrade to Premium
                </h2>
                <p className="text-slate-600 mb-6">
                  Unlimited AI-powered genetics learning for every level
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={() => handleSubscribe('monthly')}
                    disabled={isProcessing}
                    size="lg"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8"
                  >
                    {isProcessing ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><Crown className="w-5 h-5 mr-2" /> Monthly — $9.99/mo</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleSubscribe('yearly')}
                    disabled={isProcessing}
                    size="lg"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 px-8"
                  >
                    Yearly — $99.99/yr
                    <Badge className="ml-2 bg-green-600 text-white text-xs">Save 17%</Badge>
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-4">
                  Cancel anytime &bull; Secure payment via Stripe &bull; Instant access
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
                  Premium access for your school, university, or organization with volume discounts, admin controls, and student management
                </p>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <Badge className="bg-indigo-600 text-white">Starting at $5.99/seat/month</Badge>
                  <Badge className="bg-green-600 text-white">Save up to 40%</Badge>
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
