"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import Navbar from "@/components/Navbar";
import { parseCsv } from "@/lib/csv";

// Clients are taken from BAS: the admin exports the list of contractors
// (контрагенти) from BAS to Excel and imports it here. Re-importing the
// file updates existing clients by their BAS code. Passwords are issued
// per client on the client's card (/profile?client=<id>), and clients send
// change requests for their data, listed at the top of this page.

type Client = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  basId: string | null;
  taxCode: string | null;
  isActive: boolean;
  discountPercent: number;
  hasPassword: boolean;
  createdAt: string;
  shops: { id: string; name: string; address: string }[];
  _count: { orders: number };
  openRequests: number;
};

type ChangeRequest = {
  id: string;
  message: string;
  status: "NEW" | "DONE" | "REJECTED";
  adminComment: string | null;
  createdAt: string;
  user: { id: string; name: string; company: string | null; phone: string | null };
};

type ImportResult = { total: number; created: number; updated: number; skipped: string[]; notes: string[] };

const emptyForm = { company: "", name: "", phone: "", email: "", basId: "", taxCode: "" };

// Finds the header row of a BAS export (it often starts with a title line)
// and maps its columns to client fields by their names.
function mapBasSheet(table: string[][]) {
  const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
  const isName = (h: string) => /найменуван|наименован|назва|контрагент/.test(h);
  // The header row: several filled cells, one of them a name column (a
  // title line like "Контрагенти" above the table has just one cell).
  const headerIdx = table
    .slice(0, 15)
    .findIndex((r) => r.filter((c) => norm(c ?? "")).length >= 2 && r.some((c) => isName(norm(c ?? ""))));
  if (headerIdx === -1) return null;
  const headers = table[headerIdx].map((h) => norm(h ?? ""));
  const find = (test: (h: string) => boolean) => headers.findIndex(test);

  const taxCol = find((h) => /єдрпоу|едрпоу|іпн|инн|податков/.test(h));
  const codeCol = find(
    (h) => (h === "код" || /^код (bas|1с|1c|контрагента)|^ид$|guid|ідентифікатор/.test(h)) && !/єдрпоу|едрпоу|іпн|инн/.test(h)
  );
  const nameCols = headers.map((h, i) => (isName(h) ? i : -1)).filter((i) => i !== -1);
  const companyCol = nameCols.find((i) => !/повн/.test(headers[i])) ?? nameCols[0];
  const cols = {
    code: codeCol,
    company: companyCol,
    taxCode: taxCol,
    phone: find((h) => h.includes("телефон")),
    email: find((h) => /e-?mail|пошт|почт/.test(h)),
    address: (() => {
      const preferred = find((h) => h.includes("адрес") && /доставк|фактич/.test(h));
      return preferred !== -1 ? preferred : find((h) => h.includes("адрес"));
    })(),
    contactPerson: find((h) => h.includes("контактн")),
    discount: find((h) => /знижк|скидк/.test(h)),
  };
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").toString().trim() : "");
  const rows = table
    .slice(headerIdx + 1)
    .filter((r) => cell(r, cols.company))
    .map((r) => ({
      code: cell(r, cols.code),
      company: cell(r, cols.company),
      taxCode: cell(r, cols.taxCode),
      phone: cell(r, cols.phone),
      email: cell(r, cols.email),
      address: cell(r, cols.address),
      contactPerson: cell(r, cols.contactPerson),
      discount: cell(r, cols.discount),
    }));
  const found = Object.entries(cols)
    .filter(([, i]) => i !== -1)
    .map(([k]) => k);
  return { rows, found };
}

const FIELD_LABEL: Record<string, string> = {
  code: "код BAS",
  company: "назва",
  taxCode: "ЄДРПОУ",
  phone: "телефон",
  email: "email",
  address: "адреса",
  contactPerson: "контактна особа",
  discount: "знижка",
};

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [cRes, rRes] = await Promise.all([fetch("/api/admin/clients"), fetch("/api/profile/requests")]);
    setClients(cRes.ok ? await cRes.json() : []);
    setRequests(rRes.ok ? await rRes.json() : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    const digits = q.replace(/\D/g, "");
    return clients.filter((c) => {
      const hay = `${c.company ?? ""} ${c.name} ${c.email ?? ""} ${c.basId ?? ""} ${c.taxCode ?? ""}`.toLowerCase();
      return hay.includes(q) || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits));
    });
  }, [clients, query]);

  const openRequests = requests.filter((r) => r.status === "NEW");
  const noPassword = clients.filter((c) => !c.hasPassword).length;

  async function importFile(file: File) {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      let table: string[][];
      if (/\.xlsx?$/i.test(file.name)) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
        table = raw.map((r) => r.map((c) => (c == null ? "" : String(c))));
      } else {
        table = parseCsv(await file.text());
      }
      const mapped = mapBasSheet(table);
      if (!mapped || mapped.rows.length === 0) {
        setImportError("Не знайдено колонку з назвою контрагента (Найменування). Перевірте файл.");
        return;
      }
      if (!mapped.found.includes("code") && !mapped.found.includes("taxCode")) {
        setImportError("У файлі немає колонки «Код» або «ЄДРПОУ»: за ними клієнти зіставляються з BAS.");
        return;
      }
      const res = await fetch("/api/admin/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped.rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Не вдалося імпортувати");
        return;
      }
      setImportResult(data);
      load();
    } catch {
      setImportError("Не вдалося прочитати файл");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createClient() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Не вдалося створити клієнта");
      return;
    }
    router.push(`/profile?client=${data.id}`);
  }

  async function closeRequest(id: string, status: "DONE" | "REJECTED") {
    await fetch(`/api/profile/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminComment: replyDraft[id] ?? "" }),
    });
    load();
  }

  const input = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h1 className="text-lg font-semibold text-slate-900">Клієнти</h1>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
            >
              {importing ? "Імпорт..." : "Імпорт з BAS (Excel)"}
            </button>
            <button
              onClick={() => setCreating((v) => !v)}
              className="text-sm text-brand border border-brand rounded-lg px-4 py-2 hover:bg-red-50"
            >
              + Додати вручну
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Клієнти беруться з BAS: вивантажте список контрагентів у Excel і завантажте сюди. Повторний імпорт
          оновлює контакти за кодом BAS. Пароль кожному видається в картці клієнта.
        </p>

        {importError && (
          <p className="mb-4 text-sm rounded-lg px-3 py-2 bg-red-50 text-red-600">{importError}</p>
        )}
        {importResult && (
          <div className="mb-4 text-sm rounded-lg px-3 py-2 bg-emerald-50 text-emerald-800">
            <p>
              Рядків у файлі: {importResult.total}. Нових клієнтів: {importResult.created}, оновлено:{" "}
              {importResult.updated}
              {importResult.skipped.length > 0 && `, пропущено: ${importResult.skipped.length}`}.
            </p>
            {[...importResult.skipped, ...importResult.notes].length > 0 && (
              <ul className="mt-1 text-xs text-emerald-900/80 list-disc pl-4 max-h-40 overflow-y-auto">
                {[...importResult.skipped, ...importResult.notes].slice(0, 60).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {creating && (
          <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Новий клієнт</h2>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <input placeholder="Компанія" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={input} />
              <input placeholder="Контактна особа" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
              <input placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
              <input placeholder="Код у BAS" value={form.basId} onChange={(e) => setForm({ ...form, basId: e.target.value })} className={`${input} font-mono`} />
              <input placeholder="ЄДРПОУ / ІПН" value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} className={input} />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={createClient}
                disabled={saving || (!form.company && !form.name)}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {saving ? "Створення..." : "Створити і відкрити картку"}
              </button>
              <button onClick={() => setCreating(false)} className="text-sm text-slate-500 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50">
                Скасувати
              </button>
            </div>
          </div>
        )}

        {openRequests.length > 0 && (
          <section className="mb-6 border border-amber-200 bg-amber-50 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-amber-900 mb-3">
              Запити на зміну даних: {openRequests.length}
            </h2>
            <ul className="space-y-3">
              {openRequests.map((r) => (
                <li key={r.id} className="bg-white rounded-lg border border-amber-100 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <Link href={`/profile?client=${r.user.id}`} className="font-medium text-slate-900 hover:text-brand">
                      {r.user.company || r.user.name}
                    </Link>
                    <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString("uk-UA")}</span>
                  </div>
                  <p className="text-slate-800 whitespace-pre-line">{r.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={replyDraft[r.id] ?? ""}
                      onChange={(e) => setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                      placeholder="Відповідь клієнту (необов'язково)"
                      className="flex-1 min-w-[12rem] border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <Link href={`/profile?client=${r.user.id}`} className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                      Змінити дані
                    </Link>
                    <button onClick={() => closeRequest(r.id, "DONE")} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700">
                      Виконано
                    </button>
                    <button onClick={() => closeRequest(r.id, "REJECTED")} className="text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50">
                      Відхилити
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук: назва, телефон, email, код BAS, ЄДРПОУ"
            className="flex-1 min-w-[14rem] border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">
            Усього: {clients.length}
            {noPassword > 0 && `, без пароля: ${noPassword}`}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">{clients.length ? "Нічого не знайдено." : "Клієнтів ще немає. Імпортуйте їх з BAS."}</p>
        ) : (
          <div className="border border-slate-200 bg-white rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Клієнт</th>
                  <th className="text-left px-3 py-2 font-medium">Контакти</th>
                  <th className="text-left px-3 py-2 font-medium">Код BAS</th>
                  <th className="text-left px-3 py-2 font-medium">Знижка</th>
                  <th className="text-left px-3 py-2 font-medium">Адрес</th>
                  <th className="text-left px-3 py-2 font-medium">Замовлень</th>
                  <th className="text-left px-3 py-2 font-medium">Доступ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className={`border-t border-slate-100 ${c.isActive ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2">
                      <Link href={`/profile?client=${c.id}`} className="font-medium text-slate-900 hover:text-brand">
                        {c.company || c.name}
                      </Link>
                      {c.company && c.name !== c.company && <div className="text-xs text-slate-500">{c.name}</div>}
                      {c.openRequests > 0 && (
                        <span className="ml-1 text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                          запит
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      <div>{c.phone ?? "—"}</div>
                      <div>{c.email ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-slate-600">{c.basId ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.discountPercent ? `${c.discountPercent}%` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.shops.length || <span className="text-amber-600">0</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c._count.orders}</td>
                    <td className="px-3 py-2 text-xs">
                      {!c.isActive ? (
                        <span className="text-slate-500">заблоковано</span>
                      ) : c.hasPassword ? (
                        <span className="text-emerald-600">пароль видано</span>
                      ) : (
                        <Link href={`/profile?client=${c.id}`} className="text-brand underline underline-offset-2">
                          видати пароль
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {requests.some((r) => r.status !== "NEW") && (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-slate-500">Закриті запити</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {requests
                .filter((r) => r.status !== "NEW")
                .map((r) => (
                  <li key={r.id}>
                    {new Date(r.createdAt).toLocaleDateString("uk-UA")} · {r.user.company || r.user.name}:{" "}
                    {r.message.slice(0, 120)} · {r.status === "DONE" ? "виконано" : "відхилено"}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}
