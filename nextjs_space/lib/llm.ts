// Self-host: единая точка вызова LLM через Anthropic Messages API
// (platform.claude.com, бывш. console.anthropic.com). Раньше оба места
// (slack-refresh, jira/weekly-report) били напрямую в apps.abacus.ai
// с OpenAI-совместимым форматом и моделью gpt-5.4. Здесь формат другой:
// /v1/messages, system отдельным полем, max_tokens обязателен.
//
// llmChatCompletion принимает тот же вид вызова, что и раньше
// (messages: [{role, content}], system опционально, response_format
// для JSON-ответа), и сам конвертирует в формат Anthropic — так места
// вызова в slack-refresh и weekly-report почти не меняются.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

import { getLlmConfig } from '@/lib/config';

export async function llmConfigured(userId?: string): Promise<boolean> {
  return Boolean(await getLlmConfig(userId));
}

// Claude, в отличие от OpenAI json_object, не гарантирует чистый JSON:
// ответ может прийти в ```json ... ``` или с текстом вокруг. Достаём сам объект,
// иначе JSON.parse у вызывающего кода падает и ошибка молча теряется.
export function extractJson(text: string): string {
  const t = (text ?? '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return body;
  return body.slice(start, end + 1);
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function llmChatCompletion(body: {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
}, userId?: string) {
  const conf = await getLlmConfig(userId);
  if (!conf) {
    throw new Error('Ключ Anthropic не задан');
  }
  const key = conf.apiKey;
  const model = conf.model;

  const systemMsg = body.messages.find((m) => m.role === 'system')?.content;
  const chatMsgs = body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  // Просим строгий JSON без markdown-обёртки, раз вызывающий код
  // ожидает response_format: 'json_object' (как это было у OpenAI).
  const wantsJson = body.response_format?.type === 'json_object';
  const system = wantsJson
    ? `${systemMsg ?? ''}\n\nОтветь строго валидным JSON, без markdown-разметки и без текста вокруг.`
    : systemMsg;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: body.max_tokens ?? 4096,
      // temperature не передаём: claude-haiku-5-5 отвечает HTTP 400 на этот параметр (deprecated)
      ...(system ? { system } : {}),
      messages: chatMsgs,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errBody = await res.clone().text().catch(() => '');
    console.error(`[llm] Anthropic HTTP ${res.status}, model=${model}: ${errBody.slice(0, 500)}`);
  }

  // Приводим ответ к форме {choices:[{message:{content}}]}, которую
  // уже парсит остальной код (data?.choices?.[0]?.message?.content).
  const shimmed = {
    ok: res.ok,
    status: res.status,
    json: async () => {
      const data = await res.json();
      if (!res.ok) return data;
      const text = (data.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const meta = {
        stop_reason: data.stop_reason ?? null,
        block_types: (data.content ?? []).map((b: any) => b.type),
        output_tokens: data.usage?.output_tokens ?? null,
      };
      if (!text.trim()) console.error('[llm] пустой текстовый ответ модели', JSON.stringify(meta));
      return { choices: [{ message: { content: wantsJson ? extractJson(text) : text } }], _meta: meta };
    },
    text: async () => res.text(),
  };
  return shimmed as unknown as Response;
}
