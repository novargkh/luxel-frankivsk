"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowLeft, CheckCircle, FileXls, MagnifyingGlass, Warning, X } from "@phosphor-icons/react";
import { parseBafSheet, type BafRow } from "@/lib/bafMatch";
import { money } from "@/lib/adminOrders";

type Result = {
  row: BafRow;
  status: "exact" | "review" | "none";
  productId: string | null;
  how: string;
  candidates: { id: string; name: string; score: number }[];
  product: { id: string; name: string; article: string | null; price: number } | null;
};
type Preview = {
  results: Result[];
  siteOnly: { id: string; name: string; article: string | null; isActive: boolean }[];
  products: { id: string; name: string }[];
};
// Per BAF row: a product id, "" = not on the site, "create" = add it.
type Decision = string;

type Tab = "review" | "exact" | "site";

// BAF nomenclature import: links every BAF item to a site product so orders
// go to BAF with BAF's article and name, and takes the base prices from BAF.
// Photos and descriptions stay as they came from luxel.ua.
export default function BafNomenclaturePage() {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [tab, setTab] = useState<Tab>("review");
  const [updatePrices, setUpdatePrices] = useState(true);
  const [done, setDone] = useState<{ linked: number; pricesChanged: number; created: number } | null>(null);

  async function onFile(file: File) {
    setError("");
    setDone(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
      const rows = parseBafSheet(sheet);
      if (rows.length === 0) throw new Error("У файлі не знайдено товарів. Потрібна вивантажена з BAF таблиця з колонками «Артикул» і «Найменування».");
      const res = await fetch("/api/admin/baf/nomenclature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не вдалося зіставити");
      const p = data as Preview;
      setPreview(p);
      // Sure matches are linked; for "review" rows a code-based guess is
      // pre-selected, a guess by similar names is not.
      setDecisions(p.results.map((r) => (r.status === "exact" ? r.productId ?? "" : r.productId && r.how !== "схожі назви" ? r.productId : "")));
      setTab(p.results.some((r) => r.status !== "exact") ? "review" : "exact");
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const r = preview?.results ?? [];
    return {
      exact: r.filter((x) => x.status === "exact").length,
      review: r.filter((x) => x.status !== "exact").length,
      site: preview?.siteOnly.length ?? 0,
      linked: decisions.filter((d) => d && d !== "create").length,
      create: decisions.filter((d) => d === "create").length,
    };
  }, [preview, decisions]);

  // A product picked for two BAF rows.
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of decisions) if (d && d !== "create") seen.set(d, (seen.get(d) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  }, [decisions]);

  const nameById = useMemo(() => new Map((preview?.products ?? []).map((p) => [p.id, p.name])), [preview]);

  async function apply() {
    if (!preview) return;
    if (dupes.size) {
      setError("Один і той самий товар сайту вибрано для кількох рядків BAF. Виправте рядки, позначені червоним.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const links = preview.results
        .map((r, i) => ({ r, d: decisions[i] }))
        .filter(({ d }) => d && d !== "create")
        .map(({ r, d }) => ({ productId: d, article: r.row.article, name: r.row.name, unit: r.row.unit, price: r.row.price }));
      const create = preview.results
        .filter((_, i) => decisions[i] === "create")
        .map((r) => ({ article: r.row.article, name: r.row.name, unit: r.row.unit, price: r.row.price, group: r.row.group }));
      const res = await fetch("/api/admin/baf/nomenclature/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links, create, updatePrices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не вдалося зберегти");
      setDone(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setDecision = (i: number, d: Decision) => setDecisions((ds) => ds.map((x, j) => (j === i ? d : x)));

  const rowsFor = (t: Tab) =>
    (preview?.results ?? []).map((r, i) => ({ r, i })).filter(({ r }) => (t === "exact" ? r.status === "exact" : r.status !== "exact"));

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 pb-28">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-3">
        <ArrowLeft size={14} /> Товари
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Номенклатура BAF</h1>
      <p className="text-sm text-slate-500 max-w-3xl">
        Завантажте прайс-лист, вивантажений з BAF (Артикул, Найменування, ціна). Сайт зіставить кожну позицію BAF зі своїм
        товаром. Після збереження замовлення йдуть у BAF з артикулом і назвою з BAF, ціни беруться з файлу. Фото й описи
        лишаються з сайту.
      </p>

      <label className="mt-4 inline-flex items-center gap-2 h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white cursor-pointer hover:bg-slate-800">
        <FileXls size={18} />
        {busy && !preview ? "Зіставляю…" : preview ? "Завантажити інший файл" : "Вибрати файл з BAF"}
        <input
          type="file"
          accept=".xls,.xlsx"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
      </label>
      {fileName && <span className="ml-3 text-sm text-slate-500">{fileName}</span>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {done && (
        <div className="mt-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 p-4 text-sm text-emerald-900 flex items-start gap-2">
          <CheckCircle size={18} weight="fill" className="text-emerald-600 mt-0.5" />
          <div>
            Збережено: зіставлено {done.linked} товарів, змінено цін: {done.pricesChanged}
            {done.created ? `, додано нових товарів: ${done.created}` : ""}. Нові замовлення підуть у BAF з артикулами BAF.
          </div>
        </div>
      )}

      {preview && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: "exact" as Tab, label: "Збіглися автоматично", n: counts.exact, tone: "text-emerald-700" },
              { k: "review" as Tab, label: "Перевірити вручну", n: counts.review, tone: counts.review ? "text-amber-700" : "" },
              { k: "site" as Tab, label: "Є тільки на сайті", n: counts.site, tone: "" },
            ].map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setTab(c.k)}
                className={`text-left rounded-xl bg-white p-4 ring-1 ${tab === c.k ? "ring-2 ring-slate-900" : "ring-slate-200 hover:ring-slate-400"}`}
              >
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className={`text-2xl font-semibold tabular ${c.tone}`}>{c.n}</p>
              </button>
            ))}
            <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">Буде збережено</p>
              <p className="text-2xl font-semibold tabular">{counts.linked}</p>
              {counts.create > 0 && <p className="text-xs text-blue-700">+ нових: {counts.create}</p>}
            </div>
          </div>

          <section className="mt-4 rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
            {tab === "site" ? (
              <>
                <p className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100">
                  Цих товарів сайту немає у файлі BAF. Вони лишаються на сайті як є; замовлення з ними підуть у BAF зі старим
                  артикулом. Якщо товар знято з продажу, вимкніть його на сторінці «Товари».
                </p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {preview.siteOnly.map((p) => (
                    <li key={p.id} className="px-4 py-2 flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate">{p.name}</span>
                      {!p.isActive && <span className="text-xs text-slate-400">вимкнений</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rowsFor(tab).map(({ r, i }) => (
                  <Row
                    key={i}
                    r={r}
                    decision={decisions[i] ?? ""}
                    dupe={!!decisions[i] && dupes.has(decisions[i])}
                    nameOf={(id) => nameById.get(id) ?? ""}
                    products={preview.products}
                    onChange={(d) => setDecision(i, d)}
                  />
                ))}
                {rowsFor(tab).length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Тут порожньо.</li>}
              </ul>
            )}
          </section>

          <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 border-t border-slate-200 bg-white/95 backdrop-blur px-4 sm:px-6 py-3">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={updatePrices} onChange={(e) => setUpdatePrices(e.target.checked)} />
                Оновити базові ціни з файлу
              </label>
              {dupes.size > 0 && (
                <span className="inline-flex items-center gap-1 text-sm text-red-600">
                  <Warning size={16} /> Повтори: {dupes.size}
                </span>
              )}
              <button
                type="button"
                onClick={apply}
                disabled={busy || counts.linked + counts.create === 0}
                className="ml-auto h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Зберігаю…" : `Зберегти зіставлення (${counts.linked}${counts.create ? ` + ${counts.create} нових` : ""})`}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Row({
  r,
  decision,
  dupe,
  nameOf,
  products,
  onChange,
}: {
  r: Result;
  decision: Decision;
  dupe: boolean;
  nameOf: (id: string) => string;
  products: { id: string; name: string }[];
  onChange: (d: Decision) => void;
}) {
  const [search, setSearch] = useState<string | null>(null);
  const found = useMemo(() => {
    const q = (search ?? "").trim().toLowerCase();
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return products.filter((p) => words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 6);
  }, [search, products]);

  const options = r.candidates.some((c) => c.id === decision) || !decision || decision === "create"
    ? r.candidates
    : [{ id: decision, name: nameOf(decision), score: 0 }, ...r.candidates];

  return (
    <li className={`px-4 py-3 ${dupe ? "bg-red-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">{r.row.article}</span>
        <span className="flex-1 min-w-[12rem] text-sm font-medium truncate" title={r.row.name}>
          {r.row.name}
        </span>
        {r.row.price !== null && <span className="text-sm tabular text-slate-700">{money(r.row.price)}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-400">→</span>
        {r.status === "exact" && decision === r.productId ? (
          <>
            <span className="flex-1 min-w-0 truncate text-slate-700" title={r.product?.name}>
              {r.product?.name}
            </span>
            <span className="text-xs text-slate-400">{r.how}</span>
            {r.product && r.row.price !== null && Math.abs(r.product.price - r.row.price) >= 0.01 && (
              <span className="text-xs tabular text-amber-700">
                ціна {money(r.product.price)} → {money(r.row.price)}
              </span>
            )}
            <button type="button" onClick={() => onChange("")} aria-label="Розірвати зв'язок" className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <select
              value={decision}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`Товар сайту для ${r.row.article}`}
              className={`h-8 max-w-full sm:max-w-[30rem] rounded-md border px-2 text-sm ${dupe ? "border-red-400" : "border-slate-300"}`}
            >
              <option value="">— немає на сайті, пропустити —</option>
              <option value="create">+ Додати на сайт як новий товар (без фото)</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.score ? ` (${c.score}%)` : ""}
                </option>
              ))}
            </select>
            {search === null ? (
              <button type="button" onClick={() => setSearch("")} className="h-8 inline-flex items-center gap-1 rounded-md px-2 text-slate-600 hover:bg-slate-100">
                <MagnifyingGlass size={14} /> Знайти інший
              </button>
            ) : (
              <div className="relative">
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Назва або артикул на сайті"
                  className="h-8 w-64 rounded-md border border-slate-300 px-2 text-sm"
                />
                {found.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-[28rem] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(p.id);
                            setSearch(null);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 truncate"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {r.how && r.how !== "схожі назви" && <span className="text-xs text-slate-400">{r.how}</span>}
          </>
        )}
      </div>
    </li>
  );
}
