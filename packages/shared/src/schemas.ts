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
