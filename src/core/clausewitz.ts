/**
 * Fast, dependency-free parser for the Paradox "Clausewitz/Jomini" plaintext
 * format used by EU4 / EU5 saves and game files.
 *
 *   key=value   key={ ... }   { 1 2 3 }   key=rgb { 1 2 3 }   # comment
 *
 * Design notes
 * - Works directly on a Buffer (bytes) to keep 100+ MB saves fast.
 * - Repeated keys are collected into a "duplicate list" (an array tagged in a
 *   WeakSet) so callers can tell `a={1 2}` (array value) from `a=1 a=2`.
 *   Use `all(obj, key)` to always get a list.
 * - A `skip` predicate lets callers drop heavy sub-trees (history, flags, ...)
 *   without materialising them, which keeps memory reasonable.
 */

export type PScalar = string | number;
export type PValue = PScalar | PObject | PValue[];
export interface PObject {
  [key: string]: PValue;
}

const dupLists = new WeakSet<object>();

export function isDupList(v: unknown): v is PValue[] {
  return Array.isArray(v) && dupLists.has(v);
}

export function isObject(v: unknown): v is PObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every value stored under `key` (handles duplicate keys). */
export function all(obj: PValue | undefined, key: string): PValue[] {
  if (!isObject(obj)) return [];
  const v = obj[key];
  if (v === undefined) return [];
  if (isDupList(v)) return v;
  return [v];
}

/** First (or only) value stored under `key`. */
export function one(obj: PValue | undefined, key: string): PValue | undefined {
  if (!isObject(obj)) return undefined;
  const v = obj[key];
  if (isDupList(v)) return v[v.length - 1];
  return v;
}

export function num(v: PValue | undefined, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function str(v: PValue | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

export function yes(v: PValue | undefined): boolean {
  return v === "yes" || v === 1 || v === "1" || v === "true";
}

/** Coerce a parsed block into a list of scalars/objects (`{1 2 3}` or `{}`). */
export function list(v: PValue | undefined): PValue[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  if (isObject(v)) {
    const items = v["$items"];
    if (Array.isArray(items)) return items;
    return Object.keys(v).length === 0 ? [] : [v];
  }
  return [v];
}

/** Walk a dotted path (`countries.FRA.ledger`) through objects/arrays. */
export function getPath(root: PValue, path: string): PValue | undefined {
  if (!path) return root;
  let cur: PValue | undefined = root;
  for (const part of path.split(".")) {
    if (cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (isObject(cur)) {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export type SkipFn = (path: readonly string[]) => boolean;

export interface ParseOptions {
  /** Text encoding of strings. EU4 uses windows-1252 (≈latin1), EU5 uses utf8. */
  encoding?: "latin1" | "utf8";
  /** Return true to skip (not materialise) the value at `path`. */
  skip?: SkipFn;
  /** Stop after these top-level keys have been parsed (fast metadata reads). */
  stopAfterTopLevel?: string[];
}

// Byte constants
const LBRACE = 0x7b, RBRACE = 0x7d, EQ = 0x3d, QUOTE = 0x22, HASH = 0x23;
const LT = 0x3c, GT = 0x3e, BANG = 0x21, QMARK = 0x3f, BSLASH = 0x5c;

function isWs(c: number): boolean {
  return c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x3b /* ; */ || c === 0x0c;
}

function isDelim(c: number): boolean {
  return (
    isWs(c) || c === LBRACE || c === RBRACE || c === EQ || c === QUOTE ||
    c === HASH || c === LT || c === GT || c === BANG || c === QMARK
  );
}

const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

class Parser {
  pos = 0;
  readonly path: string[] = [];
  private stopKeys?: Set<string>;
  stopped = false;

  constructor(
    private readonly buf: Buffer,
    private readonly enc: "latin1" | "utf8",
    private readonly skip?: SkipFn,
    stopAfter?: string[],
  ) {
    if (stopAfter && stopAfter.length) this.stopKeys = new Set(stopAfter);
  }

  private skipWsAndComments(): void {
    const b = this.buf;
    const n = b.length;
    let p = this.pos;
    while (p < n) {
      const c = b[p];
      if (isWs(c)) {
        p++;
      } else if (c === HASH) {
        while (p < n && b[p] !== 0x0a) p++;
      } else {
        break;
      }
    }
    this.pos = p;
  }

  /** Read a quoted or bare token. Returns [text, quoted]. */
  private readToken(): [string, boolean] {
    const b = this.buf;
    const n = b.length;
    let p = this.pos;
    if (b[p] === QUOTE) {
      p++;
      const start = p;
      let hasEscape = false;
      while (p < n && b[p] !== QUOTE) {
        if (b[p] === BSLASH && p + 1 < n) {
          hasEscape = true;
          p += 2;
        } else p++;
      }
      let s = b.toString(this.enc, start, Math.min(p, n));
      if (hasEscape) s = s.replace(/\\(["\\])/g, "$1");
      this.pos = p + 1;
      return [s, true];
    }
    const start = p;
    while (p < n && !isDelim(b[p])) p++;
    if (p === start) {
      // lone delimiter we don't understand: consume one byte to make progress
      this.pos = p + 1;
      return [String.fromCharCode(b[p] ?? 0), false];
    }
    this.pos = p;
    return [b.toString(this.enc, start, p), false];
  }

  /** Consume an operator if present. Returns it, or null. */
  private readOperator(): string | null {
    const b = this.buf;
    const c = b[this.pos];
    const d = b[this.pos + 1];
    if (c === EQ) {
      if (d === EQ) { this.pos += 2; return "=="; }
      this.pos++;
      return "=";
    }
    if (c === LT || c === GT) {
      if (d === EQ) { this.pos += 2; return c === LT ? "<=" : ">="; }
      this.pos++;
      return c === LT ? "<" : ">";
    }
    if ((c === BANG || c === QMARK) && d === EQ) {
      this.pos += 2;
      return c === BANG ? "!=" : "?=";
    }
    return null;
  }

  private scalar(tok: string, quoted: boolean): PScalar {
    if (!quoted && tok.length < 20 && NUM_RE.test(tok)) return Number(tok);
    return tok;
  }

  /** Skip a value without building it. */
  private skipValue(): void {
    this.skipWsAndComments();
    const b = this.buf;
    const n = b.length;
    if (b[this.pos] !== LBRACE) {
      const [tok] = this.readToken();
      if (tok === "rgb" || tok === "hsv" || tok === "hsv360") {
        this.skipWsAndComments();
        if (b[this.pos] === LBRACE) this.skipValue();
      }
      return;
    }
    let depth = 0;
    let p = this.pos;
    while (p < n) {
      const c = b[p];
      if (c === QUOTE) {
        p++;
        while (p < n && b[p] !== QUOTE) p += b[p] === BSLASH ? 2 : 1;
      } else if (c === LBRACE) depth++;
      else if (c === RBRACE) {
        depth--;
        if (depth === 0) { p++; break; }
      }
      p++;
    }
    this.pos = p;
  }

  parseValue(): PValue {
    this.skipWsAndComments();
    const b = this.buf;
    if (b[this.pos] === LBRACE) {
      this.pos++;
      return this.parseBlock(true);
    }
    const [tok, quoted] = this.readToken();
    if (!quoted && (tok === "rgb" || tok === "hsv" || tok === "hsv360")) {
      const save = this.pos;
      this.skipWsAndComments();
      if (b[this.pos] === LBRACE) {
        this.pos++;
        const inner = this.parseBlock(true);
        return { [tok]: inner };
      }
      this.pos = save;
    }
    return this.scalar(tok, quoted);
  }

  parseBlock(nested: boolean): PValue {
    const b = this.buf;
    const n = b.length;
    let obj: PObject | null = null;
    let items: PValue[] | null = null;
    const depth = this.path.length;

    while (true) {
      this.skipWsAndComments();
      if (this.pos >= n) break;
      const c = b[this.pos];
      if (c === RBRACE) {
        this.pos++;
        if (nested) break;
        continue; // stray closing brace at top level (EU4 has these)
      }
      if (c === LBRACE) {
        this.pos++;
        this.path.push(String(items ? items.length : 0));
        const v = this.parseBlock(true);
        this.path.pop();
        (items ??= []).push(v);
        // EU5 uses blocks as keys: `{ ... }=yes` — consume and drop the value
        this.skipWsAndComments();
        if (b[this.pos] === EQ && b[this.pos + 1] !== EQ) {
          this.pos++;
          this.skipValue();
        }
        continue;
      }
      const [tok, quoted] = this.readToken();
      this.skipWsAndComments();
      const save = this.pos;
      let op = this.readOperator();
      if (!op && !quoted && b[this.pos] === LBRACE && tok !== "rgb" && tok !== "hsv") {
        op = "="; // `key{ ... }` without '=' (seen in EU4: map_area_data{)
      }
      if (!op) {
        this.pos = save;
        (items ??= []).push(this.scalar(tok, quoted));
        continue;
      }
      this.path.push(tok);
      let value: PValue | undefined;
      if (this.skip && this.skip(this.path)) {
        this.skipValue();
      } else {
        value = this.parseValue();
        if (op !== "=") value = { [op]: value } as PObject;
      }
      this.path.pop();
      if (value !== undefined) {
        obj ??= {};
        const prev = obj[tok];
        if (prev === undefined) {
          obj[tok] = value;
        } else if (isDupList(prev)) {
          prev.push(value);
        } else {
          const lst: PValue[] = [prev, value];
          dupLists.add(lst);
          obj[tok] = lst;
        }
      }
      if (depth === 0 && this.stopKeys && this.stopKeys.has(tok)) {
        this.stopKeys.delete(tok);
        if (this.stopKeys.size === 0) {
          this.stopped = true;
          break;
        }
      }
    }

    if (obj && items) {
      obj["$items"] = items;
      return obj;
    }
    if (obj) return obj;
    if (items) return items;
    return {};
  }
}

/** Parse a plaintext Clausewitz document into a JS object tree. */
export function parseClausewitz(input: Buffer | string, opts: ParseOptions = {}): PObject {
  const buf = typeof input === "string" ? Buffer.from(input, opts.encoding ?? "utf8") : input;
  const p = new Parser(buf, opts.encoding ?? "utf8", opts.skip, opts.stopAfterTopLevel);
  const root = p.parseBlock(false);
  return isObject(root) ? root : { $items: root as PValue[] };
}

/** JSON-safe, size-limited rendering of a sub-tree (for generic query tools). */
export function preview(v: PValue | undefined, maxDepth = 3, maxKeys = 60): unknown {
  if (v === undefined) return null;
  if (typeof v !== "object") return v;
  if (maxDepth <= 0) {
    if (Array.isArray(v)) return `[array(${v.length})]`;
    return `{object(${Object.keys(v).length} keys)}`;
  }
  if (Array.isArray(v)) {
    const out = v.slice(0, maxKeys).map((x) => preview(x, maxDepth - 1, maxKeys));
    if (v.length > maxKeys) out.push(`… ${v.length - maxKeys} more`);
    return out;
  }
  const out: Record<string, unknown> = {};
  const keys = Object.keys(v);
  for (const k of keys.slice(0, maxKeys)) out[k] = preview(v[k], maxDepth - 1, maxKeys);
  if (keys.length > maxKeys) out["…"] = `${keys.length - maxKeys} more keys`;
  return out;
}

/** Search keys (and optionally scalar values) matching a pattern. */
export function searchTree(
  root: PValue,
  pattern: RegExp,
  opts: { values?: boolean; limit?: number; maxDepth?: number } = {},
): { path: string; value: unknown }[] {
  const limit = opts.limit ?? 50;
  const maxDepth = opts.maxDepth ?? 8;
  const hits: { path: string; value: unknown }[] = [];
  const walk = (v: PValue, path: string, depth: number) => {
    if (hits.length >= limit || depth > maxDepth) return;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && hits.length < limit; i++) walk(v[i], path ? `${path}.${i}` : String(i), depth + 1);
      return;
    }
    if (isObject(v)) {
      for (const k of Object.keys(v)) {
        if (hits.length >= limit) return;
        const p = path ? `${path}.${k}` : k;
        const child = v[k];
        if (pattern.test(k)) hits.push({ path: p, value: preview(child, 1, 12) });
        else if (opts.values && (typeof child === "string" || typeof child === "number") && pattern.test(String(child)))
          hits.push({ path: p, value: child });
        if (typeof child === "object") walk(child, p, depth + 1);
      }
    }
  };
  walk(root, "", 0);
  return hits;
}
