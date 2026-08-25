import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const api = {
  getProjects: vi.fn(),
  createProject: vi.fn(),
  getProjectAnnotations: vi.fn(),
  createAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
  getProjectVersions: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  addCollaborator: vi.fn(),
  removeCollaborator: vi.fn(),
};

vi.mock('@genemap/shared', () => ({ apiClient: new Proxy({}, { get: (_t, k) => (...a) => api[k](...a) }) }));
vi.mock('../../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' } }),
}));

import ProjectManager from '../ProjectManager';

/** A project row exactly as GET /entities/projects returns it. */
const PROJECT = {
  id: 'p1',
  userId: 'u1',
  title: 'Ciliopathy candidates',
  description: 'desc',
  status: 'active',
  genes: ['BBS1'],
  metadata: { phenotypes: ['retinal dystrophy'], tags: ['cilia'] },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  user: { email: 'owner@example.com', displayName: 'Owner' },
  collaborators: [],
  _count: { versions: 4 },
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getProjects.mockResolvedValue([PROJECT]);
  api.getProjectAnnotations.mockResolvedValue([]);
  api.getProjectVersions.mockResolvedValue([]);
  api.createProject.mockResolvedValue({ id: 'p2' });
});
afterEach(() => vi.restoreAllMocks());

describe('ProjectManager project cards', () => {
  it('renders title / version count / updatedAt from the real contract', async () => {
    render(<ProjectManager />);
    expect(await screen.findByText('Ciliopathy candidates')).toBeInTheDocument();
    // v4 comes from _count.versions, not a nonexistent `current_version`.
    expect(screen.getByText(/v4/)).toBeInTheDocument();
    expect(screen.queryByText(/Updated Unknown/)).not.toBeInTheDocument();
  });

  it('does not invent a version number when the count is absent', async () => {
    api.getProjects.mockResolvedValue([{ ...PROJECT, _count: undefined }]);
    render(<ProjectManager />);
    await screen.findByText('Ciliopathy candidates');
    // Better to say nothing than to print a made-up "v1".
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });
});

describe('ProjectManager create', () => {
  it('posts title (not name) and folds phenotypes/tags into metadata', async () => {
    render(<ProjectManager />);
    await screen.findByText('Ciliopathy candidates');

    fireEvent.click(screen.getByRole('button', { name: /new project/i }));
    fireEvent.change(await screen.findByLabelText(/project name/i), {
      target: { value: 'New Study' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create project$/i }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    const payload = api.createProject.mock.calls[0][0];

    expect(payload.title).toBe('New Study');
    // Regression: `name` was rejected by the server with 400 every time.
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('current_version');
    // phenotypes/tags are not columns; sent top-level they were silently dropped.
    expect(payload).not.toHaveProperty('phenotypes');
    expect(payload).not.toHaveProperty('tags');
    expect(payload.metadata).toEqual({ phenotypes: [], tags: [] });
  });
});

describe('ProjectManager annotations', () => {
  it('renders the list the client returns (it is already an array)', async () => {
    // Regression: the component read `.annotations` off the CLIENT result.
    // apiClient.getProjectAnnotations() already unwraps to Annotation[], so
    // that was always undefined and the list was permanently empty.
    api.getProjectAnnotations.mockResolvedValue([
      {
        id: 'a1', projectId: 'p1', targetType: 'gene', targetId: 'BBS1',
        content: 'Check ciliary transport', resolved: false,
        createdAt: '2026-08-02T00:00:00.000Z',
        user: { email: 'owner@example.com', displayName: 'Owner' },
      },
    ]);

    render(<ProjectManager />);
    fireEvent.click(await screen.findByText('Ciliopathy candidates'));
    // Radix TabsTrigger activates on pointer down, not click alone.
    const tab = await screen.findByRole('tab', { name: /annotations/i });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    expect(await screen.findByText('Check ciliary transport')).toBeInTheDocument();
    expect(screen.queryByText(/no annotations yet/i)).not.toBeInTheDocument();
  });
});
