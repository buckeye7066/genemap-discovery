import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Keep the REAL shared helpers (groupScoreComponents, safeExternalHttpUrl) -
// this suite is about how the shared contract renders, so stubbing it out would
// make the test prove nothing. Only the network-touching client is replaced.
vi.mock('@genemap/shared', async (importOriginal) => ({
  ...(await importOriginal()),
  apiClient: { logActivity: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'score-decomposition-test@example.invalid' } }),
}));

import GeneCard from '../GeneCard';

/**
 * The Open Targets rule, pinned at the render layer.
 *
 * A source-published score may be shown BECAUSE it is decomposed: each part
 * names the class of evidence behind it, so a reader can see what produced the
 * ranking rather than being handed one unexplained number. The rolled-up
 * aggregate is refused by the API and must never appear here.
 */

const scoreComponents = [
  { id: 'genetic_association', label: 'Genetic association', score: 0.95, evidenceClass: 'human_verified', scale: 'open_targets_datatype_score_0_1' },
  { id: 'animal_model', label: 'Animal model', score: 0.42, evidenceClass: 'animal_model', scale: 'open_targets_datatype_score_0_1' },
  { id: 'literature', label: 'Literature', score: 0.61, evidenceClass: 'literature', scale: 'open_targets_datatype_score_0_1' },
];

const claim = (over = {}) => ({
  source: 'Open Targets Platform GraphQL API v4',
  recordId: 'ENSG00000001626',
  claim: 'Open Targets aggregates evidence for CFTR and cystic fibrosis.',
  subject: { kind: 'gene', id: 'ENSG00000001626', label: 'CFTR' },
  object: { kind: 'disease', id: 'MONDO:0009061', label: 'cystic fibrosis' },
  taxon: '9606',
  species: 'Homo sapiens',
  evidenceClass: 'computational',
  evidenceType: 'computed_target_disease_association',
  evidenceStrength: 'supporting',
  scoreComponents,
  releaseVersion: '26.06',
  referenceAssembly: null,
  retrievalDate: '2026-08-25',
  directLink: 'https://platform.opentargets.org/disease/MONDO_0009061/associations',
  isAiLead: false,
  ...over,
});

const gene = (claims) => ({
  gene_symbol: 'CFTR',
  symbol: 'CFTR',
  name: 'CF transmembrane conductance regulator',
  associationClaims: claims,
});

function renderCard(claims) {
  return render(<GeneCard gene={gene(claims)} index={0} />);
}

describe('GeneCard score decomposition', () => {
  it('shows every component the source stated, with its own score', () => {
    renderCard([claim()]);
    const panel = screen.getByText(/what produced this score/i).closest('div');

    // Some component labels intentionally repeat their class badge (a component
    // called "Animal model" IS animal-model evidence), so match all occurrences.
    expect(within(panel).getAllByText('Genetic association').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Animal model').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Literature').length).toBeGreaterThan(0);

    // The scores themselves are unique and are the load-bearing assertion.
    expect(within(panel).getByText('0.95')).toBeInTheDocument();
    expect(within(panel).getByText('0.42')).toBeInTheDocument();
    expect(within(panel).getByText('0.61')).toBeInTheDocument();
  });

  it('keeps each component attributed to its evidence class', () => {
    renderCard([claim()]);
    // The accessible label carries the attribution, so the meaning survives for
    // a screen reader and is not colour-only.
    expect(screen.getByLabelText(/genetic association: 0\.95 from human evidence/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/animal model: 0\.42 from animal model evidence/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/literature: 0\.61 from literature evidence/i)).toBeInTheDocument();
  });

  it('names the scale and says the numbers are the source’s, not GeneMap’s', () => {
    renderCard([claim()]);
    expect(screen.getByText(/open_targets_datatype_score_0_1/)).toBeInTheDocument();
    expect(screen.getByText(/source-published components, not a genemap calculation/i)).toBeInTheDocument();
  });

  it('renders nothing at all when the source published no components', () => {
    // Not a zero, not an empty chart, not "0.00" - absent.
    renderCard([claim({ scoreComponents: [] })]);
    expect(screen.queryByText(/what produced this score/i)).not.toBeInTheDocument();
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
  });

  it('never renders an absent component as a confident 0.00', () => {
    // Number(null) is 0 and Number.isFinite(0) is true, so a naive coercion
    // upstream would turn "the source said nothing" into a measured zero.
    renderCard([claim({
      scoreComponents: [
        scoreComponents[0],
        { id: 'rna_expression', label: 'RNA expression', score: 0, evidenceClass: 'computational', scale: 'open_targets_datatype_score_0_1' },
      ],
    })]);
    const panel = screen.getByText(/what produced this score/i).closest('div');
    expect(within(panel).getByText('0.95')).toBeInTheDocument();
    // A genuine 0 from the source is still shown - but it must be labelled and
    // attributed like any other component, never silently dropped or inflated.
    expect(within(panel).getByText('RNA expression')).toBeInTheDocument();
    expect(within(panel).getByText('0.00')).toBeInTheDocument();
  });

  it('does not show a rolled-up aggregate anywhere', () => {
    const { container } = renderCard([claim()]);
    expect(container.textContent).not.toContain('0.987654');
    expect(container.textContent).not.toMatch(/overall score|confidence score|association score:/i);
  });
});
