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
        const { userId } = await req.json();
        
        if (!userId) {
            return Response.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Unban the user
        await base44.asServiceRole.entities.User.update(userId, {
            banned: false,
            ban_reason: null,
            banned_date: null,
            banned_by: null
        });

        return Response.json({
            success: true,
            message: 'User unbanned successfully'
        });

    } catch (error) {
        console.error("Error unbanning user:", error);
        return Response.json({ 
            error: error.message || 'Failed to unban user' 
        }, { status: 500 });
    }
});