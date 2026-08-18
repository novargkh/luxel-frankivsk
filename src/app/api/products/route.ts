import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeCategory } from "@/lib/categorize";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  const products = await prisma.product.findMany({
    where: role === "ADMIN" ? {} : { isActive: true },
    include: { images: true },
    orderBy: [{ isPromo: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(
    products.map((product) => ({
      ...product,
      category: product.category ? normalizeCategory(product.category) : product.category,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, price, stock, category, videoUrl, isPromo, promoText, images, article, basId } =
    body as {
      name: string;
      description?: string;
      price: number;
      stock: number;
      category?: string;
      videoUrl?: string;
      isPromo?: boolean;
      promoText?: string;
      images?: string[];
      article?: string;
      basId?: string;
    };

  if (!name || price === undefined) {
    return NextResponse.json({ error: "name and price are required" }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      name,
      description,
      price: Number(price),
      stock: Number(stock ?? 0),
      category: category ? normalizeCategory(category) : undefined,
      videoUrl: videoUrl || undefined,
      isPromo: Boolean(isPromo),
      promoText: promoText || undefined,
      article: article || undefined,
      basId: basId || undefined,
      images: {
        create: (images ?? []).map((url) => ({ url })),
      },
    },
    include: { images: true },
  });

  return NextResponse.json(product, { status: 201 });
}
