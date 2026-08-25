import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Keep the REAL shared contract — this suite is about how GeneMap's own ranking
// policy renders, so stubbing it out would make the test prove nothing.
vi.mock('@genemap/shared', async (importOriginal) => ({
  ...(await importOriginal()),
  apiClient: { logActivity: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'ranking-test@example.invalid' } }),
}));

import GeneCard from '../GeneCard';

const humanClaim = {
  source: 'Monarch Initiative',
  recordId: 'assoc-1',
  claim: 'SCN1A is associated with seizures.',
  subject: null,
  object: null,
  taxon: '9606',
  species: 'Homo sapiens',
  evidenceClass: 'human_verified',
  evidenceType: 'gene_phenotype_association',
  evidenceStrength: 'supporting',
  scoreComponents: [],
  releaseVersion: '2026-06-08',
  referenceAssembly: null,
  retrievalDate: '2026-08-25',
  directLink: 'https://monarchinitiative.org/assoc-1',
  isAiLead: false,
};

const aiLead = {
  ...humanClaim,
  source: 'GeneMap AI candidate generator',
  recordId: null,
  claim: 'SCN1A is an AI-suggested candidate lead',
  evidenceClass: 'ai_lead',
  evidenceType: 'model_suggestion',
  evidenceStrength: 'lead',
  releaseVersion: 'publication-task/candidate_gene_research@1',
  retrievalDate: null,
  directLink: null,
  isAiLead: true,
};

const animalClaim = {
  ...humanClaim,
  source: 'Monarch Initiative ortholog-phenotype grid',
  recordId: 'ortho-1',
  taxon: '10090',
  species: 'Mus musculus',
  evidenceClass: 'animal_model',
  evidenceType: 'ortholog_phenotype_inference',
};

// The ranking-basis card lives behind the card's expand toggle, so every test
// opens it first — asserting on a collapsed card would prove nothing.
const renderCard = (claims) => {
  const utils = render(
    <GeneCard
      gene={{ gene_symbol: 'SCN1A', symbol: 'SCN1A', name: 'sodium channel', associationClaims: claims }}
      index={0}
    />,
  );
  const toggle = utils.container.querySelector('[data-state]')?.closest('button')
    || utils.container.querySelectorAll('button')[utils.container.querySelectorAll('button').length - 1];
  fireEvent.click(toggle);
  return utils;
};

const panel = () => screen.getByText(/why this gene\?/i).closest('div');

describe('GeneCard ranking explanation', () => {
  it('attributes the ordinal to GeneMap rather than to a source', () => {
    renderCard([humanClaim]);
    expect(
      within(panel()).getByText(/GeneMap ranking policy/i),
    ).toHaveTextContent(/not a score published by any source/i);
  });

  it('marks which claim sets the rank, and says the others were outranked', () => {
    renderCard([animalClaim, humanClaim]);
    const determining = within(panel()).getByText(/sets the rank/i).closest('li');
    expect(determining).toHaveTextContent('Monarch Initiative');
    expect(within(panel()).getAllByText(/sets the rank/i)).toHaveLength(1);

    // THE RANK IS A MAX, NOT A SUM. The animal-model claim is real evidence but
    // did not change the outcome, and must not read as though it added to it.
    expect(
      within(panel()).getByText(/removing it would not change the rank/i),
    ).toBeInTheDocument();
    expect(
      within(panel()).getByText(/the rank is the highest-ranking claim, not a total/i),
    ).toBeInTheDocument();
  });

  it('identifies each row beyond its source, so repeated providers stay distinct', () => {
    // The Monarch ortholog grid can emit several claims under one source name.
    const grid = (recordId) => ({ ...animalClaim, recordId, claim: recordId });
    renderCard([grid('mgi-1'), grid('mgi-2')]);
    expect(within(panel()).getByText(/mgi-1/)).toBeInTheDocument();
    expect(within(panel()).getByText(/mgi-2/)).toBeInTheDocument();
    expect(within(panel()).getAllByText(/ortholog_phenotype_inference/).length).toBe(2);
  });

  it('does not promise a better list position', () => {
    renderCard([animalClaim]);
    expect(screen.getByText(/does not guarantee a higher position in this list/i)).toBeInTheDocument();
    expect(screen.queryByText(/would rank it above its current position/i)).not.toBeInTheDocument();
  });

  it('never offers an improvement the ranking policy scores as zero', () => {
    renderCard([aiLead]);
    expect(screen.getByText(/what would change this ranking\?/i)).toBeInTheDocument();
    // external_followup ranks 100 but claimSortKey zeroes it unconditionally.
    expect(screen.queryByText(/follow-up database record/i)).not.toBeInTheDocument();
  });

  it('lists a claim that contributed nothing, with the reason', () => {
    renderCard([aiLead, humanClaim]);
    expect(
      within(panel()).getByText(/Generated research lead — not retrieved from any source/i),
    ).toBeInTheDocument();
  });

  it('says plainly when nothing retrieved supports the gene', () => {
    renderCard([aiLead]);
    expect(
      within(panel()).getByText(/Nothing retrieved supports this gene for this query yet/i),
    ).toBeInTheDocument();
  });

  it('answers "what would change this ranking" with the classes ranked above', () => {
    renderCard([animalClaim]);
    expect(screen.getByText(/what would change this ranking\?/i)).toBeInTheDocument();
    expect(screen.getByText(/human association record from a named source/i)).toBeInTheDocument();
    expect(screen.getByText(/computed association from a named source/i)).toBeInTheDocument();
    // Never "get an AI lead", and never a class at or below the current one.
    expect(screen.queryByText(/generated research lead would rank/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model-organism association record would rank/i)).not.toBeInTheDocument();
  });

  it('offers no further improvement once at the top of the policy', () => {
    renderCard([humanClaim]);
    expect(screen.queryByText(/what would change this ranking\?/i)).not.toBeInTheDocument();
  });

  it('renders no panel at all for a gene with no claims', () => {
    renderCard([]);
    expect(screen.queryByText(/why this gene\?/i)).not.toBeInTheDocument();
  });
});
