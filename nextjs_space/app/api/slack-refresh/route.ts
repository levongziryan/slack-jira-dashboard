export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getSlackChannels } from '@/lib/config';
import { getOwnerConnectorToken } from '@/lib/owner-connector';
import { matchesRules, type Rule } from '@/lib/priority';
import { fetchReactionMaps, reconcileReactions, removeSavedReactions, resolveUserId, setSlackReaction, threadTsFromPermalink, tsKey } from '@/lib/slack-sync';
import { loadAnalyzedSet, markAnalyzed } from '@/lib/analyzed';
import { ensureCompletedPromise } from '@/lib/promote';
import { backfillChannelNames, backfillLoginNames, resolveSlackNames, SLACK_ID_RE, backfillAuthorNames, backfillTextMentions, normalizePeople } from '@/lib/slack-users';
import { backfillPermalinks, buildPermalink, getWorkspaceUrl } from '@/lib/slack-links';
import { llmChatCompletion, llmConfigured } from '@/lib/llm';
import { detectPromises } from '@/lib/promise-detect';
import { slackToPlain } from '@/lib/promote';

async function slackSearch(token: string, query: string, count = 50, page = 1) {
  const res = await fetch(
    `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&sort_dir=desc&count=${count}&page=${page}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  );
  return res.json();
}

type Commitment = { action: string; toWhom: string; condition: string; deadline: string; confidence: number };
type LlmDiag = { configured: boolean; status?: number; error?: string; rawLength?: number; parsed?: number; kept?: number };

// Analyze Levon's own messages and extract commitments (explicit + implied).
async function detectCommitments(
  msgs: { i: number; channel: string; text: string }[],
  userId?: string,
): Promise<{ out: Record<number, Commitment>; diag: LlmDiag }> {
  const diag: LlmDiag = { configured: await llmConfigured(userId) };
  if (!diag.configured) {
    diag.error = 'Ключ Anthropic не задан';
    return { out: {}, diag };
  }
  if (msgs.length === 0) return { out: {}, diag };
  const today = new Date().toISOString().slice(0, 10);

  const system = `Ты — ассистент Левона по управлению ожиданиями. Левон отвечает за то, чтобы все его обещания и взятые на себя задачи выполнялись на 100%.
Тебе дают список сообщений, которые написал САМ Левон в Slack. Найди среди них те, где Левон берёт на себя обязательство или где "мяч на его стороне" — от него чего-то ждут.

Обязательством считается не только прямое обещание, но и ПОДРАЗУМЕВАЕМОЕ:
- Прямые: "сделаю", "посмотрю", "проверю", "напишу", "подготовлю", "скину", "вернусь к тебе", "уточню", "разберусь", "согласую".
- Договорённости: "давай", "ок, сделаем", "договорились", "возьму на себя", "я займусь".
- Подразумеваемые: Левон соглашается с планом, задаёт уточняющий вопрос перед тем как сделать, говорит "как освобожусь", обещает отчитаться/дать фидбэк — всё, где после его сообщения дальнейший шаг за ним.

НЕ включай: простые ответы без действия, вопросы без обязательства, чужие задачи, благодарности, сообщения где он просто делится инфой.

Сегодня: ${today}. Если в сообщении есть явный срок — верни его как YYYY-MM-DD, иначе пустая строка. Относительные сроки ("завтра", "к пятнице", "на след неделе") переведи в дату от сегодня. Поле condition — при каком условии наступает действие ("когда освобожусь", "после релиза"), иначе пусто. Поле toWhom — кому адресовано обязательство (имя/роль из контекста) или название канала, если адресат неясен.

Ответь строго JSON без markdown:
{"promises":[{"i":<номер сообщения>,"action":"краткая формулировка что Левон должен сделать","toWhom":"кому","condition":"условие или пусто","deadline":"YYYY-MM-DD или пусто","confidence":0.0-1.0}]}
Включай только пункты с confidence >= 0.5. Если обязательств нет — верни {"promises":[]}.`;

  const userContent =
    'Сообщения Левона:\n' +
    msgs.map((m) => `[${m.i}] (#${m.channel}) ${m.text}`).join('\n');

  try {
    // Пустой ответ (например, модель потратила лимит токенов не на текст) повторяем один раз с большим лимитом.
    let data: any = null;
    let raw = '';
    for (const maxTokens of [4000, 8000]) {
      const res = await llmChatCompletion({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }, userId);
      diag.status = res.status;
      data = await res.json();
      if (!res.ok) {
        diag.error = `HTTP ${res.status}: ${String(data?.error?.message ?? JSON.stringify(data)).slice(0, 300)}`;
        console.error('[slack-refresh] LLM error:', diag.error);
        return { out: {}, diag };
      }
      raw = String(data?.choices?.[0]?.message?.content ?? '');
      if (raw.trim()) break;
    }
    if (!raw.trim()) {
      const m = data?._meta ?? {};
      diag.error = `пустой ответ модели (stop_reason=${m.stop_reason ?? '?'}, блоки: ${(m.block_types ?? []).join(',') || 'нет'}, токенов: ${m.output_tokens ?? '?'})`;
      console.error('[slack-refresh] LLM empty:', diag.error);
      return { out: {}, diag };
    }
    diag.rawLength = raw.length;
    const parsed = JSON.parse(raw);
    diag.parsed = (parsed?.promises ?? []).length;
    const out: Record<number, Commitment> = {};
    for (const p of parsed?.promises ?? []) {
      if (typeof p?.i !== 'number' || (p?.confidence ?? 0) < 0.5) continue;
      if (!p?.action) continue;
      out[p.i] = {
        action: String(p.action),
        toWhom: String(p.toWhom ?? ''),
        condition: String(p.condition ?? ''),
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(p.deadline ?? '') ? p.deadline : '',
        confidence: Number(p.confidence ?? 0),
      };
    }
    diag.kept = Object.keys(out).length;
    return { out, diag };
  } catch (e: any) {
    diag.error = `${e?.name ?? 'Error'}: ${String(e?.message ?? e).slice(0, 300)}`;
    console.error('[slack-refresh] LLM call/parse failed:', diag.error);
    return { out: {}, diag };
  }
}

// Поиск с учётом выбранных каналов: если список задан, берём до трёх страниц результатов и оставляем только сообщения из него.
async function slackSearchIn(token: string, query: string, allowed: Set<string>) {
  const first = await slackSearch(token, query, 50, 1);
  if (!first?.ok || allowed.size === 0) return first;
  const all: any[] = [...(first?.messages?.matches ?? [])];
  const pages = Math.min(3, first?.messages?.paging?.pages ?? 1);
  for (let p = 2; p <= pages; p++) {
    const next = await slackSearch(token, query, 50, p);
    if (!next?.ok) break;
    all.push(...(next?.messages?.matches ?? []));
  }
  first.messages = { ...(first.messages ?? {}), matches: all.filter((m) => allowed.has(String(m?.channel?.id ?? '').toUpperCase())) };
  return first;
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let token: string;
  try {
    token = await getOwnerConnectorToken({ service: 'SLACK' }, session.user.id);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Slack не подключён', available: false }, { status: 400 });
  }

  const uid = session.user.id; // пользователь дашборда; userId ниже - ID пользователя в Slack
  const { userId, error: userIdError } = await resolveUserId(token);
  if (userIdError) console.error('[slack-refresh]', userIdError);
  if (!userId) {
    return NextResponse.json({ error: `Не удалось определить пользователя Slack (${userIdError ?? 'неизвестная ошибка'})` }, { status: 502 });
  }

  try {
    // 1) Mentions of Levon
    const allowed = new Set(await getSlackChannels(uid));
    const searchData = await slackSearchIn(token, `<@${userId}>`, allowed);
    if (!searchData.ok) {
      return NextResponse.json({ error: `Slack API: ${searchData?.error ?? 'unknown'}` }, { status: 502 });
    }
    const rules: Rule[] = await prisma.priorityRule.findMany({ where: { userId: uid }, select: { type: true, value: true } });

    const matches = searchData?.messages?.matches ?? [];
    // Автор: имя по Slack ID (username в поиске - это логин, а не имя человека)
    const authorNames = await resolveSlackNames(
      token,
      [...new Set(matches.map((m: any) => m?.user).filter((x: any) => typeof x === 'string' && SLACK_ID_RE.test(x)))] as string[],
    );
    const matchTsList = matches.map((m: any) => m?.ts).filter(Boolean) as string[];
    const knownMentions = await prisma.mention.findMany({ where: { userId: uid, id: { in: matchTsList } }, select: { id: true } });
    const knownMentionIds = new Set(knownMentions.map((k) => k.id));
    let newMentions = 0;
    let upserted = 0;
    for (const msg of matches) {
      const ts = msg?.ts;
      if (!ts) continue;
      const channelId = msg?.channel?.id ?? '';
      const channel = msg?.channel?.name ?? channelId;
      const author = (msg?.user && authorNames.get(msg.user)) || msg?.username || msg?.user || '';
      const permalink = msg?.permalink ?? '';
      const threadTs = msg?.thread_ts ?? threadTsFromPermalink(permalink);
      const isPriority = matchesRules({ channel, channelId, author, ts, permalink }, rules);
      await prisma.mention.upsert({
        where: { userId_id: { userId: uid, id: ts } },
        update: { priority: isPriority, threadTs },
        create: {
          userId: uid,
          id: ts,
          ts,
          datetime: new Date(parseFloat(ts) * 1000),
          channel,
          channelId,
          author,
          text: msg?.text ?? '',
          permalink,
          priority: isPriority,
          threadTs,
        },
      });
      upserted++;
      if (!knownMentionIds.has(ts)) newMentions++;
    }

    // 2) Levon's own messages -> detect commitments (promises)
    const ownData = await slackSearchIn(token, `from:<@${userId}>`, allowed);
    const ownMatches: any[] = ownData?.ok ? ownData?.messages?.matches ?? [] : [];

    // Skip messages already turned into a suggestion/promise (stable id S-<ts>)
    const candidateIds = ownMatches.map((m) => `S-${m?.ts}`).filter((x) => x !== 'S-undefined');
    const existing = await prisma.promise.findMany({
      where: { userId: uid, id: { in: candidateIds } },
      select: { id: true },
    });
    const existingSet = new Set(existing.map((e) => e.id));

    const notSuggested = ownMatches.filter((m) => m?.ts && m?.text && !existingSet.has(`S-${m.ts}`));
    // Сообщения, уже отправленные на анализ (даже без найденных обязательств), повторно не анализируем.
    const analyzedStore = await loadAnalyzedSet(uid, notSuggested.map((m) => String(m.ts)));
    const fresh = notSuggested.filter((m) => !analyzedStore.set.has(String(m.ts)));
    // cap LLM input
    const toAnalyze = fresh.slice(0, 40).map((m, idx) => ({
      idx,
      ts: m.ts,
      channelId: m?.channel?.id ?? '',
      channel: m?.channel?.name ?? m?.channel?.id ?? '',
      text: String(m.text).slice(0, 600),
      permalink: m?.permalink ?? '',
      threadTs: m?.thread_ts ?? threadTsFromPermalink(m?.permalink ?? ''),
    }));

    let suggested = 0;
    let llmDiag: LlmDiag | null = null;
    let analyzedMarked = 0;
    let analyzedStoreError: string | null = analyzedStore.error ?? null;
    if (toAnalyze.length > 0) {
      const detected = await detectCommitments(
        toAnalyze.map((m) => ({ i: m.idx, channel: m.channel, text: m.text })),
        session.user.id,
      );
      llmDiag = detected.diag;
      const detections = detected.out;
      for (const [iStr, det] of Object.entries(detections)) {
        const m = toAnalyze[Number(iStr)];
        if (!m) continue;
        const id = `S-${m.ts}`;
        await prisma.promise.upsert({
          where: { userId_id: { userId: uid, id } },
          update: {},
          create: {
            userId: uid,
            id,
            ts: m.ts,
            datetime: new Date(parseFloat(m.ts) * 1000),
            channel: m.channel,
            channelId: m.channelId,
            toWhom: det.toWhom || m.channel,
            action: det.action,
            condition: det.condition,
            deadline: det.deadline,
            status: 'suggested',
            sourceText: m.text,
            permalink: m.permalink,
            threadTs: m.threadTs,
            priority: matchesRules({ channel: m.channel, channelId: m.channelId, author: '', ts: m.ts, permalink: m.permalink }, rules),
            note: det.confidence ? `Авто-определение, уверенность ${(det.confidence * 100).toFixed(0)}%` : 'Авто-определение',
          },
        });
        suggested++;
      }
      // Помечаем как проанализированные только после успешного ответа LLM, иначе при сбое повторим попытку.
      if (!detected.diag.error) {
        const marked = await markAnalyzed(uid, toAnalyze.map((m) => String(m.ts)));
        analyzedMarked = marked.saved;
        if (marked.error) analyzedStoreError = marked.error;
      }
    }

    // 3) Fetch reaction maps (Done/hourglass/bookmark) + upsert saved items from 🔖 reactions
    let savedCount = 0;
    let newSaved = 0;
    type SavedLite = { channelId: string; ts: string };
    let savedToUnpin: SavedLite[] = [];
    let reconciled = { mentions: 0, promises: 0, saved: 0 };
    let reactionsError: string | null = null;
    try {
      const maps = await fetchReactionMaps(token, userId);
      if (allowed.size > 0) maps.savedItems = maps.savedItems.filter((s) => allowed.has(String(s.channelId).toUpperCase()));

      // Enrich bookmark-sourced saved items with channel names from existing mentions
      if (maps.savedItems.length > 0) {
        const cIds = [...new Set(maps.savedItems.map((s) => s.channelId))];
        const known = await prisma.mention.findMany({
          where: { userId: uid, channelId: { in: cIds } },
          select: { channelId: true, channel: true },
          distinct: ['channelId'],
        });
        const cMap = new Map(known.map((c) => [c.channelId, c.channel]));
        const existingSaved = await prisma.savedItem.findMany({
          where: { userId: uid, id: { in: maps.savedItems.map((s) => s.id) } },
          select: { id: true, handled: true },
        });
        const existingSavedMap = new Map(existingSaved.map((x) => [x.id, x.handled]));

        // Правило: свежий пин на записи, которой нет в дашборде или которая была обработана,
        // возвращает её в активные "Отложенные" и снимает ✅ в Slack, иначе реакция ✅ закрыла бы её снова.
        // Обработанная запись с пином при первом запуске этой логики считается старым состоянием:
        // пин с неё просто снимается (без возврата в активные).
        const MIGRATION_ID = '__saved_repin_v1__';
        const migrationDone = (await loadAnalyzedSet(uid, [MIGRATION_ID])).set.has(MIGRATION_ID);
        let migrationOk = true;
        const closeAndUnpin: SavedLite[] = [];

        const wsUrl = await getWorkspaceUrl(token);
        for (const s of maps.savedItems) {
          s.channel = cMap.get(s.channelId) ?? s.channelId;
          if (!s.permalink) s.permalink = buildPermalink(wsUrl, s.channelId, s.ts, s.threadTs);
          const wasHandled = existingSavedMap.get(s.id); // undefined = записи нет
          const hasDone = maps.done.has(tsKey(s.ts));
          let reactivate = false;

          if (wasHandled === undefined) {
            reactivate = hasDone; // новая запись: ✅ от прошлой жизни сообщения снимаем
          } else if (wasHandled === true) {
            if (migrationDone) reactivate = true;
            else {
              const r = await removeSavedReactions(token, s.channelId, s.ts, userId);
              if (!r.ok) migrationOk = false;
            }
          } else if (hasDone) {
            closeAndUnpin.push({ channelId: s.channelId, ts: s.ts });
          }

          if (reactivate) {
            const okDone = await setSlackReaction(token, s.channelId, s.ts, 'white_check_mark', false);
            if (okDone) maps.done.delete(tsKey(s.ts));
          }

          await prisma.savedItem.upsert({
            where: { userId_id: { userId: uid, id: s.id } },
            update: {
              text: s.text, channel: s.channel, author: s.author, threadTs: s.threadTs,
              ...(s.permalink ? { permalink: s.permalink } : {}),
              ...(reactivate && wasHandled === true ? { handled: false, handledAt: null } : {}),
            },
            create: { ...s, userId: uid, kind: 'bookmark' },
          });
          savedCount++;
          if (wasHandled === undefined || (reactivate && wasHandled === true)) newSaved++;
        }
        if (!migrationDone && migrationOk) await markAnalyzed(uid, [MIGRATION_ID]);

        // Упоминания из корзины и из обработанных, на которых стоит пин, живут только в "Отложенных".
        const pinnedPairs = maps.savedItems.map((s) => ({ channelId: s.channelId, ts: s.ts }));
        const hideCandidates = await prisma.mention.findMany({
          where: { userId: uid, OR: pinnedPairs, AND: [{ OR: [{ deleted: true }, { handled: true }] }] },
          select: { id: true, handledSource: true },
        });
        const hideIds = hideCandidates
          .filter((m) => m.handledSource !== 'saved' && m.handledSource !== 'promoted')
          .map((m) => m.id);
        // Так же для обещаний: выполненные и удалённые с пином переезжают в "Отложенные".
        const hidePromiseCandidates = await prisma.promise.findMany({
          where: { userId: uid, OR: pinnedPairs, AND: [{ OR: [{ deleted: true }, { status: 'completed' }] }] },
          select: { id: true, completedSource: true },
        });
        const hidePromiseIds = hidePromiseCandidates.filter((x) => x.completedSource !== 'saved').map((x) => x.id);
        if (hidePromiseIds.length > 0) {
          await prisma.promise.updateMany({
            where: { userId: uid, id: { in: hidePromiseIds } },
            data: { deleted: false, deletedAt: null, status: 'completed', completedSource: 'saved' },
          });
        }
        if (hideIds.length > 0) {
          await prisma.mention.updateMany({
            where: { userId: uid, id: { in: hideIds } },
            data: { deleted: false, deletedAt: null, handled: true, handledAt: new Date(), handledSource: 'saved', queued: false },
          });
        }
        savedToUnpin = closeAndUnpin;
      }

      // Разовый перенос всех обработанных (зачёркнутых) отложенных в "Выполненные".
      try {
        const DONE_MIG = '__saved_done_to_completed_v1__';
        if (!(await loadAnalyzedSet(uid, [DONE_MIG])).set.has(DONE_MIG)) {
          const handledSaved = await prisma.savedItem.findMany({ where: { userId: uid, handled: true } });
          for (const h of handledSaved) await ensureCompletedPromise(uid, h);
          await markAnalyzed(uid, [DONE_MIG]);
        }
      } catch (e: any) {
        console.error('[slack-refresh] saved->completed migration failed:', e?.message ?? e);
      }

      // 4) Apply emoji conventions (Done / hourglass) to auto open/close tasks
      reconciled = await reconcileReactions(uid, maps);
      // Запись закрыта через ✅ в Slack: пин снимаем, чтобы следующий пин считался новым.
      for (const it of savedToUnpin) await removeSavedReactions(token, it.channelId, it.ts, userId);
    } catch (e: any) {
      reactionsError = String(e?.message ?? e).slice(0, 300);
      console.error('[slack-refresh] reactions failed:', reactionsError);
    }

    // Автор в виде Slack ID (например U0B027DQKPY) заменяем на имя из Slack.
    try {
      const names = await backfillAuthorNames(uid, token);
      await backfillChannelNames(uid, token);
      await backfillLoginNames(uid, token);
      await backfillTextMentions(uid, token);
      await normalizePeople(uid, token);
      await backfillPermalinks(uid, token);
      if (names.unresolved > 0) console.warn('[slack-refresh] не удалось получить имя для ID:', names.unresolved);
    } catch (e: any) {
      console.error('[slack-refresh] backfill names failed:', e?.message ?? e);
    }

    // 4) Входящие обещания: сообщения других людей, где меня тегнули (последние 14 дней, только новые).
    let incomingSuggested = 0;
    let incomingError: string | null = null;
    try {
      const since = new Date(Date.now() - 14 * 86400000);
      const ms = await prisma.mention.findMany({
        where: { userId: uid, deleted: false, datetime: { gte: since } },
        orderBy: { datetime: 'desc' },
        take: 150,
      });
      const incAids = ms.map((m) => `SI-${m.ts}`);
      const seen = await loadAnalyzedSet(uid, incAids);
      const freshIn = ms.filter((m) => !seen.set.has(`SI-${m.ts}`) && m.text.trim().length >= 15).slice(0, 40);
      if (freshIn.length > 0) {
        const det = await detectPromises(
          freshIn.map((m, i) => ({ i, where: `#${m.channel}`, author: m.author, date: m.datetime.toISOString(), text: slackToPlain(m.text).slice(0, 700) })),
          'slack-incoming',
          uid,
        );
        if (det.error) incomingError = det.error;
        else {
          for (const [iStr, d] of Object.entries(det.out)) {
            const m = freshIn[Number(iStr)];
            if (!m) continue;
            await prisma.promise.upsert({
              where: { userId_id: { userId: uid, id: `SI-${m.ts}` } },
              update: {},
              create: {
                userId: uid,
                id: `SI-${m.ts}`,
                ts: m.ts,
                datetime: m.datetime,
                channel: m.channel,
                channelId: m.channelId,
                toWhom: 'мне',
                action: d.action,
                condition: d.condition,
                deadline: d.deadline,
                status: 'suggested',
                sourceText: slackToPlain(m.text).slice(0, 600),
                permalink: m.permalink,
                threadTs: m.threadTs,
                priority: m.priority,
                note: `Авто-определение (Slack, входящее), уверенность ${(d.confidence * 100).toFixed(0)}%`,
              },
            });
            incomingSuggested++;
          }
          await markAnalyzed(uid, freshIn.map((m) => `SI-${m.ts}`));
        }
      }
    } catch (e: any) {
      incomingError = String(e?.message ?? e).slice(0, 200);
      console.error('[slack-refresh] incoming promises failed:', incomingError);
    }

    const suggestedTotal = await prisma.promise.count({ where: { userId: uid, status: 'suggested' } });

    const ownOk = Boolean(ownData?.ok);
    const ownError: string | null = ownOk ? null : String(ownData?.error ?? 'no response');
    const warning =
      userIdError ? userIdError
      : !ownOk ? `поиск своих сообщений в Slack: ${ownError}`
      : llmDiag?.error ? `анализ обязательств (LLM): ${llmDiag.error}`
      : reactionsError ? `реакции Slack: ${reactionsError}`
      : analyzedStoreError ? `память анализа: ${analyzedStoreError}`
      : null;
    const diag = {
      build: 'selfhost-3',
      userId,
      ownSearch: { ok: ownOk, error: ownError, found: ownMatches.length },
      fresh: fresh.length,
      analyzed: toAnalyze.length,
      analyzedMarked,
      llm: llmDiag,
    };
    console.log('[slack-refresh]', JSON.stringify({ upserted, newMentions, suggested, suggestedTotal, savedCount, newSaved, ...diag, warning }));

    return NextResponse.json({ ok: true, upserted, newMentions, suggested, incomingSuggested, incomingError, suggestedTotal, savedCount, newSaved, reconciled, available: true, warning, diag });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Ошибка обновления' }, { status: 500 });
  }
}
