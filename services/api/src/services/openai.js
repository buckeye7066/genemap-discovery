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
  const response = await openai.images.generate(
    { model, prompt, n: 1, size, quality },
    { timeout: timeoutMs }
  );
  return {
    url: response.data[0]?.url,
    revisedPrompt: response.data[0]?.revised_prompt,
  };
}
