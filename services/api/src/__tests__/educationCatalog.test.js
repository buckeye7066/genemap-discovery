import { describe, expect, it } from 'vitest';
import {
  EDUCATION_CATALOG_VERSION,
  resolveEducationTopic,
  TOPICS_CATALOG,
} from '../config/educationCatalog.js';

describe('canonical education catalog boundary', () => {
  it('resolves an exact active identifier to server-owned metadata', () => {
    const topic = resolveEducationTopic('dna-structure');
    expect(topic).toMatchObject({
      id: 'dna-structure',
      title: 'DNA Structure',
      category: 'DNA Basics',
      catalogVersion: EDUCATION_CATALOG_VERSION,
    });
    expect(Object.isFrozen(topic)).toBe(true);
  });

  it.each([
    'DNA Structure',
    'dna structure',
    ' dna-structure',
    'dna-structure ',
    'DNA-STRUCTURE',
    'dna_structure',
    '../dna-structure',
    'x'.repeat(500),
    '',
  ])('rejects non-canonical topic input %j', (value) => {
    expect(resolveEducationTopic(value)).toBeNull();
  });

  it('keeps every published catalog id uniquely resolvable', () => {
    const ids = TOPICS_CATALOG.flatMap(({ topics }) => topics.map(({ id }) => id));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.every((id) => resolveEducationTopic(id)?.id === id)).toBe(true);
  });
});
