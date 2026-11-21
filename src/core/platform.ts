/** OS detection and well-known folder discovery (Documents, Steam libraries). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type OsKind = "windows" | "macos" | "linux" | "other";

export function osKind(): OsKind {
  switch (process.platform) {
    case "win32": return "windows";
    case "darwin": return "macos";
    case "linux": return "linux";
    default: return "other";
  }
}

export function platformInfo() {
  return {
    os: osKind(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    nodeVersion: process.version,
    homeDir: os.homedir(),
  };
}

export function exists(p: string | undefined): p is string {
  if (!p) return false;
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Candidate "Documents" folders (handles OneDrive redirection on Windows). */
export function documentsDirs(): string[] {
  const home = os.homedir();
  const out: string[] = [];
  if (osKind() === "windows") {
    const userProfile = process.env.USERPROFILE ?? home;
    for (const od of [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]) {
      if (od) out.push(path.join(od, "Documents"), path.join(od, "Dokumente"), path.join(od, "Belgeler"));
    }
    out.push(path.join(userProfile, "Documents"), path.join(userProfile, "My Documents"));
  } else {
    out.push(path.join(home, "Documents"));
  }
  return [...new Set(out)];
}

/** Steam root folders for the current OS (existing ones only). */
export function steamRoots(): string[] {
  const home = os.homedir();
  const c: string[] = [];
  switch (osKind()) {
    case "windows": {
      const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
      const pf = process.env.ProgramFiles ?? "C:\\Program Files";
      c.push(path.join(pf86, "Steam"), path.join(pf, "Steam"), "D:\\Steam", "D:\\SteamLibrary", "E:\\SteamLibrary");
      break;
    }
    case "macos":
      c.push(path.join(home, "Library", "Application Support", "Steam"));
      break;
    case "linux":
      c.push(
        path.join(home, ".local", "share", "Steam"),
        path.join(home, ".steam", "steam"),
        path.join(home, ".steam", "debian-installation"),
        path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
      );
      break;
  }
  return c.filter(isDir);
}

/** All Steam library folders (parses steamapps/libraryfolders.vdf). */
export function steamLibraries(): string[] {
  const libs = new Set<string>();
  for (const root of steamRoots()) {
    libs.add(root);
    for (const vdf of [path.join(root, "steamapps", "libraryfolders.vdf"), path.join(root, "config", "libraryfolders.vdf")]) {
      try {
        const txt = fs.readFileSync(vdf, "utf8");
        for (const m of txt.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\"));
      } catch { /* ignore */ }
    }
  }
  return [...libs].filter(isDir);
}

/** Steam user ids that have a userdata folder (for Steam Cloud save copies). */
export function steamUserDataDirs(appId: number): string[] {
  const out: string[] = [];
  for (const root of steamRoots()) {
    const ud = path.join(root, "userdata");
    try {
      for (const id of fs.readdirSync(ud)) {
        const p = path.join(ud, id, String(appId), "remote");
        if (isDir(p)) out.push(p);
      }
    } catch { /* ignore */ }
  }
  return out;
}

/** CrossOver / Whisky bottles on macOS (for Windows-only games run via Wine). */
export function wineDocumentsDirs(): string[] {
  const home = os.homedir();
  const out: string[] = [];
  const bottleRoots = [
    path.join(home, "Library", "Application Support", "CrossOver", "Bottles"),
    path.join(home, "Library", "Containers", "com.isaacmarovitz.Whisky", "Bottles"),
  ];
  for (const root of bottleRoots) {
    let bottles: string[] = [];
    try { bottles = fs.readdirSync(root); } catch { continue; }
    for (const b of bottles) {
      const users = path.join(root, b, "drive_c", "users");
      let names: string[] = [];
      try { names = fs.readdirSync(users); } catch { continue; }
      for (const u of names) out.push(path.join(users, u, "Documents"), path.join(users, u, "My Documents"));
    }
  }
  return out.filter(isDir);
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  modified: Date;
}

export function listFiles(dir: string, exts: string[], recursive = false): FileInfo[] {
  const out: FileInfo[] = [];
  const walk = (d: string, depth: number) => {
    let ents: fs.Dirent[] = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (recursive && depth < 3) walk(p, depth + 1);
      } else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) {
        try {
          const st = fs.statSync(p);
          out.push({ path: p, name: e.name, size: st.size, modified: st.mtime });
        } catch { /* ignore */ }
      }
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Read a Paradox launcher-settings.json and return its version string. */
export function readLauncherVersion(gameDir: string): string | undefined {
  for (const p of [
    path.join(gameDir, "launcher-settings.json"),
    path.join(gameDir, "launcher", "launcher-settings.json"),
    path.join(gameDir, "game", "launcher-settings.json"),
    path.join(gameDir, "Contents", "Resources", "launcher-settings.json"),
  ]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      return j.rawVersion ?? j.version ?? undefined;
    } catch { /* next */ }
  }
  return undefined;
}
