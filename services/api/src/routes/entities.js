import { authenticate } from '../middleware/auth.js';
import { logMedicalAccess } from '../middleware/accessLog.js';
import { createAuditLog } from '../utils/audit.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import {
  PRIVACY_DELETION_SCOPE,
  SELF_SERVICE_PURGE_TYPES,
  processDeletionRequestNow,
  serializeConsentRecord,
  serializeDeletionRequest,
} from '../services/privacyMaintenance.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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

/**
 * Require the latest consent event for this exact type/version to be a grant.
 * A later revocation must override an older grant.
 */
async function requireConsent(prisma, userId, consentType, minVersion) {
  const consent = await prisma.consentRecord.findFirst({
    where: { userId, consentType, version: minVersion },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (!consent?.granted) {
    throw new ForbiddenError(`Consent required: ${consentType} v${minVersion}`);
  }
}

export default async function entityRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.addHook('preHandler', authenticate);

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
    const where = { userId: request.user.userId };
    if (dataType) where.dataType = dataType;

    const records = await prisma.medicalData.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const decryptedRecords = records.map((record) => ({
      ...record,
      content: decrypt(record.content),
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

    // HIPAA / consent enforcement happens BEFORE the write; any storage of
    // genetic / medical data without an active consent record is a hard
    // failure regardless of authentication state.
    await requireConsent(prisma, request.user.userId, 'medical_data_storage', '1.0');

    const encryptedContent = encrypt(content);
    // `metadata` is a free-form blob that can carry the same genetic/clinical
    // detail as `content`, so it must be encrypted at rest too — otherwise the
    // "never store plaintext medical data" guarantee has a plaintext sibling.
    // It is never used in a WHERE filter, so encrypting it costs no query path.
    const encryptedMetadata = metadata != null ? encrypt(metadata) : null;

    const record = await prisma.medicalData.create({
      data: {
        userId: request.user.userId,
        dataType,
        title: title || null,
        content: encryptedContent,
        fileUrl: fileUrl || null,
        metadata: encryptedMetadata,
      },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'medical_data.write',
        entityType: 'medical_data',
        entityId: record.id,
        metadata: { dataType },
      },
      { required: true }
    );

    return { record: { ...record, content, metadata: metadata ?? null } };
  });

  // Partial update. `content` is shallow-merged into the existing (decrypted)
  // content blob so a caller can patch a single field (e.g. parsed VCF
  // variants) without having to resend the whole record and risk clobbering
  // the AI summary / gene list produced at upload time.
  fastify.put('/medical-data/:id', { preHandler: logMedicalAccess('medical_data.write') }, async (request) => {
    const { id } = request.params;
    const { dataType, title, content, metadata, fileUrl } = request.body || {};
    assertString(dataType, 'dataType', LIMIT.name);
    assertString(title, 'title', LIMIT.name);
    assertString(fileUrl, 'fileUrl', LIMIT.text);
    assertJsonSize(content, 'content');
    assertJsonSize(metadata, 'metadata');

    const existing = await prisma.medicalData.findFirst({
      where: { id, userId: request.user.userId },
    });
    if (!existing) throw new ValidationError('Medical record not found');

    const data = {};
    if (dataType !== undefined) data.dataType = dataType;
    if (title !== undefined) data.title = title || null;
    if (fileUrl !== undefined) data.fileUrl = fileUrl || null;
    // Encrypt metadata at rest (see POST handler); null clears it.
    if (metadata !== undefined) data.metadata = metadata != null ? encrypt(metadata) : null;

    let mergedContent = decrypt(existing.content);
    if (content !== undefined) {
      const current =
        mergedContent && typeof mergedContent === 'object' && !Array.isArray(mergedContent)
          ? mergedContent
          : {};
      const patch = content && typeof content === 'object' && !Array.isArray(content) ? content : {};
      mergedContent = { ...current, ...patch };
      data.content = encrypt(mergedContent);
    }

    const record = await prisma.medicalData.update({
      where: { id: existing.id },
      data,
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'medical_data.write',
        entityType: 'medical_data',
        entityId: record.id,
        metadata: { dataType: record.dataType, update: true },
      },
      { required: true }
    );

    return { record: { ...record, content: mergedContent, metadata: decrypt(record.metadata) } };
  });

  fastify.delete('/medical-data/:id', { preHandler: logMedicalAccess('medical_data.delete') }, async (request) => {
    const { id } = request.params;
    const result = await prisma.medicalData.deleteMany({
      where: { id, userId: request.user.userId },
    });

    await createAuditLog(
      prisma,
      {
        userId: request.user.userId,
        action: 'medical_data.delete',
        entityType: 'medical_data',
        entityId: id,
        metadata: { deletedCount: result.count },
      },
      { required: true }
    );

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

  fastify.post('/conversations', async (request) => {
    const { assistantType, title, messages, metadata } = request.body || {};
    if (!assistantType || !messages) throw new ValidationError('assistantType and messages are required');
    assertString(assistantType, 'assistantType', LIMIT.name);
    assertString(title, 'title', LIMIT.name);
    assertJsonSize(messages, 'messages');
    assertJsonSize(metadata, 'metadata');

    const conversation = await prisma.aIConversation.create({
      data: {
        userId: request.user.userId,
        assistantType,
        // The client derives the title from the first user message (see
        // usePersistConversation), so it can carry the same PHI as the body —
        // encrypt it too.
        title: title ? encrypt(title) : null,
        messages: encrypt(messages),
        metadata: metadata != null ? encrypt(metadata) : null,
      },
    });
    // Return plaintext to the caller (who just sent it) rather than ciphertext.
    return { conversation: { ...conversation, title: title ?? null, messages, metadata: metadata ?? null } };
  });

  fastify.put('/conversations/:id', async (request) => {
    const { id } = request.params;
    const { title, messages, metadata } = request.body || {};
    assertString(title, 'title', LIMIT.name);
    assertJsonSize(messages, 'messages');
    assertJsonSize(metadata, 'metadata');

    const existing = await prisma.aIConversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Conversation not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    const conversation = await prisma.aIConversation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title ? encrypt(title) : null }),
        ...(messages !== undefined && { messages: encrypt(messages) }),
        ...(metadata !== undefined && { metadata: metadata != null ? encrypt(metadata) : null }),
      },
    });
    return {
      conversation: {
        ...conversation,
        title: decrypt(conversation.title),
        messages: decrypt(conversation.messages),
        metadata: decrypt(conversation.metadata),
      },
    };
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
  fastify.get('/projects', async (request) => {
    const projects = await prisma.researchProject.findMany({
      where: {
        OR: [
          { userId: request.user.userId },
          { collaborators: { some: { userId: request.user.userId } } },
        ],
      },
      include: {
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
    return { messages };
  });

  fastify.post('/messages', async (request) => {
    const { subject, body, category } = request.body || {};
    if (!subject || !body) throw new ValidationError('subject and body are required');
    assertString(subject, 'subject', LIMIT.name);
    assertString(body, 'body', LIMIT.text);
    assertString(category, 'category', LIMIT.name);

    const message = await prisma.message.create({
      data: {
        senderId: request.user.userId,
        subject,
        body,
        category: category || 'support',
      },
    });
    return { message };
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
    return { licenses };
  });

  fastify.post('/licenses/:id/assign', async (request) => {
    const { id } = request.params;
    const { userEmail, department } = request.body || {};
    if (!userEmail) throw new ValidationError('userEmail is required');

    const normalizedEmail = normalizeEmail(userEmail);

    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundError('License not found');
    if (!license.adminUsers.includes(request.user.userId)) throw new ForbiddenError();

    // Atomic seat reservation: increment assignedSeats only if it remains
    // strictly less than maxSeats. updateMany returns 0 affected rows when
    // the predicate fails, which we treat as "no available seats". This
    // avoids the TOCTOU race where two parallel POSTs both observe an
    // empty seat and both succeed.
    const assignment = await prisma.$transaction(async (tx) => {
      // Reject a second active seat for the same person on the same license.
      // Without this, re-assigning an already-seated user double-counts a seat
      // and lets one person consume the whole pool. (There is no DB-level
      // partial-unique constraint for status='active', so we enforce it here
      // inside the transaction.)
      const existing = await tx.licenseAssignment.findFirst({
        where: { licenseId: id, userEmail: normalizedEmail, status: 'active' },
      });
      if (existing) {
        throw new ValidationError('This user already has an active seat on this license');
      }

      const updated = await tx.institutionalLicense.updateMany({
        where: { id, assignedSeats: { lt: license.maxSeats } },
        data: { assignedSeats: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ValidationError('No available seats');
      }
      return tx.licenseAssignment.create({
        data: {
          licenseId: id,
          userEmail: normalizedEmail,
          assignedBy: request.user.userId,
          status: 'active',
          department: department || null,
        },
      });
    });

    await prisma.licenseUsageLog.create({
      data: {
        licenseId: id,
        userEmail: normalizeEmail(userEmail),
        action: 'seat_assigned',
        metadata: { assignedBy: request.user.userId, department: department || null },
      },
    });

    return { assignment };
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

  // ─── Consent Records ────────────────────────────────────────
  fastify.post('/consent', async (request) => {
    const { consentType, version, granted } = request.body || {};
    if (!consentType || !version || granted === undefined) {
      throw new ValidationError('consentType, version, and granted are required');
    }
    assertString(consentType, 'consentType', LIMIT.name);
    assertString(version, 'version', LIMIT.name);
    if (typeof granted !== 'boolean') throw new ValidationError('granted must be a boolean');
    assertJsonSize(request.body.metadata, 'metadata');

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.consentRecord.create({
        data: {
          userId: request.user.userId,
          subjectRef: request.user.privacySubjectRef,
          consentType,
          version,
          granted,
          ipAddress: request.ip || request.headers['x-forwarded-for'] || null,
          metadata: request.body.metadata || null,
        },
      });

      await createAuditLog(
        tx,
        {
          userId: request.user.userId,
          action: 'consent_recorded',
          entityType: 'consent_record',
          entityId: created.id,
          metadata: { consentType, version, granted },
        },
        { required: true }
      );
      return created;
    });

    return { record: serializeConsentRecord(record) };
  });

  fastify.get('/consent', async (request) => {
    const records = await prisma.consentRecord.findMany({
      where: { userId: request.user.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { records: records.map(serializeConsentRecord) };
  });

  // ─── Limited self-service content purge ─────────────────────
  fastify.post('/data-deletion-request', async (request, reply) => {
    const now = new Date();
    const deletionRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.dataDeletionRequest.create({
        data: {
          userId: request.user.userId,
          subjectRef: request.user.privacySubjectRef,
          scope: PRIVACY_DELETION_SCOPE,
          status: 'pending',
          requestedAt: now,
          completedAt: null,
          requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
          deletedTypes: [],
          attemptCount: 0,
          lastAttemptAt: null,
          nextAttemptAt: now,
          leaseExpiresAt: null,
          failureCode: null,
          updatedAt: now,
        },
      });

      await createAuditLog(
        tx,
        {
          userId: request.user.userId,
          action: 'data_deletion_requested',
          entityType: 'data_deletion_request',
          entityId: created.id,
          metadata: {
            scope: PRIVACY_DELETION_SCOPE,
            requestedTypes: [...SELF_SERVICE_PURGE_TYPES],
          },
        },
        { required: true }
      );
      return created;
    });

    // The finite local purge is attempted immediately and remains eligible for
    // the external maintenance worker if an infrastructure failure occurs.
    const result = await processDeletionRequestNow(prisma, deletionRequest.id, { now });
    const publicRequest = serializeDeletionRequest(result.request || deletionRequest);
    if (result.outcome === 'completed') return { request: publicRequest };

    request.log.error(
      { requestId: request.id, deletionRequestId: deletionRequest.id },
      'deletion request retained for retry or operator review'
    );
    return reply.code(503).send({
      request: publicRequest,
      error: 'The local content purge did not complete; the request was retained for retry.',
      code: 'DELETION_NOT_COMPLETED',
    });
  });

  fastify.get('/data-deletion-request', async (request) => {
    const requests = await prisma.dataDeletionRequest.findMany({
      where: { userId: request.user.userId },
      orderBy: { requestedAt: 'desc' },
    });
    return { requests: requests.map(serializeDeletionRequest) };
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
