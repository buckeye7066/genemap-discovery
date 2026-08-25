import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const getProjectVersions = vi.fn();
const updateProject = vi.fn();

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getProjectVersions: (...args) => getProjectVersions(...args),
    updateProject: (...args) => updateProject(...args),
  },
}));
vi.mock('../../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' } }),
}));

import ProjectVersionControl from '../ProjectVersionControl';

const PROJECT = { id: 'p1', title: 'Original' };

const version = (over = {}) => ({
  id: `v${over.version ?? 1}`,
  projectId: 'p1',
  version: 1,
  changes: { type: 'initial' },
  snapshot: { title: 'Original', description: null, status: 'active', genes: ['BRCA1'], metadata: null },
  notes: 'Project created',
  createdBy: 'owner@example.com',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  getProjectVersions.mockReset();
  updateProject.mockReset().mockResolvedValue({ id: 'p1' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('ProjectVersionControl restore', () => {
  it('restores from the stored snapshot, sending exactly the fields PUT accepts', async () => {
    getProjectVersions.mockResolvedValue([
      version({ version: 2, changes: { title: 'Renamed' }, notes: 'Updated: title', snapshot: { title: 'Renamed', description: null, status: 'active', genes: ['TP53'], metadata: null } }),
      version({ version: 1 }),
    ]);

    render(<ProjectVersionControl project={PROJECT} onRestore={vi.fn()} />);
    await screen.findByText('v1');

    fireEvent.click(screen.getByText('v1').closest('button'));
    const restoreButton = await screen.findByRole('button', { name: /restore this version/i });
    fireEvent.click(restoreButton);

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    expect(updateProject).toHaveBeenCalledWith('p1', {
      title: 'Original', description: null, status: 'active', genes: ['BRCA1'], metadata: null,
    });
    // It must NOT invent a version number; the server assigns it.
    expect(updateProject.mock.calls[0][1]).not.toHaveProperty('current_version');
  });

  it('REFUSES LOUDLY on a version with no snapshot and never calls the API', async () => {
    // Regression: this used to spread `undefined` into the payload. The server
    // ignores unknown keys, returned 200, and the UI reported success while
    // nothing was restored. A silent no-op reported as success is the defect
    // class this test exists to prevent.
    getProjectVersions.mockResolvedValue([
      version({ version: 2 }),
      version({ version: 1, snapshot: null, notes: 'pre-snapshot row' }),
    ]);

    render(<ProjectVersionControl project={PROJECT} onRestore={vi.fn()} />);
    await screen.findByText('v1');

    // The restore control is not offered at all for an unrestorable version...
    fireEvent.click(screen.getByText('v1').closest('button'));
    await screen.findByText(/cannot be shown or restored/i);
    expect(screen.queryByRole('button', { name: /restore this version/i })).not.toBeInTheDocument();
    expect(screen.getByText('no snapshot')).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('renders the real version fields, not the legacy snake_case ones', async () => {
    getProjectVersions.mockResolvedValue([version({ version: 3, notes: 'Updated: genes', changes: { genes: ['TP53'] } })]);

    render(<ProjectVersionControl project={PROJECT} onRestore={vi.fn()} />);

    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByText('Updated: genes')).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText(/current version:/i)).toHaveTextContent('3');
    // `version_number` / `change_type` / `changes_description` do not exist;
    // reading them rendered "undefined" (and change_type.replace() threw).
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});
