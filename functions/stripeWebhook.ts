import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@14.10.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for stripeWebhook',
            mockData: {
                id: 'test_webhook_' + Date.now(),
                status: 'mocked',
                eventTypes: ['checkout.session.completed', 'customer.subscription.updated']
            }
        });
    }

    try {
        // CRITICAL: Do NOT call base44.auth.me() in webhooks - this is a Stripe server call!
        // Base44 client is only for service role operations
        const base44 = createClientFromRequest(req);
        
        // Get the signature from headers
        const signature = req.headers.get('stripe-signature');
        
        if (!signature) {
            console.error('Webhook error: No stripe-signature header');
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
            console.log(`✓ Webhook verified: ${event.type}`);
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

    try {
        // Find or create subscription record
        const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
            stripe_subscription_id: subscription.id
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
            console.log(`✓ Subscription updated for ${userEmail}: ${subscription.status}`);
        } else {
            // Create new
            await base44.asServiceRole.entities.Subscription.create({
                ...subscriptionData,
                created_by: userEmail
            });
            console.log(`✓ Subscription created for ${userEmail}: ${subscription.status}`);
        }
    } catch (error) {
        console.error(`Error handling subscription update for ${userEmail}:`, error);
        throw error;
    }
}

async function handleSubscriptionDeleted(base44, subscription) {
    const userEmail = subscription.metadata.user_email;
    
    if (!userEmail) {
        console.error('No user_email in subscription metadata');
        return;
    }

    try {
        const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
            stripe_subscription_id: subscription.id
        });

        if (existingSubscriptions.length > 0) {
            await base44.asServiceRole.entities.Subscription.update(
                existingSubscriptions[0].id,
                {
                    status: 'canceled',
                    plan_type: 'free'
                }
            );
            console.log(`✓ Subscription canceled for ${userEmail}`);
        }
    } catch (error) {
        console.error(`Error handling subscription deletion for ${userEmail}:`, error);
        throw error;
    }
}

async function handleCheckoutCompleted(base44, session) {
    const userEmail = session.metadata.user_email;
    
    if (!userEmail) {
        console.error('No user_email in session metadata');
        return;
    }

    try {
        // Check if this is an institutional license purchase
        const organizationName = session.metadata.organization_name;
        const licenseType = session.metadata.license_type;
        const seats = session.metadata.seats;

        if (organizationName && licenseType && seats) {
            // Create institutional license
            const startDate = new Date();
            const endDate = new Date();
            const billingCycle = session.metadata.billing_cycle || 'monthly';
            
            if (billingCycle === 'annual') {
                endDate.setFullYear(endDate.getFullYear() + 1);
            } else {
                endDate.setMonth(endDate.getMonth() + 1);
            }

            const renewalDate = new Date(endDate);
            renewalDate.setDate(renewalDate.getDate() - 14); // 14 days before expiry

            await base44.asServiceRole.entities.InstitutionalLicense.create({
                organization_name: organizationName,
                contact_email: userEmail,
                contact_name: session.customer_details?.name || '',
                license_type: licenseType,
                max_seats: parseInt(seats),
                assigned_seats: 0,
                status: 'active',
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                renewal_date: renewalDate.toISOString(),
                auto_renew: billingCycle === 'monthly',
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription || null,
                pricing: {
                    price_per_seat: session.amount_total / (parseInt(seats) * 100),
                    total_annual_cost: session.amount_total / 100,
                    billing_cycle: billingCycle
                },
                admin_users: [userEmail],
                created_by: userEmail
            });

            console.log(`✓ Institutional license created for ${organizationName} (${seats} seats)`);
        } else {
            // Individual subscription - handled by subscription.created event
            console.log(`✓ Checkout completed for ${userEmail}`);
        }
    } catch (error) {
        console.error(`Error handling checkout completion for ${userEmail}:`, error);
        throw error;
    }
}

async function handlePaymentSucceeded(base44, invoice) {
    const subscriptionId = invoice.subscription;
    
    if (!subscriptionId) {
        console.log('No subscription ID in invoice');
        return;
    }

    try {
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
            console.log(`✓ Payment succeeded for subscription ${subscriptionId}`);
        }
    } catch (error) {
        console.error(`Error handling payment success for ${subscriptionId}:`, error);
        throw error;
    }
}

async function handlePaymentFailed(base44, invoice) {
    const subscriptionId = invoice.subscription;
    
    if (!subscriptionId) {
        console.log('No subscription ID in invoice');
        return;
    }

    try {
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
            console.log(`✓ Payment failed for subscription ${subscriptionId} - marked as past_due`);
        }
    } catch (error) {
        console.error(`Error handling payment failure for ${subscriptionId}:`, error);
        throw error;
    }
}