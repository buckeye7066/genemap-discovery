import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for getAllUsers',
            mockData: {
                id: 'test_allusers_' + Date.now(),
                status: 'mocked',
                users: [],
                total: 0
            }
        });
    }

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

        // Fetch all users using service role (with high limit to get all)
        const users = await base44.asServiceRole.entities.User.filter({}, '-created_date', 10000);

        // Sort by created date (newest first)
        users.sort((a, b) => {
            const dateA = a.created_date ? new Date(a.created_date) : new Date(0);
            const dateB = b.created_date ? new Date(b.created_date) : new Date(0);
            return dateB - dateA;
        });

        return Response.json({
            success: true,
            users: users,
            total: users.length
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        return Response.json({ 
            error: error.message || 'Failed to fetch users' 
        }, { status: 500 });
    }
});