const MODEL_ENV_BY_SCOPE = Object.freeze({
  assistant: 'LLM_ASSISTANT_MODEL',
  education: 'LLM_EDU_TEXT_MODEL',
  invoke: 'LLM_INVOKE_TEXT_MODEL',
});

export function configuredTextProvider(source = process.env) {
  return source.LLM_TEXT_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

/**
 * Resolve only server-owned model configuration. Production startup requires
 * LLM_TEXT_MODEL; the provider defaults remain a local-development fallback.
 */
export function configuredTextModel(scope, source = process.env) {
  const provider = configuredTextProvider(source);
  const scopedModel = source[MODEL_ENV_BY_SCOPE[scope]];
  if (scopedModel) return scopedModel;
  if (source.LLM_TEXT_MODEL) return source.LLM_TEXT_MODEL;
  if (provider === 'anthropic') return source.ANTHROPIC_MODEL || undefined;
  return source.OPENAI_MODEL || 'gpt-4o-mini';
}

export function textRuntimeConfig(scope, source = process.env) {
  return {
    provider: configuredTextProvider(source),
    model: configuredTextModel(scope, source),
  };
}
