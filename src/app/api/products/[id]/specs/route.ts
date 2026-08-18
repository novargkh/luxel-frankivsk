import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchProductSpecs } from "@/lib/specsSync";

// Any logged-in user (not just admin) can trigger this — it's what powers
// the "Характеристики" button self-healing instead of just saying "not
// loaded yet" until an admin happens to run the bulk sync. If the product
// already has cached specs, they're returned immediately; otherwise this
// fetches the product's own luxel.ua page on demand, caches the result,
// and returns it. Returns { specs: null } (not an error) for products with
// no sourceUrl or where the live fetch didn't find anything.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sourceUrl: true, specs: true },
  });
  if (!product) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (product.specs && Object.keys(product.specs as object).length > 0) {
    return NextResponse.json({ specs: product.specs });
  }

  if (!product.sourceUrl) {
    return NextResponse.json({ specs: null });
  }

  const specs = await fetchProductSpecs(product.sourceUrl);
  if (specs) {
    await prisma.product.update({ where: { id }, data: { specs } });
  }
  return NextResponse.json({ specs: specs ?? null });
}
