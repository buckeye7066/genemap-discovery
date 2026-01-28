export async function createAuditLog(prisma, { userId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata || {},
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error.message);
  }
}
