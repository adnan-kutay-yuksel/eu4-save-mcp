/**
 * Minimal read-only ZIP reader (store / deflate / zstd) with support for ZIPs
 * that are appended to a prefix (EU5 saves put a header + metadata before the
 * archive). No external dependencies besides an optional zstd fallback.
 */
import zlib from "node:zlib";
import { decompress as fzstdDecompress } from "fzstd";

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export function looksLikeZip(buf: Buffer, offset = 0): boolean {
  return buf.length >= offset + 4 && buf.readUInt32LE(offset) === LOC_SIG;
}

/** Find the byte offset of the first local file header ("PK\x03\x04"). */
export function findZipStart(buf: Buffer, from = 0): number {
  return buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), from);
}

export class ZipReader {
  readonly entries: ZipEntry[] = [];
  private base = 0;

  constructor(private readonly buf: Buffer) {
    this.readCentralDirectory();
  }

  static tryOpen(buf: Buffer): ZipReader | null {
    try {
      const z = new ZipReader(buf);
      return z.entries.length ? z : null;
    } catch {
      return null;
    }
  }

  private readCentralDirectory(): void {
    const b = this.buf;
    const minPos = Math.max(0, b.length - 65557);
    let eocd = -1;
    for (let i = b.length - 22; i >= minPos; i--) {
      if (b.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Not a zip archive (no end-of-central-directory record)");
    const count = b.readUInt16LE(eocd + 10);
    const cdSize = b.readUInt32LE(eocd + 12);
    const cdOffset = b.readUInt32LE(eocd + 16);
    // If the zip was appended to a prefix, offsets are relative to the zip start.
    const actualCdStart = eocd - cdSize;
    this.base = actualCdStart - cdOffset;
    let p = actualCdStart;
    for (let i = 0; i < count; i++) {
      if (b.readUInt32LE(p) !== CEN_SIG) throw new Error("Corrupt zip central directory");
      const method = b.readUInt16LE(p + 10);
      const compressedSize = b.readUInt32LE(p + 20);
      const uncompressedSize = b.readUInt32LE(p + 24);
      const nameLen = b.readUInt16LE(p + 28);
      const extraLen = b.readUInt16LE(p + 30);
      const commentLen = b.readUInt16LE(p + 32);
      const localHeaderOffset = b.readUInt32LE(p + 42);
      const name = b.toString("utf8", p + 46, p + 46 + nameLen);
      this.entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  has(name: string): boolean {
    return this.entries.some((e) => e.name === name);
  }

  read(name: string): Buffer {
    const e = this.entries.find((x) => x.name === name);
    if (!e) throw new Error(`Zip entry not found: ${name}`);
    const b = this.buf;
    const lh = this.base + e.localHeaderOffset;
    if (b.readUInt32LE(lh) !== LOC_SIG) throw new Error(`Corrupt local header for ${name}`);
    const nameLen = b.readUInt16LE(lh + 26);
    const extraLen = b.readUInt16LE(lh + 28);
    const start = lh + 30 + nameLen + extraLen;
    const data = b.subarray(start, start + e.compressedSize);
    switch (e.method) {
      case 0:
        return Buffer.from(data);
      case 8:
        return zlib.inflateRawSync(data);
      case 93: {
        const native = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;
        if (typeof native === "function") return native(data);
        return Buffer.from(fzstdDecompress(data));
      }
      default:
        throw new Error(`Unsupported zip compression method ${e.method} for ${name}`);
    }
  }
}
