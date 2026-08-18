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
// The typed digits are clamped to `max` (available stock) as you type,
// not silently after the fact — typing "50" against 20 in stock snaps the
// displayed number to 20 right away, with a small note underneath, instead
// of showing "50" until you confirm and only then jumping to 20 with no
// explanation.
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
  const [clamped, setClamped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = draft ?? String(value);

  return (
    <span className="inline-flex items-center gap-1 relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={shown}
        onFocus={(e) => {
          setEditing(true);
          setClamped(false);
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
          if (digits === "") {
            setDraft("");
            setClamped(false);
            return;
          }
          let n = Math.floor(Number(digits));
          if (!Number.isFinite(n)) return;
          const overMax = n > max;
          if (overMax) n = max;
          if (n < min) n = min;
          // Show exactly what was committed, not the raw keystrokes, so
          // the field never displays a number bigger than what's in stock.
          setDraft(String(n));
          setClamped(overMax);
          onChange(n);
        }}
        onBlur={() => {
          if (draft !== null && draft.trim() === "") onChange(min);
          setDraft(null);
          setEditing(false);
          setClamped(false);
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
      {clamped && (
        <span className="absolute top-full left-0 mt-0.5 text-[10px] text-amber-600 whitespace-nowrap z-10">
          максимум: {max}
        </span>
      )}
    </span>
  );
}
