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

// Parses CSV text into rows of string cells, auto-detecting the delimiter
// (comma or semicolon — Excel exports and hand-made price lists use either)
// and handling quoted fields ("..." with "" for an escaped quote). Strips a
// leading UTF-8 BOM if present.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? undefined : clean.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c === "\r") {
      // skip — \r\n line endings are handled by the following \n
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
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
