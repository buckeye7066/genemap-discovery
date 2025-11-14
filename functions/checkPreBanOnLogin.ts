import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify the requesting user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is already banned
        if (user.banned) {
            console.log("User already banned:", user.email);
            return Response.json({
                banned: true,
                reason: user.ban_reason || 'Account suspended',
                message: 'User is already banned'
            });
        }

        // Check if this user matches any pre-ban records
        console.log("Checking pre-bans for user:", { 
            email: user.email, 
            phone: user.phone_number, 
            name: user.full_name 
        });

        const preBans = await base44.asServiceRole.entities.PreBannedUser.filter({
            status: 'active'
        });

        console.log(`Found ${preBans.length} active pre-ban records`);

        let matchedPreBan = null;

        // Check each pre-ban record for a match
        for (const preBan of preBans) {
            let matches = false;
            let matchReason = "";
            
            // Check email match
            if (preBan.email && user.email && 
                preBan.email.toLowerCase() === user.email.toLowerCase()) {
                matches = true;
                matchReason = `email: ${preBan.email}`;
            }
            
            // Check phone match
            if (preBan.phone_number && user.phone_number && 
                preBan.phone_number === user.phone_number) {
                matches = true;
                matchReason = `phone: ${preBan.phone_number}`;
            }
            
            // Check name match (case-insensitive)
            if (preBan.full_name && user.full_name && 
                preBan.full_name.toLowerCase() === user.full_name.toLowerCase()) {
                matches = true;
                matchReason = `name: ${preBan.full_name}`;
            }
            
            if (matches) {
                console.log("Pre-ban match found:", matchReason);
                matchedPreBan = preBan;
                break;
            }
        }

        // If a match was found, ban the user
        if (matchedPreBan) {
            console.log("Banning user due to pre-ban match:", user.email);
            
            try {
                // Ban the user
                await base44.asServiceRole.entities.User.update(user.id, {
                    banned: true,
                    ban_reason: matchedPreBan.ban_reason,
                    banned_date: new Date().toISOString(),
                    banned_by: matchedPreBan.banned_by
                });

                console.log("User banned successfully");

                // Update pre-ban status to triggered
                await base44.asServiceRole.entities.PreBannedUser.update(matchedPreBan.id, {
                    status: 'triggered'
                });

                console.log("Pre-ban record updated to triggered");

                return Response.json({
                    banned: true,
                    reason: matchedPreBan.ban_reason,
                    message: 'Your account has been suspended due to a pre-existing ban.'
                });
            } catch (banError) {
                console.error("Error banning user:", banError);
                return Response.json({
                    error: `Failed to ban user: ${banError.message}`
                }, { status: 500 });
            }
        }

        // No pre-ban match found
        console.log("No pre-ban matches found for user:", user.email);
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