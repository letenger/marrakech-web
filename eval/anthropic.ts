// An Anthropic-backed implementation of the LLM agent's `Complete` seam.
// Reads ANTHROPIC_API_KEY from the environment; never imported by the app, so
// no key ever reaches the browser bundle.
import Anthropic from '@anthropic-ai/sdk';
import type { Complete } from '../src/game/ai/llm';

export type AnthropicOptions = { model?: string; maxTokens?: number };

export function anthropicComplete(opts: AnthropicOptions = {}): Complete {
  const client = new Anthropic(); // throws helpfully if ANTHROPIC_API_KEY is unset
  const model = opts.model ?? 'claude-haiku-4-5-20251001'; // cheap + fast for eval
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
