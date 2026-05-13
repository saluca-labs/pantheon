import type { LlmCallOptions, LlmCallResult, LlmProvider } from '../types.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string = process.env['OPENAI_API_KEY'] ?? '') {}

  async call(opts: LlmCallOptions): Promise<LlmCallResult> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not set');
    const model = opts.model ?? DEFAULT_MODEL;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1024,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`openai: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      provider: 'openai',
      model,
    };
  }

  async *stream(opts: LlmCallOptions): AsyncIterable<string> {
    const r = await this.call(opts);
    yield r.text;
  }
}
