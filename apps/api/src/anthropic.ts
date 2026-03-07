// Anthropic-backed implementation of the engine's `Complete` seam. The key is
// read from the environment and stays on the server — it is never sent to the
// browser. (A near-identical adapter exists in eval/; the engine must stay pure,
// so the adapter can't live there and this small duplication is deliberate.)
import Anthropic from '@anthropic-ai/sdk';
import type { Complete } from '@marrakech/engine';

export type AnthropicOptions = { model?: string; maxTokens?: number };

export function anthropicComplete(opts: AnthropicOptions = {}): Complete {
  const client = new Anthropic(); // throws helpfully if ANTHROPIC_API_KEY is unset
  const model = opts.model ?? 'claude-haiku-4-5-20251001'; // cheap + fast
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
