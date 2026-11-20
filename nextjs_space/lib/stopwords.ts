// Стоп-слова: сообщения Slack с этими словами не учитываются при поиске ожиданий (упоминания и обещания).
export function parseStopWords(v: string): string[] {
  return [...new Set((v ?? '').split(/[,\n;]/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2))];
}

export function hasStopWord(text: string | null | undefined, words: string[]): boolean {
  if (words.length === 0) return false;
  const t = (text ?? '').toLowerCase();
  return words.some((w) => t.includes(w));
}
