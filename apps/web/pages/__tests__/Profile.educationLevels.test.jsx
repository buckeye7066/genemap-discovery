import { describe, expect, it } from 'vitest';
import { EDUCATION_LEVELS } from '../../lib/EducationLevelContext';
// Vite's `?raw` gives the file's source as a string. Preferred over node:fs
// here: no path resolution to get wrong, and no `process` (the web ESLint
// config supplies browser globals only, so `process` fails `no-undef`).
import profileSource from '../Profile.jsx?raw';

/**
 * Profile's education-level picker offered phd / medical / researcher. None of
 * those are keys of EDUCATION_LEVELS, so `setLevel()` rejected them
 * (`if (!EDUCATION_LEVELS[newLevel]) return;`) and the value never took effect
 * — the level prompt came back on every visit with no explanation.
 *
 * The fix is to derive the options from EDUCATION_LEVELS rather than restate
 * them, so this cannot drift again. These tests lock in both halves: the list
 * is derived, and the vocabulary is the education system's own.
 */
describe('Profile education-level options', () => {
  it('offers exactly the levels the education system accepts', () => {
    // Any hardcoded <SelectItem value="..."> inside the education Select would
    // be a re-introduction of the drift.
    const hardcoded = [...profileSource.matchAll(/<SelectItem value="([a-z_]+)">/gu)]
      .map((m) => m[1])
      .filter((value) => !['male', 'female', 'other', 'prefer_not_to_say'].includes(value));

    for (const value of hardcoded) {
      expect(
        EDUCATION_LEVELS,
        `Profile.jsx hardcodes education level "${value}", which EducationLevelContext rejects`,
      ).toHaveProperty(value);
    }
  });

  it('derives the option list from EDUCATION_LEVELS', () => {
    expect(profileSource).toContain('Object.values(EDUCATION_LEVELS).map');
    expect(profileSource).toMatch(/import \{ EDUCATION_LEVELS \} from ["']\.\.\/lib\/EducationLevelContext["']/u);
  });

  it('does not offer the levels that silently failed to save', () => {
    for (const dead of ['phd', 'medical', 'researcher']) {
      expect(EDUCATION_LEVELS, `"${dead}" must not be a real level`).not.toHaveProperty(dead);
      expect(
        profileSource.includes(`<SelectItem value="${dead}">`),
        `Profile.jsx must not offer "${dead}"`,
      ).toBe(false);
    }
  });

  it('every level EDUCATION_LEVELS defines has a label to render', () => {
    for (const [id, config] of Object.entries(EDUCATION_LEVELS)) {
      expect(config.id, `${id}.id must match its key`).toBe(id);
      expect(typeof config.label, `${id} needs a label`).toBe('string');
      expect(config.label.length).toBeGreaterThan(0);
    }
  });
});
