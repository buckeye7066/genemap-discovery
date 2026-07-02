// Lazy-load the OpenAI SDK so the rest of the API can boot when
// OPENAI_API_KEY is unset and so tests can mock the wrapper.

let client = null;

async function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function generateText(
  prompt,
  { model = 'gpt-4o', maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const openai = await getClient();
  // The OpenAI SDK accepts a per-request timeout that aborts the underlying
  // HTTP call, so we no longer rely solely on a wrapper Promise.race that
  // would resolve the route handler while the upstream kept burning tokens.
  const response = await openai.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    },
    { timeout: timeoutMs }
  );
  return response.choices[0]?.message?.content || '';
}

export async function generateChatResponse(
  messages,
  { model = 'gpt-4o', maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const openai = await getClient();
  const response = await openai.chat.completions.create(
    {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    },
    { timeout: timeoutMs }
  );
  return response.choices[0]?.message?.content || '';
}

// Ordered list of image models to attempt. The deployed key has chat access
// (gpt-4o) but the DALL·E models return "model does not exist" — so try the
// current `gpt-image-1` first, then fall back to the legacy DALL·E models for
// older keys. Override the whole chain with LLM_IMAGE_MODELS (comma-separated).
const IMAGE_MODELS = (process.env.LLM_IMAGE_MODELS || 'gpt-image-1,dall-e-3,dall-e-2')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export async function generateImage(
  prompt,
  { size = '1024x1024', quality = 'standard', timeoutMs = 60_000 } = {}
) {
  const openai = await getClient();

  const paramsFor = (model) => {
    if (model === 'dall-e-3') return { model, prompt, n: 1, size, quality };
    if (model === 'gpt-image-1') return { model, prompt, n: 1, size }; // returns b64, no `quality` enum here
    return { model, prompt, n: 1, size }; // dall-e-2 and others
  };

  let lastErr;
  for (const model of IMAGE_MODELS) {
    try {
      const response = await openai.images.generate(paramsFor(model), { timeout: timeoutMs });
      const item = response.data?.[0];
      // gpt-image-1 returns base64 (b64_json); DALL·E returns a hosted url.
      const url = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
      if (!url) throw new Error('image response contained neither url nor b64_json');
      return { url, revisedPrompt: item?.revised_prompt };
    } catch (err) {
      lastErr = err;
      const detail = err?.error?.message || err?.message || String(err);
      const status = err?.status ?? err?.statusCode;
      console.error(`[openai.generateImage] ${model} failed (status ${status}): ${detail}`);
    }
  }
  throw lastErr || new Error('image generation failed');
}
