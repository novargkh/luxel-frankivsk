// CommerceML 2 "sale" exchange endpoint for BAS (1C) "Малий бізнес ПРОФ".
// Publicly reachable at /1c_exchange.php via the rewrite in next.config.ts
// (BAS's exchange-publication wizard expects that literal filename) —
// this file is the real implementation, mounted at /api/1c-exchange.
//
// BAS calls this on its own schedule (every 30 min, per the integration
// spec); the portal never calls out to BAS. Every call is plain-text
// query params + HTTP Basic Auth, per the standard 1C/BAS exchange
// protocol — see docs/1c-exchange.md for the full writeup, example XML,
// and curl commands to test each mode by hand.
import { NextResponse } from "next/server";
import {
  EXCHANGE_COOKIE_NAME,
  buildQueryResponse,
  checkBasicAuth,
  checkIpAllowed,
  confirmSuccess,
  createSessionCookieValue,
  readCookie,
  verifySessionCookieValue,
} from "@/lib/onecExchange";

// Must run on the Node runtime (Prisma, crypto.timingSafeEqual) — this is
// already the default for App Router API routes here, stated explicitly
// so a future edge-runtime default change doesn't silently break it.
export const runtime = "nodejs";

// 1C/BAS exchange bodies are plain text ("success"/"failure\n<reason>")
// except mode=query, which returns the raw XML directly.
function text(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function xml(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const mode = url.searchParams.get("mode");

  if (type !== "sale") {
    return text(`failure\nНепідтримуваний тип обміну: ${type ?? ""}`);
  }

  if (!checkIpAllowed(req)) {
    return text("failure\nДоступ заборонено", 403);
  }

  if (!checkBasicAuth(req)) {
    return new NextResponse("failure\nНеправильний логін або пароль", {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="1C Exchange"',
      },
    });
  }

  if (mode === "checkauth") {
    const cookieValue = createSessionCookieValue();
    const res = text(`success\n${EXCHANGE_COOKIE_NAME}\n${cookieValue}`);
    res.cookies.set(EXCHANGE_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 2 * 60 * 60,
      path: "/",
    });
    return res;
  }

  // Every other mode requires a session established by a prior checkauth.
  const cookieValue = readCookie(req, EXCHANGE_COOKIE_NAME);
  if (!verifySessionCookieValue(cookieValue)) {
    return text("failure\nСесія недійсна або протермінована — повторіть checkauth");
  }

  if (mode === "init") {
    return text("zip=no\nfile_limit=10485760");
  }

  if (mode === "query") {
    try {
      const { xml: body, sentCount, skippedCount } = await buildQueryResponse();
      if (skippedCount > 0) {
        console.warn(
          `[1c-exchange] mode=query: ${skippedCount} order(s) skipped (unmatchable client/product), ${sentCount} sent`
        );
      }
      if (!body) return text(""); // nothing to send — empty body signals "done"
      return xml(body);
    } catch (e) {
      console.error("[1c-exchange] mode=query failed:", e);
      return text(`failure\n${e instanceof Error ? e.message : "Внутрішня помилка"}`);
    }
  }

  if (mode === "success") {
    try {
      const confirmed = await confirmSuccess();
      console.log(`[1c-exchange] mode=success: ${confirmed} order(s) confirmed sent to BAS`);
      return text("success");
    } catch (e) {
      console.error("[1c-exchange] mode=success failed:", e);
      return text(`failure\n${e instanceof Error ? e.message : "Внутрішня помилка"}`);
    }
  }

  return text(`failure\nНевідомий режим: ${mode ?? ""}`);
}

export async function GET(req: Request) {
  return handle(req);
}

// Some 1C/BAS client configurations issue query/success as POST — accept
// both so the exchange isn't sensitive to that detail.
export async function POST(req: Request) {
  return handle(req);
}
