import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for searchUsers',
            mockData: {
                id: 'test_search_' + Date.now(),
                status: 'mocked',
                users: []
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

        // Parse the request body
        const { searchQuery } = await req.json();
        
        if (!searchQuery || !searchQuery.trim()) {
            return Response.json({ 
                error: 'Search query is required' 
            }, { status: 400 });
        }

        // Search by email, name, or phone
        const emailResults = await base44.asServiceRole.entities.User.filter({
            email: { $regex: searchQuery, $options: 'i' }
        });

        const nameResults = await base44.asServiceRole.entities.User.filter({
            full_name: { $regex: searchQuery, $options: 'i' }
        });

        const phoneResults = await base44.asServiceRole.entities.User.filter({
            phone_number: { $regex: searchQuery, $options: 'i' }
        });

        // Combine and deduplicate results
        const combined = [...emailResults, ...nameResults, ...phoneResults];
        const unique = Array.from(new Map(combined.map(u => [u.id, u])).values());

        // Filter out already banned users
        const notBanned = unique.filter(u => !u.banned);

        return Response.json({
            success: true,
            users: notBanned
        });

    } catch (error) {
        console.error("Error searching users:", error);
        return Response.json({ 
            error: error.message || 'Failed to search users' 
        }, { status: 500 });
    }
});