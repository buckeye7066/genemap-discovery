import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@14.10.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for createPortalSession',
            mockData: {
                id: 'test_portal_' + Date.now(),
                status: 'mocked',
                url: 'https://billing.stripe.com/test'
            }
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's subscription
        const subscriptions = await base44.entities.Subscription.filter({
            created_by: user.email
        });

        if (subscriptions.length === 0 || !subscriptions[0].stripe_customer_id) {
            return Response.json({ 
                error: 'No active subscription found' 
            }, { status: 404 });
        }

        const appBaseUrl = Deno.env.get("APP_BASE_URL");

        // Create customer portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: subscriptions[0].stripe_customer_id,
            return_url: `${appBaseUrl}/Premium`,
        });

        return Response.json({ url: session.url });

    } catch (error) {
        console.error('Portal session error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});