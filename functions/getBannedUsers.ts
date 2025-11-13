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

        // Fetch all banned users using service role
        const bannedUsers = await base44.asServiceRole.entities.User.filter({
            banned: true
        });

        return Response.json({
            success: true,
            users: bannedUsers
        });

    } catch (error) {
        console.error("Error fetching banned users:", error);
        return Response.json({ 
            error: error.message || 'Failed to fetch banned users' 
        }, { status: 500 });
    }
});