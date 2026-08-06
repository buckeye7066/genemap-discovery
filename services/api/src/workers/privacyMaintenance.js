import { PrismaClient } from '@prisma/client';
import { runPrivacyMaintenance } from '../services/privacyMaintenance.js';

const prisma = new PrismaClient();

try {
  const summary = await runPrivacyMaintenance(prisma);
  // Aggregate-only output: never log request ids, subject references, errors,
  // profile fields, or deleted content.
  console.log(JSON.stringify({ event: 'privacy_maintenance_completed', ...summary }));
  if (summary.retryScheduled > 0 || summary.operatorReview > 0 || summary.stale > 0) {
    process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({ event: 'privacy_maintenance_failed' }));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
