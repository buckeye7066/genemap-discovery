import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { activeWhere, creativeData, isAdvertisingOwner, publicFields, rasterImage, requireAdvertisingOwner, signDisplay, verifyDisplay, viewerHash } from '../services/advertising.js';

const viewerInput = z.object({ viewer: z.string().uuid() }).strict();
const eventInput = z.object({ ticket: z.string().max(1500), kind: z.enum(['impression', 'click']) }).strict();
const idInput = z.string().uuid();

export default async function advertisingRoutes(fastify) {
  const prisma = fastify.prisma;
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'private, no-store');
    return payload;
  });
  const secret = process.env.COOKIE_SECRET;
  fastify.get('/capability', async (request) => ({ canManage: isAdvertisingOwner(request.user) }));
  fastify.get('/feed', async () => ({ creatives: await prisma.adCreative.findMany({
    where: activeWhere(), select: publicFields, orderBy: { createdAt: 'asc' }, take: 100,
  }) }));
  fastify.get('/:id/image', async (request) => {
    const id = idInput.parse(request.params.id);
    const ad = await prisma.adCreative.findFirst({
      where: { id, ...(isAdvertisingOwner(request.user) ? { deletedAt: null } : activeWhere()) },
      select: { image: true },
    });
    if (!ad) throw new NotFoundError('Advertisement unavailable');
    return { image: `data:image/webp;base64,${Buffer.from(ad.image).toString('base64')}` };
  });
  fastify.post('/:id/display', async (request) => {
    const id = idInput.parse(request.params.id);
    const { viewer } = viewerInput.parse(request.body);
    if (isAdvertisingOwner(request.user)) return { ticket: null }; // previews never count
    const ad = await prisma.adCreative.findFirst({ where: { id, ...activeWhere() }, select: { id: true, revision: true } });
    if (!ad) throw new NotFoundError('Advertisement unavailable');
    const at = Date.now();
    return { ticket: signDisplay({ id, revision: ad.revision, viewer: viewerHash(viewer, secret), at }, secret) };
  });
  fastify.post('/event', async (request) => {
    const { ticket, kind } = eventInput.parse(request.body);
    if (isAdvertisingOwner(request.user)) return { counted: false };
    const display = verifyDisplay(ticket, secret);
    if (!display) throw new ValidationError('Display expired or invalid');
    const ad = await prisma.adCreative.findFirst({ where: { id: display.id, revision: display.revision, ...activeWhere() }, select: { id: true } });
    if (!ad) return { counted: false };
    // One measured impression per creative/viewer/15-second window. Replays and
    // simultaneous tabs resolve at the unique DB key, including across restarts.
    const displayKey = crypto.createHash('sha256').update(`${display.id}:${display.viewer}:${Math.floor(display.at / 15000)}`).digest('hex');
    if (kind === 'click' && !await prisma.adEvent.findUnique({ where: { displayKey_kind: { displayKey, kind: 'impression' } }, select: { id: true } })) return { counted: false };
    const result = await prisma.adEvent.createMany({ data: [{ creativeId: ad.id, viewer: display.viewer, displayKey, kind, day: new Date().toISOString().slice(0, 10) }], skipDuplicates: true });
    return { counted: result.count === 1 };
  });
  fastify.get('/manage', { preHandler: requireAdvertisingOwner }, async () => ({ creatives: await prisma.adCreative.findMany({
    where: { deletedAt: null }, select: publicFields, orderBy: { createdAt: 'desc' }, take: 100,
  }) }));
  fastify.post('/manage', { preHandler: requireAdvertisingOwner, bodyLimit: 3_000_000 }, async (request, reply) => {
    const { image, ...input } = request.body || {};
    const data = creativeData(input);
    const bytes = await rasterImage(image);
    if (await prisma.adCreative.count({ where: { deletedAt: null } }) >= 100) throw new ValidationError('Remove an advertisement before adding more (100 maximum)');
    const creative = await prisma.adCreative.create({ data: { ...data, image: bytes }, select: publicFields });
    return reply.code(201).send({ creative });
  });
  fastify.put('/manage/:id', { preHandler: requireAdvertisingOwner, bodyLimit: 3_000_000 }, async (request) => {
    const id = idInput.parse(request.params.id);
    const { image, ...input } = request.body || {};
    const data = creativeData(input);
    if (image !== undefined) data.image = await rasterImage(image);
    const result = await prisma.adCreative.updateMany({ where: { id, deletedAt: null }, data: { ...data, revision: { increment: 1 } } });
    if (!result.count) throw new NotFoundError('Advertisement unavailable');
    return { success: true };
  });
  fastify.delete('/manage/:id', { preHandler: requireAdvertisingOwner }, async (request) => {
    const id = idInput.parse(request.params.id);
    const result = await prisma.adCreative.updateMany({ where: { id, deletedAt: null }, data: { paused: true, deletedAt: new Date(), image: Buffer.alloc(0), revision: { increment: 1 } } });
    if (!result.count) throw new NotFoundError('Advertisement unavailable');
    return { success: true };
  });
  fastify.get('/manage/stats', { preHandler: requireAdvertisingOwner }, async () => {
    // Aggregates only: no raw viewer identifiers, account data, referrers,
    // searches, profiles, or genomic information are stored or returned.
    const [totals, creatives, daily] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE kind = 'impression')::int AS impressions, COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks, COUNT(DISTINCT viewer) FILTER (WHERE kind = 'impression')::int AS viewers FROM ad_events`,
      prisma.$queryRaw`SELECT creative_id AS id, COUNT(*) FILTER (WHERE kind = 'impression')::int AS impressions, COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks, COUNT(DISTINCT viewer) FILTER (WHERE kind = 'impression')::int AS viewers FROM ad_events GROUP BY creative_id`,
      prisma.$queryRaw`SELECT day, COUNT(*) FILTER (WHERE kind = 'impression')::int AS impressions, COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks, COUNT(DISTINCT viewer) FILTER (WHERE kind = 'impression')::int AS viewers FROM ad_events WHERE created_at >= NOW() - INTERVAL '90 days' GROUP BY day ORDER BY day DESC`,
    ]);
    return { totals: totals[0], creatives, daily };
  });
}
