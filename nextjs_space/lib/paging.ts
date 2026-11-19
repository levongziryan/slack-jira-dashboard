// Параметры постраничной выборки: offset/limit из строки запроса. Без limit возвращается прежний формат (массив).
export const MAX_PAGE = 300;

export function readPaging(searchParams: URLSearchParams) {
  const limitRaw = searchParams.get('limit');
  if (!limitRaw) return null;
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(limitRaw)) || 15));
  const offset = Math.max(0, Math.floor(Number(searchParams.get('offset'))) || 0);
  return { limit, offset };
}
