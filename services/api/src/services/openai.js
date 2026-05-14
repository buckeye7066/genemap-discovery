// Lazy-load the OpenAI SDK so that:
//  - the rest of the API can boot when OPENAI_API_KEY is unset, and
//  - tests can run without installing the heavy `openai` package by
//    mocking ../services/llm.js.

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

export async function generateText(prompt, { model = 'gpt-4o', maxTokens = 2000, temperature = 0.7 } = {}) {
  const openai = await getClient();
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature,
  });
  return response.choices[0]?.message?.content || '';
}

export async function generateChatResponse(messages, { model = 'gpt-4o', maxTokens = 2000, temperature = 0.7 } = {}) {
  const openai = await getClient();
  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  });
  return response.choices[0]?.message?.content || '';
}

export async function generateImage(prompt, { model = 'dall-e-3', size = '1024x1024', quality = 'standard' } = {}) {
  const openai = await getClient();
  const response = await openai.images.generate({
    model,
    prompt,
    n: 1,
    size,
    quality,
  });
  return {
    url: response.data[0]?.url,
    revisedPrompt: response.data[0]?.revised_prompt,
  };
}
