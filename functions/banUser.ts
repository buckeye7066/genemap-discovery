import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify the requesting user is authenticated and is an admin
        const requestingUser = await base44.auth.me();
        if (!requestingUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!requestingUser.super_admin) {
            return Response.json({ 
                error: 'Administrator privileges required' 
            }, { status: 403 });
        }

        // Parse the request body
        const { userId, banReason } = await req.json();
        
        if (!userId) {
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }

        if (!banReason || !banReason.trim()) {
            return Response.json({ error: 'Ban reason is required' }, { status: 400 });
        }

        // Ban the user
        await base44.asServiceRole.entities.User.update(userId, {
            banned: true,
            ban_reason: banReason,
            banned_date: new Date().toISOString(),
            banned_by: requestingUser.email
        });

        return Response.json({
            success: true,
            message: 'User banned successfully'
        });

    } catch (error) {
        console.error("Error banning user:", error);
        return Response.json({ 
            error: error.message || 'Failed to ban user' 
        }, { status: 500 });
    }
});