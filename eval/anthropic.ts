import Anthropic from '@anthropic-ai/sdk';
import type { Complete } from '@marrakech/engine';

export type AnthropicOptions = { model?: string; maxTokens?: number };

export function anthropicComplete(opts: AnthropicOptions = {}): Complete {
  const client = new Anthropic();
  const model = opts.model ?? 'claude-haiku-4-5-20251001';
  const maxTokens = opts.maxTokens ?? 256;

  return async (prompt: string) => {
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  };
}
