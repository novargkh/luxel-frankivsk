// One-off script (not part of the regular db:seed) that sets up realistic
// test data for the BAS CommerceML exchange and creates the two required
// test orders — one single-item, one multi-item — so the endpoint can be
// exercised end to end against real-looking data.
//
// Run with: npx tsx scripts/seed-bas-test-orders.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // --- Client A: matched via BAS ID (the preferred path) -----------------
  const clientA = await prisma.user.upsert({
    where: { email: "client@demo.local" },
    update: {
      phone: "+380671234567",
      basId: "BAS-CTR-00042", // pretend this was looked up in BAS by an admin
    },
    create: {
      email: "client@demo.local",
      name: "Іван Клієнтенко",
      company: "ТОВ Ромашка",
      phone: "+380671234567",
      basId: "BAS-CTR-00042",
      passwordHash, // only used if the demo seed hasn't already created this user
      role: "CLIENT",
    },
  });

  // --- Client B: no BAS ID yet — matched via email + phone fallback ------
  const clientB = await prisma.user.upsert({
    where: { email: "client2@demo.local" },
    update: { phone: "+380509876543" },
    create: {
      email: "client2@demo.local",
      name: "Олена Другенко",
      company: "ФОП Другенко О.В.",
      phone: "+380509876543",
      passwordHash,
      role: "CLIENT",
    },
  });

  let shopA = await prisma.shop.findFirst({ where: { userId: clientA.id } });
  if (!shopA) {
    shopA = await prisma.shop.create({
      data: {
        userId: clientA.id,
        name: "Магазин на Хрещатику",
        address: "м. Київ, вул. Хрещатик, 22",
        contactPerson: "Іван Клієнтенко",
        phone: "+380671234567",
      },
    });
  }

  let shopB = await prisma.shop.findFirst({ where: { userId: clientB.id } });
  if (!shopB) {
    shopB = await prisma.shop.create({
      data: {
        userId: clientB.id,
        name: "Магазин на Оболоні",
        address: "м. Київ, просп. Оболонський, 45",
        contactPerson: "Олена Другенко",
        phone: "+380509876543",
      },
    });
  }

  // Pick a few real, in-stock catalog products and make sure each one has
  // a resolvable article — matches the "site_product_id / SKU -> BAS
  // product_id" table requirement (Product.article / Product.basId).
  const products = await prisma.product.findMany({
    where: { isActive: true, stock: { gt: 3 } },
    orderBy: { price: "asc" },
    take: 3,
  });
  if (products.length < 3) {
    throw new Error("Потрібно принаймні 3 активні товари з залишком у каталозі для тестових замовлень");
  }
  const [pSingle, pMulti1, pMulti2] = products;

  // pSingle gets a real BAS product ID (best-case match path).
  await prisma.product.update({
    where: { id: pSingle.id },
    data: { basId: "BAS-PROD-1025", article: "1025" },
  });
  // The other two only get an article — exercises the SKU fallback path.
  await prisma.product.update({ where: { id: pMulti1.id }, data: { article: "1036" } });
  await prisma.product.update({ where: { id: pMulti2.id }, data: { article: "10061" } });

  // --- Test order 1: single item, client matched by BAS ID ---------------
  const orderSingle = await prisma.order.create({
    data: {
      userId: clientA.id,
      shopId: shopA.id,
      comment: "Тестове замовлення — один товар",
      paymentMethod: "Безготівковий розрахунок",
      deliveryMethod: "Доставка на адресу магазину",
      items: { create: [{ productId: pSingle.id, quantity: 2, priceAtOrder: pSingle.price }] },
    },
    include: { items: true },
  });

  // --- Test order 2: multiple items, client matched by email+phone -------
  const orderMulti = await prisma.order.create({
    data: {
      userId: clientB.id,
      shopId: shopB.id,
      comment: "Тестове замовлення — кілька товарів",
      paymentMethod: "Готівка при отриманні",
      deliveryMethod: "Самовивіз зі складу",
      items: {
        create: [
          { productId: pSingle.id, quantity: 1, priceAtOrder: pSingle.price },
          { productId: pMulti1.id, quantity: 3, priceAtOrder: pMulti1.price },
          { productId: pMulti2.id, quantity: 2, priceAtOrder: pMulti2.price },
        ],
      },
    },
    include: { items: true },
  });

  console.log("Створено тестові замовлення для обміну з BAS:\n");
  console.log(`Замовлення №${orderSingle.orderNumber} (1 товар), id=${orderSingle.id}`);
  console.log(`  клієнт: ${clientA.name} (${clientA.email}), BAS ID=${clientA.basId}`);
  console.log(`  товар: ${pSingle.name} x${orderSingle.items[0].quantity}`);
  console.log("");
  console.log(`Замовлення №${orderMulti.orderNumber} (${orderMulti.items.length} товари), id=${orderMulti.id}`);
  console.log(`  клієнт: ${clientB.name} (${clientB.email} / ${clientB.phone}) — без BAS ID, зіставлення по email+телефону`);
  for (const item of orderMulti.items) {
    console.log(`  товар: ${item.productId} x${item.quantity}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
