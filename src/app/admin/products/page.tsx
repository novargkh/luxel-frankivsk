"use client";

import { useEffect, useRef, useState } from "react";
import Navbar from "@/components/Navbar";

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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

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
          <div className="flex items-center gap-2">
            <button
              onClick={syncLuxel}
              disabled={syncing}
              className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
            >
              {syncing ? "Оновлення..." : "Оновити з luxel.ua"}
            </button>
            <button
              onClick={startCreate}
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
            >
              + Додати товар
            </button>
          </div>
        </div>

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
                  <th className="text-left px-3 py-2 font-medium">Акція</th>
                  <th className="text-left px-3 py-2 font-medium">Показ</th>
                  <th className="text-right px-3 py-2 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
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
