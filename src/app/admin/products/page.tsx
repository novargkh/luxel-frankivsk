"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import { parseCsv } from "@/lib/csv";
import * as XLSX from "xlsx";
import { AVAILABILITY_LABEL, type Availability } from "@/lib/availability";

type ProductImage = { id: string; url: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  videoUrl: string | null;
  isPromo: boolean;
  promoText: string | null;
  isActive: boolean;
  images: ProductImage[];
  article: string | null;
  basId: string | null;
  boxQty?: number | null;
  sourceStatus?: string | null;
  stockOverride?: Availability | null;
  stockOverrideAt?: string | null;
  availability?: Availability;
  availabilityAuto?: Availability;
};

const emptyForm = {
  id: "",
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  isPromo: false,
  promoText: "",
  isActive: true,
  images: [] as string[],
  videoUrl: "",
  article: "",
  basId: "",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [recategorizing, setRecategorizing] = useState(false);
  const [recategorizeMsg, setRecategorizeMsg] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [importingPackaging, setImportingPackaging] = useState(false);
  const [importPackagingMsg, setImportPackagingMsg] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);
  const [syncingSpecs, setSyncingSpecs] = useState(false);
  const [syncSpecsMsg, setSyncSpecsMsg] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const packagingInputRef = useRef<HTMLInputElement>(null);
  const pricesInputRef = useRef<HTMLInputElement>(null);
  const [importingPrices, setImportingPrices] = useState(false);
  const [pricesMsg, setPricesMsg] = useState<{ type: "ok" | "error"; text: string; details?: string[] } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/products");
    setProducts(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditing(true);
  }

  function startEdit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      stock: String(p.stock),
      category: p.category ?? "",
      isPromo: p.isPromo,
      promoText: p.promoText ?? "",
      isActive: p.isActive,
      images: p.images.map((i) => i.url),
      videoUrl: p.videoUrl ?? "",
      article: p.article ?? "",
      basId: p.basId ?? "",
    });
    setEditing(true);
  }

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error("upload failed");
    const data = await res.json();
    return data.url as string;
  }

  async function handleImagesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadFile));
      setForm((f) => ({ ...f, images: [...f.images, ...urls] }));
    } catch {
      alert("Не вдалося завантажити зображення");
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function handleVideoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((f) => ({ ...f, videoUrl: url }));
    } catch {
      alert("Не вдалося завантажити відео");
    } finally {
      setUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  function removeImage(url: string) {
    setForm((f) => ({ ...f, images: f.images.filter((i) => i !== url) }));
  }

  async function saveProduct() {
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: Number(form.price || 0),
      stock: Number(form.stock || 0),
      category: form.category || undefined,
      isPromo: form.isPromo,
      promoText: form.promoText || undefined,
      isActive: form.isActive,
      images: form.images,
      videoUrl: form.videoUrl || undefined,
      article: form.article || undefined,
      basId: form.basId || undefined,
    };

    const res = form.id
      ? await fetch(`/api/products/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSaving(false);

    if (!res.ok) {
      alert("Не вдалося зберегти товар");
      return;
    }

    setEditing(false);
    setForm(emptyForm);
    load();
  }

  async function deleteProduct(id: string) {
    if (!confirm("Видалити товар?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    load();
  }

  async function syncLuxel() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/sync-luxel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg({
          type: "error",
          text: data.error ?? "Не вдалося оновити каталог з luxel.ua",
        });
        return;
      }
      const parts = [`Знайдено нових: ${data.newFound}`, `додано: ${data.added}`];
      if (data.remaining > 0) {
        parts.push(`залишилось: ${data.remaining} — натисніть ще раз`);
      }
      if (data.failed?.length) {
        parts.push(`не вдалося обробити: ${data.failed.length}`);
      }
      setSyncMsg({ type: "ok", text: parts.join(", ") });
      load();
    } catch {
      setSyncMsg({ type: "error", text: "Не вдалося з'єднатися з сервером" });
    } finally {
      setSyncing(false);
    }
  }

  async function recategorize() {
    setRecategorizing(true);
    setRecategorizeMsg(null);
    try {
      const res = await fetch("/api/admin/recategorize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRecategorizeMsg({ type: "error", text: data.error ?? "Не вдалося оновити категорії" });
        return;
      }
      const parts = [`Оновлено товарів: ${data.updated}`];
      const byCat = data.byCategory as Record<string, number>;
      if (byCat && Object.keys(byCat).length > 0) {
        parts.push(
          Object.entries(byCat)
            .map(([cat, n]) => `${cat}: ${n}`)
            .join(", ")
        );
      }
      setRecategorizeMsg({ type: "ok", text: parts.join(" — ") });
      load();
    } catch {
      setRecategorizeMsg({ type: "error", text: "Не вдалося з'єднатися з сервером" });
    } finally {
      setRecategorizing(false);
    }
  }

  // Parses the uploaded packaging/price file in the browser (so we never
  // have to trust a raw file upload server-side) and POSTs just the rows
  // as structured data — matching to products happens server-side by
  // article code. Accepts both CSV and Excel (.xlsx/.xls) — the client's
  // price list comes as either depending on how it was exported, and both
  // just need to resolve to the same "Артикул / упаковка / ящик" columns.
  // Base prices from a BAS price list (Excel/CSV). The header row is found
  // automatically (BAS exports start with a title); "Артикул" (or "Код")
  // and the first "Ціна" column are used. Clients then see this price minus
  // their personal discount.
  async function importPrices(file: File) {
    setImportingPrices(true);
    setPricesMsg(null);
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
      const norm = (h: string) => (h ?? "").trim().toLowerCase();
      const isPrice = (h: string) => /ціна|цена|price/.test(h);
      const headerIdx = table.slice(0, 20).findIndex((r) => r.some((c) => isPrice(norm(c))) && r.some((c) => /артикул|код/.test(norm(c))));
      if (headerIdx === -1) {
        setPricesMsg({ type: "error", text: "Не знайдено рядок заголовків з колонками «Артикул» і «Ціна»" });
        return;
      }
      const headers = table[headerIdx].map(norm);
      let artCol = headers.findIndex((h) => h.includes("артикул"));
      if (artCol === -1) artCol = headers.findIndex((h) => /^код/.test(h));
      const baseCol = headers.findIndex((h) => isPrice(h) && /базов/.test(h));
      const priceCol = baseCol !== -1 ? baseCol : headers.findIndex(isPrice);
      const rows = table.slice(headerIdx + 1).map((r) => ({ article: r[artCol] ?? "", price: r[priceCol] ?? "" }));
      const res = await fetch("/api/admin/import-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPricesMsg({ type: "error", text: data.error ?? "Не вдалося імпортувати ціни" });
        return;
      }
      setPricesMsg({
        type: "ok",
        text: `Колонка цін: «${table[headerIdx][priceCol]}». Рядків з цінами: ${data.rows}, зіставлено товарів: ${data.matched}, змінено цін: ${data.changed}. Товарів сайту без ціни у файлі: ${data.notInFile}. Артикулів з файлу, яких немає на сайті: ${data.unknownArticles}.`,
        details: [
          ...data.changes.map((c: { name: string; from: number; to: number }) => `${c.name}: ${c.from} → ${c.to}`),
          ...(data.notInFileSample.length ? ["— Немає у файлі: " + data.notInFileSample.join("; ")] : []),
        ],
      });
      load();
    } catch {
      setPricesMsg({ type: "error", text: "Не вдалося прочитати файл" });
    } finally {
      setImportingPrices(false);
      if (pricesInputRef.current) pricesInputRef.current.value = "";
    }
  }

  async function importPackagingCsv(file: File) {
    setImportingPackaging(true);
    setImportPackagingMsg(null);
    try {
      const isExcel = /\.xlsx?$/i.test(file.name);
      let table: string[][];
      if (isExcel) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
        table = rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
      } else {
        const text = await file.text();
        table = parseCsv(text);
      }
      if (table.length < 2) {
        setImportPackagingMsg({ type: "error", text: "Файл порожній або має невірний формат" });
        return;
      }
      const headers = table[0].map((h) => h.trim().toLowerCase());
      const findCol = (needle: string) => headers.findIndex((h) => h.includes(needle));
      const articleCol = findCol("артикул");
      const packCol = headers.findIndex((h) => h.includes("упаков"));
      const boxCol = headers.findIndex((h) => h.includes("ящик"));
      if (articleCol === -1) {
        setImportPackagingMsg({
          type: "error",
          text: "Не знайдено колонку \"Артикул\" у файлі",
        });
        return;
      }

      const rows = table.slice(1).map((r) => ({
        article: r[articleCol] ?? "",
        packQty: packCol !== -1 && r[packCol]?.trim() ? Number(r[packCol]) || null : null,
        boxQty: boxCol !== -1 && r[boxCol]?.trim() ? Number(r[boxCol]) || null : null,
      }));

      const res = await fetch("/api/admin/import-packaging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportPackagingMsg({ type: "error", text: data.error ?? "Не вдалося імпортувати файл" });
        return;
      }
      setImportPackagingMsg({
        type: "ok",
        text: `Рядків у файлі: ${data.csvRows}, зіставлено товарів: ${data.matched} (точно: ${data.directMatched}, за кодом у назві: ${data.fallbackMatched}), оновлено: ${data.updated}, без збігу: ${data.unmatchedProducts}`,
      });
      load();
    } catch {
      setImportPackagingMsg({ type: "error", text: "Не вдалося прочитати або надіслати файл" });
    } finally {
      setImportingPackaging(false);
      if (packagingInputRef.current) packagingInputRef.current.value = "";
    }
  }

  async function syncSpecs() {
    setSyncingSpecs(true);
    setSyncSpecsMsg(null);
    try {
      const res = await fetch("/api/admin/sync-specs", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncSpecsMsg({ type: "error", text: data.error ?? "Не вдалося оновити характеристики" });
        return;
      }
      const parts = [`Оброблено: ${data.processedThisRun}`, `оновлено: ${data.updated}`];
      if (data.remaining > 0) {
        parts.push(`залишилось: ${data.remaining} — натисніть ще раз`);
      }
      if (data.failed > 0) {
        parts.push(`не вдалося: ${data.failed}`);
      }
      setSyncSpecsMsg({ type: "ok", text: parts.join(", ") });
      load();
    } catch {
      setSyncSpecsMsg({ type: "error", text: "Не вдалося з'єднатися з сервером" });
    } finally {
      setSyncingSpecs(false);
    }
  }

  type StockRun = {
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    checked: number;
    changed: number;
    inStock: number;
    outOfStock: number;
    notFound: number;
    failed: number;
    remaining: number;
    priceDiffs: number;
    details: {
      changes?: { name: string; from: number; to: number; status: string }[];
      prices?: { name: string; ours: number; site: number }[];
    } | null;
  };
  const [stockRun, setStockRun] = useState<StockRun | null>(null);
  const [syncingStock, setSyncingStock] = useState(false);
  const [stockErr, setStockErr] = useState("");
  const [showStockDetails, setShowStockDetails] = useState(false);

  useEffect(() => {
    fetch("/api/admin/sync-stock")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStockRun(d))
      .catch(() => {});
  }, []);

  async function syncStock() {
    setSyncingStock(true);
    setStockErr("");
    try {
      const res = await fetch("/api/admin/sync-stock", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setStockErr(data?.error ?? "Не вдалося оновити залишки");
        return;
      }
      setStockRun(data);
      setShowStockDetails(true);
      load();
    } catch {
      setStockErr("Не вдалося з'єднатися з сервером");
    } finally {
      setSyncingStock(false);
    }
  }

  const [onlyManual, setOnlyManual] = useState(false);

  // Manual availability for today; "" goes back to the system status.
  // The next daily stock check (~08:00) clears it anyway.
  async function setAvailability(id: string, value: Availability | "") {
    setProducts((list) =>
      list.map((p) =>
        p.id === id
          ? {
              ...p,
              stockOverride: value || null,
              stockOverrideAt: value ? new Date().toISOString() : null,
              availability: value || p.availabilityAuto,
            }
          : p
      )
    );
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stockOverride: value || null }),
    });
    load();
  }

  async function saveStock(id: string) {
    const value = stockDrafts[id];
    if (value === undefined) return;
    await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: Number(value) }),
    });
    setStockDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-slate-900">Товари</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={syncLuxel}
              disabled={syncing}
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {syncing ? "Оновлення..." : "Оновити з luxel.ua"}
            </button>
            <button
              onClick={recategorize}
              disabled={recategorizing}
              title="Перевизначає категорію кожного товару за структурою меню luxel.ua (за посиланням на сторінку товару), з уточненням за ключовими словами в назві"
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {recategorizing ? "Оновлення..." : "Оновити категорії"}
            </button>
            <button
              onClick={syncStock}
              disabled={syncingStock}
              title="Перевіряє наявність і кількість кожного товару на luxel.ua. Автоматично щодня близько 08:00"
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {syncingStock ? "Перевіряю (1–3 хв)..." : "Оновити залишки"}
            </button>
            <button
              onClick={syncSpecs}
              disabled={syncingSpecs}
              title="Завантажує повну таблицю характеристик з картки товару на luxel.ua для кожного товару"
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {syncingSpecs ? "Оновлення..." : "Оновити характеристики"}
            </button>
            <input
              ref={pricesInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importPrices(file);
              }}
            />
            <button
              onClick={() => pricesInputRef.current?.click()}
              disabled={importingPrices}
              title="Базові ціни з прайсу BAS (Excel). Кожен клієнт бачить цю ціну мінус свою знижку"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
            >
              {importingPrices ? "Імпорт цін..." : "Імпорт цін з BAS"}
            </button>
            <input
              ref={packagingInputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importPackagingCsv(file);
              }}
            />
            <button
              onClick={() => packagingInputRef.current?.click()}
              disabled={importingPackaging}
              title="Імпортує кількість одиниць в упаковці та в ящику з CSV або Excel-файлу, зіставляючи товари за артикулом"
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {importingPackaging ? "Імпорт..." : "Імпортувати упаковку (CSV/Excel)"}
            </button>
            <button
              onClick={startCreate}
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
            >
              + Додати товар
            </button>
          </div>
        </div>

        <div className="mb-4 text-sm rounded-lg px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">Залишки з luxel.ua</span>
            {stockRun ? (
              <>
                <span>
                  Останнє оновлення:{" "}
                  {new Date(stockRun.finishedAt ?? stockRun.startedAt).toLocaleString("uk-UA", {
                    timeZone: "Europe/Kyiv",
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ({stockRun.trigger === "cron" ? "автоматично" : "вручну"})
                  {!stockRun.finishedAt && ", не завершено"}
                </span>
                <span className="text-slate-500">
                  перевірено {stockRun.checked}, в наявності {stockRun.inStock}, немає {stockRun.outOfStock}
                  {stockRun.notFound > 0 && `, не знайдено на сайті ${stockRun.notFound}`}
                  {stockRun.failed > 0 && `, помилок ${stockRun.failed}`}, змінено {stockRun.changed}
                  {stockRun.remaining > 0 && `, не встигли ${stockRun.remaining} (перевіряться наступного разу)`}
                  {stockRun.priceDiffs > 0 && `, ціна на сайті інша у ${stockRun.priceDiffs}`}
                </span>
                {stockRun.details && (stockRun.details.changes?.length || stockRun.details.prices?.length) ? (
                  <button
                    type="button"
                    onClick={() => setShowStockDetails((v) => !v)}
                    className="text-brand underline underline-offset-2"
                  >
                    {showStockDetails ? "Сховати" : "Деталі"}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="text-slate-500">ще не запускалось. Автоматично щодня близько 08:00.</span>
            )}
          </div>
          {stockErr && <p className="mt-1 text-red-600">{stockErr}</p>}
          {showStockDetails && stockRun?.details && (
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {!!stockRun.details.changes?.length && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Змінилась кількість</p>
                  <ul className="space-y-0.5 text-xs">
                    {stockRun.details.changes.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="whitespace-nowrap tabular-nums">
                          {c.from} → <b className={c.to === 0 ? "text-red-600" : ""}>{c.to}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!stockRun.details.prices?.length && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Ціна на luxel.ua відрізняється (не змінювали)</p>
                  <ul className="space-y-0.5 text-xs">
                    {stockRun.details.prices.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="whitespace-nowrap tabular-nums">
                          у нас {c.ours} / сайт {c.site}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {pricesMsg && (
          <div className={`mb-4 text-sm rounded-lg px-3 py-2 ${pricesMsg.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-600"}`}>
            <p>{pricesMsg.text}</p>
            {pricesMsg.details && pricesMsg.details.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">Деталі</summary>
                <ul className="mt-1 text-xs space-y-0.5 max-h-60 overflow-y-auto">
                  {pricesMsg.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {importPackagingMsg && (
          <div
            className={`mb-4 text-sm rounded-lg px-3 py-2 ${
              importPackagingMsg.type === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {importPackagingMsg.text}
          </div>
        )}

        {syncSpecsMsg && (
          <div
            className={`mb-4 text-sm rounded-lg px-3 py-2 ${
              syncSpecsMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            }`}
          >
            {syncSpecsMsg.text}
          </div>
        )}

        {syncMsg && (
          <div
            className={`mb-4 text-sm rounded-lg px-3 py-2 ${
              syncMsg.type === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {syncMsg.text}
          </div>
        )}

        {recategorizeMsg && (
          <div
            className={`mb-4 text-sm rounded-lg px-3 py-2 ${
              recategorizeMsg.type === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {recategorizeMsg.text}
          </div>
        )}

        {editing && (
          <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              {form.id ? "Редагувати товар" : "Новий товар"}
            </h2>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <input
                placeholder="Назва"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Категорія"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Ціна"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Залишок"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Артикул (для обміну з BAS)"
                title="Явний артикул для обміну CommerceML з BAS. Якщо не вказано — визначається автоматично з назви товару."
                value={form.article}
                onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
              <input
                placeholder="BAS ID товару"
                title="Ідентифікатор товару в BAS — основний ключ зіставлення для обміну CommerceML. Якщо не вказано — зіставлення йде по артикулу."
                value={form.basId}
                onChange={(e) => setForm((f) => ({ ...f, basId: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>

            <textarea
              placeholder="Опис товару"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              rows={3}
            />

            <div className="flex items-center gap-4 mb-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isPromo}
                  onChange={(e) => setForm((f) => ({ ...f, isPromo: e.target.checked }))}
                />
                Бере участь в акції
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Показувати клієнтам
              </label>
            </div>

            {form.isPromo && (
              <input
                placeholder="Текст акції (наприклад: -15% до 20 серпня)"
                value={form.promoText}
                onChange={(e) => setForm((f) => ({ ...f, promoText: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              />
            )}

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Фотографії
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.images.map((url) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg" />
                    <button
                      onClick={() => removeImage(url)}
                      className="absolute -top-1 -right-1 bg-slate-900 text-white rounded-full w-4 h-4 text-[10px] leading-4"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesSelected}
                className="text-xs"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Відео (необов&apos;язково)
              </label>
              {form.videoUrl && (
                <video src={form.videoUrl} controls className="w-40 rounded-lg mb-2" />
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoSelected}
                className="text-xs"
              />
            </div>

            {uploading && <p className="text-xs text-slate-400 mb-2">Завантаження файлу...</p>}

            <div className="flex gap-2">
              <button
                onClick={saveProduct}
                disabled={saving || !form.name || uploading}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {saving ? "Збереження..." : "Зберегти"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setForm(emptyForm);
                }}
                className="text-sm text-slate-500 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {!loading && (
          <div className="mb-2 flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={onlyManual}
                onChange={(e) => setOnlyManual(e.target.checked)}
              />
              Тільки змінені вручну
            </label>
            <span className="text-xs text-slate-500">
              Змінено вручну сьогодні: {products.filter((p) => p.stockOverride).length}. Щоранку о ~08:00
              статуси знову беруться з luxel.ua.
            </span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : (
          <div className="border border-slate-200 bg-white rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Товар</th>
                  <th className="text-left px-3 py-2 font-medium">Ціна</th>
                  <th className="text-left px-3 py-2 font-medium">Залишок</th>
                  <th className="text-left px-3 py-2 font-medium">Статус для клієнтів</th>
                  <th className="text-left px-3 py-2 font-medium">Акція</th>
                  <th className="text-left px-3 py-2 font-medium">Показ</th>
                  <th className="text-right px-3 py-2 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter((p) => !onlyManual || p.stockOverride)
                  .map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-slate-100 ${p.stockOverride ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0].url}
                            alt=""
                            className="w-8 h-8 object-cover rounded"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-slate-100 rounded" />
                        )}
                        <span className="text-slate-800">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {p.price.toLocaleString("uk-UA")} ₴
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={stockDrafts[p.id] ?? p.stock}
                        onChange={(e) =>
                          setStockDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                        }
                        onBlur={() => saveStock(p.id)}
                        className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={p.stockOverride ?? ""}
                        onChange={(e) => setAvailability(p.id, e.target.value as Availability | "")}
                        aria-label="Статус наявності"
                        className={`border rounded px-2 py-1 text-xs ${
                          p.stockOverride
                            ? "border-amber-400 bg-amber-100 text-amber-900 font-medium"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <option value="">
                          Авто: {AVAILABILITY_LABEL[p.availabilityAuto ?? "in"]}
                        </option>
                        <option value="in">{AVAILABILITY_LABEL.in}</option>
                        <option value="low">{AVAILABILITY_LABEL.low}</option>
                        <option value="out">{AVAILABILITY_LABEL.out}</option>
                      </select>
                      {p.stockOverride && p.stockOverrideAt && (
                        <div className="mt-0.5 text-[11px] text-amber-700">
                          вручну о{" "}
                          {new Date(p.stockOverrideAt).toLocaleTimeString("uk-UA", {
                            timeZone: "Europe/Kyiv",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          , до ранкової перевірки
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {p.isPromo ? (
                        <span className="text-xs bg-red-50 text-brand px-2 py-0.5 rounded-full">
                          Акція
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {p.isActive ? (
                        <span className="text-xs text-emerald-600">видно</span>
                      ) : (
                        <span className="text-xs text-slate-400">приховано</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs text-slate-600 hover:text-slate-900"
                      >
                        Змінити
                      </button>
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Видалити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
