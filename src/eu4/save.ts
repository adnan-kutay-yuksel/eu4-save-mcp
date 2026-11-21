/** Loading EU4 saves: format detection, unzip, rakaly melt, parsing, caching. */
import fs from "node:fs";
import path from "node:path";
import { all, isObject, num, one, parseClausewitz, str, yes, type PObject, type PValue } from "../core/clausewitz.js";
import { listFiles, type FileInfo } from "../core/platform.js";
import { meltWithRakaly } from "../core/rakaly.js";
import { looksLikeZip, ZipReader } from "../core/zip.js";
import { eu4SaveDirs } from "./paths.js";

export type SaveEncoding = "text" | "text-zip" | "binary" | "binary-zip" | "unknown";

export interface SaveMeta {
  date?: string;
  player?: string;
  displayedCountryName?: string;
  version?: string;
  versionNumbers?: { major: number; minor: number; patch: number; build: number; name?: string };
  ironman: boolean;
  multiplayer: boolean;
  campaignId?: string;
  dlcs: string[];
  mods: string[];
  playersCountries: { player: string; tag: string }[];
  encoding: SaveEncoding;
}

export interface LoadedSave {
  file: string;
  size: number;
  modified: Date;
  meta: SaveMeta;
  game: PObject;
  encoding: SaveEncoding;
  melted: boolean;
  loadMs: number;
  partial: boolean;
}

const MAGIC_TXT = "EU4txt";
const MAGIC_BIN = "EU4bin";

export function detectEncoding(buf: Buffer): SaveEncoding {
  const head = buf.toString("latin1", 0, 6);
  if (head === MAGIC_TXT) return "text";
  if (head === MAGIC_BIN) return "binary";
  if (looksLikeZip(buf)) {
    const z = ZipReader.tryOpen(buf);
    if (!z) return "unknown";
    const entry = z.has("meta") ? "meta" : "gamestate";
    try {
      const h = z.read(entry).toString("latin1", 0, 6);
      return h === MAGIC_BIN ? "binary-zip" : "text-zip";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

function stripMagic(b: Buffer): Buffer {
  const h = b.toString("latin1", 0, 6);
  return h === MAGIC_TXT || h === MAGIC_BIN ? b.subarray(6) : b;
}

function versionOf(v: PValue | undefined): SaveMeta["versionNumbers"] | undefined {
  if (!isObject(v)) return undefined;
  const major = num(v["first"]), minor = num(v["second"]), patch = num(v["third"]);
  const build = num(v["forth"] ?? v["fourth"]);
  return { major, minor, patch, build, name: str(v["name"]) };
}

export function extractMeta(meta: PObject, encoding: SaveEncoding): SaveMeta {
  const vn = versionOf(meta["savegame_version"]);
  const pc = meta["players_countries"];
  const playersCountries: SaveMeta["playersCountries"] = [];
  if (Array.isArray(pc)) {
    for (let i = 0; i + 1 < pc.length; i += 2) playersCountries.push({ player: String(pc[i]), tag: String(pc[i + 1]) });
  }
  const list = (v: PValue | undefined) => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);
  return {
    date: str(meta["date"]),
    player: str(meta["player"]),
    displayedCountryName: str(meta["displayed_country_name"]),
    version: vn ? `${vn.major}.${vn.minor}.${vn.patch}.${vn.build}${vn.name ? ` (${vn.name})` : ""}` : undefined,
    versionNumbers: vn,
    ironman: yes(meta["is_ironman"]) || yes(meta["ironman"]),
    multiplayer: yes(meta["multi_player"]) || yes(meta["multiplayer"]),
    campaignId: str(meta["campaign_id"]),
    dlcs: list(meta["dlc_enabled"]),
    mods: [...list(meta["mods_enabled_names"]), ...list(meta["mod_enabled"])].filter(Boolean),
    playersCountries,
    encoding,
  };
}

/** Skip heavy sub-trees we never analyse. `player` keeps their relations. */
function makeSkip(player?: string) {
  const TOP = new Set([
    "map_area_data", "trade", "active_advisors", "combat", "id_counters", "fired_events", "pending_events",
    "change_price", "tech_level_dates", "idea_dates", "great_projects", "mercenary_companies", "trade_company_manager",
    "religion_instance_data", "production_leader_tag", "dynamic_province_names", "region_data", "rebel_faction_groups",
  ]);
  const COUNTRY = new Set([
    "flags", "hidden_flags", "variables", "interesting_countries", "ai", "colors", "modifier", "triggered_modifier",
    "active_loyalty_modifiers", "changed_country_mapcolor_from", "unit_template", "previous_country_tags",
    "adm_spent_indexed", "dip_spent_indexed", "mil_spent_indexed", "parliament", "tribute_type", "trade_league",
    "cooldowns", "subject_interactions", "native_policy", "hostile_mana_cost_decrease", "rebel_threat",
    "last_sent_alliance_offer", "rival_change_date", "spy_propensity", "ignore_decision", "harmonized_religions",
    "mission_slot", "estimated_monthly_income", "army_strength_last_update",
  ]);
  const PROVINCE = new Set([
    "history", "discovered_dates", "discovered_by", "flags", "variables", "modifier", "triggered_modifier",
    "patrol", "rebel_faction", "unit", "fort_influencing", "great_projects", "latent_trade_goods", "institutions",
  ]);
  return (p: readonly string[]): boolean => {
    const d = p.length;
    if (d === 1) return TOP.has(p[0]);
    if (d === 3 && p[0] === "countries") {
      if (p[2] === "active_relations") return p[1] !== player;
      return COUNTRY.has(p[2]);
    }
    if (d === 3 && p[0] === "provinces") return PROVINCE.has(p[2]);
    if (d === 3 && p[0] === "previous_war") return p[2] === "history";
    return false;
  };
}

/** Read just the header/meta block of a save (fast; used for listing). */
export function readSaveMeta(file: string): SaveMeta {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(6);
    fs.readSync(fd, head, 0, 6, 0);
    const magic = head.toString("latin1");
    if (magic === MAGIC_TXT) {
      const chunk = Buffer.alloc(Math.min(fs.fstatSync(fd).size, 256 * 1024));
      fs.readSync(fd, chunk, 0, chunk.length, 0);
      // stop at the first heavy section so a truncated chunk still parses cleanly
      const cut = chunk.indexOf("\nmap_area_data");
      const meta = parseClausewitz(stripMagic(cut > 0 ? chunk.subarray(0, cut) : chunk), {
        encoding: "latin1",
        skip: (p) => p.length === 1 && ["gameplaysettings", "speed", "multiplayer_random_seed"].includes(p[0]),
      });
      return extractMeta(meta, "text");
    }
  } finally {
    fs.closeSync(fd);
  }
  const buf = fs.readFileSync(file);
  const enc = detectEncoding(buf);
  if (enc === "text-zip" || enc === "binary-zip") {
    const z = new ZipReader(buf);
    if (enc === "text-zip" && z.has("meta")) {
      return extractMeta(parseClausewitz(stripMagic(z.read("meta")), { encoding: "latin1" }), enc);
    }
    return { ...emptyMeta(enc), ironman: enc === "binary-zip" };
  }
  return { ...emptyMeta(enc), ironman: enc === "binary" };
}

function emptyMeta(encoding: SaveEncoding): SaveMeta {
  return { ironman: false, multiplayer: false, dlcs: [], mods: [], playersCountries: [], encoding };
}

/** Returns plaintext gamestate (+meta) bytes for any supported save. */
async function plaintextOf(file: string, buf: Buffer): Promise<{ text: Buffer; meta?: Buffer; encoding: SaveEncoding; melted: boolean }> {
  const encoding = detectEncoding(buf);
  switch (encoding) {
    case "text":
      return { text: stripMagic(buf), encoding, melted: false };
    case "text-zip": {
      const z = new ZipReader(buf);
      return { text: stripMagic(z.read("gamestate")), meta: z.has("meta") ? stripMagic(z.read("meta")) : undefined, encoding, melted: false };
    }
    case "binary":
    case "binary-zip": {
      const melted = await meltWithRakaly(file, "eu4");
      return { text: stripMagic(melted), encoding, melted: true };
    }
    default:
      throw new Error(`${path.basename(file)} does not look like an EU4 save (unknown header).`);
  }
}

const cache = new Map<string, LoadedSave>();
let lastLoaded: string | undefined;

export function lastLoadedPath(): string | undefined {
  return lastLoaded;
}

export async function loadSave(file: string, opts: { full?: boolean } = {}): Promise<LoadedSave> {
  const st = fs.statSync(file);
  const key = `${file}|${st.size}|${st.mtimeMs}|${opts.full ? "full" : "std"}`;
  const hit = cache.get(key);
  if (hit) {
    lastLoaded = file;
    return hit;
  }
  const t0 = Date.now();
  const buf = fs.readFileSync(file);
  const { text, meta: metaBuf, encoding, melted } = await plaintextOf(file, buf);
  // the player tag lets us keep their diplomatic relations while skipping everyone else's
  let player: string | undefined;
  const m = text.subarray(0, 4096).toString("latin1").match(/\nplayer="?([A-Z0-9-]{3})"?/);
  if (m) player = m[1];
  else if (metaBuf) player = metaBuf.toString("latin1").match(/player="?([A-Z0-9-]{3})"?/)?.[1];
  const game = parseClausewitz(text, { encoding: "latin1", skip: opts.full ? undefined : makeSkip(player) });
  let metaObj: PObject = game;
  if (metaBuf) metaObj = { ...parseClausewitz(metaBuf, { encoding: "latin1" }), players_countries: game["players_countries"] ?? [] };
  const meta = extractMeta(metaObj, encoding);
  if (melted) meta.ironman = meta.ironman || encoding !== "text";
  const loaded: LoadedSave = {
    file, size: st.size, modified: st.mtime, meta, game, encoding, melted, loadMs: Date.now() - t0, partial: !opts.full,
  };
  // keep the cache small: saves can be big
  if (cache.size >= 2) cache.delete(cache.keys().next().value!);
  cache.set(key, loaded);
  lastLoaded = file;
  return loaded;
}

export function findSaves(extraDir?: string): (FileInfo & { dirKind: string })[] {
  const dirs = eu4SaveDirs();
  if (extraDir) dirs.unshift({ path: extraDir, kind: "requested" });
  const out: (FileInfo & { dirKind: string })[] = [];
  const seen = new Set<string>();
  for (const d of dirs) {
    for (const f of listFiles(d.path, [".eu4"], true)) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      out.push({ ...f, dirKind: d.kind });
    }
  }
  return out.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

/** Resolve "latest", a bare file name, or a path into an absolute save path. */
export function resolveSavePath(input?: string): string {
  if (!input || input === "latest") {
    const last = lastLoaded;
    if (!input && last) return last;
    const saves = findSaves();
    if (!saves.length) {
      throw new Error("No EU4 saves found. Use eu4_environment to see where I looked, or pass a full path / set EU4_SAVE_DIR.");
    }
    return saves[0].path;
  }
  if (fs.existsSync(input)) return path.resolve(input);
  const lower = input.toLowerCase();
  const match = findSaves().find((s) => s.name.toLowerCase() === lower || s.name.toLowerCase() === `${lower}.eu4` || s.name.toLowerCase().includes(lower));
  if (match) return match.path;
  throw new Error(`Save not found: ${input}. Call eu4_list_saves to see available saves.`);
}

// ---------- small accessors shared by analysis ----------

export function countries(game: PObject): Record<string, PObject> {
  const c = game["countries"];
  if (!isObject(c)) return {};
  const out: Record<string, PObject> = {};
  for (const [tag, v] of Object.entries(c)) {
    const obj = isObject(v) ? v : Array.isArray(v) ? (v.find(isObject) as PObject | undefined) : undefined;
    if (obj) out[tag] = obj;
  }
  return out;
}

/** Countries that still exist (own at least one province). */
export function livingCountries(game: PObject): [string, PObject][] {
  return Object.entries(countries(game)).filter(([tag, c]) => tag !== "---" && num(c["num_of_cities"]) > 0);
}

export function provinces(game: PObject): [string, PObject][] {
  const p = game["provinces"];
  if (!isObject(p)) return [];
  return Object.entries(p)
    .filter(([, v]) => isObject(v))
    .map(([k, v]) => [k.replace(/^-/, ""), v as PObject]);
}

export { all, one };
