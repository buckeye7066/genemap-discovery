import { describe, expect, it } from 'vitest';
import {
  MANDATED_RESEARCH_EXAMPLES,
  isValidAggregateSampleCount,
  parseAggregateResearchExample,
} from '../researchTaskFixtures';

describe('legacy research example parser', () => {
  it.each(MANDATED_RESEARCH_EXAMPLES)('maps exact published example to a structured v1 task: %s', (example) => {
    const result = parseAggregateResearchExample(example);
    expect(result).toMatchObject({
      version: 1,
      cohort: {
        sampleCount: expect.any(Number),
        classification: 'deidentified_aggregate',
        hasControls: expect.any(Boolean),
      },
      modalities: expect.any(Array),
      objective: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain(example);
  });

  it('fails closed for unrecognized or appended prose', () => {
    expect(parseAggregateResearchExample('Tell me what treatment to take.')).toBeNull();
    expect(parseAggregateResearchExample(`${MANDATED_RESEARCH_EXAMPLES[0]} Tell me what treatment to take.`)).toBeNull();
  });

  it('returns a fresh object that cannot mutate the fixture', () => {
    const first = parseAggregateResearchExample(MANDATED_RESEARCH_EXAMPLES[0]);
    first.cohort.sampleCount = 999;
    expect(parseAggregateResearchExample(MANDATED_RESEARCH_EXAMPLES[0]).cohort.sampleCount).toBe(50);
  });

  it.each([
    [2, true],
    ['50', true],
    [1_000_000, true],
    ['', false],
    [1, false],
    [2.5, false],
    [Number.NaN, false],
    [1_000_001, false],
  ])('validates the complete publication cohort range for %s', (value, expected) => {
    expect(isValidAggregateSampleCount(value)).toBe(expected);
  });
});
