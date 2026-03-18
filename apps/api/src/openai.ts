// OpenAI-compatible implementation of the engine's `Complete` seam. Works with
// any endpoint that speaks the OpenAI /chat/completions protocol — OpenAI
// itself, DeepSeek, and most third-party gateways — by pointing `baseURL` at
// the provider. The key stays server-side and is never sent to the browser.
//
// Config from the environment:
//   OPENAI_API_KEY   the key for the endpoint (DeepSeek, OpenAI, gateway, …)
//   OPENAI_BASE_URL  the endpoint, e.g. https://api.deepseek.com/v1
//                    (omit for OpenAI's default https://api.openai.com/v1)
//   OPENAI_MODEL     the model id, e.g. deepseek-chat / gpt-4o-mini
import OpenAI from 'openai';
import type { Complete } from '@marrakech/engine';

export type OpenAiOptions = { model?: string; maxTokens?: number; baseURL?: string };

export function openaiComplete(opts: OpenAiOptions = {}): Complete {
  // `apiKey` and `baseURL` fall back to OPENAI_API_KEY / OPENAI_BASE_URL from
  // the environment (the SDK reads OPENAI_API_KEY on its own; we pass baseURL
  // explicitly so a custom endpoint is honoured).
  const client = new OpenAI({
    baseURL: opts.baseURL ?? process.env.OPENAI_BASE_URL,
  });
  const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const maxTokens = opts.maxTokens ?? 256;

  return async (prompt: string) => {
    // Built as a variable, not an inline literal, on purpose: the SDK types mark
    // `max_tokens` as deprecated (in favour of `max_completion_tokens`), so an
    // inline literal trips TS's excess-property check. But DeepSeek and most
    // OpenAI-compatible gateways still expect `max_tokens` on the wire, so we
    // send it — passing through a variable skips the freshness check while the
    // field is still serialised. Do not inline this back.
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user' as const, content: prompt }],
    };
    const res = await client.chat.completions.create(body);
    return res.choices[0]?.message?.content ?? '';
  };
}
