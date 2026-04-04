import { z } from 'zod';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'buckeye7066@gmail.com')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function resolveRole(email) {
  return ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user';
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export default async function authRoutes(fastify) {
  const prisma = fastify.prisma;
  
  fastify.post('/register', async (request, reply) => {
    const { email, password } = registerSchema.parse(request.body);
    
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    
    if (existingUser) {
      throw new ValidationError('Email already registered');
    }
    
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: resolveRole(email),
      },
    });
    
    await createAuditLog(prisma, {
      userId: user.id,
      action: 'user.register',
      entityType: 'user',
      entityId: user.id,
    });
    
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });
    
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
      },
    });
    
    reply
      .setCookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60,
        path: '/',
      })
      .setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })
      .send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
  });
  
  fastify.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    
    const user = await prisma.user.findUnique({
      where: { email },
    });
    
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if user is banned
    if (user.banned) {
      throw new UnauthorizedError('Account has been suspended');
    }

    // Check pre-ban list
    const preBanMatch = await prisma.preBannedUser.findFirst({
      where: {
        status: 'active',
        OR: [
          { email: { equals: user.email, mode: 'insensitive' } },
          ...(user.phoneNumber ? [{ phoneNumber: user.phoneNumber }] : []),
          ...(user.fullName ? [{ fullName: { equals: user.fullName, mode: 'insensitive' } }] : []),
        ],
      },
    });

    if (preBanMatch) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          banned: true,
          banReason: preBanMatch.reason || 'Pre-ban triggered',
          bannedDate: new Date(),
          bannedBy: preBanMatch.bannedBy,
        },
      });
      await prisma.preBannedUser.update({
        where: { id: preBanMatch.id },
        data: { status: 'triggered', triggeredAt: new Date() },
      });
      throw new UnauthorizedError('Account has been suspended');
    }

    const expectedRole = resolveRole(user.email);
    if (expectedRole === 'admin' && user.role !== 'admin' && user.role !== 'super_admin') {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'admin' },
      });
      user.role = 'admin';
    }
    
    await createAuditLog(prisma, {
      userId: user.id,
      action: 'user.login',
      entityType: 'user',
      entityId: user.id,
    });
    
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id });
    
    const refreshTokenHash = await hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
      },
    });
    
    reply
      .setCookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60,
        path: '/',
      })
      .setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      })
      .send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
  });
  
  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    
    const logoutOps = [
      createAuditLog(prisma, {
        userId: request.user.userId,
        action: 'user.logout',
        entityType: 'user',
        entityId: request.user.userId,
      }),
    ];
    if (refreshToken) {
      logoutOps.push(
        prisma.session.deleteMany({
          where: { userId: request.user.userId },
        })
      );
    }
    await Promise.all(logoutOps);
    
    reply
      .clearCookie('accessToken', { path: '/' })
      .clearCookie('refreshToken', { path: '/' })
      .send({ success: true });
  });
  
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const [user, licenseAssignment] = await Promise.all([
      prisma.user.findUnique({
        where: { id: request.user.userId },
        include: {
          subscriptions: {
            where: { status: { in: ['active', 'trialing'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.licenseAssignment.findFirst({
        where: {
          userEmail: request.user.email,
          status: 'active',
        },
        include: { license: true },
      }),
    ]);
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isPremium = isAdmin || user.subscriptions.length > 0 || 
                      (licenseAssignment && licenseAssignment.license.status === 'active');
    
    const entitlements = {
      isPremium,
      isAdmin,
      licenseInfo: licenseAssignment ? {
        organizationName: licenseAssignment.license.organizationName,
        licenseType: licenseAssignment.license.licenseType,
      } : null,
    };
    
    reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.displayName || null,
      full_name: user.fullName || null,
      phone_number: user.phoneNumber || null,
      education_level: user.educationLevel || null,
      demographics_collected: user.demographicsCollected,
      banned: user.banned,
      ban_reason: user.banReason || null,
      entitlements,
    });
  });

  // PUT /auth/me — update user profile
  fastify.put('/me', { preHandler: authenticate }, async (request, reply) => {
    const { displayName, fullName, phoneNumber, educationLevel, demographicsCollected } = request.body || {};

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (fullName !== undefined) data.fullName = fullName;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
    if (educationLevel !== undefined) data.educationLevel = educationLevel;
    if (demographicsCollected !== undefined) data.demographicsCollected = demographicsCollected;

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'user.update_profile',
      entityType: 'user',
      entityId: request.user.userId,
      metadata: { fields: Object.keys(data) },
    });

    reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.displayName,
      full_name: user.fullName,
      education_level: user.educationLevel,
      demographics_collected: user.demographicsCollected,
    });
  });
}
