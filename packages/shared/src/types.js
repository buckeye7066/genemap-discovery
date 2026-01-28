export interface User {
  id: string;
  email: string;
  role: string;
  entitlements?: {
    isPremium: boolean;
    licenseInfo: {
      organizationName: string;
      licenseType: string;
    } | null;
  };
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CheckoutSessionRequest {
  priceId?: string;
  plan?: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  _selfTest?: boolean;
}

export interface PortalSessionRequest {
  returnUrl: string;
  _selfTest?: boolean;
}

export interface InstitutionalCheckoutRequest {
  organizationName: string;
  contactEmail: string;
  licenseType: 'team' | 'department' | 'enterprise';
  billing: 'monthly' | 'yearly';
  seats: number;
  successUrl: string;
  cancelUrl: string;
  _selfTest?: boolean;
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface PortalSessionResponse {
  url: string;
}
