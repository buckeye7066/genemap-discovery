import { createAuditLog } from '../utils/audit.js';

export function logMedicalAccess(action) {
  return async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = request.user?.userId || null;
    const routePath = request.routeOptions?.url || String(request.url || '').split('?')[0];
    const endpoint = `${request.method} ${routePath}`;
    const ipAddress = request.ip || request.headers['x-forwarded-for'] || 'unknown';

    await createAuditLog(
      prisma,
      {
        userId,
        action,
        entityType: 'medical_data',
        entityId: request.params?.id || null,
        metadata: {
          endpoint,
          ipAddress,
          timestamp: new Date().toISOString(),
          userAgent: request.headers['user-agent'] || null,
        },
      },
      { required: true },
    );
  };
}
