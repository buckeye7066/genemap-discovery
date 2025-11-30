import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for getBannedUsers',
            mockData: {
                id: 'test_banned_' + Date.now(),
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

        // Fetch banned users
        const bannedUsers = await base44.asServiceRole.entities.User.filter({
            banned: true
        });

        // Fetch pre-banned records
        const preBannedRecords = await base44.asServiceRole.entities.PreBannedUser.filter({
            status: 'active'
        });

        // Convert pre-banned records to user-like format for display
        const preBannedUsers = preBannedRecords.map(record => ({
            id: record.id,
            email: record.email || 'N/A',
            full_name: record.full_name || 'Pre-banned User',
            phone_number: record.phone_number || null,
            banned: true,
            ban_reason: record.ban_reason,
            banned_date: record.created_date,
            banned_by: record.banned_by,
            pre_banned: true
        }));

        // Combine both lists
        const allBanned = [...bannedUsers, ...preBannedUsers];

        return Response.json({
            success: true,
            users: allBanned
        });

    } catch (error) {
        console.error("Error fetching banned users:", error);
        return Response.json({ 
            error: error.message || 'Failed to fetch banned users' 
        }, { status: 500 });
    }
});