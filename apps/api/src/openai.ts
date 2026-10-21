import OpenAI from 'openai';
import type { Complete } from '@marrakech/engine';

export type OpenAiOptions = { model?: string; maxTokens?: number; baseURL?: string };

export function openaiComplete(opts: OpenAiOptions = {}): Complete {
  const client = new OpenAI({
    baseURL: opts.baseURL ?? process.env.OPENAI_BASE_URL,
  });
  const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const maxTokens = opts.maxTokens ?? 256;

  return async (prompt: string) => {
    // Some compatible providers still require max_tokens rather than
    // max_completion_tokens, so keep this request portable across gateways.
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user' as const, content: prompt }],
    };
    const res = await client.chat.completions.create(body);
    return res.choices[0]?.message?.content ?? '';
  };
}
