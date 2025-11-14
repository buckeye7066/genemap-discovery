import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify the requesting user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if this user matches any pre-ban records
        const preBans = await base44.asServiceRole.entities.PreBannedUser.filter({
            status: 'active'
        });

        let matchedPreBan = null;

        // Check each pre-ban record for a match
        for (const preBan of preBans) {
            let matches = false;
            
            // Check email match
            if (preBan.email && user.email && 
                preBan.email.toLowerCase() === user.email.toLowerCase()) {
                matches = true;
            }
            
            // Check phone match
            if (preBan.phone_number && user.phone_number && 
                preBan.phone_number === user.phone_number) {
                matches = true;
            }
            
            // Check name match (case-insensitive)
            if (preBan.full_name && user.full_name && 
                preBan.full_name.toLowerCase() === user.full_name.toLowerCase()) {
                matches = true;
            }
            
            if (matches) {
                matchedPreBan = preBan;
                break;
            }
        }

        // If a match was found, ban the user
        if (matchedPreBan) {
            // Ban the user
            await base44.asServiceRole.entities.User.update(user.id, {
                banned: true,
                ban_reason: matchedPreBan.ban_reason,
                banned_date: new Date().toISOString(),
                banned_by: matchedPreBan.banned_by
            });

            // Update pre-ban status to triggered
            await base44.asServiceRole.entities.PreBannedUser.update(matchedPreBan.id, {
                status: 'triggered'
            });

            return Response.json({
                banned: true,
                reason: matchedPreBan.ban_reason,
                message: 'Your account has been suspended due to a pre-existing ban.'
            });
        }

        // No pre-ban match found
        return Response.json({
            banned: false,
            message: 'No pre-ban matches found'
        });

    } catch (error) {
        console.error("Pre-ban check error:", error);
        return Response.json({ 
            error: error.message || 'Failed to check pre-ban status' 
        }, { status: 500 });
    }
});