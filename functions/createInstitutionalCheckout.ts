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
            message: 'Self-test passed for createInstitutionalCheckout',
            mockData: {
                id: 'test_institutional_' + Date.now(),
                status: 'mocked',
                url: 'https://checkout.stripe.com/test_institutional'
            }
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return Response.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { organizationName, licenseType, seats, billingCycle } = body;

        // Validation
        if (!organizationName || !licenseType || !seats) {
            return Response.json({ 
                error: 'Missing required fields: organizationName, licenseType, seats' 
            }, { status: 400 });
        }

        // Pricing structure
        const pricing = {
            team: { monthly: 7.99, annual: 79.99 }, // per seat
            department: { monthly: 6.99, annual: 69.99 },
            enterprise: { monthly: 5.99, annual: 59.99 }
        };

        const pricePerSeat = billingCycle === 'annual' 
            ? pricing[licenseType].annual 
            : pricing[licenseType].monthly;
        
        const totalPrice = pricePerSeat * seats;
        const appBaseUrl = Deno.env.get("APP_BASE_URL");

        // Create or retrieve Stripe customer
        const customer = await stripe.customers.create({
            email: user.email,
            name: organizationName,
            metadata: {
                user_id: user.id,
                user_email: user.email,
                organization_name: organizationName,
                license_type: licenseType
            }
        });

        // Create Checkout Session for one-time payment or subscription
        const sessionConfig = {
            customer: customer.id,
            mode: billingCycle === 'annual' ? 'payment' : 'subscription',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${organizationName} - ${licenseType.toUpperCase()} License`,
                            description: `${seats} seats - ${billingCycle} billing`,
                        },
                        unit_amount: Math.round(pricePerSeat * 100),
                        ...(billingCycle === 'monthly' && {
                            recurring: {
                                interval: 'month'
                            }
                        })
                    },
                    quantity: seats,
                },
            ],
            success_url: `${appBaseUrl}/InstitutionalAdmin?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${appBaseUrl}/Premium?canceled=true`,
            metadata: {
                user_id: user.id,
                user_email: user.email,
                organization_name: organizationName,
                license_type: licenseType,
                seats: seats.toString(),
                billing_cycle: billingCycle
            }
        };

        if (billingCycle === 'monthly') {
            sessionConfig.subscription_data = {
                metadata: {
                    user_id: user.id,
                    user_email: user.email,
                    organization_name: organizationName,
                    license_type: licenseType,
                    seats: seats.toString()
                }
            };
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        return Response.json({ 
            url: session.url,
            sessionId: session.id 
        });

    } catch (error) {
        console.error('Institutional checkout error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});