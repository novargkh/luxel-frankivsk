import crypto from "crypto";

// Reversible encryption for client passwords the admin must be able to see
// (AES-256-GCM). The key comes from PASSWORD_VIEW_SECRET or, if not set,
// NEXTAUTH_SECRET; without either nothing is stored in readable form.

function key(): Buffer | null {
  const secret = process.env.PASSWORD_VIEW_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  return secret ? crypto.createHash("sha256").update(`luxel-password-view:${secret}`).digest() : null;
}

export function sealSecret(plain: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const k = key();
  if (!k) return null;
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
