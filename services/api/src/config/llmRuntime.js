const MODEL_ENV_BY_SCOPE = Object.freeze({
  assistant: 'LLM_ASSISTANT_MODEL',
  education: 'LLM_EDU_TEXT_MODEL',
  invoke: 'LLM_INVOKE_TEXT_MODEL',
});

export const DEFAULT_TEXT_MODEL_BY_PROVIDER = Object.freeze({
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
});

export function configuredTextProvider(source = process.env) {
  return source.LLM_TEXT_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

/**
 * Resolve only server-owned model configuration. Provider defaults are
 * audited application configuration, so a deployment with a valid provider
 * key remains functional when no optional model override is supplied.
 */
export function configuredTextModel(scope, source = process.env) {
  const provider = configuredTextProvider(source);
  const scopedModel = source[MODEL_ENV_BY_SCOPE[scope]];
  if (scopedModel) return scopedModel;
  if (source.LLM_TEXT_MODEL) return source.LLM_TEXT_MODEL;
  if (provider === 'anthropic') {
    return source.ANTHROPIC_MODEL || DEFAULT_TEXT_MODEL_BY_PROVIDER.anthropic;
  }
  return source.OPENAI_MODEL || DEFAULT_TEXT_MODEL_BY_PROVIDER.openai;
}

export function textRuntimeConfig(scope, source = process.env) {
  return {
    provider: configuredTextProvider(source),
    model: configuredTextModel(scope, source),
  };
}
