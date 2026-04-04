import { authenticate } from '../middleware/auth.js';
import { logMedicalAccess } from '../middleware/accessLog.js';
import { createAuditLog } from '../utils/audit.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';

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
    await prisma.searchHistory.deleteMany({
      where: { userId: request.user.userId },
    });
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
  fastify.get('/medical-data', { preHandler: logMedicalAccess('read') }, async (request) => {
    const { dataType } = request.query;
    const where = { userId: request.user.userId };
    if (dataType) where.dataType = dataType;

    const records = await prisma.medicalData.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Decrypt content field for each record
    const decryptedRecords = records.map((record) => ({
      ...record,
      content: decrypt(record.content),
    }));

    return { records: decryptedRecords };
  });

  fastify.post('/medical-data', { preHandler: logMedicalAccess('write') }, async (request) => {
    const { dataType, title, content, metadata } = request.body || {};
    if (!dataType || !content) throw new ValidationError('dataType and content are required');

    // Encrypt content before storing
    const encryptedContent = encrypt(content);

    const record = await prisma.medicalData.create({
      data: {
        userId: request.user.userId,
        dataType,
        title: title || null,
        content: encryptedContent,
        metadata: metadata || null,
      },
    });
    return { record: { ...record, content } };
  });

  fastify.delete('/medical-data/:id', { preHandler: logMedicalAccess('delete') }, async (request) => {
    const { id } = request.params;
    await prisma.medicalData.deleteMany({
      where: { id, userId: request.user.userId },
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
    return { conversations };
  });

  fastify.post('/conversations', async (request) => {
    const { assistantType, title, messages, metadata } = request.body || {};
    if (!assistantType || !messages) throw new ValidationError('assistantType and messages are required');

    const conversation = await prisma.aIConversation.create({
      data: {
        userId: request.user.userId,
        assistantType,
        title: title || null,
        messages,
        metadata: metadata || null,
      },
    });
    return { conversation };
  });

  fastify.put('/conversations/:id', async (request) => {
    const { id } = request.params;
    const { title, messages, metadata } = request.body || {};

    const existing = await prisma.aIConversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Conversation not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    const conversation = await prisma.aIConversation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(messages !== undefined && { messages }),
        ...(metadata !== undefined && { metadata }),
      },
    });
    return { conversation };
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

    const project = await prisma.researchProject.create({
      data: {
        userId: request.user.userId,
        title,
        description: description || null,
        genes: genes || [],
        metadata: metadata || null,
      },
    });

    // Create initial version
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

    const existing = await prisma.researchProject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Project not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

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

    // Create version for the update
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
    const existing = await prisma.researchProject.findUnique({ where: { id: request.params.id } });
    if (!existing) throw new NotFoundError('Project not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    await prisma.researchProject.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  fastify.get('/projects/:id/versions', async (request) => {
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

    const project = await prisma.researchProject.findUnique({ where: { id } });
    if (!project) throw new NotFoundError('Project not found');
    if (project.userId !== request.user.userId) throw new ForbiddenError();

    const targetUser = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!targetUser) throw new NotFoundError('User not found');

    const collab = await prisma.projectCollaborator.create({
      data: {
        projectId: id,
        userId: targetUser.id,
        role: role || 'viewer',
        addedBy: request.user.userId,
      },
    });
    return { collaborator: collab };
  });

  fastify.delete('/projects/:projectId/collaborators/:collabId', async (request) => {
    const { projectId, collabId } = request.params;
    const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== request.user.userId) throw new ForbiddenError();

    await prisma.projectCollaborator.delete({ where: { id: collabId } });
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
  fastify.get('/licenses', async (request) => {
    const licenses = await prisma.institutionalLicense.findMany({
      where: { adminUsers: { has: request.user.email } },
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

    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license) throw new NotFoundError('License not found');
    if (!license.adminUsers.includes(request.user.email)) throw new ForbiddenError();
    if (license.assignedSeats >= license.maxSeats) {
      throw new ValidationError('No available seats');
    }

    const assignment = await prisma.licenseAssignment.create({
      data: {
        licenseId: id,
        userEmail,
        assignedBy: request.user.userId,
        status: 'active',
        department: department || null,
      },
    });

    await prisma.institutionalLicense.update({
      where: { id },
      data: { assignedSeats: { increment: 1 } },
    });

    await prisma.licenseUsageLog.create({
      data: {
        licenseId: id,
        userEmail,
        action: 'seat_assigned',
        metadata: { assignedBy: request.user.email, department },
      },
    });

    return { assignment };
  });

  fastify.delete('/licenses/:id/assignments/:assignmentId', async (request) => {
    const { id, assignmentId } = request.params;

    const license = await prisma.institutionalLicense.findUnique({ where: { id } });
    if (!license || !license.adminUsers.includes(request.user.email)) throw new ForbiddenError();

    const assignment = await prisma.licenseAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundError('Assignment not found');

    await prisma.licenseAssignment.delete({ where: { id: assignmentId } });
    await prisma.institutionalLicense.update({
      where: { id },
      data: { assignedSeats: { decrement: 1 } },
    });

    return { success: true };
  });

  // ─── Consent Records (HIPAA Compliance) ────────────────────
  fastify.post('/consent', async (request) => {
    const { consentType, version, granted } = request.body || {};
    if (!consentType || !version || granted === undefined) {
      throw new ValidationError('consentType, version, and granted are required');
    }

    const record = await prisma.consentRecord.create({
      data: {
        userId: request.user.userId,
        consentType,
        version,
        granted,
        ipAddress: request.ip || request.headers['x-forwarded-for'] || null,
        metadata: request.body.metadata || null,
      },
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'consent_recorded',
      entityType: 'consent_record',
      entityId: record.id,
      metadata: { consentType, version, granted },
    });

    return { record };
  });

  fastify.get('/consent', async (request) => {
    const records = await prisma.consentRecord.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    return { records };
  });

  // ─── Data Deletion Requests (HIPAA Compliance) ─────────────
  fastify.post('/data-deletion-request', async (request) => {
    const { deletedTypes } = request.body || {};

    const deletionRequest = await prisma.dataDeletionRequest.create({
      data: {
        userId: request.user.userId,
        status: 'pending',
        deletedTypes: deletedTypes || [],
      },
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'data_deletion_requested',
      entityType: 'data_deletion_request',
      entityId: deletionRequest.id,
      metadata: { deletedTypes: deletedTypes || [] },
    });

    return { request: deletionRequest };
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

    const where = { projectId: id };
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    const annotations = await prisma.projectAnnotation.findMany({
      where,
      include: {
        user: { select: { email: true, displayName: true } },
      },
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

    const existing = await prisma.projectAnnotation.findUnique({ where: { id: annotationId } });
    if (!existing) throw new NotFoundError('Annotation not found');
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
    const { annotationId } = request.params;
    const existing = await prisma.projectAnnotation.findUnique({ where: { id: annotationId } });
    if (!existing) throw new NotFoundError('Annotation not found');
    if (existing.userId !== request.user.userId) throw new ForbiddenError();

    await prisma.projectAnnotation.delete({ where: { id: annotationId } });
    return { success: true };
  });
}
