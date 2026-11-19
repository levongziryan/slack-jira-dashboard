import { prisma } from '@/lib/prisma';
import { encryptText, decryptText } from '@/lib/crypto';

// Настройки интеграций пользователя. Секретные значения хранятся зашифрованными и в интерфейс
// отдаются только в виде "set + последние 4 символа".
export const SETTING_DEFS = {
  SLACK_USER_TOKEN: { secret: true, service: 'slack', label: 'Slack User OAuth Token', pattern: /^xoxp-[A-Za-z0-9-]{10,}$/, hint: 'xoxp-...' },
  SLACK_CHANNELS: { secret: false, service: 'slack', label: 'Каналы для мониторинга (пусто: все)', pattern: /^[CGDM][A-Z0-9]{6,}(\s*,\s*[CGDM][A-Z0-9]{6,})*$/i, hint: 'выберите из списка' },
  ANTHROPIC_API_KEY: { secret: true, service: 'llm', label: 'Anthropic API key', pattern: /^sk-ant-[A-Za-z0-9_-]{10,}$/, hint: 'sk-ant-...' },
  LLM_MODEL: { secret: false, service: 'llm', label: 'Модель', pattern: /^[A-Za-z0-9._-]{3,80}$/, hint: 'claude-haiku-4-5' },
  JIRA_BASE_URL: { secret: false, service: 'jira', label: 'Адрес Jira', pattern: /^https?:\/\/[^\s]+$/, hint: 'https://jira.example.com' },
  JIRA_PAT: { secret: true, service: 'jira', label: 'Jira Personal Access Token', pattern: /^[^\s]{8,300}$/, hint: '' },
  JIRA_TASKS_PROJECTS: { secret: false, service: 'jira', label: 'Проекты для вкладки "Задачи Jira" (ключи через запятую)', pattern: /^[A-Z][A-Z0-9_]{1,19}(\s*,\s*[A-Z][A-Z0-9_]{1,19})*$/i, hint: 'ABC, XYZ (пусто: все проекты)' },
  JIRA_REPORT_PROJECTS: { secret: false, service: 'jira', label: 'Проекты для вкладки "Отчет Jira" (ключи через запятую)', pattern: /^[A-Z][A-Z0-9_]{1,19}(\s*,\s*[A-Z][A-Z0-9_]{1,19})*$/i, hint: 'ABC, XYZ (пусто: все проекты)' },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];
export const isSettingKey = (k: string): k is SettingKey => k in SETTING_DEFS;

// Таблица создаётся при первом обращении, чтобы не требовать ручной миграции
// (в проекте нет prisma/migrations). DDL совпадает с model UserSetting в schema.prisma.
let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  const p: Promise<void> = prisma
    .$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "UserSetting" (' +
        '"userId" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL, ' +
        '"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
        'CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("userId","key"), ' +
        'CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)'
    )
    .then(() => undefined)
    .catch((e: unknown) => {
      tableReady = null;
      throw e;
    });
  tableReady = p;
  return p;
}

// Короткий кэш, чтобы не читать базу и не расшифровывать на каждый вызов API.
const cache = new Map<string, { at: number; values: Partial<Record<SettingKey, string>> }>();
const TTL = 30_000;

export async function getUserSettings(userId: string): Promise<Partial<Record<SettingKey, string>>> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.values;
  await ensureTable();
  const rows = await prisma.userSetting.findMany({ where: { userId } });
  const values: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) {
    if (!isSettingKey(r.key)) continue;
    const v = SETTING_DEFS[r.key].secret ? decryptText(r.value) : r.value;
    if (v) values[r.key] = v;
  }
  cache.set(userId, { at: Date.now(), values });
  return values;
}

// value === null удаляет настройку (вернётся значение из окружения, если оно разрешено).
export async function saveUserSettings(userId: string, changes: Partial<Record<SettingKey, string | null>>): Promise<void> {
  await ensureTable();
  for (const [k, v] of Object.entries(changes)) {
    if (!isSettingKey(k)) continue;
    if (v === null || v === '') {
      await prisma.userSetting.deleteMany({ where: { userId, key: k } });
      continue;
    }
    const stored = SETTING_DEFS[k].secret ? encryptText(v) : v;
    await prisma.userSetting.upsert({
      where: { userId_key: { userId, key: k } },
      update: { value: stored },
      create: { userId, key: k, value: stored },
    });
  }
  cache.delete(userId);
}

export type SettingView = {
  key: SettingKey;
  label: string;
  service: string;
  secret: boolean;
  hint: string;
  set: boolean;
  source: 'user' | 'env' | null;
  preview: string; // для секрета: последние 4 символа, для обычной настройки: значение
};

export async function getSettingsOverview(userId: string, envFallback: (k: SettingKey) => string): Promise<SettingView[]> {
  const user = await getUserSettings(userId);
  return SETTING_KEYS.map((key) => {
    const def = SETTING_DEFS[key];
    const own = user[key];
    const env = own ? '' : envFallback(key);
    const val = own || env;
    return {
      key,
      label: def.label,
      service: def.service,
      secret: def.secret,
      hint: def.hint,
      set: Boolean(val),
      source: own ? 'user' : env ? 'env' : null,
      preview: !val ? '' : def.secret ? `••••${val.slice(-4)}` : val,
    };
  });
}
