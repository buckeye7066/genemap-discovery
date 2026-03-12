import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function generateText(prompt, { model = 'claude-sonnet-4-20250514', maxTokens = 2000, temperature = 0.7 } = {}) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

export async function generateChatResponse(messages, { model = 'claude-sonnet-4-20250514', maxTokens = 2000, temperature = 0.7 } = {}) {
  const anthropic = getClient();

  let systemPrompt = '';
  const chatMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
    } else {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
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

  const response = await anthropic.messages.create(params);
  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}
