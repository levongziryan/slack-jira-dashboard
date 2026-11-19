// Читаемые названия каналов Slack. Значение в базе (channel) используется для фильтрации и не меняется при показе.
const GROUP_RE = /^mpdm-(.+?)(?:-\d+)?$/;
export const SLACK_USER_ID_RE = /^[UW][A-Z0-9]{6,}$/;

// mpdm-ivan.petrov--anna.s--me-1 -> "Группа: ivan petrov, anna s, me"
export function groupLabel(name: string): string {
  const m = name.match(GROUP_RE);
  if (!m) return name;
  const people = m[1].split('--').map((x) => x.replace(/[._]/g, ' ').trim()).filter(Boolean);
  return `Группа: ${people.join(', ')}`;
}

export function displayChannel(raw: string | null | undefined): string {
  const n = (raw ?? '').trim();
  if (!n) return 'без названия';
  if (/^(ЛС|Группа):/.test(n)) return n;
  if (GROUP_RE.test(n) && n.startsWith('mpdm-')) return groupLabel(n);
  if (SLACK_USER_ID_RE.test(n)) return `ЛС (имя не определено, …${n.slice(-4)})`;
  if (/^[CGD][A-Z0-9]{8,}$/.test(n)) return `Канал без названия (…${n.slice(-4)})`;
  return `#${n}`;
}
