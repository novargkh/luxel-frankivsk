import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // The BAS (1C) CommerceML exchange endpoint has its own HTTP Basic Auth
  // (see src/lib/onecExchange.ts) — it's a machine-to-machine integration
  // that can't do the NextAuth login redirect, so it's excluded from the
  // session check entirely. /1c_exchange.php is the public-facing URL
  // (rewritten to /api/1c-exchange in next.config.ts); both are listed
  // since rewrites happen after middleware runs.
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname === "/1c_exchange.php" ||
    pathname.startsWith("/api/1c-exchange");

  if (isPublic) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only areas
  const role = (req.auth.user as { role?: string } | undefined)?.role;
  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/|brand/|catalog/).*)",
  ],
};
