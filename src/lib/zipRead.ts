import zlib from "zlib";

// Minimal ZIP reader for the archives BAF sends during the exchange
// (zip=yes): reads the central directory and inflates the entries we want.
// Supports "stored" and "deflate" entries, which is what 1C/BAF writes.

export type ZipEntry = { name: string; data: Buffer };

export function readZip(buf: Buffer, want: (name: string) => boolean): ZipEntry[] {
  // End of central directory record: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Архів пошкоджений або неповний (немає каталогу ZIP)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Архів пошкоджений (запис каталогу)");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    // Bit 11 = UTF-8 names; 1C sometimes writes cp866, but our files are ASCII.
    const name = (flags & 0x800 ? rawName.toString("utf8") : rawName.toString("latin1")).replace(/\\/g, "/");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/") || !want(name)) continue;
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(start, start + compSize);
    const data = method === 0 ? Buffer.from(comp) : method === 8 ? zlib.inflateRawSync(comp) : null;
    if (!data) throw new Error(`Непідтримуваний спосіб стиснення в архіві: ${method}`);
    out.push({ name, data });
  }
  return out;
}
