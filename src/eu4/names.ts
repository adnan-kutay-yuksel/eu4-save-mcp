/**
 * Human readable names for country tags / provinces / unit types.
 * Uses the user's installed game files when available (accurate for any mod
 * or version), otherwise a built-in table of common tags.
 */
import fs from "node:fs";
import path from "node:path";
import { parseClausewitz, str, isObject } from "../core/clausewitz.js";
import { eu4DataRoot, eu4GameDirs, eu4Language } from "./paths.js";

const BUILTIN: Record<string, string> = {
  ENG: "England", GBR: "Great Britain", SCO: "Scotland", IRE: "Ireland", FRA: "France", BUR: "Burgundy", BRI: "Brittany",
  PRO: "Provence", SPA: "Spain", CAS: "Castile", ARA: "Aragon", POR: "Portugal", NAV: "Navarre", GRA: "Granada",
  HAB: "Austria", BOH: "Bohemia", HUN: "Hungary", POL: "Poland", LIT: "Lithuania", PLC: "Polish-Lithuanian Commonwealth",
  BRA: "Brandenburg", PRU: "Prussia", TEU: "Teutonic Order", LIV: "Livonian Order", SAX: "Saxony", BAV: "Bavaria",
  PAL: "The Palatinate", HAN: "Hannover", HOL: "Holland", NED: "Netherlands", FLA: "Flanders", SWI: "Switzerland",
  GER: "Germany", HLR: "Holy Roman Empire", ITA: "Italy", VEN: "Venice", MLO: "Milan", SAV: "Savoy", GEN: "Genoa",
  TUS: "Tuscany", FIR: "Florence", PAP: "Papal State", NAP: "Naples", SIC: "Sicily", KNI: "The Knights",
  DAN: "Denmark", SWE: "Sweden", NOR: "Norway", SCA: "Scandinavia", FIN: "Finland", MOS: "Muscovy", RUS: "Russia",
  NOV: "Novgorod", PSK: "Pskov", TVE: "Tver", RYA: "Ryazan", KAZ: "Kazan", CRI: "Crimea", GOL: "Golden Horde",
  NOG: "Nogai", AST: "Astrakhan", UKR: "Ukraine", MOL: "Moldavia", WAL: "Wallachia", BYZ: "Byzantium", TUR: "Ottomans",
  SER: "Serbia", BOS: "Bosnia", ALB: "Albania", ATH: "Athens", EPI: "Epirus", GRE: "Greece", BUL: "Bulgaria",
  MAM: "Mamluks", EGY: "Egypt", TUN: "Tunis", ALG: "Algiers", MOR: "Morocco", TRP: "Tripoli", ETH: "Ethiopia",
  ADA: "Adal", MAL: "Mali", SON: "Songhai", KON: "Kongo", ZIM: "Zimbabwe", KIL: "Kilwa",
  PER: "Persia", TIM: "Timurids", QAR: "Qara Qoyunlu", AKK: "Aq Qoyunlu", SHI: "Shirvan", GEO: "Georgia",
  ARM: "Armenia", HED: "Hejaz", YEM: "Yemen", OMA: "Oman",
  MUG: "Mughals", DLH: "Delhi", BAH: "Bahmanis", VIJ: "Vijayanagar", BNG: "Bengal", GUJ: "Gujarat", MAR: "Marathas",
  ORI: "Orissa", JNP: "Jaunpur", MLW: "Malwa", RAJ: "Rajputana", MYS: "Mysore", HIN: "Hindustan", BHA: "Bharat",
  MNG: "Ming", QNG: "Qing", MCH: "Manchu", JAP: "Japan", KOR: "Korea", ODA: "Oda", ASH: "Ashikaga", DAI: "Dai Viet",
  AYU: "Ayutthaya", SIA: "Siam", MAJ: "Majapahit", MLC: "Malacca", BRU: "Brunei", ATJ: "Aceh", TAU: "Taungu",
  KHM: "Khmer", OIR: "Oirat", KHA: "Mongolia", YUA: "Yuan", CHG: "Chagatai", TIB: "Tibet",
  AZT: "Aztec", MAY: "Maya", INC: "Inca", HUR: "Huron", IRO: "Iroquois", CHE: "Cherokee", USA: "United States",
  MEX: "Mexico", CAN: "Canada", QUE: "Quebec", COL: "Colombia", PEU: "Peru", LAP: "La Plata", BRZ: "Brazil",
  REB: "Rebels", NAT: "Natives", PIR: "Pirates",
};

let cache: { tags: Map<string, string>; provinces: Map<string, string>; adjectives: Map<string, string> } | null = null;

function loadLocalisation(): typeof cache {
  const tags = new Map<string, string>();
  const provinces = new Map<string, string>();
  const adjectives = new Map<string, string>();
  const lang = eu4Language();
  for (const g of eu4GameDirs()) {
    const root = path.join(eu4DataRoot(g), "localisation");
    let files: string[] = [];
    try { files = fs.readdirSync(root); } catch { continue; }
    const wanted = files.filter((f) => f.endsWith(`_l_${lang}.yml`));
    const use = wanted.length ? wanted : files.filter((f) => f.endsWith("_l_english.yml"));
    for (const f of use) {
      let txt = "";
      try { txt = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
      for (const m of txt.matchAll(/^\s*([A-Z][A-Z0-9]{2}|PROV\d+|[A-Z][A-Z0-9]{2}_ADJ):\d*\s+"([^"\n]*)"/gm)) {
        const [, key, val] = m;
        if (key.startsWith("PROV")) provinces.set(key.slice(4), val);
        else if (key.endsWith("_ADJ")) adjectives.set(key.slice(0, 3), val);
        else if (!tags.has(key)) tags.set(key, val);
      }
    }
    if (tags.size) break;
  }
  return { tags, provinces, adjectives };
}

function loc() {
  if (!cache) cache = loadLocalisation();
  return cache!;
}

export function hasGameLocalisation(): boolean {
  return loc()!.tags.size > 0;
}

export function countryName(tag: string, customName?: string): string {
  if (customName) return customName;
  return loc()!.tags.get(tag) ?? BUILTIN[tag] ?? tag;
}

export function provinceName(id: string, saveName?: string): string {
  return saveName ?? loc()!.provinces.get(id) ?? `Province ${id}`;
}

/** Unit type → category (infantry/cavalry/artillery/heavy_ship/...) from game files. */
let unitCache: Map<string, string> | null = null;
export function unitCategory(type: string): string {
  if (!unitCache) {
    unitCache = new Map();
    for (const g of eu4GameDirs()) {
      const dir = path.join(eu4DataRoot(g), "common", "units");
      let files: string[] = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        try {
          const parsed = parseClausewitz(fs.readFileSync(path.join(dir, f)), { encoding: "latin1" });
          const t = str(parsed["type"]);
          if (t) unitCache.set(f.replace(/\.txt$/, ""), t);
          else for (const [k, v] of Object.entries(parsed)) if (isObject(v) && str(v["type"])) unitCache.set(k, str(v["type"])!);
        } catch { /* ignore */ }
      }
      if (unitCache.size) break;
    }
  }
  const known = unitCache.get(type);
  if (known) return known;
  const t = type.toLowerCase();
  if (/artillery|cannon|bombard|culverin|howitzer|_gun|mortar|_battery/.test(t)) return "artillery";
  if (/cavalry|knight|horse|hussar|cuirassier|dragoon|lancer|mamluk|sipahi|cossack|horsem|rider|camel|elephant|keshik|raider|cataphract|gendarme|caracolle|chevauchee|galoop|reiter|carabinier|steppe|charge|mounted|cavalier|chariot/.test(t)) return "cavalry";
  if (/galleass|galley|chebeck|archipelago|xebec|war_galley|zambuk|djong|longship/.test(t)) return "galley";
  if (/carrack|galleon|man_of_war|ship_of_the_line|threedecker|twodecker|wargalleon|heavy/.test(t)) return "heavy_ship";
  if (/barque|caravel|frigate|carrack_light|light|sloop|corvette|brig$/.test(t)) return "light_ship";
  if (/cog|flute|merchant|transport|eastindiaman|trabakul|fluyt|brig|cargo/.test(t)) return "transport";
  return "infantry";
}
