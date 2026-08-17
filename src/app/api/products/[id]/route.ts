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
