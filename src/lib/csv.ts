// Small shared CSV-export helper (semicolon-delimited + UTF-8 BOM, which is
// what makes Cyrillic text open correctly in Excel's default locale-aware
// CSV import — the format already used for the coverage-map export).
export function toCsvValue(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = "﻿" + rows.map((row) => row.map(toCsvValue).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
