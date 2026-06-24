// Lazy-load Anthropic SDK — same rationale as ./openai.js.

let client = null;

async function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function generateText(
  prompt,
  { model = 'claude-sonnet-4-20250514', maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const anthropic = await getClient();
  const response = await anthropic.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    },
    { timeout: timeoutMs }
  );
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

export async function generateChatResponse(
  messages,
  { model = 'claude-sonnet-4-20250514', maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const anthropic = await getClient();

  // Only the FIRST system message is honoured. Concatenating user-supplied
  // system messages would let a chat client keep injecting "ignore previous
  // instructions" without ever evicting the server-side guard rails.
  let systemPrompt = '';
  const chatMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (!systemPrompt) systemPrompt = msg.content;
      // Subsequent system messages are silently dropped.
      continue;
    }
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  const params = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: chatMessages,
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await anthropic.messages.create(params, { timeout: timeoutMs });
  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}
