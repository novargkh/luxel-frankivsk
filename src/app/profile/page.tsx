"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import ClientPriceList from "@/components/admin/ClientPriceList";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
      Завантаження карти...
    </div>
  ),
});

type Profile = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  taxCode?: string | null;
  basId?: string | null;
  isActive?: boolean;
  discountPercent?: number;
  passwordIssuedAt?: string | null;
  password?: string | null;
};
type ChangeRequest = {
  id: string;
  message: string;
  status: "NEW" | "DONE" | "REJECTED";
  adminComment: string | null;
  createdAt: string;
};
const REQUEST_STATUS: Record<ChangeRequest["status"], { label: string; cls: string }> = {
  NEW: { label: "Очікує", cls: "bg-amber-100 text-amber-800" },
  DONE: { label: "Виконано", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Відхилено", cls: "bg-slate-100 text-slate-600" },
};
type Shop = {
  id: string;
  name: string;
  address: string;
  contactPerson: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  workingHours: string | null;
};

const emptyShopForm = {
  id: "",
  name: "",
  address: "",
  contactPerson: "",
  phone: "",
  workingHours: "",
  lat: null as number | null,
  lng: null as number | null,
};

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileInner />
    </Suspense>
  );
}

// Clients see their contacts and delivery points read-only (the data comes
// from BAS) and send change requests to the manager. An admin opens
// /profile?client=<id> from admin/clients to edit a client's contacts and
// delivery points and to issue a password.
function ProfileInner() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  // Admin opens a client at /admin/clients/<id> (the old ?client=<id>
  // link still works).
  const routeParams = useParams<{ id?: string }>();
  const clientId = useSearchParams().get("client") ?? routeParams?.id ?? null;
  const adminMode = isAdmin && !!clientId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxCode, setTaxCode] = useState("");
  const [basId, setBasId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [discount, setDiscount] = useState("");
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [requestText, setRequestText] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestMsg, setRequestMsg] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopForm, setShopForm] = useState(emptyShopForm);
  const [editingShop, setEditingShop] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auto-geocoding: as the user types an address, look it up and drop the
  // pin automatically (they can still fine-tune by clicking the map).
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "ok" | "empty" | "error">("idle");
  const [recenterKey, setRecenterKey] = useState(0);
  const skipNextGeocodeRef = useRef(false);

  useEffect(() => {
    if (!editingShop) return;
    const address = shopForm.address.trim();
    if (address.length < 5) {
      setGeocodeStatus("idle");
      return;
    }
    if (skipNextGeocodeRef.current) {
      skipNextGeocodeRef.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setGeocoding(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
        const data = await res.json();
        const first = data.results?.[0];
        if (first) {
          setShopForm((f) => (f.address.trim() === address ? { ...f, lat: first.lat, lng: first.lng } : f));
          setRecenterKey((k) => k + 1);
          setGeocodeStatus("ok");
        } else {
          setGeocodeStatus("empty");
        }
      } catch {
        setGeocodeStatus("error");
      } finally {
        setGeocoding(false);
      }
    }, 700);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopForm.address, editingShop]);

  async function load() {
    setLoading(true);
    const [profileRes, shopsRes, reqRes] = await Promise.all([
      fetch(adminMode ? `/api/admin/clients/${clientId}` : "/api/profile"),
      fetch(adminMode ? `/api/shops?client=${clientId}` : "/api/shops"),
      adminMode ? Promise.resolve(null) : fetch("/api/profile/requests"),
    ]);
    const p = await profileRes.json();
    setProfile(p);
    setName(p.name ?? "");
    setCompany(p.company ?? "");
    setPhone(p.phone ?? "");
    setEmail(p.email ?? "");
    setTaxCode(p.taxCode ?? "");
    setBasId(p.basId ?? "");
    setIsActive(p.isActive ?? true);
    setDiscount(p.discountPercent ? String(p.discountPercent) : "");
    setShops(await shopsRes.json());
    if (reqRes?.ok) setRequests(await reqRes.json());
    setLoading(false);
  }

  useEffect(() => {
    if (session === undefined) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMode, clientId, session === undefined]);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg("");
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, company, phone, email, taxCode, basId, isActive, discountPercent: discount || 0 }),
    });
    setSavingProfile(false);
    const data = await res.json().catch(() => ({}));
    setProfileMsg(res.ok ? "Збережено" : data.error ?? "Помилка збереження");
    if (res.ok) setProfile(data);
  }

  async function issuePassword(custom?: string) {
    if (!custom && profile?.passwordIssuedAt && !confirm("Згенерувати новий пароль? Старий перестане працювати.")) return;
    setProfileMsg("");
    const res = await fetch(`/api/admin/clients/${clientId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(custom ? { password: custom } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileMsg(data.error ?? "Не вдалося змінити пароль");
      return;
    }
    setIssued({ login: data.login, password: data.password });
    setShowPassword(true);
    setNewPassword(null);
    setProfile((p) => (p ? { ...p, passwordIssuedAt: new Date().toISOString(), password: data.password } : p));
  }

  async function sendRequest() {
    setSendingRequest(true);
    setRequestMsg("");
    const res = await fetch("/api/profile/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: requestText }),
    });
    setSendingRequest(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRequestMsg(data.error ?? "Не вдалося надіслати");
      return;
    }
    setRequestText("");
    setRequestMsg("Запит надіслано менеджеру");
    setRequests((r) => [data, ...r]);
  }

  function startAddShop() {
    setShopForm(emptyShopForm);
    setGeocodeStatus("idle");
    setEditingShop(true);
  }

  function startEditShop(s: Shop) {
    // The address is already set (and presumably already has a fine-tuned
    // pin) — skip the very next auto-geocode pass so opening "Змінити"
    // doesn't immediately jump/move an already-correct marker.
    skipNextGeocodeRef.current = true;
    setGeocodeStatus("idle");
    setShopForm({
      id: s.id,
      name: s.name,
      address: s.address,
      contactPerson: s.contactPerson ?? "",
      phone: s.phone ?? "",
      workingHours: s.workingHours ?? "",
      lat: s.lat,
      lng: s.lng,
    });
    setEditingShop(true);
  }

  async function saveShop() {
    if (!shopForm.name || !shopForm.address) return;
    setSavingShop(true);

    const payload = {
      userId: clientId,
      name: shopForm.name,
      address: shopForm.address,
      contactPerson: shopForm.contactPerson || undefined,
      phone: shopForm.phone || undefined,
      workingHours: shopForm.workingHours || undefined,
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
        {adminMode && (
          <Link href="/admin/clients" className="inline-block text-xs text-slate-500 hover:text-slate-900 mb-2">
            ← Усі клієнти
          </Link>
        )}
        <h1 className="text-lg font-semibold text-slate-900 mb-1">
          {adminMode ? profile?.company || profile?.name || "Клієнт" : "Мій профіль"}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {adminMode
            ? "Контакти й адреси доставки клієнта. Клієнт бачить їх у своєму профілі, але змінити не може."
            : "Ваші дані з облікової системи LUXEL. Щоб щось змінити, надішліть запит менеджеру внизу сторінки."}
        </p>

        {!loading && shops.length === 0 && (
          <div className="mb-6 border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
            {adminMode
              ? "У клієнта ще немає адрес доставки: без них він не зможе оформити замовлення. Додайте хоча б одну нижче."
              : "Адреси доставки ще не додано. Надішліть запит менеджеру внизу сторінки, щоб мати змогу оформлювати замовлення."}
          </div>
        )}

        {adminMode ? (
          <section className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Контактні дані</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Компанія</span>
                <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Контактна особа</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Телефон (логін для входу)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Email (логін для входу)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">ЄДРПОУ / ІПН</span>
                <input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Код у BAF</span>
                <input value={basId} onChange={(e) => setBasId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 mb-1">Знижка від базової ціни, % (клієнт її не бачить)</span>
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-4">
              <input type="checkbox" checked={!isActive} onChange={(e) => setIsActive(!e.target.checked)} />
              Заблокувати вхід
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {savingProfile ? "Збереження..." : "Зберегти"}
              </button>
              {profileMsg && <span className="text-xs text-slate-700">{profileMsg}</span>}
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900 mb-2">Доступ до кабінету</p>
              {!(profile?.email || profile?.phone) ? (
                <p className="text-amber-700">Вкажіть email або телефон: це логін клієнта. Без нього кабінет не створити.</p>
              ) : (
                <>
                  <p>
                    <span className="text-slate-500">Логін: </span>
                    <span className="font-mono">{profile?.email || profile?.phone}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-slate-500">Пароль: </span>
                    {(issued?.password ?? profile?.password) ? (
                      <>
                        <span className="font-mono">{showPassword ? issued?.password ?? profile?.password : "••••••••••"}</span>
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-xs underline text-slate-600">
                          {showPassword ? "Сховати" : "Показати"}
                        </button>
                      </>
                    ) : profile?.passwordIssuedAt ? (
                      <span className="text-slate-500">видано раніше, не збережено — згенеруйте новий</span>
                    ) : (
                      <span className="text-amber-700">ще немає: клієнт не може увійти</span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => issuePassword()}
                      className="text-xs border border-slate-300 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-100"
                    >
                      {profile?.passwordIssuedAt ? "Згенерувати новий" : "Створити кабінет"}
                    </button>
                    {newPassword === null ? (
                      <button
                        type="button"
                        onClick={() => setNewPassword("")}
                        className="text-xs border border-slate-300 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-100"
                      >
                        Задати свій пароль
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="мін. 6 символів"
                          aria-label="Новий пароль"
                          className="h-8 w-40 rounded-md border border-slate-300 px-2 font-mono text-xs"
                        />
                        <button
                          type="button"
                          disabled={newPassword.trim().length < 6}
                          onClick={() => issuePassword(newPassword.trim())}
                          className="text-xs bg-slate-900 text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
                        >
                          Зберегти
                        </button>
                        <button type="button" onClick={() => setNewPassword(null)} className="text-xs text-slate-500 underline">
                          Скасувати
                        </button>
                      </span>
                    )}
                    {(issued?.password ?? profile?.password) && (
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            ?.writeText(
                              `Кабінет LUXEL: ${window.location.origin}\nЛогін: ${(profile?.email || profile?.phone || "")}\nПароль: ${issued?.password ?? profile?.password}`
                            )
                            .then(() => setProfileMsg("Скопійовано"))
                            .catch(() => {})
                        }
                        className="text-xs border border-emerald-300 bg-emerald-50 text-emerald-900 rounded-lg px-3 py-1.5 hover:bg-emerald-100"
                      >
                        Скопіювати для клієнта
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Контактні дані</h2>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ["Компанія", profile?.company],
                ["Контактна особа", profile?.name],
                ["Телефон", profile?.phone],
                ["Email", profile?.email],
                ["ЄДРПОУ / ІПН", profile?.taxCode],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="text-slate-900">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {adminMode && clientId && <ClientPriceList clientId={clientId} />}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Магазини / точки доставки
            </h2>
            {adminMode && (
              <button
                onClick={startAddShop}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
              >
                + Додати адресу
              </button>
            )}
          </div>

          {adminMode && editingShop && (
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
                <div>
                  <input
                    placeholder="Адреса"
                    value={shopForm.address}
                    onChange={(e) => setShopForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-xs mt-1 h-4">
                    {geocoding && <span className="text-slate-400">Пошук на карті...</span>}
                    {!geocoding && geocodeStatus === "ok" && (
                      <span className="text-emerald-600">Адресу знайдено на карті</span>
                    )}
                    {!geocoding && geocodeStatus === "empty" && (
                      <span className="text-amber-600">
                        Адресу не знайдено — поставте мітку вручну
                      </span>
                    )}
                    {!geocoding && geocodeStatus === "error" && (
                      <span className="text-amber-600">Не вдалося визначити координати</span>
                    )}
                  </p>
                </div>
                <input
                  placeholder="Телефон"
                  value={shopForm.phone}
                  onChange={(e) => setShopForm((f) => ({ ...f, phone: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm h-fit"
                />
              </div>

              <div className="mb-3">
                <input
                  placeholder="Години роботи (напр. Пн-Пт 9:00–18:00, Сб 10:00–15:00)"
                  value={shopForm.workingHours}
                  onChange={(e) => setShopForm((f) => ({ ...f, workingHours: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Геомітка на карті — підбирається автоматично за адресою, або клацніть вручну
                </label>
                <MapPicker
                  lat={shopForm.lat}
                  lng={shopForm.lng}
                  onChange={(lat, lng) => setShopForm((f) => ({ ...f, lat, lng }))}
                  recenterKey={recenterKey}
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
            <p className="text-sm text-slate-500">Адрес доставки ще немає.</p>
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
                    {s.workingHours && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Години роботи: {s.workingHours}
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
                  {adminMode && (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {!adminMode && (
          <section className="border border-slate-200 bg-white rounded-xl p-4 mt-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Запит на зміну даних</h2>
            <p className="text-xs text-slate-500 mb-3">
              Змінився телефон, з&apos;явився новий магазин чи інша адреса? Опишіть, і менеджер внесе зміни.
            </p>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={3}
              placeholder="Наприклад: новий телефон 050 123 45 67; додати магазин у м. Калуш, вул. Шевченка, 10"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={sendRequest}
                disabled={sendingRequest || requestText.trim().length < 5}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {sendingRequest ? "Надсилаю..." : "Надіслати запит"}
              </button>
              {requestMsg && <span className="text-xs text-slate-600">{requestMsg}</span>}
            </div>
            {requests.length > 0 && (
              <ul className="mt-4 space-y-2">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-slate-500">
                        {new Date(r.createdAt).toLocaleDateString("uk-UA")}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${REQUEST_STATUS[r.status].cls}`}>
                        {REQUEST_STATUS[r.status].label}
                      </span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-line">{r.message}</p>
                    {r.adminComment && (
                      <p className="mt-1 text-slate-600">
                        <span className="text-slate-400">Менеджер: </span>
                        {r.adminComment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
