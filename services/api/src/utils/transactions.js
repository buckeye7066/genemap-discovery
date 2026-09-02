const DEFAULT_ATTEMPTS = 3;

/**
 * Run a database mutation at PostgreSQL's serializable isolation level and
 * retry the serialization/deadlock conflict Prisma reports as P2034.
 *
 * Access-control mutations use this helper so their state change and required
 * audit receipt commit together. Retrying the whole transaction is important:
 * concurrent grants must be re-read after a conflict rather than applying a
 * decision made from stale entitlement state.
 */
export async function withSerializableRetry(
  prisma,
  operation,
  {
    attempts = DEFAULT_ATTEMPTS,
    maxWait = 5_000,
    timeout = 15_000,
  } = {},
) {
  let lastConflict;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
        maxWait,
        timeout,
      });
    } catch (error) {
      if (error?.code !== 'P2034') throw error;
      lastConflict = error;
    }
  }

  throw lastConflict;
}
