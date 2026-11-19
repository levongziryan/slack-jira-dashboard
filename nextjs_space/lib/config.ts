// Единая точка получения учётных данных и настроек интеграций (Slack, Jira, LLM).
// Порядок: настройки пользователя из базы (вводятся в интерфейсе, хранятся зашифрованными),
// затем переменные окружения. Для SaaS задайте ALLOW_ENV_CREDENTIALS=false, чтобы
// окружение сервера никогда не подставлялось пользователям.
// Если userId не передан (например, публичная ссылка без сессии), используется владелец:
// самый ранний пользователь. После появления userId в данных (мультитенантность) это уберём.
import { prisma } from '@/lib/prisma';
import { getUserSettings, type SettingKey } from '@/lib/settings';

export type JiraConfig = { baseUrl: string; pat: string; tasksProjects: string[]; reportProjects: string[] };

// "abc, XYZ" -> ['ABC','XYZ'] без дублей
export function parseProjectKeys(v: string): string[] {
  return [...new Set(v.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z][A-Z0-9_]{1,19}$/.test(x)))];
}
export type LlmConfig = { apiKey: string; model: string };

// Пробелы и переводы строк при копировании токена - частая причина "invalid_auth".
const env = (key: string): string => (process.env[key] ?? '').trim();

export const envFallbackAllowed = () => process.env.ALLOW_ENV_CREDENTIALS !== 'false';
export const envValue = (key: SettingKey): string => (envFallbackAllowed() ? env(key) : '');

export async function ownerId(): Promise<string | null> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return u?.id ?? null;
}

async function value(userId: string | undefined, key: SettingKey): Promise<string> {
  const uid = userId ?? (await ownerId());
  if (uid) {
    try {
      const own = (await getUserSettings(uid))[key];
      if (own) return own.trim();
    } catch (e: any) {
      console.error('[config] не удалось прочитать настройки:', e?.message ?? e);
    }
  }
  return envValue(key);
}

export async function getSlackToken(userId?: string): Promise<string | null> {
  return (await value(userId, 'SLACK_USER_TOKEN')) || null;
}

// ID каналов Slack, которые нужно загружать и отслеживать. Пустой список: все каналы.
export async function getSlackChannels(userId?: string): Promise<string[]> {
  const v = await value(userId, 'SLACK_CHANNELS');
  return [...new Set(v.split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[CGDM][A-Z0-9]{6,}$/.test(x)))];
}

export async function getJiraConfig(userId?: string): Promise<JiraConfig | null> {
  const baseUrl = (await value(userId, 'JIRA_BASE_URL')).replace(/\/+$/, '');
  const pat = await value(userId, 'JIRA_PAT');
  if (!baseUrl || !pat) return null;
  return {
    baseUrl,
    pat,
    tasksProjects: parseProjectKeys(await value(userId, 'JIRA_TASKS_PROJECTS')),
    reportProjects: parseProjectKeys(await value(userId, 'JIRA_REPORT_PROJECTS')),
  };
}

export async function getLlmConfig(userId?: string): Promise<LlmConfig | null> {
  const apiKey = await value(userId, 'ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  return { apiKey, model: (await value(userId, 'LLM_MODEL')) || 'claude-haiku-4-5' };
}

// Секрет для подписи ссылок. В production без NEXTAUTH_SECRET подпись была бы подделываемой.
export function appSecret(): string {
  const s = env('NEXTAUTH_SECRET');
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET не задан');
  return 'dev-only-secret';
}

export function appBaseUrl(): string {
  return (env('NEXTAUTH_URL') || 'http://localhost:3000').replace(/\/+$/, '');
}
