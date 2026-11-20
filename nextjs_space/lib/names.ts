// Единые правила имён в текстах задач, отчётов и статусов:
//  - владелец дашборда (Левон Гзирян) заменяется на «я»;
//  - остальные люди сокращаются до вида «Л.Гзирян».
// Чистые функции без обращений к сети: работают и на сервере, и в браузере.

const L = '\\p{L}';

// Левон Гзирян в любом порядке и падеже -> форма местоимения.
const SELF_RULES: { re: RegExp; to: string }[] = [
  { re: new RegExp(`(?<!${L})Левон(?:а|у|ом|е)?\\s+Гзирян(?:а|у|ом|е)?(?!${L})`, 'giu'), to: '' },
  { re: new RegExp(`(?<!${L})Гзирян(?:а|у|ом|е)?\\s+Левон(?:а|у|ом|е)?(?!${L})`, 'giu'), to: '' },
  { re: new RegExp(`(?<!${L})Levon\\s+Gziry[ae]n(?!${L})`, 'giu'), to: '' },
  { re: new RegExp(`(?<!${L})Gziry[ae]n\\s+Levon(?!${L})`, 'giu'), to: '' },
];

function selfForm(matched: string): string {
  const m = matched.toLowerCase();
  if (/левона\s+гзиряна|гзиряна\s+левона/.test(m)) return 'меня';
  if (/левону\s+гзиряну|гзиряну\s+левону/.test(m)) return 'мне';
  if (/левоном\s+гзиряном|гзиряном\s+левоном/.test(m)) return 'мной';
  if (/левоне\s+гзирян[ое]|гзирян[ое]\s+левоне/.test(m)) return 'мне';
  return 'я';
}

export function selfToI(text: string): string {
  let out = text ?? '';
  for (const r of SELF_RULES) {
    out = out.replace(r.re, (m, offset: number, whole: string) => {
      const f = selfForm(m);
      // В начале текста и после точки местоимение пишется с большой буквы.
      const before = whole.slice(0, offset);
      return /^\s*$|[.!?]\s*$/.test(before) ? f[0].toUpperCase() + f.slice(1) : f;
    });
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isSelfName(name: string): boolean {
  return /гзирян|gziry[ae]n/i.test(name) && /левон|levon/i.test(name);
}

// Сокращает «Имя Фамилия» (и «Фамилия Имя») из списка известных имён до «И.Фамилия».
// Падежи русских фамилий и имён учитываются по общему началу слова.
export function abbreviateNames(text: string, names: string[]): string {
  let out = text ?? '';
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? '').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name.toLowerCase()) || isSelfName(name)) continue;
    seen.add(name.toLowerCase());
    const parts = name.split(' ');
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    const stem = (w: string) => esc(w.length > 4 ? w.slice(0, -1) : w);
    // «Имя Фамилия» и «Фамилия Имя»: фамилию берём в той форме (падеже), в какой она найдена в тексте.
    const direct = new RegExp(`(?<!${L})${stem(a)}${L}*\\s+(${stem(b)}${L}*)(?!${L})`, 'giu');
    const reverse = new RegExp(`(?<!${L})(${stem(b)}${L}*)\\s+${stem(a)}${L}*(?!${L})`, 'giu');
    out = out.replace(direct, (_m, last: string) => `${a[0].toUpperCase()}.${last}`);
    out = out.replace(reverse, (_m, last: string) => `${a[0].toUpperCase()}.${last}`);
  }
  return out;
}

export function personalize(text: string, names: string[] = []): string {
  return abbreviateNames(selfToI(text), names);
}

// «Имя Фамилия» -> «И.Фамилия» для одного отображаемого имени (поля исполнителя, автора).
export function shortName(name: string | null | undefined): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  if (isSelfName(n)) return 'я';
  const parts = n.split(' ');
  if (parts.length !== 2) return n;
  return `${parts[0][0].toUpperCase()}.${parts[1]}`;
}
