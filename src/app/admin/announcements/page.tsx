"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type Announcement = { id: string; title: string; body: string; createdAt: string };

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/announcements");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!title || !body) return;
    setSaving(true);
    await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    setSaving(false);
    setTitle("");
    setBody("");
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">
          Сповіщення для клієнтів
        </h1>

        <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
          <input
            placeholder="Заголовок (наприклад: Акція на вихідні)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2"
          />
          <textarea
            placeholder="Текст сповіщення"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          <button
            onClick={submit}
            disabled={saving || !title || !body}
            className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Надсилання..." : "Надіслати всім клієнтам"}
          </button>
        </div>

        <h2 className="text-sm font-semibold text-slate-900 mb-2">Історія</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="border border-slate-200 bg-white rounded-xl p-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm font-medium text-slate-900">{a.title}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(a.createdAt).toLocaleString("uk-UA")}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
