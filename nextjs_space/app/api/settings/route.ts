export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { envValue } from '@/lib/config';
import { SETTING_DEFS, getSettingsOverview, isSettingKey, saveUserSettings, type SettingKey } from '@/lib/settings';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ items: await getSettingsOverview(session.user.id, envValue) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}

// Тело: { values: { KEY: "значение" | null } }. Пустая строка или null удаляют настройку.
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body?.values;
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }

  const changes: Partial<Record<SettingKey, string | null>> = {};
  for (const [k, raw] of Object.entries(input)) {
    if (!isSettingKey(k)) return NextResponse.json({ error: `Неизвестная настройка: ${k}` }, { status: 400 });
    if (raw === null || raw === '') { changes[k] = null; continue; }
    if (typeof raw !== 'string') return NextResponse.json({ error: `Некорректное значение: ${k}` }, { status: 400 });
    const v = raw.trim();
    if (!SETTING_DEFS[k].pattern.test(v)) {
      return NextResponse.json({ error: `Неверный формат: ${SETTING_DEFS[k].label}` }, { status: 400 });
    }
    changes[k] = v;
  }

  try {
    await saveUserSettings(session.user.id, changes);
    return NextResponse.json({ items: await getSettingsOverview(session.user.id, envValue) });
  } catch (e: any) {
    console.error('[settings] save failed:', e?.message ?? e);
    return NextResponse.json({ error: 'Не удалось сохранить настройки' }, { status: 500 });
  }
}
