import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Users,
  Check,
  Crown,
  Shield,
  ArrowRight,
  Info,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { apiClient } from '@genemap/shared';
import { isNativeApp } from "@/lib/platform";
import { useAuth } from "@/lib/AuthContext";
import { pollCheckoutActivation } from "@/lib/checkoutActivation";
import { annualSavingsPercent, formatBillingPrice } from "@/lib/billingCatalog";

const PRICING = {
  team: {
    name: "Team",
    features: [
      "Full premium features",
      "Admin dashboard",
      "Atomic bulk seat assignment",
      "Usage activity log and export",
      "Server-enforced institutional access"
    ]
  },
  department: {
    name: "Department",
    features: [
      "Full premium features",
      "Admin dashboard",
      "Atomic bulk seat assignment",
      "Usage activity log and export",
      "Server-enforced institutional access"
    ]
  },
  enterprise: {
    name: "Enterprise",
    features: [
      "Full premium features",
      "Admin dashboard",
      "Atomic bulk seat assignment",
      "Usage activity log and export",
      "Server-enforced institutional access"
    ]
  }
};

export default function InstitutionalPricingPage() {
  const { applyUser } = useAuth();
  const [selectedTier, setSelectedTier] = useState("team");
  const [billingCycle, setBillingCycle] = useState("annual");
  const [seats, setSeats] = useState(10);
  const [organizationName, setOrganizationName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [activationState, setActivationState] = useState('idle');
  const [checkoutSessionId, setCheckoutSessionId] = useState(null);
  const [billingCatalog, setBillingCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);

  const currentTier = PRICING[selectedTier];
  const currentCatalogTier = billingCatalog?.institutional?.[selectedTier] || null;
  const billingKey = billingCycle === 'annual' ? 'yearly' : 'monthly';
  const pricePerSeat = currentCatalogTier?.[billingKey] || null;
  const pricePerSeatLabel = formatBillingPrice(pricePerSeat);
  const totalPrice = pricePerSeat
    ? { ...pricePerSeat, amountMinor: pricePerSeat.amountMinor * seats }
    : null;
  const totalPriceLabel = formatBillingPrice(totalPrice);
  const annualSavings = billingCycle === 'annual' && currentCatalogTier
    ? {
        ...currentCatalogTier.yearly,
        amountMinor: (
          (currentCatalogTier.monthly.amountMinor * 12)
          - currentCatalogTier.yearly.amountMinor
        ) * seats,
      }
    : null;
  const annualSavingsLabel = annualSavings?.amountMinor > 0
    ? formatBillingPrice(annualSavings)
    : null;
  const savingsPercent = annualSavingsPercent(
    currentCatalogTier?.monthly,
    currentCatalogTier?.yearly,
  );

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
    if (!isNativeApp()) void loadBillingCatalog();
  }, [loadBillingCatalog]);

  const confirmCheckoutActivation = useCallback(async (sessionId, signal) => {
    setActivationState('confirming');
    setError(null);
    const result = await pollCheckoutActivation({
      sessionId,
      expectedKind: 'institutional',
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
        setError('The institutional entitlement is active, but this page could not refresh your profile. Reload the page to refresh it.');
      }
    }
  }, [applyUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canceled') === 'true') {
      setActivationState('canceled');
      window.history.replaceState({}, '', window.location.pathname);
      return undefined;
    }
    if (params.get('success') !== 'true') return undefined;
    const sessionId = params.get('session_id');
    if (!sessionId) {
      setActivationState('invalid');
      return undefined;
    }
    setCheckoutSessionId(sessionId);
    const controller = new AbortController();
    void confirmCheckoutActivation(sessionId, controller.signal);
    return () => controller.abort();
  }, [confirmCheckoutActivation]);

  const handlePurchase = async () => {
    if (!currentCatalogTier || !pricePerSeatLabel) {
      setError("Current Stripe pricing is not verified. Reload pricing before checkout.");
      return;
    }
    if (!organizationName.trim()) {
      setError("Please enter your organization name");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail.trim())) {
      setError("Please enter a valid billing contact email");
      return;
    }

    if (seats < currentCatalogTier.minSeats || seats > currentCatalogTier.maxSeats) {
      setError(`Seats must be between ${currentCatalogTier.minSeats} and ${currentCatalogTier.maxSeats} for ${currentTier.name} tier`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?canceled=true`;
      
      const response = await apiClient.createInstitutionalCheckout({
        organizationName: organizationName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        licenseType: selectedTier,
        // The UI speaks "annual"/"monthly" for its price display; the API enum
        // is "yearly"/"monthly". Translate at the boundary — sending "annual"
        // (the default cycle) failed Zod validation and broke annual checkout.
        billing: billingCycle === "annual" ? "yearly" : "monthly",
        seats: parseInt(seats),
        successUrl,
        cancelUrl,
      });

      if (response && response.url) {
        window.location.href = response.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Failed to start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  // Store policy: no purchase flow, prices, or external-payment steering in
  // native builds.
  if (isNativeApp()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-xl mx-auto pt-16">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-blue-600" />
                <CardTitle>Institutional Licensing</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-slate-700">
                Institutional license purchases aren&apos;t available in this app.
              </p>
              <p className="text-sm text-slate-500">
                Members of an organization with an existing license can simply log
                in — institutional access works here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Institutional Licensing
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Premium genomic research access with volume pricing, auditable seat assignment, and server-side tier enforcement.
          </p>
        </div>

        {activationState === 'active' && (
          <Alert className="mb-8 max-w-4xl mx-auto border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-700" />
            <AlertDescription className="text-green-900 flex items-center justify-between gap-3 flex-wrap">
              <span><strong>Institutional license activated.</strong> The exact checkout and signed-webhook license are both confirmed.</span>
              <Link to={createPageUrl("InstitutionalAdmin")}><Button size="sm">Manage seats</Button></Link>
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'confirming' && (
          <Alert className="mb-8 max-w-4xl mx-auto border-blue-200 bg-blue-50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            <AlertDescription className="text-blue-900">
              Checkout returned successfully. Waiting for the verified webhook to create the institutional license…
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'delayed' && (
          <Alert className="mb-8 max-w-4xl mx-auto border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900 flex items-center justify-between gap-3 flex-wrap">
              <span>The checkout is not yet matched to an active server license. Seat management remains locked until webhook processing completes.</span>
              <Button size="sm" variant="outline" onClick={() => confirmCheckoutActivation(checkoutSessionId)}>Check again</Button>
            </AlertDescription>
          </Alert>
        )}

        {activationState === 'invalid' && (
          <Alert variant="destructive" className="mb-8 max-w-4xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>The checkout return could not be matched to this institutional flow. No license was granted.</AlertDescription>
          </Alert>
        )}

        {activationState === 'canceled' && (
          <Alert className="mb-8 max-w-4xl mx-auto border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900">Checkout was canceled. No institutional license was created.</AlertDescription>
          </Alert>
        )}

        {catalogError && (
          <Alert variant="destructive" className="mb-8 max-w-4xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{catalogError} Checkout is disabled until the configured prices are verified.</span>
              <Button size="sm" variant="outline" onClick={loadBillingCatalog}>Reload pricing</Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          {/* Tier Selection Cards */}
          {Object.entries(PRICING).map(([key, tier]) => {
            const verifiedTier = billingCatalog?.institutional?.[key] || null;
            const displayedPrice = formatBillingPrice(
              verifiedTier?.[billingCycle === 'annual' ? 'yearly' : 'monthly'],
            );
            return (
              <Card
                key={key}
                className={`cursor-pointer transition-all duration-300 ${
                  selectedTier === key
                    ? "border-2 border-blue-600 shadow-xl scale-105"
                    : "border-2 border-slate-200 hover:border-blue-300"
                }`}
                onClick={() => {
                  setSelectedTier(key);
                  if (verifiedTier) setSeats(verifiedTier.minSeats);
                }}
              >
                <CardHeader className="text-center">
                  <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-xl flex items-center justify-center">
                    {key === "team" && <Users className="w-6 h-6 text-blue-600" />}
                    {key === "department" && <Shield className="w-6 h-6 text-blue-600" />}
                    {key === "enterprise" && <Crown className="w-6 h-6 text-blue-600" />}
                  </div>
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <Badge variant="outline" className="mt-2">
                    {verifiedTier
                      ? `${verifiedTier.minSeats}-${verifiedTier.maxSeats.toLocaleString()} users`
                      : 'Verifying seat band…'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-center mb-4">
                    <p className="text-3xl font-bold text-slate-900">
                      {displayedPrice || 'Verifying…'}
                    </p>
                    <p className="text-sm text-slate-600">per user/{billingCycle === "annual" ? "year" : "month"}</p>
                  </div>
                  <div className="space-y-2">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Configuration & Checkout */}
        <Card className="shadow-2xl max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Configure Your License</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Billing Cycle */}
            <div>
              <Label className="text-base font-medium mb-3 block">Billing Cycle</Label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant={billingCycle === "monthly" ? "default" : "outline"}
                  onClick={() => setBillingCycle("monthly")}
                  className="h-auto py-4"
                >
                  <div className="text-center">
                    <p className="font-semibold">Monthly</p>
                    <p className="text-xs opacity-80">Pay as you go</p>
                  </div>
                </Button>
                <Button
                  variant={billingCycle === "annual" ? "default" : "outline"}
                  onClick={() => setBillingCycle("annual")}
                  className="h-auto py-4 relative"
                >
                  <div className="text-center">
                    <p className="font-semibold">Annual</p>
                    <p className="text-xs opacity-80">
                      {savingsPercent ? `Save ${savingsPercent}%` : 'Billed yearly'}
                    </p>
                  </div>
                  <Badge className="absolute -top-2 -right-2 bg-green-600 text-white">
                    Best Value
                  </Badge>
                </Button>
              </div>
            </div>

            {/* Organization Name */}
            <div>
              <Label htmlFor="org-name" className="text-base font-medium">
                Organization Name
              </Label>
              <Input
                id="org-name"
                placeholder="Acme Research Institute"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="mt-2 text-lg py-6"
              />
            </div>

            {/* Contact Email — required by /billing/institutional-checkout */}
            <div>
              <Label htmlFor="org-contact-email" className="text-base font-medium">
                Billing Contact Email
              </Label>
              <Input
                id="org-contact-email"
                type="email"
                placeholder="finance@yourorg.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-2 text-lg py-6"
              />
            </div>

            {/* Number of Seats */}
            <div>
              <Label htmlFor="seats" className="text-base font-medium">
                Number of Seats
              </Label>
              <div className="flex items-center gap-4 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setSeats(Math.max(currentCatalogTier.minSeats, seats - 1))}
                  disabled={!currentCatalogTier || seats <= currentCatalogTier.minSeats}
                >
                  -
                </Button>
                <Input
                  id="seats"
                  type="number"
                  value={seats}
                  onChange={(e) => setSeats(Number.parseInt(e.target.value, 10) || currentCatalogTier?.minSeats || 0)}
                  min={currentCatalogTier?.minSeats}
                  max={currentCatalogTier?.maxSeats}
                  disabled={!currentCatalogTier}
                  className="text-center text-xl font-bold"
                />
                <Button
                  variant="outline"
                  onClick={() => setSeats(Math.min(currentCatalogTier.maxSeats, seats + 1))}
                  disabled={!currentCatalogTier || seats >= currentCatalogTier.maxSeats}
                >
                  +
                </Button>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                {currentCatalogTier
                  ? `${currentTier.name} tier: ${currentCatalogTier.minSeats}-${currentCatalogTier.maxSeats.toLocaleString()} seats`
                  : 'Seat range is being verified with the billing catalog.'}
              </p>
            </div>

            {/* Price Summary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-slate-900 mb-4">Price Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-700">
                    {pricePerSeatLabel || 'Verifying price'} × {seats} seats
                  </span>
                  <span className="font-medium text-slate-900">
                    {totalPriceLabel || '—'}/{billingCycle === "annual" ? "year" : "month"}
                  </span>
                </div>
                {billingCycle === "annual" && annualSavingsLabel && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Annual savings</span>
                    <span>{annualSavingsLabel}</span>
                  </div>
                )}
                <div className="border-t border-blue-200 pt-3 flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-blue-600">
                    {totalPriceLabel || '—'}/{billingCycle === "annual" ? "year" : "month"}
                  </span>
                </div>
              </div>
            </div>

            {/* Features Included */}
            <Alert className="bg-white border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-slate-700">
                <strong>Included with all licenses:</strong> Admin dashboard, usage tracking, bulk user management, 
                owner-bound seat assignment, and all premium GeneMap features. Assigned users sign in with the exact email; this flow does not send invitation mail.
              </AlertDescription>
            </Alert>

            {/* Purchase Button */}
            <Button
              onClick={handlePurchase}
              disabled={isProcessing || activationState === 'confirming' || !currentCatalogTier || !pricePerSeatLabel || !organizationName.trim() || !contactEmail.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 py-6 text-lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Crown className="w-5 h-5 mr-2" />
                  Purchase {currentTier.name} License{totalPriceLabel ? ` — ${totalPriceLabel}` : ''}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">
              Stripe-hosted checkout • Access begins only after signed-webhook activation
            </p>
          </CardContent>
        </Card>

        {/* Contact CTA */}
        <Card className="mt-8 max-w-4xl mx-auto bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="pt-6 text-center">
            <Mail className="w-12 h-12 mx-auto mb-4 text-purple-600" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Need more than the self-service limit?
            </h3>
            <p className="text-slate-600 mb-4">
              Self-service checkout supports up to 1,000 seats. Use the in-app support form for requirements outside that boundary.
            </p>
            <Link to={createPageUrl("ContactSupport")}>
              <Button variant="outline" className="gap-2">
                <Mail className="w-4 h-4" />
                Open support form
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* FAQ */}
        <div className="mt-12 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-8">
            Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">How do I add users?</h4>
                <p className="text-sm text-slate-600">
                  Assign one or more seat email addresses in the admin dashboard. No invitation email is sent; access is active when that exact address signs in.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">Can I change purchased capacity in the dashboard?</h4>
                <p className="text-sm text-slate-600">
                  Not currently. The dashboard administers the purchased seats but does not alter the Stripe subscription or license capacity.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">What happens if I exceed my seats?</h4>
                <p className="text-sm text-slate-600">
                  The API rejects the entire assignment. Revoke an existing seat before assigning a replacement; bulk assignments are all-or-nothing.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">Is there a free trial?</h4>
                <p className="text-sm text-slate-600">
                  There is no automated institutional trial in the current checkout flow.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
