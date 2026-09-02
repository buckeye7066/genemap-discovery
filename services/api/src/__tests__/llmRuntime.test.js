import { describe, expect, it } from 'vitest';
import {
  configuredTextModel,
  configuredTextProvider,
  textRuntimeConfig,
} from '../config/llmRuntime.js';

describe('server-owned LLM runtime selection', () => {
  it('uses one production model by default with bounded route overrides', () => {
    const source = {
      LLM_TEXT_PROVIDER: 'openai',
      LLM_TEXT_MODEL: 'gpt-5-mini',
      LLM_ASSISTANT_MODEL: 'gpt-5.1',
    };
    expect(textRuntimeConfig('assistant', source)).toEqual({
      provider: 'openai', model: 'gpt-5.1',
    });
    expect(textRuntimeConfig('education', source)).toEqual({
      provider: 'openai', model: 'gpt-5-mini',
    });
  });

  it('never inherits an OpenAI default after Anthropic is selected', () => {
    const source = {
      LLM_TEXT_PROVIDER: 'anthropic',
      ANTHROPIC_MODEL: 'claude-sonnet-5',
    };
    expect(configuredTextProvider(source)).toBe('anthropic');
    expect(configuredTextModel('assistant', source)).toBe('claude-sonnet-5');
  });
});
