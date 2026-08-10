import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DemographicCheck from '../DemographicCheck';

const auth = vi.hoisted(() => ({
  user: { id: 'learner', demographics_collected: false },
  isLoadingAuth: false,
}));

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => auth,
}));

function LocationEcho() {
  const location = useLocation();
  return <div>Location: {location.pathname}</div>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={(
            <DemographicCheck>
              <LocationEcho />
            </DemographicCheck>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DemographicCheck privacy access', () => {
  it('never requires optional demographics before Account & Privacy', () => {
    renderAt('/accountsettings');
    expect(screen.getByText('Location: /accountsettings')).toBeInTheDocument();
  });

  it('continues to route ordinary protected pages to demographic collection', async () => {
    renderAt('/search');
    expect(await screen.findByText('Location: /demographiccollection')).toBeInTheDocument();
  });
});
