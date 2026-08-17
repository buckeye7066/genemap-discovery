import Stripe from 'stripe';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';
import {
  assertCheckoutAllowed,
  recordCheckoutOrExpire,
} from '../services/accountClosureState.js';

const stripe = (() => {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not configured');
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
})();

function requireStripe() {
  if (!stripe) {
    console.error('Stripe not properly configured');
    throw new ValidationError('Stripe is not configured for this deployment');
  }
  return stripe;
}

/**
 * Build the price-id lookup table from server env. The previous implementation
 * accepted `priceId` directly off the request body; that lets a paying user
 * trick the API into checking out at any Stripe price they discover. We now
 * resolve a fixed set of plan keys to server-controlled price IDs.
 */
function priceIdsFromEnv() {
  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_YEARLY,
    team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY,
    department_monthly: process.env.STRIPE_PRICE_DEPT_MONTHLY,
    department_yearly: process.env.STRIPE_PRICE_DEPT_YEARLY,
    enterprise_monthly: process.env.STRIPE_PRICE_ENT_MONTHLY,
    enterprise_yearly: process.env.STRIPE_PRICE_ENT_YEARLY,
  };
}

function priceIdForKey(key) {
  const ids = priceIdsFromEnv();
  const id = ids[key];
  if (!id) {
    throw new ValidationError(`Plan '${key}' is not configured for this deployment`);
  }
  if (/^price_(monthly|yearly|team_|dept_|ent_)/.test(id)) {
    if (process.env.NODE_ENV === 'production') {
      throw new ValidationError(`Plan '${key}' is using a placeholder Stripe price ID`);
    }
  }
  return id;
}

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'yearly']).default('monthly'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const institutionalCheckoutSchema = z.object({
  organizationName: z.string().min(1),
  contactEmail: z.string().email(),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.number().int().min(5),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

function isStripeEventDuplicate(error) {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (!target) return false;
  const fields = Array.isArray(target) ? target : [String(target)];
  return fields.some((field) => field === 'stripeEventId' || field === 'stripe_event_id');
}

function assertAllowedRedirect(url, env) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Invalid redirect URL');
  }
  const allowed = env.corsAllowList();
  if (allowed.length === 0) {
    throw new ValidationError('No allowed redirect origins configured');
  }
  if (allowed.includes('*')) return;
  if (!allowed.includes(parsed.origin)) {
    throw new ForbiddenError('Redirect URL origin is not allowed');
  }
}

function selfTestEnabled() {
  return process.env.NODE_ENV === 'test';
}

export default async function billingRoutes(fastify) {
  const prisma = fastify.prisma;
  const env = fastify.env;

  fastify.post('/checkout-session', { preHandler: authenticate }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body);
    assertAllowedRedirect(body.successUrl, env);
    assertAllowedRedirect(body.cancelUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      return reply.send({
        url: `${body.successUrl}?session_id=mock_session_${Date.now()}`,
        sessionId: `mock_session_${Date.now()}`,
      });
    }

    const userId = request.user.userId;
    await assertCheckoutAllowed(prisma, userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ValidationError('User not found');
    }

    const priceId = priceIdForKey(body.plan);
    let customerId = null;
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existingSub?.stripeCustomerId) customerId = existingSub.stripeCustomerId;

    const sessionParams = {
      mode: 'subscription',
      customer: customerId || undefined,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: { userId: user.id },
    };

    const stripeClient = requireStripe();
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    await recordCheckoutOrExpire({
      prisma,
      stripeClient,
      userId: user.id,
      session,
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { plan: body.plan },
    });

    return reply.send({ url: session.url, sessionId: session.id });
  });

  fastify.post('/portal-session', { preHandler: authenticate }, async (request, reply) => {
    const body = portalSchema.parse(request.body);
    assertAllowedRedirect(body.returnUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      return reply.send({ url: body.returnUrl });
    }

    await assertCheckoutAllowed(prisma, request.user.userId);
    const subscription = await prisma.subscription.findFirst({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription?.stripeCustomerId) {
      throw new ValidationError('No active subscription found');
    }

    const session = await requireStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: body.returnUrl,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'billing.portal_accessed',
      entityType: 'subscription',
    }, { required: true });

    return reply.send({ url: session.url });
  });

  fastify.post('/institutional-checkout', { preHandler: authenticate }, async (request, reply) => {
    const body = institutionalCheckoutSchema.parse(request.body);
    assertAllowedRedirect(body.successUrl, env);
    assertAllowedRedirect(body.cancelUrl, env);

    if (selfTestEnabled() && request.body?._selfTest === true) {
      return reply.send({
        url: `${body.successUrl}?session_id=mock_institutional_${Date.now()}`,
        sessionId: `mock_institutional_${Date.now()}`,
      });
    }

    const userId = request.user.userId;
    await assertCheckoutAllowed(prisma, userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ValidationError('User not found');
    }

    const priceKey = `${body.licenseType}_${body.billing}`;
    const priceId = priceIdForKey(priceKey);
    const sessionParams = {
      mode: 'subscription',
      customer_email: body.contactEmail,
      line_items: [{ price: priceId, quantity: body.seats }],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: {
        userId: user.id,
        organizationName: body.organizationName,
        contactEmail: body.contactEmail,
        licenseType: body.licenseType,
        seats: String(body.seats),
        isInstitutional: 'true',
      },
    };

    const stripeClient = requireStripe();
    const session = await stripeClient.checkout.sessions.create(sessionParams);
    await recordCheckoutOrExpire({
      prisma,
      stripeClient,
      userId: user.id,
      session,
      action: 'billing.institutional_checkout_created',
      entityType: 'institutional_license',
      metadata: {
        organizationName: body.organizationName,
        licenseType: body.licenseType,
      },
    });

    return reply.send({ url: session.url, sessionId: session.id });
  });

  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) return reply.status(400).send({ error: 'Missing stripe-signature header' });
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return reply.status(400).send({ error: 'Webhook not configured' });
    }

    const stripeClient = stripe;
    if (!stripeClient) {
      console.error('STRIPE_SECRET_KEY not configured');
      return reply.status(500).send({ error: 'Stripe not configured' });
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }

    try {
      let prefetchedSubscription = null;
      if (event.type === 'checkout.session.completed') {
        const s = event.data.object;
        if (s.metadata?.isInstitutional !== 'true' && s.metadata?.userId && s.subscription) {
          prefetchedSubscription = await stripeClient.subscriptions.retrieve(s.subscription);
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.stripeEvent.create({
          data: { stripeEventId: event.id, type: event.type },
        });

        switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;

          if (session.metadata?.isInstitutional === 'true') {
            const subscriptionId = session.subscription;
            const customerId = session.customer;
            const pricing = {
              monthly:
                session.metadata.licenseType === 'team' ? 7.99 :
                session.metadata.licenseType === 'department' ? 6.99 : 5.99,
              yearly:
                session.metadata.licenseType === 'team' ? 79.99 :
                session.metadata.licenseType === 'department' ? 69.99 : 59.99,
            };

            const license = await tx.institutionalLicense.create({
              data: {
                organizationName: session.metadata.organizationName,
                contactEmail: session.metadata.contactEmail,
                licenseType: session.metadata.licenseType,
                maxSeats: parseInt(session.metadata.seats, 10),
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                renewalDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                autoRenew: true,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                pricing,
                adminUsers: [session.metadata.userId],
              },
            });

            await createAuditLog(tx, {
              userId: session.metadata.userId,
              action: 'license.created',
              entityType: 'institutional_license',
              entityId: license.id,
            });
          } else {
            const userId = session.metadata?.userId;
            if (!userId) break;
            const subscriptionId = session.subscription;
            const customerId = session.customer;
            const subscription = prefetchedSubscription;
            if (!subscription) break;

            await tx.subscription.create({
              data: {
                userId,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: subscription.status,
                planType: subscription.items.data[0]?.price?.recurring?.interval || 'month',
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              },
            });

            await createAuditLog(tx, {
              userId,
              action: 'subscription.created',
              entityType: 'subscription',
              entityId: subscriptionId,
            });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              status: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          await Promise.all([
            tx.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
            tx.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
          ]);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: invoice.subscription },
            data: {
              status: 'active',
              currentPeriodEnd: new Date(invoice.period_end * 1000),
            },
          });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: invoice.subscription },
            data: { status: 'past_due' },
          });
          break;
        }
        }
      });
    } catch (error) {
      if (isStripeEventDuplicate(error)) {
        return reply.send({ received: true, duplicate: true });
      }
      console.error('Error processing webhook:', error.message);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }

    return reply.send({ received: true });
  });
}
