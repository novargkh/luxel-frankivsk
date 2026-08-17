import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type LuxelCatalogItem = {
  name: string;
  price: number;
  category: string;
  subcategory: string;
  sourceUrl: string;
  imagePath: string;
};

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "admin@demo.local" },
    update: {},
    create: {
      email: "admin@demo.local",
      name: "Адміністратор LUXEL",
      passwordHash,
      role: "ADMIN",
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@demo.local" },
    update: {},
    create: {
      email: "client@demo.local",
      name: "Іван Клієнтенко",
      company: "ТОВ Ромашка",
      passwordHash,
      role: "CLIENT",
    },
  });

  const shopCount = await prisma.shop.count({ where: { userId: client.id } });
  if (shopCount === 0) {
    await prisma.shop.createMany({
      data: [
        {
          userId: client.id,
          name: "Магазин на Хрещатику",
          address: "м. Київ, вул. Хрещатик, 22",
          contactPerson: "Іван Клієнтенко",
          phone: "+380 67 123 45 67",
          lat: 50.4487,
          lng: 30.5238,
        },
        {
          userId: client.id,
          name: "Магазин на Оболоні",
          address: "м. Київ, просп. Оболонський, 45",
          contactPerson: "Марія Продавченко",
          phone: "+380 67 765 43 21",
          lat: 50.5049,
          lng: 30.4977,
        },
      ],
    });
  }

  const existing = await prisma.product.count();
  if (existing === 0) {
    const catalogPath = path.join(__dirname, "luxel-catalog.json");
    if (fs.existsSync(catalogPath)) {
      const items: LuxelCatalogItem[] = JSON.parse(
        fs.readFileSync(catalogPath, "utf-8")
      );

      console.log(`Заповнення каталогу: ${items.length} товарів з luxel.ua...`);

      const BATCH_SIZE = 25;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((item) =>
            prisma.product.create({
              data: {
                name: item.name,
                description: item.subcategory
                  ? `${item.category} — ${item.subcategory}`
                  : item.category,
                price: item.price,
                stock: 20,
                category: item.category,
                isActive: true,
                sourceUrl: item.sourceUrl,
                images: {
                  create: [{ url: item.imagePath }],
                },
              },
            })
          )
        );
        if ((i / BATCH_SIZE) % 10 === 0) {
          console.log(`  ...${Math.min(i + BATCH_SIZE, items.length)}/${items.length}`);
        }
      }

      console.log(`Готово: додано ${items.length} товарів з каталогу luxel.ua.`);
    } else {
      console.warn(
        "prisma/luxel-catalog.json не знайдено — товари з каталогу не додані."
      );
    }
  }

  console.log(
    "Seed complete. Demo login: admin@demo.local / client@demo.local, пароль: password123"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
