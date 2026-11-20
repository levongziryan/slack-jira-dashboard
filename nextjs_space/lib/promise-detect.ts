// Поиск обещаний и договорённостей в тексте (описания и комментарии Jira, входящие сообщения Slack).
import { llmChatCompletion, llmConfigured } from '@/lib/llm';

export type DetectKind = 'jira' | 'slack-incoming';
export type DetectItem = { i: number; where: string; author: string; date: string; text: string };
export type Detected = {
  direction: 'mine' | 'incoming';
  who: string;        // кто обещает (для incoming) или кому обещаю (для mine)
  action: string;
  condition: string;
  deadline: string;   // YYYY-MM-DD или пусто
  confidence: number;
};

const ME = 'Левон Гзирян';

function systemPrompt(kind: DetectKind, today: string): string {
  const source = kind === 'jira'
    ? `Тебе дают тексты из задач Jira (описание и комментарии), в которых участвует ${ME}: он постановщик, исполнитель или наблюдатель. У каждого текста указан автор и задача.`
    : `Тебе дают сообщения Slack других людей, в которых тегнули ${ME}.`;
  const directions = kind === 'jira'
    ? `Найди два вида обязательств:
- "mine": ${ME} (автор текста - он, либо в тексте явно сказано, что задачу делает он) обещает или берёт на себя действие.
- "incoming": другой человек обещает или договаривается что-то сделать для ${ME} или по задаче, где ${ME} ждёт результат (постановщик или исполнитель). Автор текста - не ${ME}.`
    : `Найди только "incoming": человек обещает, берёт на себя или договаривается что-то сделать для ${ME} или по вопросу, который тот ждёт. Если в сообщении только просьба к ${ME} или информация без обещания автора, не включай его.`;
  return `Ты помогаешь ${ME} выровнять ожидания: ничего не должно потеряться.
${source}
${directions}

Обязательством считается явное обещание ("сделаю", "подготовим", "вернусь с ответом", "до пятницы пришлём"), договорённость ("договорились", "ок, сделаем") и подразумеваемое ("возьму в работу", "узнаю и напишу"). Не включай: общие рассуждения, вопросы, благодарности, статусы о том, что уже сделано, чужие задачи без связи с ${ME}.

Сегодня: ${today}. Срок верни как YYYY-MM-DD, иначе пустая строка. Относительные сроки переводи в дату от сегодня.
Поля: who - для mine кому обещано (имя или роль, иначе пусто), для incoming кто обещает (Имя Фамилия как в тексте); action - короткая формулировка действия без лишних слов (для incoming начни с имени: "Ручан: подготовит доступ"); condition - условие или пусто.

Ответь строго JSON без markdown:
{"promises":[{"i":<номер>,"direction":"mine|incoming","who":"","action":"","condition":"","deadline":"","confidence":0.0-1.0}]}
Только confidence >= 0.6. Если обязательств нет: {"promises":[]}.`;
}

export async function detectPromises(
  items: DetectItem[],
  kind: DetectKind,
  userId: string,
): Promise<{ out: Record<number, Detected>; error?: string }> {
  if (items.length === 0) return { out: {} };
  if (!(await llmConfigured(userId))) return { out: {}, error: 'Ключ Anthropic не задан' };
  const today = new Date().toISOString().slice(0, 10);
  const content = items
    .map((m) => `[${m.i}] ${m.where} | ${m.author} | ${m.date.slice(0, 10)}\n${m.text}`)
    .join('\n\n');
  try {
    let raw = '';
    for (const maxTokens of [4000, 8000]) {
      const res = await llmChatCompletion({
        messages: [{ role: 'system', content: systemPrompt(kind, today) }, { role: 'user', content }],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }, userId);
      const data: any = await res.json();
      if (!res.ok) return { out: {}, error: `HTTP ${res.status}: ${String(data?.error?.message ?? '').slice(0, 200)}` };
      raw = String(data?.choices?.[0]?.message?.content ?? '');
      if (raw.trim()) break;
    }
    if (!raw.trim()) return { out: {}, error: 'пустой ответ модели' };
    const parsed = JSON.parse(raw);
    const out: Record<number, Detected> = {};
    for (const p of parsed?.promises ?? []) {
      if (typeof p?.i !== 'number' || !p?.action || (p?.confidence ?? 0) < 0.6) continue;
      const direction = p.direction === 'incoming' ? 'incoming' : 'mine';
      if (kind === 'slack-incoming' && direction !== 'incoming') continue;
      out[p.i] = {
        direction,
        who: String(p.who ?? ''),
        action: String(p.action),
        condition: String(p.condition ?? ''),
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(p.deadline ?? '') ? p.deadline : '',
        confidence: Number(p.confidence ?? 0),
      };
    }
    return { out };
  } catch (e: any) {
    return { out: {}, error: `${e?.name ?? 'Error'}: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}
