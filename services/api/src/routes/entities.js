import { authenticate } from '../middleware/auth.js';
import { requireFeature } from '../middleware/entitlements.js';
import { logMedicalAccess } from '../middleware/accessLog.js';
import { FEATURES } from '../config/entitlementCatalog.js';
import { createAuditLog } from '../utils/audit.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import {
  MEDICAL_DATA_STORAGE_CONSENT,
  requireLatestConsent,
  validateHealthRecordContent,
} from '../services/healthRecords.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function normalizeSeatEmails(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new ValidationError('At least one user email is required');
  }
  if (values.length > 100) throw new ValidationError('No more than 100 seats can be assigned at once');
  const emails = values.map(normalizeEmail);
  if (emails.some((email) => !EMAIL_ADDRESS.test(email))) {
    throw new ValidationError('Every seat assignment needs a valid email address');
  }
  if (new Set(emails).size !== emails.length) {
    throw new ValidationError('Duplicate email addresses are not allowed in one assignment request');
  }
  return emails;
}

function assertLicenseCanAssignSeats(license, now = new Date()) {
  const startDate = new Date(license?.startDate);
  const endDate = new Date(license?.endDate);
  if (
    license?.status !== 'active'
    || !Number.isFinite(startDate.getTime())
    || !Number.isFinite(endDate.getTime())
    || startDate > now
    || endDate <= now
  ) {
    throw new ValidationError('Seats can only be assigned to an active, current license');
  }
}

function publicOwnedLicense(license) {
  return {
    id: license.id,
    organizationName: license.organizationName,
    contactEmail: license.contactEmail,
    licenseType: license.licenseType,
    maxSeats: license.maxSeats,
    assignedSeats: license.assignedSeats,
    status: license.status,
    startDate: license.startDate,
    endDate: license.endDate,
    renewalDate: license.renewalDate,
    autoRenew: Boolean(license.autoRenew),
    canManageBilling: Boolean(license.stripeCustomerId),
    assignments: (license.assignments || []).map((assignment) => ({
      id: assignment.id,
      userEmail: assignment.userEmail,
      status: assignment.status,
      department: assignment.department || null,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
    })),
    usageLogs: (license.usageLogs || []).map((entry) => ({
      id: entry.id,
      userEmail: entry.userEmail,
      action: entry.action,
      createdAt: entry.createdAt,
    })),
  };
}

function publicSupportMessage(message, userId) {
  return {
    id: message.id,
    subject: message.subject,
    body: message.body,
    category: 'support',
    status: message.status,
    parentId: message.parentId || null,
    isIssue: message.metadata?.isIssue === true,
    direction: message.senderId === userId ? 'sent' : 'received',
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

async function assignLicenseSeats(prisma, { license, emails, department, assignedBy }) {
  const now = new Date();
  assertLicenseCanAssignSeats(license, now);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.licenseAssignment.findMany({
        where: { licenseId: license.id, userEmail: { in: emails }, status: 'active' },
      });
      if (existing.length) {
        throw new ValidationError('At least one user already has an active seat on this license');
      }

      // Reserve the complete batch with one conditional update. Either every
      // requested seat fits or none are written; a bulk operation cannot leave a
      // half-assigned organization after the first bad address or full seat pool.
      const updated = await tx.institutionalLicense.updateMany({
        where: {
          id: license.id,
          status: 'active',
          startDate: { lte: now },
          endDate: { gt: now },
          assignedSeats: { lte: license.maxSeats - emails.length },
        },
        data: { assignedSeats: { increment: emails.length } },
      });
      if (updated.count !== 1) throw new ValidationError('No available seats for this assignment');

      const assignments = [];
      for (const userEmail of emails) {
        assignments.push(await tx.licenseAssignment.create({
          data: {
            licenseId: license.id,
            userEmail,
            assignedBy,
            status: 'active',
            department: department || null,
          },
        }));
        await tx.licenseUsageLog.create({
          data: {
            licenseId: license.id,
            userEmail,
            action: 'seat_assigned',
            metadata: { assignedBy, department: department || null },
          },
        });
      }
      return assignments;
    });
  } catch (error) {
    // Production also has a partial unique index on active
    // (license_id,user_email). Translate a concurrent collision into the same
    // stable client error instead of leaking it as a 500.
    if (error?.code === 'P2002') {
      throw new ValidationError('At least one user already has an active seat on this license');
    }
    throw error;
  }
}

// Roles assignable to a project collaborator. 'owner' is intentionally excluded
// — ownership belongs to the project creator and is never granted via the
// collaborators endpoint.
const COLLABORATOR_ROLES = ['editor', 'viewer'];

// ─── Lightweight input bounds ────────────────────────────────────────────────
// Output of these routes is trusted; the *input* was not previously bounded, so
// a client could send a multi-megabyte string, a 100k-element `genes` array, or
// a giant `metadata` blob and consume memory / DB space unchecked. These guards
// bound the DoS vectors without changing any valid payload's behavior.
const LIMIT = {
  name: 300, // names, titles, types, short labels
  text: 20_000, // free text (queries, annotation bodies, message bodies)
  array: 5_000, // gene lists, etc.
  json: 256 * 1024, // serialized size of a metadata / content / results blob
};

function assertString(val, field, max = LIMIT.text) {
  if (val == null) return;
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`);
  if (val.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer`);
}
function assertStringArray(val, field, max = LIMIT.array) {
  if (val == null) return;
  if (!Array.isArray(val)) throw new ValidationError(`${field} must be an array`);
  if (val.length > max) throw new ValidationError(`${field} must contain ${max} items or fewer`);
  if (val.some((i) => typeof i !== 'string')) throw new ValidationError(`${field} must contain only strings`);
}
function assertJsonSize(val, field, max = LIMIT.json) {
  if (val == null) return;
  let serialized;
  try {
    serialized = JSON.stringify(val);
  } catch {
    throw new ValidationError(`${field} must be JSON-serializable`);
  }
  if (serialized.length > max) throw new ValidationError(`${field} is too large`);
}

function parseConsentChoice(value, index = null) {
  const field = index == null ? 'consent' : `choices[${index}]`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`);
  }
  const { consentType, version, granted, metadata } = value;
  if (!consentType || !version || granted === undefined) {
    throw new ValidationError(`${field}: consentType, version, and granted are required`);
  }
  assertString(consentType, `${field}.consentType`, LIMIT.name);
  assertString(version, `${field}.version`, LIMIT.name);
  if (typeof granted !== 'boolean') {
    throw new ValidationError(`${field}.granted must be a boolean`);
  }
  assertJsonSize(metadata, `${field}.metadata`);
  return { consentType, version, granted, metadata: metadata || null };
}

async function createConsentRecord(tx, request, choice) {
  const created = await tx.consentRecord.create({
    data: {
      userId: request.user.userId,
      ...choice,
      ipAddress: request.ip || request.headers['x-forwarded-for'] || null,
    },
  });
  await createAuditLog(tx, {
    userId: request.user.userId,
    action: 'consent_recorded',
    entityType: 'consent_record',
    entityId: created.id,
    metadata: {
      consentType: choice.consentType,
      version: choice.version,
      granted: choice.granted,
    },
  }, { required: true });
  return created;
}

/**
 * Centralised access guard for any project-scoped resource (versions,
 * annotations, collaborators). Owners always have access; collaborators
 * are checked against the requested role set. Throws NotFound for
 * non-existent projects and Forbidden for unauthorised users — never the
 * other way around (we don't want to leak project existence via 403 vs 404
 * to a user who can't see them).
 */
async function requireProjectAccess(prisma, projectId, userId, roles = ['owner', 'editor', 'viewer']) {
  const project = await prisma.researchProject.findUnique({
    where: { id: projectId },
    include: { collaborators: true },
  });

  if (!project) throw new NotFoundError('Project not found');

  if (project.userId === userId) return { project, role: 'owner' };

  // If the test mock did not populate `include`, fall back to the
  // collaborator table directly. Production Prisma always returns the
  // relation when include is set, so the second query is dead code at
  // runtime but keeps the helper portable.
  const collaborators = Array.isArray(project.collaborators)
    ? project.collaborators
    : await prisma.projectCollaborator.findMany({ where: { projectId } });

  const collab = collaborators.find((c) => c.userId === userId);
  if (!collab || !roles.includes(collab.role)) {
    throw new ForbiddenError('Project access denied');
  }

  return { project, role: collab.role };
}

const SELF_SERVICE_PURGE_TYPES = Object.freeze([
  'medicalData',
  'aiConversations',
  'searchHistory',
]);

const ENTITY_FEATURE_GUARDS = new Map([
  [FEATURES.RESEARCH_SEARCH, requireFeature(FEATURES.RESEARCH_SEARCH)],
  [FEATURES.RESEARCH_WORKSPACE, requireFeature(FEATURES.RESEARCH_WORKSPACE)],
  [FEATURES.HEALTH_RECORDS, requireFeature(FEATURES.HEALTH_RECORDS)],
  [FEATURES.PROFILE_ASSISTANTS, requireFeature(FEATURES.PROFILE_ASSISTANTS)],
  [FEATURES.INSTITUTION_MANAGEMENT, requireFeature(FEATURES.INSTITUTION_MANAGEMENT)],
]);

function featureForEntityRoute(routeUrl) {
  const path = String(routeUrl || '').split('?')[0];
  if (path.includes('/medical-data')) return FEATURES.HEALTH_RECORDS;
  if (path.includes('/conversations')) return FEATURES.PROFILE_ASSISTANTS;
  if (path.includes('/search-history')) return FEATURES.RESEARCH_SEARCH;
  if (path.includes('/gene-sets') || path.includes('/projects')) {
    return FEATURES.RESEARCH_WORKSPACE;
  }
  if (path.includes('/licenses')) return FEATURES.INSTITUTION_MANAGEMENT;
  return null;
}

async function enforceEntityFeature(request) {
  const feature = featureForEntityRoute(request.routeOptions?.url || request.url);
  if (!feature) return;
  await ENTITY_FEATURE_GUARDS.get(feature)(request);
}

/**
 * Process the currently implemented, limited content purge in one transaction.
 * This is not account closure or processor/backup deletion. Any partial
 * database failure rolls the purge back.
 */
async function processDeletionRequest(prisma, requestId) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.dataDeletionRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== 'pending') return null;

    await tx.medicalData.deleteMany({ where: { userId: req.userId } });
    await tx.aIConversation.deleteMany({ where: { userId: req.userId } });
    await tx.searchHistory.deleteMany({ where: { userId: req.userId } });

    return tx.dataDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        deletedTypes: [...SELF_SERVICE_PURGE_TYPES],
      },
    });
  });
}

export default async function entityRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', enforceEntityFeature);

  // ─── Search History ─────────────────────────────────────────
  fastify.get('/search-history', async (request) => {
    const entries = await prisma.searchHistory.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { entries };
  });

  fastify.post('/search-history', async (request) => {
    const { query, queryType, results } = request.body || {};
    if (!query) throw new ValidationError('query is required');
    assertString(query, 'query', LIMIT.text);
    assertString(queryType, 'queryType', LIMIT.name);
    assertJsonSize(results, 'results');

    const entry = await prisma.searchHistory.create({
      data: {
        userId: request.user.userId,
        query,
        queryType: queryType || 'general',
        results: results || null,
      },
    });
    return { entry };
  });

  fastify.delete('/search-history/:id', async (request) => {
    const { id } = request.params;
    await prisma.searchHistory.deleteMany({
      where: { id, userId: request.user.userId },
    });
    return { success: true };
  });

  fastify.delete('/search-history', async (request) => {
    await prisma.searchHistory.deleteMany({ where: { userId: request.user.userId } });
    return { success: true };
  });

  // ─── User Activity ──────────────────────────────────────────
  fastify.get('/activity', async (request) => {
    const entries = await prisma.userActivity.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { entries };
  });

  fastify.post('/activity', async (request) => {
    const { activityType, entityType, entityId, metadata } = request.body || {};
    if (!activityType) throw new ValidationError('activityType is required');
    assertString(activityType, 'activityType', LIMIT.name);
    assertString(entityType, 'entityType', LIMIT.name);
    assertString(entityId, 'entityId', LIMIT.name);
    assertJsonSize(metadata, 'metadata');

    const entry = await prisma.userActivity.create({
      data: {
        userId: request.user.userId,
        activityType,
        entityType: entityType || null,
        entityId: entityId || null,
        metadata: metadata || null,
      },
    });
    return { entry };
  });

  // ─── Medical Data ───────────────────────────────────────────
  // Reads are not consent-gated (the user is reading their own data) but
  // every read is audit-logged via logMedicalAccess.
  fastify.get('/medical-data', { preHandler: logMedicalAccess('medical_data.read') }, async (request) => {
    const { dataType } = request.query;
    assertString(dataType, 'dataType', LIMIT.name);
    const where = { userId: request.user.userId };
    if (dataType) where.dataType = dataType;

    const records = await prisma.medicalData.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const decryptedRecords = records.map((record) => ({
      ...record,
      title: decrypt(record.title),
      content: decrypt(record.content),
      fileUrl: decrypt(record.fileUrl),
      metadata: decrypt(record.metadata),
    }));

    return { records: decryptedRecords };
  });

  fastify.post('/medical-data', { preHandler: logMedicalAccess('medical_data.write') }, async (request) => {
    const { dataType, title, content, metadata, fileUrl } = request.body || {};
    if (!dataType || !content) throw new ValidationError('dataType and content are required');
    assertString(dataType, 'dataType', LIMIT.name);
    assertString(title, 'title', LIMIT.name);
    assertString(fileUrl, 'fileUrl', LIMIT.text);
    assertJsonSize(content, 'content');
    assertJsonSize(metadata, 'metadata');

    const validatedContent = validateHealthRecordContent(dataType, content);
    const encryptedContent = encrypt(validatedContent);
    // `metadata` is a free-form blob that can carry the same genetic/clinical
    // detail as `content`, so it must be encrypted at rest too — otherwise the
    // "never store plaintext medical data" guarantee has a plaintext sibling.
    // It is never used in a WHERE filter, so encrypting it costs no query path.
    const encryptedMetadata = metadata != null ? encrypt(metadata) : null;

    const record = await prisma.$transaction(async (tx) => {
      // The consent check, encrypted write, and durable action receipt commit
      // together. A failed audit insert cannot leave an unreceipted health row.
      await requireLatestConsent(tx, request.user.userId, MEDICAL_DATA_STORAGE_CONSENT);
      const created = await tx.medicalData.create({
        data: {
          userId: request.user.userId,
          dataType,
          title: title ? encrypt(title) : null,
          content: encryptedContent,
          fileUrl: fileUrl ? encrypt(fileUrl) : null,
          metadata: encryptedMetadata,
        },
      });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'medical_data.write',
        entityType: 'medical_data',
        entityId: created.id,
        metadata: { dataType },
      }, { required: true });
      return created;
    });

    return {
      record: {
        ...record,
        title: title ?? null,
        content: validatedContent,
        fileUrl: fileUrl ?? null,
        metadata: metadata ?? null,
      },
    };
  });

  // Partial update. `content` is shallow-merged into the existing (decrypted)
  // content blob so a caller can patch one health-profile field without
  // resending and potentially clobbering the remaining structured record.
  fastify.put('/medical-data/:id', { preHandler: logMedicalAccess('medical_data.write') }, async (request) => {
    const { id } = request.params;
    const { dataType, title, content, metadata, fileUrl } = request.body || {};
    assertString(dataType, 'dataType', LIMIT.name);
    assertString(title, 'title', LIMIT.name);
    assertString(fileUrl, 'fileUrl', LIMIT.text);
    assertJsonSize(content, 'content');
    assertJsonSize(metadata, 'metadata');

    const { record, mergedContent } = await prisma.$transaction(async (tx) => {
      const existing = await tx.medicalData.findFirst({
        where: { id, userId: request.user.userId },
      });
      if (!existing) throw new ValidationError('Medical record not found');
      await requireLatestConsent(tx, request.user.userId, MEDICAL_DATA_STORAGE_CONSENT);

      const data = {};
      if (dataType !== undefined) data.dataType = dataType;
      if (title !== undefined) data.title = title ? encrypt(title) : null;
      if (fileUrl !== undefined) data.fileUrl = fileUrl ? encrypt(fileUrl) : null;
      // Encrypt metadata at rest (see POST handler); null clears it.
      if (metadata !== undefined) data.metadata = metadata != null ? encrypt(metadata) : null;

      let nextContent = decrypt(existing.content);
      if (content !== undefined) {
        const current =
          nextContent && typeof nextContent === 'object' && !Array.isArray(nextContent)
            ? nextContent
            : {};
        const contentPatch = content && typeof content === 'object' && !Array.isArray(content)
          ? content
          : {};
        nextContent = { ...current, ...contentPatch };
      }
      // A dataType-only update still has to validate the existing content
      // against the new schema. Otherwise a caller could relabel arbitrary text
      // as a parser-structured lab document and have it enter assistant context.
      if (content !== undefined || dataType !== undefined) {
        nextContent = validateHealthRecordContent(dataType ?? existing.dataType, nextContent);
        data.content = encrypt(nextContent);
      }

      const updated = await tx.medicalData.update({ where: { id: existing.id }, data });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'medical_data.write',
        entityType: 'medical_data',
        entityId: updated.id,
        metadata: { dataType: updated.dataType, update: true },
      }, { required: true });
      return { record: updated, mergedContent: nextContent };
    });

    return {
      record: {
        ...record,
        title: title !== undefined ? title : decrypt(record.title),
        content: mergedContent,
        fileUrl: fileUrl !== undefined ? fileUrl : decrypt(record.fileUrl),
        metadata: record.metadata ? decrypt(record.metadata) : null,
      },
    };
  });

  fastify.delete('/medical-data/:id', { preHandler: logMedicalAccess('medical_data.delete') }, async (request) => {
    const { id } = request.params;
    await prisma.$transaction(async (tx) => {
      const result = await tx.medicalData.deleteMany({
        where: { id, userId: request.user.userId },
      });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'medical_data.delete',
        entityType: 'medical_data',
        entityId: id,
        metadata: { deletedCount: result.count },
      }, { required: true });
    });

    return { success: true };
  });

  // ─── AI Conversations ──────────────────────────────────────
  fastify.get('/conversations', async (request) => {
    const { assistantType } = request.query;
    const where = { userId: request.user.userId };
    if (assistantType) where.assistantType = assistantType;

    const conversations = await prisma.aIConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    // Conversations with the genomics assistants (Robert, tutors) routinely
    // contain the user's genetic results and clinical questions, so `messages`
    // and `metadata` are encrypted at rest — decrypt them for the owner here.
    const decrypted = conversations.map((c) => ({
      ...c,
      title: decrypt(c.title),
      messages: decrypt(c.messages),
      metadata: decrypt(c.metadata),
    }));
    return { conversations: decrypted };
  });

  fastify.delete('/conversations/:id', async (request) => {
    const { id } = request.params;
    const result = await prisma.$transaction(async (tx) => {
      // Bind deletion to both the opaque id and authenticated owner. Returning
      // the same success shape for zero rows avoids exposing whether another
      // account has a conversation with a guessed id.
      const deleted = await tx.aIConversation.deleteMany({
        where: { id, userId: request.user.userId },
      });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'assistant.conversation.delete',
        entityType: 'ai_conversation',
        entityId: id,
        metadata: { deletedCount: deleted.count },
      }, { required: true });
      return deleted;
    });

    return { success: true, deleted: result.count === 1 };
  });

  // ─── Gene Sets ──────────────────────────────────────────────
  fastify.get('/gene-sets', async (request) => {
    const sets = await prisma.geneSet.findMany({
      where: { userId: request.user.userId },
      orderBy: { updatedAt: 'desc' },
    });
    return { sets };
  });

  fastify.post('/gene-sets', async (request) => {
    const { name, description, genes, metadata } = request.body || {};
    if (!name || !genes) throw new ValidationError('name and genes are required');
    assertString(name, 'name', LIMIT.name);
    assertString(description, 'description', LIMIT.text);
    assertStringArray(genes, 'genes');
    assertJsonSize(metadata, 'metadata');

    const set = await prisma.geneSet.create({
      data: {
        userId: request.user.userId,
        name,
        description: description || null,
        genes,
        metadata: metadata || null,
      },
    });
    return { set };
  });

  fastify.put('/gene-sets/:id', async (request) => {
    const { id } = request.params;
    const { name, description, genes, metadata } = request.body || {};
    assertString(name, 'name', LIMIT.name);
    assertString(description, 'description', LIMIT.text);
    assertStringArray(genes, 'genes');
    assertJsonSize(metadata, 'metadata');

    const existing = await prisma.geneSet.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Gene set not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    const set = await prisma.geneSet.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(genes !== undefined && { genes }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    return { set };
  });

  fastify.delete('/gene-sets/:id', async (request) => {
    await prisma.geneSet.deleteMany({
      where: { id: request.params.id, userId: request.user.userId },
    });
    return { success: true };
  });

  // ─── Research Projects ──────────────────────────────────────

  // The restorable state of a project. Exactly the fields PUT /projects/:id
  // accepts, so a snapshot can be fed straight back through the update path
  // with nothing missing and nothing invented.
  const projectSnapshot = (project) => ({
    title: project.title,
    description: project.description ?? null,
    status: project.status ?? null,
    genes: project.genes ?? [],
    metadata: project.metadata ?? null,
  });

  fastify.get('/projects', async (request) => {
    const projects = await prisma.researchProject.findMany({
      where: {
        OR: [
          { userId: request.user.userId },
          { collaborators: { some: { userId: request.user.userId } } },
        ],
      },
      include: {
        // The owner, so the collaboration panel can name them. Previously the
        // UI read a nonexistent `created_by` and rendered undefined. Everyone
        // who can read this row is already the owner or a collaborator on it.
        user: { select: { email: true, displayName: true } },
        collaborators: { include: { user: { select: { email: true, displayName: true } } } },
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { projects };
  });

  fastify.post('/projects', async (request) => {
    const { title, description, genes, metadata } = request.body || {};
    if (!title) throw new ValidationError('title is required');
    assertString(title, 'title', LIMIT.name);
    assertString(description, 'description', LIMIT.text);
    assertStringArray(genes, 'genes');
    assertJsonSize(metadata, 'metadata');

    const project = await prisma.researchProject.create({
      data: {
        userId: request.user.userId,
        title,
        description: description || null,
        genes: genes || [],
        metadata: metadata || null,
      },
    });

    await prisma.projectVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        changes: { type: 'initial', title },
        snapshot: projectSnapshot(project),
        notes: 'Project created',
        createdBy: request.user.userId,
      },
    });

    return { project };
  });

  fastify.put('/projects/:id', async (request) => {
    const { id } = request.params;
    const { title, description, status, genes, metadata } = request.body || {};
    assertString(title, 'title', LIMIT.name);
    assertString(description, 'description', LIMIT.text);
    assertString(status, 'status', LIMIT.name);
    assertStringArray(genes, 'genes');
    assertJsonSize(metadata, 'metadata');

    // Owners only can mutate the project itself.
    await requireProjectAccess(prisma, id, request.user.userId, ['owner']);

    const project = await prisma.researchProject.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(genes !== undefined && { genes }),
        ...(metadata !== undefined && { metadata }),
      },
    });

    const lastVersion = await prisma.projectVersion.findFirst({
      where: { projectId: id },
      orderBy: { version: 'desc' },
    });

    await prisma.projectVersion.create({
      data: {
        projectId: id,
        version: (lastVersion?.version || 0) + 1,
        changes: request.body,
        // The state AFTER the update, so restoring THIS version reproduces
        // what the project looked like at this point. `changes` is the delta
        // that got us here and is kept for the human-readable history.
        snapshot: projectSnapshot(project),
        notes: `Updated: ${Object.keys(request.body).join(', ')}`,
        createdBy: request.user.userId,
      },
    });

    return { project };
  });

  fastify.delete('/projects/:id', async (request) => {
    await requireProjectAccess(prisma, request.params.id, request.user.userId, ['owner']);
    await prisma.researchProject.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  fastify.get('/projects/:id/versions', async (request) => {
    // FIX: previous implementation returned versions to ANY caller with the
    // project ID. Now we explicitly require collaborator-or-owner access.
    await requireProjectAccess(prisma, request.params.id, request.user.userId);

    const versions = await prisma.projectVersion.findMany({
      where: { projectId: request.params.id },
      orderBy: { version: 'desc' },
    });
    return { versions };
  });

  // ─── Project Collaborators ─────────────────────────────────
  fastify.post('/projects/:id/collaborators', async (request) => {
    const { id } = request.params;
    const { userEmail, role } = request.body || {};
    if (!userEmail) throw new ValidationError('userEmail is required');

    // The `role` column is a free-form string in the DB, so an unchecked value
    // here could grant a privilege the access checks never anticipate (e.g.
    // role: "owner"/"admin"). Constrain it to the known collaborator roles.
    // 'owner' is reserved for the project creator and cannot be assigned.
    const collaboratorRole = role || 'viewer';
    if (!COLLABORATOR_ROLES.includes(collaboratorRole)) {
      throw new ValidationError(
        `role must be one of: ${COLLABORATOR_ROLES.join(', ')}`
      );
    }

    await requireProjectAccess(prisma, id, request.user.userId, ['owner']);

    const targetUser = await prisma.user.findUnique({ where: { email: normalizeEmail(userEmail) } });
    if (!targetUser) throw new NotFoundError('User not found');

    if (targetUser.id === request.user.userId) {
      throw new ValidationError('You already own this project');
    }

    // Idempotent + race-safe: a unique (projectId, userId) constraint exists,
    // so upsert avoids both duplicate rows and a P2002 crash on double-submit.
    const collab = await prisma.projectCollaborator.upsert({
      where: { projectId_userId: { projectId: id, userId: targetUser.id } },
      update: { role: collaboratorRole },
      create: {
        projectId: id,
        userId: targetUser.id,
        role: collaboratorRole,
        addedBy: request.user.userId,
      },
    });
    return { collaborator: collab };
  });

  fastify.delete('/projects/:projectId/collaborators/:collabId', async (request) => {
    const { projectId, collabId } = request.params;
    await requireProjectAccess(prisma, projectId, request.user.userId, ['owner']);

    // FIX: previous implementation deleted by collabId alone, so an owner
    // of project A could delete a collaborator row from project B by
    // guessing the collabId. Bind the delete to projectId.
    const deleted = await prisma.projectCollaborator.deleteMany({
      where: { id: collabId, projectId },
    });
    if (deleted.count !== 1) {
      throw new NotFoundError('Collaborator not found');
    }
    return { success: true };
  });

  // ─── Messages (Support) ────────────────────────────────────
  fastify.get('/messages', async (request) => {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: request.user.userId },
          { receiverId: request.user.userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      messages: messages.map((message) => publicSupportMessage(
        message,
        request.user.userId,
      )),
    };
  });

  fastify.post('/messages', async (request) => {
    const { subject, body, isIssue, category } = request.body || {};
    if (subject == null || body == null) {
      throw new ValidationError('subject and body are required');
    }
    assertString(subject, 'subject', LIMIT.name);
    assertString(body, 'body', LIMIT.text);
    const normalizedSubject = subject.trim();
    const normalizedBody = body.trim();
    if (!normalizedSubject || !normalizedBody) {
      throw new ValidationError('subject and body are required');
    }
    if (isIssue !== undefined && typeof isIssue !== 'boolean') {
      throw new ValidationError('isIssue must be a boolean');
    }
    // `category` is accepted only for the previous web build during a rolling
    // deploy. Normalize it into the single queue rather than storing a record
    // that the administrator inbox cannot see.
    if (category !== undefined && !['support', 'general', 'issue'].includes(category)) {
      throw new ValidationError('category must identify a support message');
    }

    const message = await prisma.message.create({
      data: {
        senderId: request.user.userId,
        subject: normalizedSubject,
        body: normalizedBody,
        category: 'support',
        metadata: { isIssue: isIssue === true || category === 'issue' },
      },
    });
    return { message: publicSupportMessage(message, request.user.userId) };
  });

  // ─── Institutional License Management ──────────────────────
  // Critical fix: license.adminUsers stores USER IDs (set by the Stripe
  // webhook). Match them against request.user.userId, not request.user.email
  // — the previous code stored userId but checked email, so the purchaser
  // could not administer their own license.
  fastify.get('/licenses', async (request) => {
    const licenses = await prisma.institutionalLicense.findMany({
      where: { adminUsers: { has: request.user.userId } },
      include: {
        assignments: true,
        usageLogs: { take: 50, orderBy: { createdAt: 'desc' } },
      },
    });
    return { licenses: licenses.map(publicOwnedLicense) };
  });

  fastify.post('/licenses/:id/assign', async (request) => {
    const { id } = request.params;
    const { userEmail, department } = request.body || {};
    if (!userEmail) throw new ValidationError('userEmail is required');

    const [normalizedEmail] = normalizeSeatEmails([userEmail]);

    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundError('License not found');
    if (!license.adminUsers.includes(request.user.userId)) throw new ForbiddenError();

    const [assignment] = await assignLicenseSeats(prisma, {
      license,
      emails: [normalizedEmail],
      department,
      assignedBy: request.user.userId,
    });

    return { assignment };
  });

  fastify.post('/licenses/:id/assign-bulk', async (request) => {
    const { id } = request.params;
    const { userEmails, department } = request.body || {};
    assertString(department, 'department', LIMIT.name);
    const emails = normalizeSeatEmails(userEmails);
    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundError('License not found');
    if (!license.adminUsers.includes(request.user.userId)) throw new ForbiddenError();

    const assignments = await assignLicenseSeats(prisma, {
      license,
      emails,
      department,
      assignedBy: request.user.userId,
    });
    return { assignments };
  });

  fastify.delete('/licenses/:id/assignments/:assignmentId', async (request) => {
    const { id, assignmentId } = request.params;

    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license || !license.adminUsers.includes(request.user.userId)) throw new ForbiddenError();

    // Bind the delete to the parent license so an admin of one license
    // can never delete an assignment row from another license by guessing
    // the assignmentId.
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.licenseAssignment.deleteMany({
        where: { id: assignmentId, licenseId: id },
      });
      if (deleted.count !== 1) {
        throw new NotFoundError('Assignment not found');
      }
      // Never let the seat counter underflow below zero, even if the data ever
      // drifts (e.g. a manually deleted assignment row).
      await tx.institutionalLicense.updateMany({
        where: { id, assignedSeats: { gt: 0 } },
        data: { assignedSeats: { decrement: 1 } },
      });
      return { success: true };
    });

    return result;
  });

  // ─── Consent Records (versioned privacy choices; not a HIPAA claim) ────────
  fastify.post('/consent/batch', async (request) => {
    const choices = request.body?.choices;
    if (!Array.isArray(choices) || choices.length < 1 || choices.length > 20) {
      throw new ValidationError('choices must contain between 1 and 20 consent records');
    }
    const parsed = choices.map((choice, index) => parseConsentChoice(choice, index));
    const keys = parsed.map((choice) => `${choice.consentType}\u0000${choice.version}`);
    if (new Set(keys).size !== keys.length) {
      throw new ValidationError('A consent type and version may appear only once per batch');
    }

    // All choices and all required audit receipts share one transaction. The
    // browser can therefore never report a failed privacy save after only one
    // of its two switches was committed.
    const records = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const choice of parsed) {
        created.push(await createConsentRecord(tx, request, choice));
      }
      return created;
    });
    return { records };
  });

  fastify.post('/consent', async (request) => {
    const choice = parseConsentChoice(request.body);
    const record = await prisma.$transaction((tx) => createConsentRecord(tx, request, choice));

    return { record };
  });

  fastify.get('/consent', async (request) => {
    const records = await prisma.consentRecord.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return { records };
  });

  // ─── Limited self-service content purge ─────────────────────
  fastify.post('/data-deletion-request', async (request, reply) => {
    const deletionRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.dataDeletionRequest.create({
        data: {
          userId: request.user.userId,
          status: 'pending',
          deletedTypes: [...SELF_SERVICE_PURGE_TYPES],
        },
      });
      await createAuditLog(tx, {
        userId: request.user.userId,
        action: 'data_deletion_requested',
        entityType: 'data_deletion_request',
        entityId: created.id,
        metadata: { deletedTypes: [...SELF_SERVICE_PURGE_TYPES] },
      }, { required: true });
      return created;
    });

    // This limited purge runs immediately. A full account/processor deletion
    // requires the separately reviewed workflow documented in DATA_RETENTION.
    try {
      const processedRequest = await processDeletionRequest(prisma, deletionRequest.id);
      return { request: processedRequest || deletionRequest };
    } catch {
      request.log.error(
        { requestId: request.id, deletionRequestId: deletionRequest.id },
        'deletion request processing failed'
      );
      let failedRequest = deletionRequest;
      try {
        failedRequest = await prisma.dataDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: { status: 'failed' },
        });
      } catch {
        request.log.error(
          { requestId: request.id, deletionRequestId: deletionRequest.id },
          'deletion request failure state could not be persisted'
        );
      }
      return reply.code(503).send({
        request: failedRequest,
        error: 'The content purge did not complete; the request was retained for operator review.',
        code: 'DELETION_NOT_COMPLETED',
      });
    }
  });

  fastify.get('/data-deletion-request', async (request) => {
    const requests = await prisma.dataDeletionRequest.findMany({
      where: { userId: request.user.userId },
      orderBy: { requestedAt: 'desc' },
    });
    return { requests };
  });

  // ─── Project Annotations (Collaboration) ──────────────────
  fastify.get('/projects/:id/annotations', async (request) => {
    const { id } = request.params;
    const { targetType, targetId } = request.query;

    await requireProjectAccess(prisma, id, request.user.userId);

    const where = { projectId: id };
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    const annotations = await prisma.projectAnnotation.findMany({
      where,
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { annotations };
  });

  fastify.post('/projects/:id/annotations', async (request) => {
    const { id } = request.params;
    const { targetType, targetId, content, parentId } = request.body || {};
    if (!targetType || !targetId || !content) {
      throw new ValidationError('targetType, targetId, and content are required');
    }
    assertString(targetType, 'targetType', LIMIT.name);
    assertString(targetId, 'targetId', LIMIT.name);
    assertString(content, 'content', LIMIT.text);
    assertString(parentId, 'parentId', LIMIT.name);

    await requireProjectAccess(prisma, id, request.user.userId, ['owner', 'editor']);

    const annotation = await prisma.projectAnnotation.create({
      data: {
        projectId: id,
        userId: request.user.userId,
        targetType,
        targetId,
        content,
        parentId: parentId || null,
      },
    });
    return { annotation };
  });

  fastify.put('/projects/:projectId/annotations/:annotationId', async (request) => {
    const { projectId, annotationId } = request.params;
    const { content, resolved } = request.body || {};
    assertString(content, 'content', LIMIT.text);
    if (resolved !== undefined && typeof resolved !== 'boolean') {
      throw new ValidationError('resolved must be a boolean');
    }

    await requireProjectAccess(prisma, projectId, request.user.userId, ['owner', 'editor']);

    const existing = await prisma.projectAnnotation.findUnique({ where: { id: annotationId } });
    if (!existing || existing.projectId !== projectId) throw new NotFoundError('Annotation not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    const annotation = await prisma.projectAnnotation.update({
      where: { id: annotationId },
      data: {
        ...(content !== undefined && { content }),
        ...(resolved !== undefined && { resolved }),
      },
    });
    return { annotation };
  });

  fastify.delete('/projects/:projectId/annotations/:annotationId', async (request) => {
    const { projectId, annotationId } = request.params;
    await requireProjectAccess(prisma, projectId, request.user.userId, ['owner', 'editor']);

    const existing = await prisma.projectAnnotation.findUnique({ where: { id: annotationId } });
    if (!existing || existing.projectId !== projectId) throw new NotFoundError('Annotation not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    await prisma.projectAnnotation.delete({ where: { id: annotationId } });
    return { success: true };
  });
}

export const __test = {
  assignLicenseSeats,
  featureForEntityRoute,
  normalizeSeatEmails,
  processDeletionRequest,
  publicOwnedLicense,
  requireProjectAccess,
};
