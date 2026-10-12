import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "LUXEL | Адмін-панель",
};

// Everything under /admin shares the admin shell: its own navigation and
// look, separate from the client cabinet.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
