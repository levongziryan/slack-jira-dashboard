export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

// Устарел: вход выполняет NextAuth (/api/auth/callback/credentials). Отдельный эндпоинт
// проверки пароля без ограничения попыток не нужен и увеличивал поверхность атаки.
export async function POST() {
  return NextResponse.json({ error: 'Gone' }, { status: 410 });
}
