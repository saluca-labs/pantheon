import type { LlmCallOptions, LlmCallResult, LlmProvider } from '../types.js';

const DEFAULT_MODEL = 'claude-opus-4-7';

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string = process.env['ANTHROPIC_API_KEY'] ?? '') {
    if (apiKey === '' && (process.env['ANTHROPIC_API_KEY'] ?? '') === '') {
      // Soft-init: lets the package import even if key is unset; the registry
      // skips registering this provider when unconfigured.
    }
  }

  async call(opts: LlmCallOptions): Promise<LlmCallResult> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not set');
    const model = opts.model ?? DEFAULT_MODEL;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic: ${res.status}`);
    }
    const json = (await res.json()) as {
      content?: { type: string; text: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return {
      text,
      promptTokens: json.usage?.input_tokens ?? 0,
      completionTokens: json.usage?.output_tokens ?? 0,
      provider: 'anthropic',
      model,
    };
  }

  async *stream(opts: LlmCallOptions): AsyncIterable<string> {
    // For Wave 0 we ship non-streaming and reuse `call`. Real streaming
    // (SSE parse) lands in Wave 1 alongside its first consumer.
    const r = await this.call(opts);
    yield r.text;
  }
}
