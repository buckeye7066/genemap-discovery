import { z } from 'zod';
import {
  CORRELATION_ID_PATTERN,
  REASON_CODE_PATTERN,
} from './publicationStatus.js';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const checkoutSessionSchema = z.object({
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
  organizationName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(320),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.number().int().min(5).max(1_000),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  createdAt: z.union([z.string().datetime(), z.date()]).optional(),
  display_name: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  education_level: z.enum([
    'elementary',
    'middle_school',
    'high_school',
    'undergraduate',
    'graduate',
    'postgraduate',
  ]).nullable().optional(),
  demographics_collected: z.boolean().optional(),
  mailing_list_opt_in: z.boolean().optional(),
  age: z.number().int().min(1).max(130).nullable().optional(),
  field_of_study: z.string().nullable().optional(),
  research_interests: z.string().nullable().optional(),
  current_projects: z.string().nullable().optional(),
  publications: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  orcid_id: z.string().nullable().optional(),
  profile_picture: z.string().nullable().optional(),
  banned: z.boolean().optional(),
  ban_reason: z.string().nullable().optional(),
  entitlements: z.object({
    tier: z.enum(['free', 'premium', 'institutional', 'admin']),
    isPremium: z.boolean(),
    isInstitutional: z.boolean(),
    isAdmin: z.boolean(),
    features: z.array(z.string().min(1)),
    limits: z.record(z.number().int().nonnegative()).nullable(),
    access: z.object({
      source: z.enum(['free', 'subscription', 'complimentary', 'institutional', 'admin']),
      expiresAt: z.string().datetime().nullable(),
      canManageBilling: z.boolean(),
    }),
    licenseInfo: z.object({
      organizationName: z.string(),
      licenseType: z.string(),
      accessType: z.enum(['seat', 'administrator']),
    }).strict().nullable(),
  }).strict().optional(),
});

export const publicationStatusSchema = z.enum([
  'available',
  'partial',
  'withheld',
  'unavailable',
  'superseded',
]);

export const publicationArtifactSchema = <T extends z.ZodTypeAny>(contentSchema: T) => z.object({
  contractVersion: z.literal(1),
  status: publicationStatusSchema,
  content: contentSchema.nullable(),
  reasonCode: z.string().regex(REASON_CODE_PATTERN).nullable(),
  correlationId: z.string().regex(CORRELATION_ID_PATTERN),
  limitations: z.array(z.string().min(1).refine(
    (value) => value === value.trim(),
    { message: 'Publication limitations must not contain leading or trailing whitespace.' },
  )),
}).strict().superRefine((artifact, context) => {
  const contentAllowed = artifact.status === 'available' || artifact.status === 'partial';
  if (contentAllowed !== (artifact.content !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: contentAllowed
        ? 'Available or partial artifacts require content.'
        : 'Non-publishable artifacts cannot carry content.',
    });
  }
  if (artifact.status === 'partial' && artifact.limitations.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: 'Partial artifacts require a visible limitation.',
    });
  }
  if (new Set(artifact.limitations).size !== artifact.limitations.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: 'Publication limitations must be unique.',
    });
  }
  if (artifact.status !== 'available' && artifact.reasonCode === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasonCode'],
      message: 'Non-available artifacts require a reason code.',
    });
  }
});

// ─── Inferred Types from Schemas ────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CheckoutSessionInput = z.infer<typeof checkoutSessionSchema>;
export type PortalSessionInput = z.infer<typeof portalSessionSchema>;
export type InstitutionalCheckoutInput = z.infer<typeof institutionalCheckoutSchema>;
export type UserFromSchema = z.infer<typeof userSchema>;
