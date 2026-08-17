"use client";

import { useState } from "react";

// A plain controlled <input type="number"> bound straight to a numeric qty
// can't be cleared: typing backspace to empty it fires onChange("") ->
// Number("")=0 -> the parent sets qty back to 0 -> the input's value prop
// is "0" again, so React snaps the DOM right back and the field never
// actually empties. This keeps its own draft text while focused so the
// field can go blank, and only commits (clamped to [min, max]) once
// there's a real number typed; blurring empty falls back to `min`.
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
    <input
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      value={shown}
      onFocus={() => setDraft("")}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null && draft.trim() === "") onChange(min);
        setDraft(null);
      }}
      className={className}
    />
  );
}
