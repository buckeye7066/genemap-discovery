import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@14.10.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get the signature from headers
        const signature = req.headers.get('stripe-signature');
        
        if (!signature) {
            return Response.json({ error: 'No signature' }, { status: 400 });
        }

        // Get raw body for signature verification
        const body = await req.text();

        let event;
        try {
            event = await stripe.webhooks.constructEventAsync(
                body,
                signature,
                webhookSecret
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return Response.json({ error: 'Invalid signature' }, { status: 400 });
        }

        // Handle the event
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(base44, event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(base44, event.data.object);
                break;

            case 'checkout.session.completed':
                await handleCheckoutCompleted(base44, event.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(base44, event.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(base44, event.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return Response.json({ received: true });

    } catch (error) {
        console.error('Webhook error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});

async function handleSubscriptionUpdate(base44, subscription) {
    const userEmail = subscription.metadata.user_email;
    
    if (!userEmail) {
        console.error('No user_email in subscription metadata');
        return;
    }

    // Find or create subscription record
    const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
        created_by: userEmail
    });

    const subscriptionData = {
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        plan_type: subscription.status === 'active' || subscription.status === 'trialing' ? 'premium' : 'free',
        expires_at: new Date(subscription.current_period_end * 1000).toISOString()
    };

    if (existingSubscriptions.length > 0) {
        // Update existing
        await base44.asServiceRole.entities.Subscription.update(
            existingSubscriptions[0].id,
            subscriptionData
        );
    } else {
        // Create new
        await base44.asServiceRole.entities.Subscription.create({
            ...subscriptionData,
            created_by: userEmail
        });
    }

    console.log(`Subscription ${subscription.status} for ${userEmail}`);
}

async function handleSubscriptionDeleted(base44, subscription) {
    const userEmail = subscription.metadata.user_email;
    
    if (!userEmail) {
        console.error('No user_email in subscription metadata');
        return;
    }

    const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
        created_by: userEmail
    });

    if (existingSubscriptions.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(
            existingSubscriptions[0].id,
            {
                status: 'canceled',
                plan_type: 'free'
            }
        );
    }

    console.log(`Subscription canceled for ${userEmail}`);
}

async function handleCheckoutCompleted(base44, session) {
    const userEmail = session.metadata.user_email;
    
    if (!userEmail) {
        console.error('No user_email in session metadata');
        return;
    }

    // Subscription will be handled by subscription.created event
    console.log(`Checkout completed for ${userEmail}`);
}

async function handlePaymentSucceeded(base44, invoice) {
    const customerId = invoice.customer;
    const subscriptionId = invoice.subscription;
    
    // Update subscription status to active
    const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
        stripe_subscription_id: subscriptionId
    });

    if (existingSubscriptions.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(
            existingSubscriptions[0].id,
            {
                status: 'active',
                plan_type: 'premium'
            }
        );
    }

    console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(base44, invoice) {
    const subscriptionId = invoice.subscription;
    
    // Update subscription status to past_due
    const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
        stripe_subscription_id: subscriptionId
    });

    if (existingSubscriptions.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(
            existingSubscriptions[0].id,
            {
                status: 'past_due'
            }
        );
    }

    console.log(`Payment failed for subscription ${subscriptionId}`);
}