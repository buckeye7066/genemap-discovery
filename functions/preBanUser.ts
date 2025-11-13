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
        const { email, phone, name, reason } = await req.json();
        
        // Validate at least one identifier
        if (!email && !phone && !name) {
            return Response.json({ 
                error: 'At least one identifier (email, phone, or name) is required' 
            }, { status: 400 });
        }

        if (!reason || !reason.trim()) {
            return Response.json({ error: 'Ban reason is required' }, { status: 400 });
        }

        // Check if user already exists with any of the provided identifiers
        try {
            const searchPromises = [];
            
            if (email && email.trim()) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ email: email.trim() })
                );
            }
            
            if (phone && phone.trim()) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ phone_number: phone.trim() })
                );
            }
            
            if (name && name.trim()) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ full_name: name.trim() })
                );
            }

            // Wait for all searches with error handling
            const searchResults = await Promise.allSettled(searchPromises);
            const existingUsers = searchResults
                .filter(result => result.status === 'fulfilled')
                .flatMap(result => result.value || []);

            // Remove duplicates by user ID
            const uniqueUsers = Array.from(new Map(existingUsers.map(u => [u.id, u])).values());

            if (uniqueUsers.length > 0) {
                // User exists, ban them directly
                const existingUser = uniqueUsers[0];
                
                if (existingUser.banned) {
                    return Response.json({ 
                        error: `User ${existingUser.email || existingUser.full_name} is already banned` 
                    }, { status: 400 });
                }
                
                await base44.asServiceRole.entities.User.update(existingUser.id, {
                    banned: true,
                    ban_reason: reason.trim(),
                    banned_date: new Date().toISOString(),
                    banned_by: requestingUser.email
                });
                
                return Response.json({
                    success: true,
                    message: `Successfully banned existing user: ${existingUser.email || existingUser.full_name}`
                });
            }

        } catch (searchError) {
            console.error("Search error:", searchError);
            // Continue to pre-ban even if search fails
        }

        // User doesn't exist, create pre-ban entry
        try {
            const preBanData = {
                ban_reason: reason.trim(),
                banned_by: requestingUser.email,
                status: 'active'
            };

            // Only add fields that have values
            if (email && email.trim()) {
                preBanData.email = email.trim();
            }
            if (phone && phone.trim()) {
                preBanData.phone_number = phone.trim();
            }
            if (name && name.trim()) {
                preBanData.full_name = name.trim();
            }

            const preBanRecord = await base44.asServiceRole.entities.PreBannedUser.create(preBanData);
            
            const identifiers = [];
            if (email) identifiers.push(`email: ${email}`);
            if (phone) identifiers.push(`phone: ${phone}`);
            if (name) identifiers.push(`name: ${name}`);
            
            return Response.json({
                success: true,
                message: `Pre-ban created successfully for ${identifiers.join(', ')}`
            });

        } catch (createError) {
            console.error("Pre-ban creation error:", createError);
            return Response.json({ 
                error: `Failed to create pre-ban: ${createError.message}` 
            }, { status: 500 });
        }

    } catch (error) {
        console.error("Pre-ban error:", error);
        return Response.json({ 
            error: `Pre-ban failed: ${error.message}` 
        }, { status: 500 });
    }
});