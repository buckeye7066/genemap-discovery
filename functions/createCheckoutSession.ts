import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@14.10.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { priceId } = await req.json();
        const appBaseUrl = Deno.env.get("APP_BASE_URL");

        // Create or retrieve Stripe customer
        let customerId = null;
        
        // Check if user already has a Stripe customer ID
        const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
            created_by: user.email
        });

        if (existingSubscriptions.length > 0 && existingSubscriptions[0].stripe_customer_id) {
            customerId = existingSubscriptions[0].stripe_customer_id;
        } else {
            // Create new Stripe customer
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: {
                    user_id: user.id,
                    user_email: user.email
                }
            });
            customerId = customer.id;
        }

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [
                {
                    price: priceId || Deno.env.get("STRIPE_PRICE_ID_MONTHLY"),
                    quantity: 1,
                },
            ],
            success_url: `${appBaseUrl}/Premium?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${appBaseUrl}/Premium?canceled=true`,
            subscription_data: {
                metadata: {
                    user_id: user.id,
                    user_email: user.email
                }
            },
            metadata: {
                user_id: user.id,
                user_email: user.email
            }
        });

        return Response.json({ 
            url: session.url,
            sessionId: session.id 
        });

    } catch (error) {
        console.error('Checkout session error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});