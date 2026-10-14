// Brute-force protection for the sign-in form: failed attempts are counted
// per login and per IP; past the limit the login is refused for a while even
// with the right password. Optional Cloudflare Turnstile captcha on top
// (TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY).

import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/clientAccount";

const WINDOW_MS = 15 * 60_000;
export const MAX_PER_LOGIN = 5;
const MAX_PER_IP = 30;

function loginKey(login: string) {
  const v = login.trim().toLowerCase();
  return `u:${v.includes("@") ? v : (phoneKey(v) ?? v)}`;
}

export function clientIp(req: Request | undefined) {
  return req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function isBlocked(login: string, ip: string | null) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byLogin, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { key: loginKey(login), at: { gte: since } } }),
    ip ? prisma.loginAttempt.count({ where: { key: `ip:${ip}`, at: { gte: since } } }) : 0,
  ]);
  return byLogin >= MAX_PER_LOGIN || byIp >= MAX_PER_IP;
}

export async function recordFailure(login: string, ip: string | null) {
  await prisma.loginAttempt.createMany({
    data: [{ key: loginKey(login) }, ...(ip ? [{ key: `ip:${ip}` }] : [])],
  });
  // Old rows are of no use.
  await prisma.loginAttempt.deleteMany({ where: { at: { lt: new Date(Date.now() - 24 * 3600_000) } } });
}

export async function clearFailures(login: string) {
  await prisma.loginAttempt.deleteMany({ where: { key: loginKey(login) } });
}

export function captchaEnabled() {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function captchaOk(token: string | undefined, ip: string | null) {
  if (!captchaEnabled()) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch (e) {
    console.error("[login] captcha check failed:", e);
    return false;
  }
}
