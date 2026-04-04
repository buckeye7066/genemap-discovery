import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const checkoutSessionSchema = z.object({
  priceId: z.string().optional(),
  plan: z.enum(['monthly', 'yearly']).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

export const portalSessionSchema = z.object({
  returnUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

export const institutionalCheckoutSchema = z.object({
  organizationName: z.string().min(1),
  contactEmail: z.string().email(),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.number().int().min(5),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  entitlements: z.object({
    isPremium: z.boolean(),
    licenseInfo: z.object({
      organizationName: z.string(),
      licenseType: z.string(),
    }).nullable(),
  }).optional(),
});

// ─── Inferred Types from Schemas ────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
export type PortalSessionInput = z.infer<typeof portalSessionSchema>;
export type InstitutionalCheckoutInput = z.infer<typeof institutionalCheckoutSchema>;
export type UserFromSchema = z.infer<typeof userSchema>;
