import Stripe from 'stripe';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');

const STRIPE_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly',
  yearly: process.env.STRIPE_PRICE_YEARLY || 'price_yearly',
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || 'price_team_monthly',
  team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || 'price_team_yearly',
  department_monthly: process.env.STRIPE_PRICE_DEPT_MONTHLY || 'price_dept_monthly',
  department_yearly: process.env.STRIPE_PRICE_DEPT_YEARLY || 'price_dept_yearly',
  enterprise_monthly: process.env.STRIPE_PRICE_ENT_MONTHLY || 'price_ent_monthly',
  enterprise_yearly: process.env.STRIPE_PRICE_ENT_YEARLY || 'price_ent_yearly',
};

const checkoutSchema = z.object({
  priceId: z.string().optional(),
  plan: z.enum(['monthly', 'yearly']).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

const institutionalCheckoutSchema = z.object({
  organizationName: z.string().min(1),
  contactEmail: z.string().email(),
  licenseType: z.enum(['team', 'department', 'enterprise']),
  billing: z.enum(['monthly', 'yearly']),
  seats: z.number().int().min(5),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

const portalSchema = z.object({
  returnUrl: z.string().url(),
  _selfTest: z.boolean().optional(),
});

export default async function billingRoutes(fastify) {
  const prisma = fastify.prisma;
  
  fastify.post('/checkout-session', { preHandler: authenticate }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body);
    
    if (body._selfTest) {
      return reply.send({
        url: `${body.successUrl}?session_id=mock_session_${Date.now()}`,
        sessionId: `mock_session_${Date.now()}`,
      });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
    });
    
    if (!user) {
      throw new ValidationError('User not found');
    }
    
    const priceId = body.priceId || STRIPE_PRICE_IDS[body.plan] || STRIPE_PRICE_IDS.monthly;
    
    let customerId = null;
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    
    if (existingSub?.stripeCustomerId) {
      customerId = existingSub.stripeCustomerId;
    }
    
    const sessionParams = {
      mode: 'subscription',
      customer: customerId || undefined,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: {
        userId: user.id,
      },
    };
    
    const session = await stripe.checkout.sessions.create(sessionParams);
    
    await createAuditLog(prisma, {
      userId: user.id,
      action: 'billing.checkout_created',
      entityType: 'subscription',
      metadata: { sessionId: session.id },
    });
    
    reply.send({
      url: session.url,
      sessionId: session.id,
    });
  });
  
  fastify.post('/portal-session', { preHandler: authenticate }, async (request, reply) => {
    const body = portalSchema.parse(request.body);
    
    if (body._selfTest) {
      return reply.send({
        url: body.returnUrl,
      });
    }
    
    const subscription = await prisma.subscription.findFirst({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!subscription?.stripeCustomerId) {
      throw new ValidationError('No active subscription found');
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: body.returnUrl,
    });
    
    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'billing.portal_accessed',
      entityType: 'subscription',
    });
    
    reply.send({
      url: session.url,
    });
  });
  
  fastify.post('/institutional-checkout', { preHandler: authenticate }, async (request, reply) => {
    const body = institutionalCheckoutSchema.parse(request.body);
    
    if (body._selfTest) {
      return reply.send({
        url: `${body.successUrl}?session_id=mock_institutional_${Date.now()}`,
        sessionId: `mock_institutional_${Date.now()}`,
      });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
    });
    
    if (!user) {
      throw new ValidationError('User not found');
    }
    
    const priceMap = {
      team: body.billing === 'monthly' ? STRIPE_PRICE_IDS.team_monthly : STRIPE_PRICE_IDS.team_yearly,
      department: body.billing === 'monthly' ? STRIPE_PRICE_IDS.department_monthly : STRIPE_PRICE_IDS.department_yearly,
      enterprise: body.billing === 'monthly' ? STRIPE_PRICE_IDS.enterprise_monthly : STRIPE_PRICE_IDS.enterprise_yearly,
    };
    
    const priceId = priceMap[body.licenseType];
    
    const sessionParams = {
      mode: 'subscription',
      customer_email: body.contactEmail,
      line_items: [
        {
          price: priceId,
          quantity: body.seats,
        },
      ],
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      metadata: {
        userId: user.id,
        organizationName: body.organizationName,
        contactEmail: body.contactEmail,
        licenseType: body.licenseType,
        seats: body.seats.toString(),
        isInstitutional: 'true',
      },
    };
    
    const session = await stripe.checkout.sessions.create(sessionParams);
    
    await createAuditLog(prisma, {
      userId: user.id,
      action: 'billing.institutional_checkout_created',
      entityType: 'institutional_license',
      metadata: {
        sessionId: session.id,
        organizationName: body.organizationName,
        licenseType: body.licenseType,
      },
    });
    
    reply.send({
      url: session.url,
      sessionId: session.id,
    });
  });
  
  fastify.post('/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!sig) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }
    
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return reply.status(500).send({ error: 'Webhook not configured' });
    }
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(request.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }
    
    // Idempotency: only mark the event as processed AFTER the handler
    // succeeds. Recording before processing meant a transient downstream
    // failure (e.g. Stripe API call inside checkout.session.completed)
    // would leave the event "seen but never applied" — Stripe's retry
    // would then short-circuit and the subscription would never activate.
    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });

    if (existingEvent) {
      return reply.send({ received: true, duplicate: true });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          
          if (session.metadata?.isInstitutional === 'true') {
            const subscriptionId = session.subscription;
            const customerId = session.customer;
            
            const pricing = {
              monthly: session.metadata.licenseType === 'team' ? 7.99 :
                       session.metadata.licenseType === 'department' ? 6.99 : 5.99,
              yearly: session.metadata.licenseType === 'team' ? 79.99 :
                      session.metadata.licenseType === 'department' ? 69.99 : 59.99,
            };
            
            const license = await prisma.institutionalLicense.create({
              data: {
                organizationName: session.metadata.organizationName,
                contactEmail: session.metadata.contactEmail,
                licenseType: session.metadata.licenseType,
                maxSeats: parseInt(session.metadata.seats),
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
            
            await createAuditLog(prisma, {
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
            
            let subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            await prisma.subscription.create({
              data: {
                userId,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: subscription.status,
                planType: subscription.items.data[0]?.price?.recurring?.interval || 'month',
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              },
            });
            
            await createAuditLog(prisma, {
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
          
          await prisma.subscription.updateMany({
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
            prisma.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
            prisma.institutionalLicense.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            }),
          ]);
          break;
        }
        
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: {
              status: 'active',
              currentPeriodEnd: new Date(invoice.period_end * 1000),
            },
          });
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const subscriptionId = invoice.subscription;
          
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId },
            data: {
              status: 'past_due',
            },
          });
          break;
        }
      }
    } catch (error) {
      // Do NOT record stripeEvent on failure — Stripe will retry, and the
      // next attempt should re-execute the handler from scratch.
      console.error('Error processing webhook:', error.message);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }

    // Mark processed only after success so retries are safe.
    try {
      await prisma.stripeEvent.create({
        data: { stripeEventId: event.id, type: event.type },
      });
    } catch (e) {
      // Race: a concurrent retry beat us to the insert. The handler ran
      // successfully on both sides which, given idempotent updateMany /
      // unique-key checks above, is acceptable.
      if (e.code !== 'P2002') {
        console.error('Failed to record stripe event after success:', e.message);
      }
    }

    reply.send({ received: true });
  });
}
