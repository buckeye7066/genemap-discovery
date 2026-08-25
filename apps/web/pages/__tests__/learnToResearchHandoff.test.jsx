import { describe, expect, it } from 'vitest';
// Vite's `?raw` gives the file's source as a string. Preferred over node:fs
// here: no path resolution to get wrong, and no `process` (the web ESLint
// config supplies browser globals only, so `process` fails `no-undef`).
import searchSource from '../Search.jsx?raw';
import learningPathSource from '../LearningPath.jsx?raw';
import dashboardSource from '../Dashboard.jsx?raw';
import historySource from '../History.jsx?raw';

/**
 * The LEARN -> DISCOVER handoff is a cross-page URL contract: LearningPath's
 * "Continue to Research" writes search params that Search.jsx reads back.
 * It emitted `q` while Search read `query`, so the lesson context was silently
 * dropped on arrival and the search box came up empty — no error, no clue.
 *
 * Every producer of a /search link must agree with the one consumer.
 */
describe('LEARN -> DISCOVER search handoff', () => {
  const PARAM = 'query';

  it('Search.jsx reads the parameter this contract is named after', () => {
    expect(searchSource).toContain(`urlParams.get('${PARAM}')`);
  });

  it('LearningPath hands off using that same parameter, not "q"', () => {
    expect(learningPathSource).toContain(`params.set('${PARAM}',`);
    expect(
      learningPathSource,
      'LearningPath must not emit ?q= — Search.jsx never reads it',
    ).not.toMatch(/params\.set\(\s*['"]q['"]\s*,/u);
  });

  it('every page that links into /search uses the same parameter', () => {
    // Dashboard and History build "?query=" links; a new producer using a
    // different name would break exactly the way LearningPath did.
    for (const [name, source] of [['Dashboard.jsx', dashboardSource], ['History.jsx', historySource]]) {
      const searchLinks = [...source.matchAll(/createPageUrl\((['"])Search\1\)\}\?([A-Za-z_]+)=/gu)];
      expect(searchLinks.length, `${name} should link into Search`).toBeGreaterThan(0);
      for (const [, , param] of searchLinks) {
        expect(param, `${name} links into Search with ?${param}=`).toBe(PARAM);
      }
    }
  });
});
