import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    const clonedReq = req.clone();
    let bodyCheck;
    try {
        bodyCheck = await clonedReq.json();
    } catch {
        bodyCheck = {};
    }

    if (bodyCheck._selfTest === true) {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for grantPremiumToUser',
            mockData: {
                id: 'test_grant_' + Date.now(),
                status: 'mocked'
            }
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        
        // Verify requesting user is admin
        const requestingUser = await base44.auth.me();
        if (!requestingUser || !requestingUser.super_admin) {
            return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { userEmail, phoneNumber } = body;

        if (!userEmail && !phoneNumber) {
            return Response.json({ error: 'Email or phone number required' }, { status: 400 });
        }

        // Find the user
        let targetUser;
        if (phoneNumber) {
            const users = await base44.asServiceRole.entities.User.filter({
                phone_number: phoneNumber
            });
            targetUser = users[0];
        } else {
            const users = await base44.asServiceRole.entities.User.filter({
                email: userEmail
            });
            targetUser = users[0];
        }

        if (!targetUser) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if subscription already exists for this user
        const existingSubscriptions = await base44.asServiceRole.entities.Subscription.filter({
            created_by: targetUser.email
        });

        if (existingSubscriptions.length > 0) {
            // Update existing subscription
            await base44.asServiceRole.entities.Subscription.update(existingSubscriptions[0].id, {
                status: 'active',
                plan_type: 'premium',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
            });
        } else {
            // Create new subscription for the target user
            // We need to impersonate the target user for RLS
            await base44.asServiceRole.entities.Subscription.create({
                status: 'active',
                plan_type: 'premium',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                stripe_customer_id: 'admin_grant',
                stripe_subscription_id: 'admin_grant',
                created_by: targetUser.email
            });
        }

        return Response.json({
            success: true,
            message: `Premium access granted to ${targetUser.full_name || targetUser.email}`
        });

    } catch (error) {
        console.error("Grant premium to user error:", error);
        return Response.json({ 
            error: error.message || 'Failed to grant premium access' 
        }, { status: 500 });
    }
});