export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 });
    }
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Ошибка' }, { status: 500 });
  }
}
