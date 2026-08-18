import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    name,
    description,
    price,
    stock,
    category,
    videoUrl,
    isPromo,
    promoText,
    isActive,
    images,
    article,
    basId,
  } = body as {
    name?: string;
    description?: string;
    price?: number;
    stock?: number;
    category?: string;
    videoUrl?: string;
    isPromo?: boolean;
    promoText?: string;
    isActive?: boolean;
    images?: string[];
    article?: string;
    basId?: string;
  };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (price !== undefined) data.price = Number(price);
  if (stock !== undefined) data.stock = Number(stock);
  if (category !== undefined) data.category = category;
  if (videoUrl !== undefined) data.videoUrl = videoUrl;
  if (isPromo !== undefined) data.isPromo = Boolean(isPromo);
  if (promoText !== undefined) data.promoText = promoText;
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  // Used by the BAS (1C) exchange to match this product — see
  // src/lib/onecExchange.ts. Empty string clears back to null (falls back
  // to the regex-extracted article from the name).
  if (article !== undefined) data.article = article || null;
  if (basId !== undefined) {
    const trimmed = basId.trim();
    if (trimmed) {
      const existing = await prisma.product.findUnique({ where: { basId: trimmed } });
      if (existing && existing.id !== id) {
        return NextResponse.json(
          { error: "Цей BAS ID вже прив'язаний до іншого товару" },
          { status: 400 }
        );
      }
    }
    data.basId = trimmed || null;
  }

  if (images !== undefined) {
    await prisma.productImage.deleteMany({ where: { productId: id } });
    data.images = { create: images.map((url) => ({ url })) };
  }

  const product = await prisma.product.update({
    where: { id },
    data,
    include: { images: true },
  });

  return NextResponse.json(product);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
