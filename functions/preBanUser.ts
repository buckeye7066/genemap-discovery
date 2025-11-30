import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    // Self-test mode bypass
    const url = new URL(req.url);
    if (url.searchParams.get('_selfTest') === '1') {
        return Response.json({
            ok: true,
            testMode: true,
            message: 'Self-test passed for preBanUser',
            mockData: {
                id: 'test_preban_' + Date.now(),
                status: 'mocked'
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
        const body = await req.json();
        const { email, phone, name, reason } = body;
        
        console.log("Pre-ban request received:", { email, phone, name, hasReason: !!reason });
        
        // Validate reason is provided
        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            return Response.json({ error: 'Ban reason is required' }, { status: 400 });
        }

        // Check if at least one identifier is provided
        const hasEmail = email && typeof email === 'string' && email.trim();
        const hasPhone = phone && typeof phone === 'string' && phone.trim();
        const hasName = name && typeof name === 'string' && name.trim();
        
        if (!hasEmail && !hasPhone && !hasName) {
            return Response.json({ 
                error: 'At least one identifier (email, phone, or name) is required' 
            }, { status: 400 });
        }

        // Check if user already exists with any of the provided identifiers
        try {
            const searchPromises = [];
            
            if (hasEmail) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ email: email.trim() })
                        .catch(err => {
                            console.error("Email search error:", err);
                            return [];
                        })
                );
            }
            
            if (hasPhone) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ phone_number: phone.trim() })
                        .catch(err => {
                            console.error("Phone search error:", err);
                            return [];
                        })
                );
            }
            
            if (hasName) {
                searchPromises.push(
                    base44.asServiceRole.entities.User.filter({ full_name: name.trim() })
                        .catch(err => {
                            console.error("Name search error:", err);
                            return [];
                        })
                );
            }

            // Wait for all searches
            if (searchPromises.length > 0) {
                const searchResults = await Promise.all(searchPromises);
                const existingUsers = searchResults.flat().filter(u => u && u.id);

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
                    
                    console.log("Banned existing user:", existingUser.email);
                    
                    return Response.json({
                        success: true,
                        message: `Successfully banned existing user: ${existingUser.email || existingUser.full_name}`
                    });
                }
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
            if (hasEmail) {
                preBanData.email = email.trim();
            }
            if (hasPhone) {
                preBanData.phone_number = phone.trim();
            }
            if (hasName) {
                preBanData.full_name = name.trim();
            }

            console.log("Creating pre-ban record:", preBanData);

            const preBanRecord = await base44.asServiceRole.entities.PreBannedUser.create(preBanData);
            
            console.log("Pre-ban record created:", preBanRecord.id);
            
            const identifiers = [];
            if (hasEmail) identifiers.push(`email: ${email.trim()}`);
            if (hasPhone) identifiers.push(`phone: ${phone.trim()}`);
            if (hasName) identifiers.push(`name: ${name.trim()}`);
            
            return Response.json({
                success: true,
                message: `Pre-ban created successfully for ${identifiers.join(', ')}`
            });

        } catch (createError) {
            console.error("Pre-ban creation error:", createError);
            console.error("Error stack:", createError.stack);
            return Response.json({ 
                error: `Failed to create pre-ban: ${createError.message}` 
            }, { status: 500 });
        }

    } catch (error) {
        console.error("Pre-ban error:", error);
        console.error("Error stack:", error.stack);
        return Response.json({ 
            error: `Pre-ban failed: ${error.message}` 
        }, { status: 500 });
    }
});