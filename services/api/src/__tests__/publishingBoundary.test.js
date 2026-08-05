import { describe, expect, it, vi } from 'vitest';
import {
  HIGH_RISK_CLINICAL_FEATURES_ENABLED,
  PUBLICATION_MODE,
  enforcePublishingBoundary,
  isPersonalClinicalPrompt,
  publicationBoundaryDecision,
} from '../config/publishingBoundary.js';

describe('publishable education/research boundary', () => {
  it('is fail-closed in source code rather than controlled by deployment env', () => {
    expect(PUBLICATION_MODE).toBe('education_research');
    expect(HIGH_RISK_CLINICAL_FEATURES_ENABLED).toBe(false);
  });

  it.each([
    '/clinical-trials/search?gene=BRCA1',
    '/clinical-trials/NCT00000000',
    '/genomics/vcf/parse',
    '/genomics/vcf/enrich',
    '/entities/medical-data',
    '/entities/medical-data/record-1',
    '/entities/conversations',
    '/entities/conversations/conversation-1',
  ])('hides high-risk API path %s', (url) => {
    expect(publicationBoundaryDecision({ url, body: {} })).toMatchObject({
      statusCode: 404,
      code: 'FEATURE_NOT_AVAILABLE',
    });
  });

  it.each(['robert', 'Robert', 'anastasia'])('blocks clinical agent %s server-side', (agent) => {
    expect(publicationBoundaryDecision({
      url: '/llm/invoke',
      body: { prompt: 'Explain BRCA1', agent },
    })).toMatchObject({ statusCode: 403, code: 'EDUCATION_RESEARCH_BOUNDARY' });
  });

  it.each([
    'Interpret my variant and tell me my personal risk level.',
    'I am taking warfarin; what dose should I use for my genotype?',
    'What diagnosis fits this patient and these symptoms?',
    'Explain the pharmacogenomic drug implications for my child.',
  ])('blocks personalized clinical generation: %s', (prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(true);
    expect(publicationBoundaryDecision({ url: '/education/chat', body: {
      messages: [{ role: 'user', content: prompt }],
    } })).toMatchObject({ statusCode: 403 });
  });

  it.each([
    ['general genetics lesson', '/education/explain', { topic: 'What is pharmacogenomics?' }],
    ['general PGx mechanism', '/llm/invoke', { prompt: 'Explain how CYP2D6 metabolizer phenotypes are defined.' }],
    ['gene lookup', '/genomics/gene/CFTR', null],
    ['candidate enrichment', '/genomics/enrich', { symbols: ['CFTR'] }],
    ['research project', '/entities/projects', { title: 'CFTR literature review' }],
  ])('allows %s', (_label, url, body) => {
    expect(publicationBoundaryDecision({ url, body })).toBeNull();
  });

  it('returns a structured response without logging sensitive prompt text', async () => {
    const send = vi.fn((payload) => payload);
    const code = vi.fn(() => ({ send }));
    const info = vi.fn();
    const reply = { code };
    const request = {
      raw: { url: '/llm/invoke' },
      body: { prompt: 'Interpret my variant and tell me my risk.' },
      log: { info },
    };

    await enforcePublishingBoundary(request, reply);

    expect(code).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EDUCATION_RESEARCH_BOUNDARY',
      publicationMode: 'education_research',
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('Interpret my variant');
  });
});

