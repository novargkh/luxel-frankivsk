import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncFromLuxel } from "@/lib/luxelSync";

// Fetching prices for new products happens sequentially in small batches
// and can take a while — give this route more room than the Next.js
// default before Vercel kills it (actual cap depends on the plan).
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await syncFromLuxel();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не вдалося оновити каталог з luxel.ua" },
      { status: 502 }
    );
  }
}
