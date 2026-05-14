import type { LlmCallOptions, LlmCallResult, LlmProvider } from '../types.js';

/**
 * Ollama provider — wraps the Ollama HTTP API.
 * Default endpoint: http://127.0.0.1:11434
 *
 * The user override makes Ollama the program-default provider. Ollama
 * has no API key (local), so CFG-01 only validates OLLAMA_HOST format.
 */
export class OllamaLlmProvider implements LlmProvider {
  readonly name = 'ollama';

  constructor(private readonly host: string = process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434') {}

  async call(opts: LlmCallOptions): Promise<LlmCallResult> {
    const model = opts.model ?? 'llama3.1:8b';
    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        stream: false,
        options: {
          temperature: opts.temperature ?? 0.2,
          num_predict: opts.maxTokens ?? 1024,
        },
        format: opts.jsonMode ? 'json' : undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      text: json.message?.content ?? '',
      promptTokens: json.prompt_eval_count ?? 0,
      completionTokens: json.eval_count ?? 0,
      provider: 'ollama',
      model,
    };
  }

  async *stream(opts: LlmCallOptions): AsyncIterable<string> {
    const model = opts.model ?? 'llama3.1:8b';
    const res = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`ollama stream: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line) as { message?: { content?: string } };
          if (j.message?.content) yield j.message.content;
        } catch {
          // ignore malformed line; ollama can emit keepalives
        }
      }
    }
  }
}
