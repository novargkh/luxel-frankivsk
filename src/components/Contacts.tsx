"use client";

import { useEffect, useRef, useState } from "react";
import { ChatCircleDots, Phone, PhoneCall, TelegramLogo, X } from "@phosphor-icons/react";

// Manager contacts in the top bar, next to the envelope. One tap opens a
// small card with the numbers: call directly, or open Telegram / Viber.
const CONTACTS = [
  {
    display: "050 968 11 19",
    intl: "+380509681119",
    messengers: true,
  },
  {
    display: "068 187 55 61",
    intl: "+380681875561",
    messengers: false,
  },
] as const;

export default function Contacts() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chip =
    "h-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-transform duration-300 ease-fluid active:scale-[0.97]";

  return (
    <div ref={rootRef} className="contents">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Контакти менеджера"
        className={`relative h-10 sm:h-11 min-w-10 sm:min-w-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-full lg:pl-3 lg:pr-4 transition-colors duration-300 ease-fluid ${
          open ? "bg-ink text-white" : "bg-white/60 ring-1 ring-white/70 text-ink hover:bg-white/90"
        }`}
      >
        <Phone size={20} weight="light" />
        <span className="hidden lg:inline text-[14px] font-medium tabular whitespace-nowrap">
          {CONTACTS[0].display}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Контакти"
          className="reveal absolute right-0 top-full mt-3 z-10 w-[min(22rem,calc(100vw-1.5rem))] rounded-[1.75rem] glass glass-strong bg-white/[0.97] p-1.5"
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Зв&apos;язатися з нами</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрити"
              className="w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-white/70"
            >
              <X size={14} weight="bold" />
            </button>
          </div>

          <ul className="px-1.5 pb-1.5 space-y-1.5">
            {CONTACTS.map((c, i) => (
              <li
                key={c.intl}
                className="rise rounded-[1.25rem] bg-white/80 ring-1 ring-white p-3"
                style={{ ["--i" as string]: i }}
              >
                <a
                  href={`tel:${c.intl}`}
                  className="flex items-center gap-3 px-1"
                  aria-label={`Подзвонити ${c.display}`}
                >
                  <span className="w-10 h-10 shrink-0 rounded-full bg-ink/[0.05] inline-flex items-center justify-center text-ink">
                    <PhoneCall size={18} weight="light" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold tracking-[-0.01em] text-ink tabular">
                      {c.display}
                    </span>
                    <span className="block text-xs text-muted">
                      {c.messengers ? "Дзвінок, Telegram, Viber" : "Дзвінок"}
                    </span>
                  </span>
                </a>
                <div className="mt-3 flex gap-1.5">
                  <a href={`tel:${c.intl}`} className={`${chip} bg-ink text-white`}>
                    <PhoneCall size={16} weight="bold" />
                    Дзвінок
                  </a>
                  {c.messengers && (
                    <>
                      <a
                        href={`https://t.me/${c.intl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${chip} bg-[#229ED9] text-white`}
                      >
                        <TelegramLogo size={16} weight="fill" />
                        Telegram
                      </a>
                      <a
                        href={`viber://chat?number=${encodeURIComponent(c.intl)}`}
                        className={`${chip} bg-[#7360F2] text-white`}
                      >
                        <ChatCircleDots size={16} weight="fill" />
                        Viber
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
