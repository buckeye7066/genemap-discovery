import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate the requesting user
        const requestingUser = await base44.auth.me();
        if (!requestingUser) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const { email } = await req.json();
        
        if (!email || !email.trim()) {
            return Response.json({ error: 'Email address is required' }, { status: 400 });
        }

        // Use service role to find and update the user
        const users = await base44.asServiceRole.entities.User.filter({
            email: email.trim().toLowerCase()
        });

        if (users.length === 0) {
            return Response.json({ 
                error: 'User not found',
                details: 'No user exists with that email address. Please ensure the email is correct and the user has logged in at least once.'
            }, { status: 404 });
        }

        const targetUser = users[0];

        // Update user to super admin
        await base44.asServiceRole.entities.User.update(targetUser.id, {
            super_admin: true
        });

        return Response.json({ 
            success: true,
            message: `Successfully granted administrator privileges to ${email}`,
            user: {
                email: targetUser.email,
                id: targetUser.id,
                super_admin: true
            }
        });

    } catch (error) {
        console.error('Error granting admin privileges:', error);
        return Response.json({ 
            error: 'Failed to grant privileges',
            details: error.message 
        }, { status: 500 });
    }
});