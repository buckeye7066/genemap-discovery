/**
 * Persist an audit log entry.
 *
 * `required: true` makes the call fatal if the insert fails. Use it for
 * security-sensitive actions (admin grants, bans, billing, medical-data
 * access) where silently swallowing a write is not acceptable. Routine
 * activity logs default to best-effort so a non-critical persistence
 * issue cannot take down the rest of the request.
 */
export async function createAuditLog(
  prisma,
  { userId, action, entityType, entityId, metadata },
  { required = false } = {}
) {
  try {
    return await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata || {},
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        component: 'audit',
        message: 'Failed to create audit log',
        action,
        required,
      })
    );
    if (required) throw error;
    return null;
  }
}
