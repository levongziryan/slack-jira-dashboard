// Заголовок и границы периодов дашборда считаются по времени Минска.
// Беларусь живёт на UTC+3 без перехода на летнее время, поэтому фиксированного смещения достаточно.
const MINSK_OFFSET_MS = 3 * 3600_000;

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export interface MinskPeriod {
  /** сегодняшняя дата в Минске, YYYY-MM-DD */
  today: string;
  /** DD.MM.YYYY для подписей */
  todayRu: string;
  monthName: string;
  /** начало текущего месяца (включительно), момент времени в UTC */
  monthStart: Date;
  /** начало завтрашнего дня (исключительно): всё, что строго раньше, входит в "по сегодня включительно" */
  endOfToday: Date;
}

export function minskPeriod(now: Date = new Date()): MinskPeriod {
  const local = new Date(now.getTime() + MINSK_OFFSET_MS); // UTC-поля = настенное время Минска
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    today: `${y}-${pad(m + 1)}-${pad(d)}`,
    todayRu: `${pad(d)}.${pad(m + 1)}.${y}`,
    monthName: MONTHS[m],
    monthStart: new Date(Date.UTC(y, m, 1) - MINSK_OFFSET_MS),
    endOfToday: new Date(Date.UTC(y, m, d + 1) - MINSK_OFFSET_MS),
  };
}

export function buildDashboardTitle(active: number, mentions: number, monthName: string): string {
  return (
    `${active} ${plural(active, 'активное обещание', 'активных обещания', 'активных обещаний')}, ` +
    `${mentions} ${plural(mentions, 'упоминание', 'упоминания', 'упоминаний')} за ${monthName}`
  );
}
