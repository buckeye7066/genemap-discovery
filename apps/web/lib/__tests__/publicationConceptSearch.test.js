import { test } from 'vitest';
import assert from 'node:assert/strict';
import { lookupPublicationConceptSuggestions, resolveConceptSubmission } from '../publicationConceptSearch.js';

const mondo = (label = 'relapsing polychondritis', identifier = 'MONDO:0009999') => ({
  kind: 'mondo', identifier, canonicalLabel: label, source: 'Monarch Initiative', apiVersion: 'v3',
});
const hpo = (label = 'Seizure', identifier = 'HP:0001250') => ({
  kind: 'hpo', identifier, canonicalLabel: label, source: 'NLM Clinical Tables HPO', apiVersion: 'v3',
});

test('typed polychondritis searches both ontologies and offers the returned disease identity', async () => {
  const calls = [];
  const result = await resolveConceptSubmission('polychondritis', 'free_text', null, async (query, kind) => {
    calls.push([query, kind]);
    return { suggestions: kind === 'disease' ? [mondo()] : [] };
  });
  assert.deepEqual(calls, [['polychondritis', 'phenotype'], ['polychondritis', 'disease']]);
  assert.equal(result.status, 'choose');
  assert.deepEqual(result.suggestions[0].publicationReference, { kind: 'mondo', identifier: 'MONDO:0009999' });
  assert.equal(result.reference, undefined);
});

test('a unique exact canonical label resolves to identifier-only input', async () => {
  const result = await resolveConceptSubmission('  Relapsing Polychondritis  ', 'free_text', null,
    async (_query, kind) => ({ suggestions: kind === 'disease' ? [mondo()] : [] }));
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.reference, { kind: 'mondo', identifier: 'MONDO:0009999' });
  assert.equal(result.query, 'relapsing polychondritis');
});

test('an exact curated disease works in the default field without a network lookup', async () => {
  const result = await resolveConceptSubmission('Cystic Fibrosis', 'free_text', null, () => assert.fail('unexpected lookup'));
  assert.equal(result.reference.conceptId, 'disease:cystic-fibrosis');
});

test('exact HPO and MONDO identifiers do not require typeahead availability', async () => {
  for (const query of ['hp:0001250', 'mondo:0009061']) {
    const result = await resolveConceptSubmission(query, 'free_text', null, () => assert.fail('unexpected lookup'));
    assert.equal(result.status, 'resolved');
    assert.equal(result.reference.identifier, query.toUpperCase());
  }
});

test('a retained selected reference can be resubmitted without re-resolving its display label', async () => {
  const result = await resolveConceptSubmission('relapsing polychondritis', 'disease',
    { kind: 'mondo', identifier: 'MONDO:0009999', injectedPrompt: 'discard me' },
    () => assert.fail('unexpected lookup'));
  assert.deepEqual(result.reference, { kind: 'mondo', identifier: 'MONDO:0009999' });
});

test('ambiguous exact labels are choices, never arbitrary auto-selection', async () => {
  const result = await resolveConceptSubmission('overlap', 'free_text', null,
    async (_query, kind) => ({ suggestions: kind === 'disease' ? [mondo('overlap')] : [hpo('overlap')] }));
  assert.equal(result.status, 'choose');
  assert.equal(result.suggestions.length, 2);
});

test('a no-match result is not a publication-artifact error', async () => {
  const result = await resolveConceptSubmission('unmatched term', 'free_text', null, async () => ({ suggestions: [] }));
  assert.equal(result.status, 'no_matches');
  assert.match(result.message, /try a synonym/i);
  assert.doesNotMatch(result.message, /publication artifact/i);
  assert.equal(result.reference, undefined);
});

test('503 lookup failures offer retry guidance rather than pretending there are no matches', async () => {
  const result = await resolveConceptSubmission('polychondritis', 'free_text', null, async () => {
    throw Object.assign(new Error('unavailable'), { status: 503 });
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.message, /text has been kept/i);
});

test('a partial resolver outage retains choices but cannot establish exact-match uniqueness', async () => {
  const result = await resolveConceptSubmission('relapsing polychondritis', 'free_text', null, async (_query, kind) => {
    if (kind === 'phenotype') throw new Error('offline');
    return { suggestions: [mondo()] };
  });
  assert.equal(result.status, 'choose');
  assert.equal('unavailable' in result && result.unavailable, true);
  assert.equal(result.reference, undefined);
});

test('malformed suggestions are never promoted to generation input', async () => {
  const result = await lookupPublicationConceptSuggestions('unlikely query', 'free_text', async () => ({
    suggestions: [mondo('invalid', 'MONDO:wrong'), hpo('invalid', 'HP:1'), { kind: 'prompt', canonicalLabel: 'text' }],
  }));
  assert.deepEqual(result.suggestions, []);
});

test('bounds and malformed identifiers fail locally without any remote/model request', async () => {
  for (const query of ['a', 'x'.repeat(81), 'two\nlines', 'HP:123', 'MONDO:abc']) {
    const result = await resolveConceptSubmission(query, 'free_text', null, () => assert.fail('unexpected lookup'));
    assert.equal(result.status, 'invalid');
  }
});

test('duplicate ontology records collapse to one identity', async () => {
  const result = await lookupPublicationConceptSuggestions('remote seizure', 'free_text', async () => ({ suggestions: [hpo(), hpo()] }));
  assert.equal(result.suggestions.length, 1);
});

test('explicit disease/HPO modes remain bounded to the chosen ontology', async () => {
  for (const [mode, expected] of [['disease', 'disease'], ['hpo_term', 'phenotype']]) {
    const calls = [];
    await lookupPublicationConceptSuggestions('remote term', mode, async (_query, kind) => {
      calls.push(kind);
      return { suggestions: [] };
    });
    assert.deepEqual(calls, [expected]);
  }
});

test('401 errors retain sign-in guidance and malformed API envelopes are unavailable', async () => {
  const denied = await resolveConceptSubmission('unknown term', 'free_text', null, async () => {
    throw Object.assign(new Error('expired'), { status: 401 });
  });
  assert.match(denied.message, /sign in/i);
  const malformed = await resolveConceptSubmission('unknown term', 'free_text', null, async () => ({}));
  assert.equal(malformed.status, 'unavailable');
});
