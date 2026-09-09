import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const withPostgres = process.env.TEST_DB === 'postgres' ? describe : describe.skip;
withPostgres('advertising persistence and concurrent deduplication (real PostgreSQL)', () => {
  let prisma;
  const id = crypto.randomUUID();
  const viewer = crypto.randomBytes(32).toString('hex');
  const displayKey = crypto.randomBytes(32).toString('hex');
  beforeAll(async () => { prisma = new PrismaClient(); await prisma.$connect(); });
  afterAll(async () => {
    await prisma.adEvent.deleteMany({ where: { creativeId: id } });
    await prisma.adCreative.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });
  it('preserves image and campaign across connections and counts each event once under races', async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).webp().toBuffer();
    await prisma.adCreative.create({ data: { id, advertiser: 'Integration test fixture', headline: 'Not published', body: '', targetUrl: 'https://example.invalid', seconds: 15, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), paused: true, image } });
    await prisma.$disconnect();
    prisma = new PrismaClient();
    const persisted = await prisma.adCreative.findUnique({ where: { id } });
    expect(Buffer.from(persisted.image).equals(image)).toBe(true);
    expect(persisted.paused).toBe(true);
    const event = { creativeId: id, viewer, displayKey, kind: 'impression', day: new Date().toISOString().slice(0, 10) };
    const results = await Promise.all(Array.from({ length: 10 }, () => prisma.adEvent.createMany({ data: [event], skipDuplicates: true })));
    expect(results.reduce((sum, result) => sum + result.count, 0)).toBe(1);
    await prisma.adEvent.createMany({ data: [{ ...event, kind: 'click' }], skipDuplicates: true });
    const counts = await prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE kind = 'impression')::int AS impressions, COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks, COUNT(DISTINCT viewer)::int AS viewers FROM ad_events WHERE creative_id = ${id}`;
    expect(counts[0]).toEqual({ impressions: 1, clicks: 1, viewers: 1 });
    await prisma.adCreative.update({ where: { id }, data: { deletedAt: new Date(), image: Buffer.alloc(0), paused: true } });
    expect(await prisma.adEvent.count({ where: { creativeId: id } })).toBe(2);
    expect((await prisma.adCreative.findUnique({ where: { id } })).image.byteLength).toBe(0);
  });
});
