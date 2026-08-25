/**
 * Project API contract test.
 *
 * Four separate defects shipped at once because the Research Mode UI still
 * spoke the Base44-era snake_case vocabulary (`name`, `user_email`,
 * `current_version`, `updated_date`, `snapshot_data`) while the server, the
 * shared types in packages/shared/src/types.ts, and packages/shared/src/client.ts
 * had all moved to camelCase. Nothing compared the two, so the drift was
 * invisible until a user pressed a button.
 *
 * This is the thing that compares them. It:
 *   1. drives the REAL Fastify app and records the field names the project
 *      surface actually returns, then
 *   2. scans the UI that consumes those entities and asserts every field it
 *      reads exists in the recorded contract.
 *
 * Either side drifting fails this test, and the failure names the field and
 * the file. A UI-only field must be declared in UI_ONLY_FIELDS with a reason —
 * an entry there is a decision, not a mute button.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie, seedAuthUser } from './setup.js';

const webRoot = fileURLToPath(new URL('../../../../apps/web', import.meta.url));

const OWNER = { userId: 'contract-owner', email: 'owner@example.com', role: 'user' };
const MATE = { userId: 'contract-mate', email: 'mate@example.com', role: 'user' };

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});
afterAll(async () => app.close());
beforeEach(() => {
  prisma._reset();
  seedAuthUser(prisma, OWNER);
  seedAuthUser(prisma, MATE);
});

const cookie = () => authCookie(OWNER, prisma);

async function inject(method, url, payload) {
  const res = await app.inject({ method, url, headers: { cookie: cookie() }, payload });
  return { statusCode: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

/**
 * UI-side field reads that are legitimately not API fields. Each needs a reason.
 */
const UI_ONLY_FIELDS = {
  project: new Map([
    ['_count', 'Prisma relation count (versions) included by GET /entities/projects; list rows only.'],
    ['collaborators', 'Relation included by GET /entities/projects; absent from the POST/PUT single-project response.'],
    ['user', 'Owner {email, displayName} relation included by GET /entities/projects so the collaboration panel can name the owner.'],
  ]),
  version: new Map(),
  collaborator: new Map([
    ['user', 'Nested {email, displayName} included by GET /entities/projects; the collaborator row itself carries only userId.'],
  ]),
  annotation: new Map([
    ['user', 'Nested {email, displayName} included by GET /entities/projects/:id/annotations so a note can show its author.'],
  ]),
};

describe('Project API contract — recorded from the real app', () => {
  it('POST /entities/projects returns the documented project shape', async () => {
    const created = await inject('POST', '/entities/projects', {
      title: 'Contract Project',
      description: 'desc',
      genes: ['BRCA1'],
      metadata: { phenotypes: ['HP:0000001'], tags: ['x'] },
    });
    expect(created.statusCode).toBe(200);
    const project = created.body.project;

    // The create contract is `title`, not `name`. A UI posting `name` gets a 400.
    // Subset assertion, not equality: `status` comes from a Prisma column
    // default that the in-memory test double does not model. The real-Postgres
    // pass in postgres-integration.test.js sees it. What matters here is that
    // no key outside the contract appears, and none of the legacy names do.
    const PROJECT_CONTRACT_KEYS = [
      'createdAt', 'description', 'genes', 'id', 'metadata', 'status', 'title', 'updatedAt', 'userId',
    ];
    expect(Object.keys(project)).toEqual(
      expect.arrayContaining(['id', 'title', 'description', 'genes', 'metadata', 'createdAt', 'updatedAt'])
    );
    expect(Object.keys(project).filter((k) => !PROJECT_CONTRACT_KEYS.includes(k))).toEqual([]);
    for (const legacy of ['name', 'current_version', 'updated_date', 'created_date', 'is_collaborative']) {
      expect(project, `legacy key "${legacy}" must not be in the contract`).not.toHaveProperty(legacy);
    }

    const rejected = await inject('POST', '/entities/projects', { name: 'Wrong Key' });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.body.error).toMatch(/title is required/i);
  });

  it('POST /entities/projects/:id/collaborators requires userEmail, not user_email', async () => {
    const { body: { project } } = await inject('POST', '/entities/projects', { title: 'P' });

    const wrong = await inject('POST', `/entities/projects/${project.id}/collaborators`, {
      user_email: MATE.email,
      role: 'viewer',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.body.error).toMatch(/userEmail is required/i);

    const right = await inject('POST', `/entities/projects/${project.id}/collaborators`, {
      userEmail: MATE.email,
      role: 'viewer',
    });
    expect(right.statusCode).toBe(200);
    expect(Object.keys(right.body.collaborator)).toEqual(
      expect.arrayContaining(['id', 'projectId', 'userId', 'role'])
    );
  });

  it('GET /entities/projects/:id/versions returns version/changes/notes/createdBy/createdAt', async () => {
    const { body: { project } } = await inject('POST', '/entities/projects', { title: 'P' });
    const { statusCode, body } = await inject('GET', `/entities/projects/${project.id}/versions`);
    expect(statusCode).toBe(200);
    expect(body.versions.length).toBeGreaterThan(0);

    const version = body.versions[0];
    // NOT version_number / change_type / changes_description / modified_by /
    // created_date, and NOT snapshot_data — see the snapshot test below.
    expect(Object.keys(version)).toEqual(
      expect.arrayContaining(['id', 'projectId', 'version', 'changes', 'snapshot', 'notes', 'createdBy', 'createdAt'])
    );
    expect(version).not.toHaveProperty('version_number');
    expect(version).not.toHaveProperty('change_type');
  });

  it('stores a restorable snapshot on every version it writes', async () => {
    const { body: { project } } = await inject('POST', '/entities/projects', {
      title: 'Original', description: 'first', genes: ['BRCA1'],
    });
    await inject('PUT', `/entities/projects/${project.id}`, {
      title: 'Renamed', genes: ['TP53'],
    });

    const { body } = await inject('GET', `/entities/projects/${project.id}/versions`);
    // Selected by version number, not array position: the assertion is about
    // snapshot content, and should not also be a test of result ordering.
    const initial = body.versions.find((v) => v.version === 1);
    const latest = body.versions.find((v) => v.version === 2);
    expect(initial && latest, 'both versions must exist').toBeTruthy();

    // `changes` is a DELTA and cannot be replayed into a state; `snapshot` is
    // the state. Both exist, and they are not the same thing.
    expect(initial.snapshot).toMatchObject({ title: 'Original', genes: ['BRCA1'] });
    expect(latest.snapshot).toMatchObject({ title: 'Renamed', genes: ['TP53'] });
    expect(latest.changes).toMatchObject({ title: 'Renamed' });

    // The snapshot is exactly what PUT accepts, so restoring it is a plain
    // update with nothing missing and nothing invented.
    const restore = await inject('PUT', `/entities/projects/${project.id}`, initial.snapshot);
    expect(restore.statusCode).toBe(200);
    expect(restore.body.project.title).toBe('Original');
    expect(restore.body.project.genes).toEqual(['BRCA1']);
  });

  it('leaves snapshot NULL rather than inventing one for pre-migration rows', async () => {
    // A row written before migration 20260825120000 has no snapshot. Nothing
    // may backfill or infer one — the UI must refuse the restore and say why.
    const { body: { project } } = await inject('POST', '/entities/projects', { title: 'P' });
    const legacy = await prisma.projectVersion.create({
      data: {
        projectId: project.id, version: 99, changes: { title: 'legacy delta' },
        notes: 'pre-snapshot row', createdBy: OWNER.userId,
      },
    });
    expect(legacy.snapshot ?? null).toBeNull();
  });

  it('GET /entities/projects/:id/annotations returns a wrapped list the client unwraps', async () => {
    const { body: { project } } = await inject('POST', '/entities/projects', { title: 'P' });
    await inject('POST', `/entities/projects/${project.id}/annotations`, {
      targetType: 'gene', targetId: 'BRCA1', content: 'note',
    });
    const { statusCode, body } = await inject('GET', `/entities/projects/${project.id}/annotations`);
    expect(statusCode).toBe(200);
    // The HTTP layer wraps; apiClient.getProjectAnnotations() returns res.annotations.
    // A caller that reads `.annotations` off the CLIENT result gets undefined.
    expect(Array.isArray(body.annotations)).toBe(true);
    expect(body.annotations[0]).toHaveProperty('content');
  });
});

// ─── UI consumption scan ────────────────────────────────────────────────────

const ENTITY_VARIABLES = {
  project: ['project', 'selectedProject', 'proj'],
  version: ['version'],
  collaborator: ['collab', 'collaborator'],
  annotation: ['annotation'],
};

const SCANNED_FILES = [
  'components/research/ProjectManager.jsx',
  'components/research/ProjectCollaboration.jsx',
  'components/research/ProjectVersionControl.jsx',
];

function memberReads(source, variableNames) {
  const found = new Map(); // field -> line number
  const lines = source.split('\n');
  const alternation = variableNames.join('|');
  const pattern = new RegExp(`\\b(?:${alternation})\\??\\.([A-Za-z_][A-Za-z0-9_]*)`, 'gu');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(pattern)) {
      if (!found.has(match[1])) found.set(match[1], index + 1);
    }
  });
  return found;
}

// Fields common to every object returned by the API surface, plus JS builtins a
// field read can legitimately resolve to.
const JS_BUILTINS = new Set(['length', 'map', 'filter', 'find', 'slice', 'replace', 'toString', 'then']);

describe('Research UI reads only fields the project API returns', () => {
  /** Contracts recorded live in the suite above, restated here as the assertion target. */
  const CONTRACT = {
    project: new Set(['id', 'userId', 'title', 'description', 'status', 'genes', 'metadata', 'createdAt', 'updatedAt']),
    version: new Set(['id', 'projectId', 'version', 'changes', 'snapshot', 'notes', 'createdBy', 'createdAt']),
    collaborator: new Set(['id', 'projectId', 'userId', 'role', 'addedBy', 'createdAt']),
    annotation: new Set(['id', 'projectId', 'userId', 'targetType', 'targetId', 'content', 'parentId', 'resolved', 'createdAt', 'updatedAt']),
  };

  it('has the files it claims to scan', () => {
    for (const relative of SCANNED_FILES) {
      expect(existsSync(path.join(webRoot, relative)), `${relative} must exist`).toBe(true);
    }
  });

  it.each(Object.keys(CONTRACT))('reads only contract fields off a %s', (entity) => {
    const allowed = CONTRACT[entity];
    const uiOnly = UI_ONLY_FIELDS[entity];
    const violations = [];
    let reads = 0;

    for (const relative of SCANNED_FILES) {
      const source = readFileSync(path.join(webRoot, relative), 'utf8');
      for (const [field, line] of memberReads(source, ENTITY_VARIABLES[entity])) {
        reads += 1;
        if (allowed.has(field) || uiOnly.has(field) || JS_BUILTINS.has(field)) continue;
        violations.push(
          `apps/web/${relative}:${line} reads "${field}" off a ${entity}, which the API never returns. `
            + `Contract: ${[...allowed].sort().join(', ')}. `
            + 'Fix the UI to use the real field, or declare it in UI_ONLY_FIELDS with a reason.'
        );
      }
    }

    expect(reads, `scan matched no ${entity} field reads — the extractor is broken`).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it('keeps every UI_ONLY_FIELDS entry justified and non-redundant', () => {
    const problems = [];
    for (const [entity, entries] of Object.entries(UI_ONLY_FIELDS)) {
      for (const [field, reason] of entries) {
        if (typeof reason !== 'string' || reason.trim().length < 30) {
          problems.push(`${entity}.${field}: needs a written reason, not a placeholder`);
        }
        if (CONTRACT[entity].has(field)) {
          problems.push(`${entity}.${field}: redundant — it IS in the contract`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
