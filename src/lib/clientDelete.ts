// Removing a test client with everything that hangs on it. Real clients come
// from BAF with a BAF code and are never deletable; a client whose orders
// already reached BAF is not deletable either (block the account instead).

import { prisma } from "@/lib/prisma";
import { notifyAdmins, esc } from "@/lib/telegram";

export class DeleteRefused extends Error {}

export function clientLabel(u: { company: string | null; name: string }) {
  return (u.company || u.name).trim();
}

export async function deletionBlocker(id: string): Promise<string | null> {
  const u = await prisma.user.findFirst({ where: { id, role: "CLIENT" }, select: { basId: true } });
  if (!u) return "Клієнта не знайдено";
  if (u.basId) return "Клієнт має код BAF: це реальний клієнт з BAF, видаляти його не можна. Щоб закрити доступ, заблокуйте вхід.";
  const sent = await prisma.order.count({ where: { userId: id, basStatus: { in: ["SENT_TO_BAS", "SENDING"] } } });
  if (sent) return `${sent} замовл. цього клієнта вже передані в BAF, тому видаляти його не можна. Заблокуйте вхід.`;
  return null;
}

export async function deleteTestClient(id: string, confirmName: string, actorId: string) {
  const blocker = await deletionBlocker(id);
  if (blocker) throw new DeleteRefused(blocker);
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true, company: true, shops: { select: { id: true } } } });
  if (!u) throw new DeleteRefused("Клієнта не знайдено");
  const label = clientLabel(u);
  if (confirmName.trim() !== label) throw new DeleteRefused(`Для підтвердження введіть назву клієнта точно: «${label}»`);

  const shopIds = u.shops.map((s) => s.id);
  // Personal codes given only to this client: without their owner they
  // would turn into codes anyone can use.
  const personal = await prisma.promoCode.findMany({
    where: { isTemplate: false, clients: { some: { id } } },
    select: { id: true, _count: { select: { clients: true } } },
  });
  const ownCodes = personal.filter((p) => p._count.clients === 1).map((p) => p.id);

  const [, , , , orders] = await prisma.$transaction([
    prisma.returnRequest.deleteMany({ where: { userId: id } }),
    prisma.routeStopOrder.deleteMany({ where: { order: { userId: id } } }),
    prisma.routeStop.deleteMany({ where: { shopId: { in: shopIds } } }),
    prisma.challengeEntry.deleteMany({ where: { userId: id } }),
    prisma.order.deleteMany({ where: { userId: id } }),
    prisma.promoCode.deleteMany({ where: { id: { in: ownCodes } } }),
    prisma.user.delete({ where: { id } }),
  ]);

  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } });
  console.warn(`[clients] test client "${label}" (${id}) deleted by ${actor?.email ?? actorId}; orders: ${orders.count}`);
  await notifyAdmins(
    `🗑 <b>Видалено тестового клієнта</b> «${esc(label)}» разом з ${orders.count} замовл.\nХто видалив: ${esc(actor?.name ?? "")} (${esc(actor?.email ?? "")})`
  );
  return { label, orders: orders.count };
}
