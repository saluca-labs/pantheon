/**
 * Creator OS Phase 6 — streaming chat endpoint.
 *
 * Wire format: U+001E (Record Separator) prefixed JSON lines for streaming
 * text deltas, followed by a final done sentinel with the message id.
 *
 * Multi-provider routing based on model prefix:
 *   - claude-*   → Anthropic Messages API (streaming)
 *   - gpt-*, o1*, o3*, o4* → OpenAI Chat Completions API (streaming)
 *   - ollama/*   → Ollama local API (http://localhost:11434)
 *
 * @license MIT — Tiresias Creator OS Phase 6 (internal).
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getCurrentCreatorUser } from '@/lib/agentic-os/creator/session';
import { recordAudit } from '@/lib/agentic-os/_shared/audit';
import {
  getConversation,
  appendMessage,
  getMessages,
  updateConversation,
  autoTitle,
} from '@/lib/agentic-os/creator/chat-repo';
import type { ChatMessage } from '@/lib/agentic-os/creator/chat';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Body = z.object({
  message: z.string().min(1).max(8000),
});

interface Props {
  params: Promise<{ conversationId: string }>;
}

// ─── Provider routing ──────────────────────────────────────────────────────────

function detectProvider(model: string): 'anthropic' | 'openai' | 'ollama' {
  if (model.startsWith('ollama/')) return 'ollama';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  // Default to Anthropic for unknown models
  return 'anthropic';
}

function stripOllamaPrefix(model: string): string {
  return model.replace(/^ollama\//, '');
}

// ─── Anthropic streaming ───────────────────────────────────────────────────────

async function* streamAnthropic(
  model: string,
  systemPrompt: string | null,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropicMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: true,
    messages: anthropicMessages,
  };

  if (systemPrompt) {
    body['system'] = systemPrompt;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          yield parsed.delta.text;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }
}

// ─── OpenAI streaming ──────────────────────────────────────────────────────────

async function* streamOpenAI(
  model: string,
  systemPrompt: string | null,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const openaiMessages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      openaiMessages.push({ role: m.role, content: m.content });
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: openaiMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // skip unparseable lines
      }
    }
  }
}

// ─── Ollama streaming ──────────────────────────────────────────────────────────

async function* streamOllama(
  model: string,
  systemPrompt: string | null,
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const ollamaMessages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    ollamaMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const m of messages) {
    ollamaMessages.push({ role: m.role, content: m.content });
  }

  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: ollamaMessages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.message?.content) {
          yield parsed.message.content;
        }
        if (parsed.done) return;
      } catch {
        // skip unparseable lines
      }
    }
  }
}

// ─── Build stream chunks with wire format ──────────────────────────────────────

function encodeChunk(text: string): Uint8Array {
  const payload = JSON.stringify({ type: 'text-delta', textDelta: text });
  return new TextEncoder().encode(String.fromCharCode(0x1e) + payload + '\n');
}

function encodeDone(messageId: string): Uint8Array {
  const payload = JSON.stringify({ type: 'done', messageId });
  return new TextEncoder().encode(String.fromCharCode(0x1e) + payload + '\n');
}

// ─── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: Props) {
  const user = await getCurrentCreatorUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { conversationId } = await params;
  const conversation = await getConversation(conversationId, user.userId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userMessage = parsed.data.message;
  const model = conversation.model;
  const provider = detectProvider(model);
  const effectiveModel = provider === 'ollama' ? stripOllamaPrefix(model) : model;

  // ── Append user message ──────────────────────────────────────────────────
  const userTurn: ChatMessage = { role: 'user', content: userMessage };
  await appendMessage(conversationId, user.userId, userTurn);

  // ── Auto-title on first message ───────────────────────────────────────────
  if (
    conversation.title === 'New Conversation' ||
    conversation.title === '' ||
    conversation.title == null
  ) {
    try {
      await updateConversation(conversationId, user.userId, {
        title: autoTitle(userMessage),
      });
    } catch {
      // best-effort
    }
  }

  // ── Fetch full transcript for the model ───────────────────────────────────
  const messages = await getMessages(conversationId, user.userId);

  // ── Stream ────────────────────────────────────────────────────────────────
  const messageId = randomUUID();
  const systemPrompt = conversation.systemPrompt;
  let assistantContent = '';

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const stream =
            provider === 'anthropic'
              ? streamAnthropic(effectiveModel, systemPrompt, messages)
              : provider === 'openai'
                ? streamOpenAI(effectiveModel, systemPrompt, messages)
                : streamOllama(effectiveModel, systemPrompt, messages);

          for await (const delta of stream) {
            assistantContent += delta;
            controller.enqueue(encodeChunk(delta));
          }
        } catch (err) {
          console.error('[creator.chat.messages] stream error', err);
        } finally {
          controller.enqueue(encodeDone(messageId));

          // ── Persist assistant message ──────────────────────────────────
          if (assistantContent.length > 0) {
            try {
              const assistantTurn: ChatMessage = {
                role: 'assistant',
                content: assistantContent,
              };
              await appendMessage(conversationId, user.userId, assistantTurn);
              await recordAudit({
                pool: (await import('@/lib/agentic-os/creator/session')).getCreatorPool(),
                osSlug: 'creator',
                actorId: user.userId,
                action: 'creator.conversation.message_sent',
                payload: {
                  conversationId,
                  model,
                  provider,
                  assistantChars: assistantContent.length,
                },
              });
            } catch (err) {
              console.error('[creator.chat.messages] persistence failed', err);
            }
          }

          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'x-message-id': messageId,
        'x-conversation-id': conversationId,
      },
    },
  );
}
