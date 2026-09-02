import { describe, expect, it } from 'vitest';
import { isNearFreeEducationLimit } from '../UsageBanner.jsx';

describe('education free-limit warning', () => {
  const limits = {
    explanations_per_day: 5,
    quizzes_per_day: 3,
    chat_messages_per_day: 10,
  };

  it.each([
    [{ explanation: 4 }, true],
    [{ quiz: 2 }, true],
    [{ chat: 9 }, true],
    [{ explanation: 3, quiz: 1, chat: 8 }, false],
  ])('maps usage counters to their canonical limits for %j', (usage, expected) => {
    expect(isNearFreeEducationLimit(usage, limits)).toBe(expected);
  });

  it('ignores unknown counters and invalid or unlimited limits', () => {
    expect(isNearFreeEducationLimit(
      { image: 999, explanation: 1 },
      { ...limits, explanations_per_day: null },
    )).toBe(false);
  });
});
