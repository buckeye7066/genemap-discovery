import { z } from 'zod';
import { hashPassword, verifyPassword, generateAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/auth.js';
import { authenticate } from '../middleware/auth.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

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
        role: 'user',
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
    
    if (refreshToken) {
      await prisma.session.deleteMany({
        where: {
          userId: request.user.userId,
        },
      });
    }
    
    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'user.logout',
      entityType: 'user',
      entityId: request.user.userId,
    });
    
    reply
      .clearCookie('accessToken', { path: '/' })
      .clearCookie('refreshToken', { path: '/' })
      .send({ success: true });
  });
  
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      include: {
        subscriptions: {
          where: {
            status: {
              in: ['active', 'trialing'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });
    
    if (!user) {
      throw new UnauthorizedError('User not found');
    }
    
    const licenseAssignment = await prisma.licenseAssignment.findFirst({
      where: {
        userEmail: user.email,
        status: 'active',
      },
      include: {
        license: true,
      },
    });
    
    const isPremium = user.subscriptions.length > 0 || 
                      (licenseAssignment && licenseAssignment.license.status === 'active');
    
    const entitlements = {
      isPremium,
      licenseInfo: licenseAssignment ? {
        organizationName: licenseAssignment.license.organizationName,
        licenseType: licenseAssignment.license.licenseType,
      } : null,
    };
    
    reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      entitlements,
    });
  });
}
