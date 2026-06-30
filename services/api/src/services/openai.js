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

export async function generateImage(
  prompt,
  { model = 'dall-e-3', size = '1024x1024', quality = 'standard', timeoutMs = 60_000 } = {}
) {
  const openai = await getClient();

  const callModel = async (m) => {
    // dall-e-2 does not accept the `quality` param; only dall-e-3 does.
    const params = m === 'dall-e-3'
      ? { model: m, prompt, n: 1, size, quality }
      : { model: m, prompt, n: 1, size: size === '1024x1024' ? '1024x1024' : '512x512' };
    const response = await openai.images.generate(params, { timeout: timeoutMs });
    return {
      url: response.data?.[0]?.url,
      revisedPrompt: response.data?.[0]?.revised_prompt,
    };
  };

  try {
    return await callModel(model);
  } catch (err) {
    // Surface the REAL OpenAI reason (status + body message) — the upstream
    // retry wrapper otherwise collapses it to a bare "HTTP 400" and we can't
    // tell a content-policy rejection from a model-access problem.
    const detail = err?.error?.message || err?.message || String(err);
    const status = err?.status ?? err?.statusCode;
    // eslint-disable-next-line no-console
    console.error(`[openai.generateImage] ${model} failed (status ${status}): ${detail}`);

    // Many accounts/keys are not enabled for dall-e-3 (returns 400/403). Fall
    // back to the broadly-available dall-e-2 before giving up, so the feature
    // works instead of just failing gracefully.
    if (model === 'dall-e-3') {
      try {
        return await callModel('dall-e-2');
      } catch (err2) {
        const d2 = err2?.error?.message || err2?.message || String(err2);
        // eslint-disable-next-line no-console
        console.error(`[openai.generateImage] dall-e-2 fallback failed: ${d2}`);
        throw err2;
      }
    }
    throw err;
  }
}
