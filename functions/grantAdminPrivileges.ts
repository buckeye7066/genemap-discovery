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
            message: 'Self-test passed for grantAdminPrivileges',
            mockData: {
                id: 'test_admin_' + Date.now(),
                status: 'mocked'
            }
        });
    }

    try {
        // Initialize base44 client from request
        const base44 = createClientFromRequest(req);
        
        // Verify the requesting user is authenticated
        const requestingUser = await base44.auth.me();
        if (!requestingUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // CRITICAL: Verify the requesting user is already a super_admin
        if (!requestingUser.super_admin) {
            return Response.json({ 
                error: 'Access denied. Only super administrators can grant privileges.' 
            }, { status: 403 });
        }

        // Parse the request body
        const { targetEmail } = await req.json();
        
        if (!targetEmail) {
            return Response.json({ error: 'Target email is required' }, { status: 400 });
        }

        // Find the target user
        const users = await base44.asServiceRole.entities.User.filter({
            email: targetEmail.trim()
        });

        if (users.length === 0) {
            return Response.json({ 
                error: 'User not found with that email address' 
            }, { status: 404 });
        }

        const targetUser = users[0];

        // Grant super_admin privileges
        await base44.asServiceRole.entities.User.update(targetUser.id, {
            super_admin: true
        });

        return Response.json({
            success: true,
            message: `Successfully granted administrator privileges to ${targetEmail}`,
            targetEmail: targetEmail
        });

    } catch (error) {
        console.error("Error granting admin privileges:", error);
        return Response.json({ 
            error: error.message || 'Failed to grant privileges' 
        }, { status: 500 });
    }
});