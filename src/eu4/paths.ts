/** Where EU4 lives on each OS: user dir (saves), Steam Cloud copies, game install. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  documentsDirs, exists, expandHome, isDir, osKind, readLauncherVersion, steamLibraries, steamUserDataDirs,
} from "../core/platform.js";

export const EU4_APP_ID = 236850;
const GAME_FOLDER = "Europa Universalis IV";

/** Candidate user directories (contain `save games`, `settings.txt`, mods). */
export function eu4UserDirs(): string[] {
  const out: string[] = [];
  if (process.env.EU4_USER_DIR) out.push(expandHome(process.env.EU4_USER_DIR));
  for (const d of documentsDirs()) out.push(path.join(d, "Paradox Interactive", GAME_FOLDER));
  if (osKind() === "linux") {
    out.push(path.join(os.homedir(), ".local", "share", "Paradox Interactive", GAME_FOLDER));
  }
  // userdir.txt in the game folder can redirect the user dir
  for (const g of eu4GameDirs()) {
    try {
      const custom = fs.readFileSync(path.join(g, "userdir.txt"), "utf8").trim();
      if (custom) out.push(path.join(custom, GAME_FOLDER), custom);
    } catch { /* none */ }
  }
  return [...new Set(out)].filter(isDir);
}

/** Every folder that may contain .eu4 saves, most specific first. */
export function eu4SaveDirs(): { path: string; kind: string }[] {
  const out: { path: string; kind: string }[] = [];
  if (process.env.EU4_SAVE_DIR) {
    for (const p of process.env.EU4_SAVE_DIR.split(path.delimiter)) if (p.trim()) out.push({ path: expandHome(p.trim()), kind: "configured" });
  }
  for (const u of eu4UserDirs()) out.push({ path: path.join(u, "save games"), kind: "local" });
  for (const r of steamUserDataDirs(EU4_APP_ID)) out.push({ path: path.join(r, "save games"), kind: "steam-cloud" });
  const seen = new Set<string>();
  return out.filter((d) => isDir(d.path) && !seen.has(d.path) && seen.add(d.path));
}

/** Game install folders (Steam libraries, macOS app bundle, Microsoft Store/Xbox). */
export function eu4GameDirs(): string[] {
  const out: string[] = [];
  if (process.env.EU4_GAME_DIR) out.push(expandHome(process.env.EU4_GAME_DIR));
  for (const lib of steamLibraries()) out.push(path.join(lib, "steamapps", "common", GAME_FOLDER));
  if (osKind() === "macos") {
    out.push("/Applications/Europa Universalis IV", path.join(os.homedir(), "Applications", GAME_FOLDER));
  }
  if (osKind() === "windows") {
    out.push("C:\\XboxGames\\Europa Universalis IV\\Content", "C:\\Program Files\\ModifiableWindowsApps\\Europa Universalis IV",
      "C:\\Program Files (x86)\\GOG Galaxy\\Games\\Europa Universalis IV");
  }
  return [...new Set(out)].filter(isDir);
}

/** On macOS the Steam install may keep game data inside an .app bundle. */
export function eu4DataRoot(gameDir: string): string {
  for (const p of [gameDir, path.join(gameDir, "eu4.app", "Contents", "Resources"), path.join(gameDir, "Contents", "Resources")]) {
    if (exists(path.join(p, "common")) && exists(path.join(p, "localisation"))) return p;
  }
  return gameDir;
}

export function eu4InstalledVersion(): { gameDir?: string; version?: string } {
  for (const g of eu4GameDirs()) {
    const v = readLauncherVersion(g) ?? readLauncherVersion(eu4DataRoot(g));
    if (v) return { gameDir: g, version: v };
    return { gameDir: g };
  }
  return {};
}

/** Read the in-game language from settings.txt (affects localisation lookup). */
export function eu4Language(): string {
  for (const u of eu4UserDirs()) {
    try {
      const m = fs.readFileSync(path.join(u, "settings.txt"), "latin1").match(/language\s*=\s*"?l_(\w+)"?/);
      if (m) return m[1];
    } catch { /* next */ }
  }
  return "english";
}
