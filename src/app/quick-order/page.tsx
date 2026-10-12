"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  CircleNotch,
  ImageSquare,
  Images,
  LockSimple,
  MagnifyingGlass,
  Microphone,
  Minus,
  Plus,
  Question,
  TextAa,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import QtyInput from "@/components/QtyInput";
import { useCart } from "@/lib/cart";
import { blobToWavBase64, compressImage, startRecording, type Recorder } from "@/lib/media";
import { textMatches } from "@/lib/itemSearch";
import { liveDictationSupported, startDictation, type Dictation } from "@/lib/speech";

type Candidate = { id: string; name: string; price: number; stock: number; image: string | null; score: number };
type Line = {
  key: string;
  source: "voice" | "photo" | "text";
  text: string;
  article: string | null;
  qty: number;
  qtyGuessed: boolean;
  status: "exact" | "likely" | "choose" | "none";
  candidates: Candidate[];
  chosen: Candidate | null;
  fresh: boolean;
};
type Shot = { key: string; thumb: string; state: "busy" | "done" | "error"; found: number; error?: string };
type CatalogItem = { id: string; name: string; price: number; stock: number; images: { url: string }[] };

const money = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;
let seq = 0;
const nextKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;
const MAX_RECORD_SEC = 90;

export default function QuickOrderPage() {
  const router = useRouter();
  const { cart, setQty } = useCart();
  const [lines, setLines] = useState<Line[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState("");

  // ── recording state ───────────────────────────────────────────────
  const [rec, setRec] = useState<"idle" | "hold" | "locked" | "processing">("idle");
  const [secs, setSecs] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  // Live dictation (browser speech recognition) where available: the words
  // appear in the text box while speaking and are checked before matching.
  // Otherwise the audio is recorded and read by the AI model.
  const [live, setLive] = useState(false);
  const dictRef = useRef<Dictation | null>(null);
  const textBase = useRef("");
  // What the AI heard in a recording, shown so the person can check it.
  const [heard, setHeard] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(liveDictationSupported());
  }, []);
  const pressStart = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Catalog for manual search in unresolved lines (loaded on demand).
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  async function ensureCatalog() {
    if (catalog) return;
    const res = await fetch("/api/products");
    if (res.ok) setCatalog(await res.json());
  }

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      dictRef.current?.abort();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // ── sending to the recogniser ─────────────────────────────────────
  async function recognise(payload: Record<string, string>, source: Line["source"]): Promise<number> {
    setBusy((n) => n + 1);
    setError("");
    try {
      const res = await fetch("/api/quick-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не вдалося розпізнати");
      if (source === "voice") setHeard(typeof data.transcript === "string" ? data.transcript : null);
      const items = (data.items ?? []) as (Omit<Line, "key" | "source" | "chosen" | "fresh" | "qtyGuessed"> & {
        qtyMissing?: boolean;
      })[];
      addLines(
        items.map((it) => ({
          ...it,
          key: nextKey(),
          source,
          qtyGuessed: !!it.qtyMissing,
          chosen: it.status === "exact" || it.status === "likely" ? it.candidates[0] : null,
          fresh: true,
        }))
      );
      if (items.length === 0) setError("Нічого не впізнано. Спробуйте ще раз або чіткіше.");
      return items.length;
    } finally {
      setBusy((n) => n - 1);
    }
  }

  // New lines merge into existing ones for the same product (qty adds up).
  function addLines(incoming: Line[]) {
    setLines((prev) => {
      const next = prev.map((l) => ({ ...l, fresh: false }));
      for (const l of incoming) {
        const same = l.chosen && next.find((x) => x.chosen?.id === l.chosen!.id);
        if (same) {
          same.qty += l.qty;
          same.fresh = true;
        } else next.unshift(l);
      }
      return next;
    });
  }

  async function onPhotos(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const key = nextKey();
      let thumb = "";
      try {
        thumb = await compressImage(file, 1600);
      } catch {
        setShots((s) => [...s, { key, thumb: "", state: "error", found: 0, error: "Не вдалося відкрити фото" }]);
        continue;
      }
      setShots((s) => [{ key, thumb, state: "busy", found: 0 }, ...s]);
      recognise({ image: thumb }, "photo")
        .then((found) => setShots((s) => s.map((x) => (x.key === key ? { ...x, state: "done", found } : x))))
        .catch((e: Error) => {
          setShots((s) => s.map((x) => (x.key === key ? { ...x, state: "error", error: e.message } : x)));
          setError(e.message);
        });
    }
  }

  async function submitText() {
    const t = text.trim();
    if (!t) return;
    try {
      await recognise({ text: t }, "text");
      setText("");
      setShowText(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── microphone: hold to talk, or tap to lock ──────────────────────
  async function begin() {
    setError("");
    if (live) {
      try {
        textBase.current = text.trim() ? text.trim() + "\n" : "";
        setShowText(true);
        dictRef.current = startDictation({
          onText: (t) => setText(textBase.current + t),
          onEnd: (t, err) => {
            dictRef.current = null;
            if (timer.current) clearInterval(timer.current);
            timer.current = null;
            setRec("idle");
            if (err === "not-allowed" || err === "service-not-allowed") {
              setError("Немає доступу до мікрофона. Дозвольте мікрофон для цього сайту в налаштуваннях браузера.");
            } else if (err && !t) {
              setError("Не вдалося розпізнати мову. Спробуйте ще раз або введіть текстом.");
            }
            setText(textBase.current + t);
          },
        });
      } catch {
        setLive(false);
        return begin();
      }
      setSecs(0);
      timer.current = setInterval(() => {
        setSecs((s) => {
          if (s + 1 >= MAX_RECORD_SEC) finish();
          return s + 1;
        });
      }, 1000);
      return true;
    }
    try {
      recorderRef.current = await startRecording();
    } catch {
      setError("Немає доступу до мікрофона. Дозвольте мікрофон для цього сайту в налаштуваннях браузера.");
      setRec("idle");
      return false;
    }
    setSecs(0);
    timer.current = setInterval(() => {
      setSecs((s) => {
        if (s + 1 >= MAX_RECORD_SEC) finish();
        return s + 1;
      });
    }, 1000);
    return true;
  }

  async function finish() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (dictRef.current) {
      setRec("processing");
      dictRef.current.stop();
      return;
    }
    const r = recorderRef.current;
    recorderRef.current = null;
    if (!r) return;
    setRec("processing");
    try {
      const blob = await r.stop();
      if (blob.size < 2000) {
        setRec("idle");
        return;
      }
      const wav = await blobToWavBase64(blob);
      await recognise({ audio: wav, format: "wav" }, "voice");
    } catch (e) {
      setError((e as Error).message || "Не вдалося обробити запис");
    } finally {
      setRec("idle");
    }
  }

  function cancelRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (dictRef.current) {
      dictRef.current.abort();
      dictRef.current = null;
      setText(textBase.current.trim());
    }
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRec("idle");
  }

  async function onMicDown(e: React.PointerEvent) {
    e.preventDefault();
    if (rec === "locked") {
      finish();
      return;
    }
    if (rec !== "idle") return;
    pressStart.current = Date.now();
    setRec("hold");
    const ok = await begin();
    if (!ok) setRec("idle");
  }

  function onMicUp() {
    if (rec !== "hold") return;
    // Short tap = lock (keep recording hands-free); long press = done.
    if (Date.now() - pressStart.current < 450) setRec("locked");
    else finish();
  }

  // ── editing ───────────────────────────────────────────────────────
  const update = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const ready = lines.filter((l) => l.chosen);
  const unresolved = lines.length - ready.length;
  const total = ready.reduce((s, l) => s + l.qty * (l.chosen?.price ?? 0), 0);

  function addToCart() {
    for (const l of ready) {
      const p = l.chosen!;
      const have = cart[p.id] ?? 0;
      const want = have + l.qty;
      setQty(p.id, want);
    }
    router.push("/cart");
  }

  const recording = rec === "hold" || rec === "locked";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-40 flex-1">
        <header className="reveal mb-6">
          <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">
            Швидке замовлення
          </h1>
          <p className="mt-3 text-base text-muted max-w-[52ch]">
            Сфотографуйте товар, упаковку чи запис у зошиті або надиктуйте артикули з кількістю.
            Ви перевірите список перед додаванням у кошик.
          </p>
        </header>

        {/* Input panel */}
        <section className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-6" style={{ ["--i" as string]: 1 }}>
          <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-4 sm:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <label className="group cursor-pointer flex flex-col items-center justify-center gap-1.5 h-24 rounded-[1.25rem] bg-white/80 ring-1 ring-white text-ink active:scale-[0.97] transition-transform duration-300 ease-fluid">
                <span className="w-12 h-12 rounded-full bg-ink text-white inline-flex items-center justify-center">
                  <Camera size={22} weight="regular" />
                </span>
                <span className="text-sm font-medium">Камера</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    onPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              <label className="group cursor-pointer flex flex-col items-center justify-center gap-1.5 h-24 rounded-[1.25rem] bg-white/80 ring-1 ring-white text-ink active:scale-[0.97] transition-transform duration-300 ease-fluid">
                <span className="w-12 h-12 rounded-full bg-ink text-white inline-flex items-center justify-center">
                  <Images size={22} weight="regular" />
                </span>
                <span className="text-sm font-medium">Фото з галереї</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    onPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                onPointerDown={onMicDown}
                onPointerUp={onMicUp}
                onPointerLeave={() => rec === "hold" && finish()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={rec === "processing"}
                aria-label={recording ? "Завершити запис" : "Записати голосом"}
                className={`relative select-none touch-none flex flex-col items-center justify-center gap-1.5 h-24 rounded-[1.25rem] ring-1 transition-all duration-300 ease-fluid ${
                  recording ? "bg-brand text-white ring-brand scale-[1.02]" : "bg-white/80 ring-white text-ink active:scale-[0.97]"
                }`}
              >
                {recording && (
                  <span aria-hidden="true" className="env-ripple absolute inset-0 rounded-[1.25rem]" />
                )}
                <span
                  className={`w-12 h-12 rounded-full inline-flex items-center justify-center ${
                    recording ? "bg-white/20" : "bg-brand text-white"
                  }`}
                >
                  {rec === "processing" ? (
                    <CircleNotch size={22} className="animate-spin" />
                  ) : rec === "locked" ? (
                    <LockSimple size={22} weight="fill" />
                  ) : (
                    <Microphone size={22} weight={recording ? "fill" : "regular"} />
                  )}
                </span>
                <span className="text-sm font-medium tabular">
                  {rec === "hold"
                    ? `Запис ${secs}с`
                    : rec === "locked"
                      ? `${secs}с, натисніть`
                      : rec === "processing"
                        ? "Обробка..."
                        : "Голос"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                aria-expanded={showText}
                className={`flex flex-col items-center justify-center gap-1.5 h-24 rounded-[1.25rem] ring-1 transition-all duration-300 ease-fluid active:scale-[0.97] ${
                  showText ? "bg-ink text-white ring-ink" : "bg-white/80 ring-white text-ink"
                }`}
              >
                <span className={`w-12 h-12 rounded-full inline-flex items-center justify-center ${showText ? "bg-white/15" : "bg-ink/[0.06]"}`}>
                  <TextAa size={22} weight="regular" />
                </span>
                <span className="text-sm font-medium">Текст</span>
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-muted">
              {recording
                ? rec === "locked"
                  ? "Говоріть вільно. Натисніть мікрофон ще раз, щоб завершити."
                  : "Говоріть. Відпустіть, щоб завершити. Короткий дотик залишає запис увімкненим."
                : live
                  ? "Мікрофон: торкніться і диктуйте, текст з'являтиметься нижче. Перевірте його і натисніть «Розібрати»."
                  : "Мікрофон: утримуйте під час диктовки або торкніться, щоб диктувати без рук."}
            </p>
            {recording && (
              <div className="mt-2 text-center">
                <button type="button" onClick={cancelRecording} className="text-xs font-medium text-muted underline underline-offset-4">
                  Скасувати запис
                </button>
              </div>
            )}

            {showText && (
              <div className="rise mt-4">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder={"Наприклад:\n9601 - 20 шт\nJAZZ 9707 графіт 10\nлампа HPF 55W - 5"}
                  aria-label="Текст замовлення"
                  className="w-full rounded-2xl bg-white/85 ring-1 ring-white px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus:bg-white"
                />
                <button
                  type="button"
                  onClick={submitText}
                  disabled={!text.trim() || busy > 0 || recording}
                  className="mt-2 h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Розібрати
                </button>
              </div>
            )}

            {shots.length > 0 && (
              <ul className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
                {shots.map((s) => (
                  <li key={s.key} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-paper ring-1 ring-white">
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageSquare size={20} className="m-auto mt-5 text-muted" />
                    )}
                    <span
                      className={`absolute inset-0 flex items-center justify-center text-xs font-semibold ${
                        s.state === "busy"
                          ? "bg-black/35 text-white"
                          : s.state === "error"
                            ? "bg-brand/70 text-white"
                            : "bg-black/0"
                      }`}
                    >
                      {s.state === "busy" ? (
                        <CircleNotch size={20} className="animate-spin" />
                      ) : s.state === "error" ? (
                        <Warning size={18} weight="bold" />
                      ) : (
                        <span className="absolute bottom-1 right-1 min-w-5 h-5 px-1 rounded-full bg-white text-ink text-[11px] leading-5 text-center tabular shadow">
                          {s.found}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {busy > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <CircleNotch size={16} className="animate-spin" /> Розпізнаю...
              </p>
            )}
            {heard && (
              <p className="mt-3 text-sm text-ink/80">
                <span className="text-muted">Почув: </span>«{heard}»
                <button
                  type="button"
                  onClick={() => {
                    setText(heard);
                    setShowText(true);
                    setHeard(null);
                  }}
                  className="ml-2 text-xs font-medium underline underline-offset-4 text-muted hover:text-ink"
                >
                  Виправити текстом
                </button>
              </p>
            )}
            {error && <p className="mt-3 text-sm text-brand">{error}</p>}
          </div>
        </section>

        {/* Review list */}
        {lines.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3 px-1">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Перевірте замовлення</h2>
              <button type="button" onClick={() => setLines([])} className="text-sm text-muted hover:text-ink">
                Очистити
              </button>
            </div>
            <ul className="space-y-2">
              {lines.map((l, i) => (
                <LineCard
                  key={l.key}
                  line={l}
                  index={i}
                  catalog={catalog}
                  onNeedCatalog={ensureCatalog}
                  onChange={(patch) => update(l.key, patch)}
                  onRemove={() => removeLine(l.key)}
                />
              ))}
            </ul>
          </section>
        )}

        {lines.length === 0 && busy === 0 && (
          <p className="px-1 text-sm text-muted">
            Приклад диктовки: «Дев&apos;ять шістсот один, двадцять штук. JAZZ дев&apos;ять сімсот сім, десять. Лампа HPF
            п&apos;ятдесят п&apos;ять ват, п&apos;ять».
          </p>
        )}
      </main>

      {/* Add-to-cart bar */}
      {lines.length > 0 && (
        <div className="vv-fixed no-print fixed inset-x-3 z-20 bottom-[calc(max(env(safe-area-inset-bottom),12px)+80px)] md:bottom-6 pointer-events-none">
          <div className="reveal glass glass-strong pointer-events-auto mx-auto max-w-xl rounded-[1.75rem] pl-5 pr-1.5 py-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0 leading-tight">
              <div className="text-xs text-muted tabular">
                {ready.length} поз. готово{unresolved > 0 ? `, ${unresolved} треба уточнити` : ""}
              </div>
              <div className="text-lg font-semibold tracking-[-0.02em] tabular text-ink">{money(total)}</div>
            </div>
            <button
              type="button"
              onClick={addToCart}
              disabled={ready.length === 0}
              className="group h-12 inline-flex items-center gap-3 rounded-full bg-brand pl-5 pr-1.5 text-sm font-semibold text-white whitespace-nowrap disabled:opacity-40 active:scale-[0.98] transition-transform duration-300 ease-fluid"
            >
              У кошик
              <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:translate-x-0.5">
                <ArrowRight size={16} weight="bold" />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LineCard({
  line,
  index,
  catalog,
  onNeedCatalog,
  onChange,
  onRemove,
}: {
  line: Line;
  index: number;
  catalog: CatalogItem[] | null;
  onNeedCatalog: () => void;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(line.status === "none");
  const p = line.chosen;
  const state = p ? (line.status === "likely" ? "check" : "ok") : line.candidates.length > 0 ? "choose" : "none";
  const others = p ? line.candidates.filter((c) => c.id !== p.id) : [];
  const results =
    searching && catalog && search.trim().length >= 2
      ? catalog.filter((c) => textMatches(c.name, search)).slice(0, 6)
      : [];

  const pick = (c: Candidate) => {
    onChange({ chosen: c, status: "exact" });
    setSearching(false);
    setSearch("");
  };

  return (
    <li
      className={`rise rounded-[1.5rem] p-1 ${
        state === "ok" ? "bg-emerald-400/15" : state === "choose" || state === "check" ? "bg-amber-400/20" : "bg-brand/15"
      } ${line.fresh ? "ring-2 ring-white" : ""}`}
      style={{ ["--i" as string]: Math.min(index, 8) }}
    >
      <div className="rounded-[calc(1.5rem-0.25rem)] bg-white/90 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 mt-0.5 w-7 h-7 rounded-full inline-flex items-center justify-center text-white ${
              state === "ok" ? "bg-emerald-500" : state === "choose" || state === "check" ? "bg-amber-500" : "bg-brand"
            }`}
            aria-label={
              state === "ok" ? "Знайдено" : state === "check" ? "Перевірте" : state === "choose" ? "Оберіть варіант" : "Не знайдено"
            }
          >
            {state === "ok" ? (
              <Check size={14} weight="bold" />
            ) : state === "choose" || state === "check" ? (
              <Question size={14} weight="bold" />
            ) : (
              <X size={14} weight="bold" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            {p ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:flex shrink-0 w-11 h-11 rounded-xl bg-paper overflow-hidden items-center justify-center text-muted/60">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImageSquare size={18} weight="light" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] leading-snug font-medium text-ink line-clamp-2">{p.name}</p>
                  <p className="text-xs text-muted tabular">
                    {money(p.price)}/шт{p.stock <= 0 ? ", немає в наявності" : ""}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[14px] font-medium text-ink">
                {state === "choose" ? "Оберіть потрібний товар" : "Не знайдено в каталозі"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              {line.source === "voice" ? "Почуто" : line.source === "photo" ? "На фото" : "У тексті"}: «{line.text || line.article}»
              {p && (
                <button
                  type="button"
                  onClick={() => {
                    onChange({ chosen: null, status: line.candidates.length ? "choose" : "none" });
                    setSearching(line.candidates.length === 0);
                  }}
                  className="ml-2 underline underline-offset-2 hover:text-ink"
                >
                  змінити
                </button>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onRemove}
            aria-label="Прибрати позицію"
            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/[0.05]"
          >
            <Trash size={16} weight="light" />
          </button>
        </div>

        {state === "check" && others.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-amber-800 mb-1">Перевірте. Інші схожі:</p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c)}
                  className="max-w-full rounded-full bg-ink/[0.05] hover:bg-ink/[0.09] px-3 py-1.5 text-xs text-ink text-left line-clamp-1"
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange({ status: "exact" })}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white"
              >
                Все вірно
              </button>
            </div>
          </div>
        )}

        {!p && line.candidates.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {line.candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className="w-full flex items-center gap-3 rounded-xl bg-ink/[0.04] hover:bg-ink/[0.08] px-3 py-2 text-left active:scale-[0.99] transition-transform"
                >
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink line-clamp-2">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted tabular">{money(c.price)}</span>
                </button>
              </li>
            ))}
            {!searching && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setSearching(true);
                    onNeedCatalog();
                  }}
                  className="text-xs font-medium text-muted underline underline-offset-4 px-1"
                >
                  Немає потрібного, знайти в каталозі
                </button>
              </li>
            )}
          </ul>
        )}

        {!p && searching && (
          <div className="mt-3">
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onFocus={onNeedCatalog}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Назва або артикул"
                aria-label="Знайти товар"
                className="w-full h-10 rounded-xl bg-ink/[0.04] pl-9 pr-3 text-base text-ink placeholder:text-muted focus:outline-none focus:bg-white focus:ring-1 focus:ring-black/10"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() =>
                        pick({ id: c.id, name: c.name, price: c.price, stock: c.stock, image: c.images[0]?.url ?? null, score: 100 })
                      }
                      className="w-full flex items-center gap-3 rounded-xl hover:bg-ink/[0.05] px-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-ink line-clamp-2">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted tabular">{money(c.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {line.qtyGuessed ? "Вкажіть кількість" : ""}
          </span>
          <div className="inline-flex items-center h-10 rounded-full bg-white ring-1 ring-ink/70">
            <button
              type="button"
              aria-label="Менше"
              onClick={() => onChange({ qty: Math.max(1, line.qty - 1), qtyGuessed: false })}
              className="w-10 h-10 inline-flex items-center justify-center rounded-full"
            >
              <Minus size={14} weight="bold" />
            </button>
            <QtyInput
              value={line.qty}
              min={1}
              max={9999}
              onChange={(n) => onChange({ qty: n, qtyGuessed: false })}
              className="w-12 h-8 bg-transparent text-center text-base font-semibold tabular text-ink focus:outline-none"
            />
            <button
              type="button"
              aria-label="Більше"
              onClick={() => onChange({ qty: line.qty + 1, qtyGuessed: false })}
              className="w-10 h-10 inline-flex items-center justify-center rounded-full"
            >
              <Plus size={14} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

