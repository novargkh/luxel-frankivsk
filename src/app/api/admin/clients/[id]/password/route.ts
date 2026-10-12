import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { loginOf, setClientPassword } from "@/lib/clientAccount";

// POST {} = new random password; POST { password } = the admin's own.
// The password stays visible to the admin in the client's card.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id, role: "CLIENT" }, select: { email: true, phone: true } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!user.email && !user.phone) {
    return NextResponse.json(
      { error: "Спочатку вкажіть клієнту email або телефон: це його логін для входу" },
      { status: 400 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const custom = typeof body.password === "string" ? body.password.trim() : "";
  if (custom && (custom.length < 6 || /\s/.test(custom))) {
    return NextResponse.json({ error: "Пароль: щонайменше 6 символів, без пробілів" }, { status: 400 });
  }
  const password = await setClientPassword(id, custom || undefined);
  return NextResponse.json({ password, login: loginOf(user) });
}
