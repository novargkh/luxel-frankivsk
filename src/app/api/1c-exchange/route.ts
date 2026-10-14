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
import { catalogComplete, catalogFile, catalogImport, catalogInit } from "@/lib/cmlCatalog";
import {
  EXCHANGE_COOKIE_NAME,
  buildQueryResponse,
  checkBasicAuthInfo,
  checkIpAllowed,
  confirmSuccess,
  createSessionCookieValue,
  readCookie,
  verifySessionCookieValue,
} from "@/lib/onecExchange";
import { prisma } from "@/lib/prisma";

// Must run on the Node runtime (Prisma, crypto.timingSafeEqual) — this is
// already the default for App Router API routes here, stated explicitly
// so a future edge-runtime default change doesn't silently break it.
export const runtime = "nodejs";
// A catalog import may take a while on a big first upload.
export const maxDuration = 60;

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

// What the journal records about the current request (filled by handle).
type Note = { detail?: string | null };

async function handle(req: Request, note: Note): Promise<NextResponse> {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const mode = url.searchParams.get("mode");

  // "sale" = orders to BAF; "catalog" = goods and prices from BAF
  // (src/lib/cmlCatalog.ts).
  if (type !== "sale" && type !== "catalog") {
    return text(`failure\nНепідтримуваний тип обміну: ${type ?? ""}`);
  }

  if (!checkIpAllowed(req)) {
    return text("failure\nДоступ заборонено", 403);
  }

  const authInfo = checkBasicAuthInfo(req);
  const auth = authInfo.result;
  if (auth !== "ok") {
    note.detail = authInfo.detail;
    const why =
      auth === "not-configured"
        ? "На сайті не задано ONE_C_EXCHANGE_LOGIN / ONE_C_EXCHANGE_PASSWORD (Vercel → Environment Variables, потім Redeploy)"
        : auth === "no-credentials"
          ? "BAF не передав логін і пароль"
          : "Неправильний логін або пароль";
    return new NextResponse(`failure\n${why}`, {
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
    note.detail = cookieValue ? "cookie сесії недійсний або протермінований" : "BAF не передав cookie сесії з checkauth";
    return text("failure\nСесія недійсна або протермінована — повторіть checkauth");
  }

  if (type === "catalog") {
    if (mode === "init") {
      await catalogInit();
      // zip=yes: BAF packs everything into one archive, ~10x smaller.
      // Chunks stay under Vercel's 4.5 MB request limit.
      return text("zip=yes\nfile_limit=4000000");
    }
    if (mode === "file") {
      const body = Buffer.from(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
      await catalogFile(url.searchParams.get("filename") ?? "", body);
      return text("success");
    }
    if (mode === "import") {
      return text(await catalogImport(url.searchParams.get("filename") ?? ""));
    }
    if (mode === "complete" || mode === "deactivate") {
      await catalogComplete();
      return text("success");
    }
    return text("success");
  }

  if (mode === "init") {
    // Under Vercel's 4.5 MB request limit, so BAF splits bigger files.
    return text("zip=no\nfile_limit=4000000");
  }

  // On "sale" BAF sends its own copy of the orders (statuses after it
  // processed them): nothing on the site changes from it.
  if (mode === "file") {
    const body = await req.arrayBuffer().catch(() => new ArrayBuffer(0));
    console.log(`[1c-exchange] type=sale mode=file: ${url.searchParams.get("filename") ?? "?"} ${body.byteLength} bytes (ignored)`);
    return text("success");
  }
  if (mode === "import" || mode === "complete" || mode === "deactivate") {
    return text("success");
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

// Every call: never crash with an HTML 500 (BAF shows that only as "no
// connection"), answer "failure\n<reason>" instead, and write the request
// to the exchange journal (admin → Обмін з BAF).
async function run(req: Request): Promise<NextResponse> {
  const started = Date.now();
  const note: Note = {};
  // The row is written first and completed at the end, so a request that
  // Vercel cuts off (timeout) still shows up in the journal.
  const logId = await startLog(req);
  let res: NextResponse;
  let answer: string;
  try {
    res = await handle(req, note);
    answer = res.headers.get("content-type")?.includes("xml") ? "(XML із замовленнями)" : await res.clone().text();
  } catch (e) {
    console.error("[1c-exchange] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    answer = `failure\nПомилка на сайті: ${msg.slice(0, 300)}`;
    note.detail = msg.slice(0, 1000);
    res = text(answer);
  }
  await finishLog(logId, res.status, answer, note, Date.now() - started);
  return res;
}

let lastPrune = 0;

async function startLog(req: Request): Promise<string | null> {
  try {
    const url = new URL(req.url);
    const row = await prisma.exchangeLog.create({
      data: {
        type: url.searchParams.get("type"),
        mode: url.searchParams.get("mode"),
        filename: url.searchParams.get("filename"),
        bytes: Number(req.headers.get("content-length")) || 0,
        status: 0,
        ok: false,
        answer: "(обробка не завершилась: сайт не встиг відповісти)",
        ip: (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null,
        agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[1c-exchange] journal write failed:", e);
    return null;
  }
}

async function finishLog(id: string | null, status: number, answer: string, note: Note, ms: number) {
  if (!id) return;
  try {
    const first = answer.split("\n")[0]?.trim() ?? "";
    await prisma.exchangeLog.update({
      where: { id },
      data: {
        status,
        ok: status < 400 && first !== "failure",
        answer: answer.slice(0, 500),
        detail: note.detail ?? null,
        ms,
      },
    });
    // Keep the journal small: prune now and then.
    if (Date.now() - lastPrune > 10 * 60_000) {
      lastPrune = Date.now();
      const cutoff = await prisma.exchangeLog.findMany({ orderBy: { at: "desc" }, skip: 3000, take: 1, select: { at: true } });
      if (cutoff[0]) await prisma.exchangeLog.deleteMany({ where: { at: { lte: cutoff[0].at } } });
    }
  } catch (e) {
    console.error("[1c-exchange] journal write failed:", e);
  }
}

export async function GET(req: Request) {
  return run(req);
}

// Some 1C/BAS client configurations issue query/success as POST — accept
// both so the exchange isn't sensitive to that detail.
export async function POST(req: Request) {
  return run(req);
}
