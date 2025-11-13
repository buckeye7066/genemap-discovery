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
        let existingUsers = [];
        
        if (email) {
            const emailUsers = await base44.asServiceRole.entities.User.filter({
                email: email.trim()
            });
            existingUsers = [...existingUsers, ...emailUsers];
        }
        
        if (phone && existingUsers.length === 0) {
            const phoneUsers = await base44.asServiceRole.entities.User.filter({
                phone_number: phone.trim()
            });
            existingUsers = [...existingUsers, ...phoneUsers];
        }
        
        if (name && existingUsers.length === 0) {
            const nameUsers = await base44.asServiceRole.entities.User.filter({
                full_name: { $regex: name.trim(), $options: 'i' }
            });
            existingUsers = [...existingUsers, ...nameUsers];
        }

        // Remove duplicates
        const uniqueUsers = Array.from(new Map(existingUsers.map(u => [u.id, u])).values());

        if (uniqueUsers.length > 0) {
            // Ban existing user
            const existingUser = uniqueUsers[0];
            if (existingUser.banned) {
                return Response.json({ 
                    error: 'This user is already banned' 
                }, { status: 400 });
            }
            
            await base44.asServiceRole.entities.User.update(existingUser.id, {
                banned: true,
                ban_reason: reason,
                banned_date: new Date().toISOString(),
                banned_by: requestingUser.email
            });
            
            return Response.json({
                success: true,
                message: `Successfully banned ${existingUser.email || existingUser.full_name} (existing user)`
            });
        } else {
            // Create pre-ban record (not a User entity)
            await base44.asServiceRole.entities.PreBannedUser.create({
                email: email ? email.trim() : null,
                full_name: name ? name.trim() : null,
                phone_number: phone ? phone.trim() : null,
                ban_reason: reason,
                banned_by: requestingUser.email,
                status: 'active'
            });
            
            const identifiers = [];
            if (email) identifiers.push(`email: ${email}`);
            if (phone) identifiers.push(`phone: ${phone}`);
            if (name) identifiers.push(`name: ${name}`);
            
            return Response.json({
                success: true,
                message: `Successfully pre-banned ${identifiers.join(', ')} - they will be blocked on signup/login`
            });
        }

    } catch (error) {
        console.error("Error pre-banning user:", error);
        return Response.json({ 
            error: error.message || 'Failed to pre-ban user' 
        }, { status: 500 });
    }
});