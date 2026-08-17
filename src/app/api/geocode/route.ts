import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Proxies address -> coordinates lookups to Nominatim (OpenStreetMap).
// Called server-side so we can send a proper User-Agent (Nominatim's usage
// policy requires one identifying the application) and so the client never
// talks to a third-party geocoding service directly.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Bias results toward Ukraine, where LUXEL's delivery points are.
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ua");
  url.searchParams.set("addressdetails", "0");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "luxel-client-portal/1.0 (contact: novargkh@gmail.com)",
        "Accept-Language": "uk",
      },
      // Nominatim's public instance is free but rate-limited; don't let a
      // hung request block the profile form indefinitely.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const results = data.map((r) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: r.display_name,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
