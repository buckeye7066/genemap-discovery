import React, { useState } from "react";
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
  Zap,
  ArrowRight,
  Info,
  Mail,
  Loader2
} from "lucide-react";
import { apiClient } from '@genemap/shared';

const PRICING = {
  team: {
    name: "Team",
    minSeats: 5,
    maxSeats: 20,
    monthly: 7.99,
    annual: 79.99,
    features: [
      "Up to 20 users",
      "Full premium features",
      "Priority support",
      "Admin dashboard",
      "Usage analytics",
      "Email support"
    ]
  },
  department: {
    name: "Department",
    minSeats: 21,
    maxSeats: 100,
    monthly: 6.99,
    annual: 69.99,
    features: [
      "21-100 users",
      "All Team features",
      "Advanced analytics",
      "Custom onboarding",
      "Dedicated account manager",
      "Phone support"
    ]
  },
  enterprise: {
    name: "Enterprise",
    minSeats: 100,
    maxSeats: 1000,
    monthly: 5.99,
    annual: 59.99,
    features: [
      "100+ users",
      "All Department features",
      "Custom integration",
      "SLA guarantees",
      "Training sessions",
      "24/7 priority support"
    ]
  }
};

export default function InstitutionalPricingPage() {
  const [selectedTier, setSelectedTier] = useState("team");
  const [billingCycle, setBillingCycle] = useState("annual");
  const [seats, setSeats] = useState(10);
  const [organizationName, setOrganizationName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const currentTier = PRICING[selectedTier];
  const pricePerSeat = billingCycle === "annual" ? currentTier.annual : currentTier.monthly;
  const totalPrice = pricePerSeat * seats;
  const annualSavings = billingCycle === "annual" 
    ? ((currentTier.monthly * 12 - currentTier.annual) * seats).toFixed(2)
    : 0;

  const handlePurchase = async () => {
    if (!organizationName.trim()) {
      setError("Please enter your organization name");
      return;
    }

    if (seats < currentTier.minSeats || seats > currentTier.maxSeats) {
      setError(`Seats must be between ${currentTier.minSeats} and ${currentTier.maxSeats} for ${currentTier.name} tier`);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const successUrl = `${window.location.origin}${window.location.pathname}?success=true`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}?canceled=true`;
      
      const response = await apiClient.createInstitutionalCheckout({
        organizationName: formData.organizationName,
        contactEmail: formData.contactEmail,
        licenseType: selectedPlan,
        billing: billingCycle,
        seats: parseInt(formData.seats),
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
            Empower your entire team with premium genomic research tools. Volume discounts and dedicated support included.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          {/* Tier Selection Cards */}
          {Object.entries(PRICING).map(([key, tier]) => (
            <Card
              key={key}
              className={`cursor-pointer transition-all duration-300 ${
                selectedTier === key
                  ? "border-2 border-blue-600 shadow-xl scale-105"
                  : "border-2 border-slate-200 hover:border-blue-300"
              }`}
              onClick={() => {
                setSelectedTier(key);
                setSeats(tier.minSeats);
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
                  {tier.minSeats}-{tier.maxSeats === 1000 ? "∞" : tier.maxSeats} users
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold text-slate-900">
                    ${billingCycle === "annual" ? tier.annual : tier.monthly}
                  </p>
                  <p className="text-sm text-slate-600">per user/{billingCycle === "annual" ? "year" : "month"}</p>
                </div>
                <div className="space-y-2">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
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
                    <p className="text-xs opacity-80">Save ~17%</p>
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

            {/* Number of Seats */}
            <div>
              <Label htmlFor="seats" className="text-base font-medium">
                Number of Seats
              </Label>
              <div className="flex items-center gap-4 mt-2">
                <Button
                  variant="outline"
                  onClick={() => setSeats(Math.max(currentTier.minSeats, seats - 1))}
                  disabled={seats <= currentTier.minSeats}
                >
                  -
                </Button>
                <Input
                  id="seats"
                  type="number"
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value) || currentTier.minSeats)}
                  min={currentTier.minSeats}
                  max={currentTier.maxSeats}
                  className="text-center text-xl font-bold"
                />
                <Button
                  variant="outline"
                  onClick={() => setSeats(Math.min(currentTier.maxSeats, seats + 1))}
                  disabled={seats >= currentTier.maxSeats}
                >
                  +
                </Button>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                {currentTier.name} tier: {currentTier.minSeats}-{currentTier.maxSeats === 1000 ? "unlimited" : currentTier.maxSeats} seats
              </p>
            </div>

            {/* Price Summary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
              <h3 className="font-semibold text-slate-900 mb-4">Price Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-700">
                    ${pricePerSeat} × {seats} seats
                  </span>
                  <span className="font-medium text-slate-900">
                    ${totalPrice.toFixed(2)}/{billingCycle === "annual" ? "year" : "month"}
                  </span>
                </div>
                {billingCycle === "annual" && annualSavings > 0 && (
                  <div className="flex justify-between text-green-600 font-medium">
                    <span>Annual savings</span>
                    <span>${annualSavings}</span>
                  </div>
                )}
                <div className="border-t border-blue-200 pt-3 flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-blue-600">
                    ${totalPrice.toFixed(2)}/{billingCycle === "annual" ? "year" : "month"}
                  </span>
                </div>
              </div>
            </div>

            {/* Features Included */}
            <Alert className="bg-white border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-slate-700">
                <strong>Included with all licenses:</strong> Admin dashboard, usage tracking, bulk user management, 
                email invitations, and all premium GeneMap features.
              </AlertDescription>
            </Alert>

            {/* Purchase Button */}
            <Button
              onClick={handlePurchase}
              disabled={isProcessing || !organizationName.trim()}
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
                  Purchase {currentTier.name} License - ${totalPrice.toFixed(2)}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">
              Secure payment powered by Stripe • Cancel anytime • Full access from day one
            </p>
          </CardContent>
        </Card>

        {/* Contact CTA */}
        <Card className="mt-8 max-w-4xl mx-auto bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="pt-6 text-center">
            <Mail className="w-12 h-12 mx-auto mb-4 text-purple-600" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Need a Custom Enterprise Plan?
            </h3>
            <p className="text-slate-600 mb-4">
              For organizations with 100+ users or custom requirements, we offer tailored solutions.
            </p>
            <Button variant="outline" className="gap-2">
              <Mail className="w-4 h-4" />
              Contact Sales: sales@genemap.com
            </Button>
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
                  Use the admin dashboard to send email invitations. Users will get premium access upon accepting.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">Can I change tiers later?</h4>
                <p className="text-sm text-slate-600">
                  Yes! Contact support and we'll help you upgrade or adjust your seat count as needed.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">What happens if I exceed my seats?</h4>
                <p className="text-sm text-slate-600">
                  You can easily purchase additional seats through the admin dashboard or contact support.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold text-slate-900 mb-2">Is there a free trial?</h4>
                <p className="text-sm text-slate-600">
                  Yes! Contact sales for a 14-day trial with full access for your team.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}