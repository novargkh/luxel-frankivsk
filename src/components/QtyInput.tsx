"use client";

import { useRef, useState } from "react";

// A plain controlled <input type="number"> bound straight to a numeric qty
// can't be cleared: typing backspace to empty it fires onChange("") ->
// Number("")=0 -> the parent sets qty back to 0 -> the input's value prop
// is "0" again, so React snaps the DOM right back and the field never
// actually empties. This keeps its own draft text while focused so the
// field can go blank, and only commits (clamped to [min, max]) once
// there's a real number typed; blurring empty falls back to `min`.
//
// Tapping a cell that already has a non-zero value should NOT clear it —
// only the "empty"/zero state clears on focus so it's ready to type over;
// an already-entered quantity just gets a cursor placed at the end,
// ready to edit. A small "OK" button appears next to the field while it's
// being edited, so the person can explicitly confirm the typed quantity
// (tapping it just blurs the field, which commits the draft the same way
// tabbing away would).
//
// Plain <input type="number"> doesn't support programmatic cursor
// placement in most browsers (setSelectionRange throws on it), so this
// uses a numeric-mode text input instead.
export default function QtyInput({
  value,
  min = 0,
  max,
  disabled,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = draft ?? String(value);

  function commit(raw: string) {
    if (raw.trim() === "") return;
    let n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    if (n < min) n = min;
    if (n > max) n = max;
    onChange(n);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={shown}
        onFocus={(e) => {
          setEditing(true);
          if (value === 0) {
            setDraft("");
            return;
          }
          // Cursor goes to the end of the existing digits instead of
          // clearing them — the value stays, ready to edit.
          const el = e.currentTarget;
          requestAnimationFrame(() => {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          });
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          setDraft(digits);
          commit(digits);
        }}
        onBlur={() => {
          if (draft !== null && draft.trim() === "") onChange(min);
          setDraft(null);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={className}
      />
      {editing && (
        <button
          type="button"
          // onMouseDown (not onClick) fires before the input's onBlur, so
          // this reliably confirms instead of racing a blur-driven close.
          onMouseDown={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
          }}
          className="shrink-0 text-xs font-medium bg-brand text-white rounded px-2 py-1 hover:bg-brand-dark"
          title="Підтвердити кількість"
        >
          OK
        </button>
      )}
    </span>
  );
}
