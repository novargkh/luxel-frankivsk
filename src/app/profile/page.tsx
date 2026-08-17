"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
      Завантаження карти...
    </div>
  ),
});

type Profile = { id: string; name: string; email: string; company: string | null };
type Shop = {
  id: string;
  name: string;
  address: string;
  contactPerson: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
};

const emptyShopForm = {
  id: "",
  name: "",
  address: "",
  contactPerson: "",
  phone: "",
  lat: null as number | null,
  lng: null as number | null,
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopForm, setShopForm] = useState(emptyShopForm);
  const [editingShop, setEditingShop] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [profileRes, shopsRes] = await Promise.all([
      fetch("/api/profile"),
      fetch("/api/shops"),
    ]);
    const p = await profileRes.json();
    setProfile(p);
    setName(p.name ?? "");
    setCompany(p.company ?? "");
    setShops(await shopsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg("");
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company }),
    });
    setSavingProfile(false);
    setProfileMsg(res.ok ? "Збережено" : "Помилка збереження");
  }

  function startAddShop() {
    setShopForm(emptyShopForm);
    setEditingShop(true);
  }

  function startEditShop(s: Shop) {
    setShopForm({
      id: s.id,
      name: s.name,
      address: s.address,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      lat: s.lat,
      lng: s.lng,
    });
    setEditingShop(true);
  }

  async function saveShop() {
    if (!shopForm.name || !shopForm.address) return;
    setSavingShop(true);

    const payload = {
      name: shopForm.name,
      address: shopForm.address,
      contactPerson: shopForm.contactPerson || undefined,
      phone: shopForm.phone || undefined,
      lat: shopForm.lat,
      lng: shopForm.lng,
    };

    const res = shopForm.id
      ? await fetch(`/api/shops/${shopForm.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/shops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSavingShop(false);

    if (!res.ok) {
      alert("Не вдалося зберегти магазин");
      return;
    }

    setEditingShop(false);
    setShopForm(emptyShopForm);
    load();
  }

  async function deleteShop(id: string) {
    if (!confirm("Видалити цю точку доставки?")) return;
    await fetch(`/api/shops/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Мій профіль</h1>
        <p className="text-sm text-slate-500 mb-6">
          Контактні дані та точки доставки (магазини) — потрібні для оформлення
          замовлень і побудови маршрутів доставки.
        </p>

        {!loading && shops.length === 0 && (
          <div className="mb-6 border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
            Профіль ще не заповнено. Додайте хоча б один магазин з адресою та
            геоміткою нижче, щоб мати змогу оформлювати замовлення.
          </div>
        )}

        <section className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Контактні дані</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Ім&apos;я / контактна особа
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Компанія
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input
              value={profile?.email ?? ""}
              disabled
              className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
            >
              {savingProfile ? "Збереження..." : "Зберегти"}
            </button>
            {profileMsg && <span className="text-xs text-slate-500">{profileMsg}</span>}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Магазини / точки доставки
            </h2>
            <button
              onClick={startAddShop}
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
            >
              + Додати магазин
            </button>
          </div>

          {editingShop && (
            <div className="border border-slate-200 bg-white rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                {shopForm.id ? "Редагувати магазин" : "Новий магазин"}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <input
                  placeholder="Назва (напр. Магазин на вул. Хрещатик)"
                  value={shopForm.name}
                  onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  placeholder="Контактна особа"
                  value={shopForm.contactPerson}
                  onChange={(e) =>
                    setShopForm((f) => ({ ...f, contactPerson: e.target.value }))
                  }
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <input
                  placeholder="Адреса"
                  value={shopForm.address}
                  onChange={(e) => setShopForm((f) => ({ ...f, address: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  placeholder="Телефон"
                  value={shopForm.phone}
                  onChange={(e) => setShopForm((f) => ({ ...f, phone: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Геомітка на карті
                </label>
                <MapPicker
                  lat={shopForm.lat}
                  lng={shopForm.lng}
                  onChange={(lat, lng) => setShopForm((f) => ({ ...f, lat, lng }))}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveShop}
                  disabled={savingShop || !shopForm.name || !shopForm.address}
                  className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
                >
                  {savingShop ? "Збереження..." : "Зберегти магазин"}
                </button>
                <button
                  onClick={() => {
                    setEditingShop(false);
                    setShopForm(emptyShopForm);
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
          ) : shops.length === 0 && !editingShop ? (
            <p className="text-sm text-slate-500">Магазинів ще не додано.</p>
          ) : (
            <div className="space-y-2">
              {shops.map((s) => (
                <div
                  key={s.id}
                  className="border border-slate-200 bg-white rounded-xl p-4 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.address}</div>
                    {(s.contactPerson || s.phone) && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.contactPerson}
                        {s.contactPerson && s.phone ? " · " : ""}
                        {s.phone}
                      </div>
                    )}
                    <div className="text-xs mt-1">
                      {s.lat != null && s.lng != null ? (
                        <span className="text-emerald-600">Геомітку встановлено</span>
                      ) : (
                        <span className="text-amber-600">Геомітку не встановлено</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => startEditShop(s)}
                      className="text-xs text-slate-600 hover:text-slate-900"
                    >
                      Змінити
                    </button>
                    <button
                      onClick={() => deleteShop(s.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Видалити
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
