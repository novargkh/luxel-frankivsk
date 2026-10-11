import { auth } from "@/lib/auth";

export async function sessionUser() {
  const session = await auth();
  const u = session?.user as { id?: string; role?: string } | undefined;
  return u?.id ? { id: u.id, isAdmin: u.role === "ADMIN" } : null;
}
