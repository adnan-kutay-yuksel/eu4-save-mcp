/**
 * Optional integration with the open-source rakaly CLI
 * (https://github.com/rakaly/cli), which can "melt" binary / ironman Paradox
 * saves into plaintext. We never download or bundle it; we only use it if the
 * user installed it.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDir } from "./platform.js";

const EXE = process.platform === "win32" ? "rakaly.exe" : "rakaly";

export function findRakaly(): string | undefined {
  const candidates: string[] = [];
  if (process.env.RAKALY_PATH) candidates.push(process.env.RAKALY_PATH);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) if (dir) candidates.push(path.join(dir, EXE));
  const home = os.homedir();
  candidates.push(
    path.join(home, ".local", "bin", EXE),
    path.join(home, "bin", EXE),
    path.join(home, "rakaly", EXE),
    path.join(home, "Downloads", EXE),
    "/opt/homebrew/bin/rakaly",
    "/usr/local/bin/rakaly",
  );
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "rakaly", EXE));
  // Extracted release folders like ~/Downloads/rakaly-0.8.25-aarch64-apple-darwin/rakaly
  for (const base of [path.join(home, "Downloads"), home]) {
    try {
      for (const d of fs.readdirSync(base)) {
        if (d.startsWith("rakaly-") && isDir(path.join(base, d))) candidates.push(path.join(base, d, EXE));
      }
    } catch { /* ignore */ }
  }
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
    } catch { /* next */ }
  }
  return undefined;
}

function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
      // rakaly exits 1 when it encountered unknown tokens but still produced output
      if (stdout && stdout.length > 100 && (!err || (err as NodeJS.ErrnoException & { code?: number }).code === 1)) {
        resolve(stdout);
        return;
      }
      reject(new Error(`rakaly ${args.join(" ")} failed: ${(stderr?.toString() || err?.message || "").trim().slice(0, 500)}`));
    });
  });
}

/** Melt a binary save into plaintext using rakaly. Tries several argument sets. */
export async function meltWithRakaly(file: string, format: string): Promise<Buffer> {
  const bin = findRakaly();
  if (!bin) throw new RakalyMissingError();
  const attempts = [
    ["melt", "--to-stdout", "--unknown-key", "stringify", file],
    ["melt", "--format", format, "--to-stdout", "--unknown-key", "stringify", file],
    ["melt", "--to-stdout", file],
  ];
  const errors: string[] = [];
  for (const args of attempts) {
    try {
      return await run(bin, args);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(`rakaly could not melt this save. Is it up to date? (${bin})\n${errors.join("\n")}`);
}

export class RakalyMissingError extends Error {
  constructor() {
    super(
      "This save is binary (ironman or binary-format). Reading it requires the free rakaly CLI " +
        "(https://github.com/rakaly/cli/releases). Download the build for your OS, extract it, and either put " +
        "`rakaly` on your PATH or set the RAKALY_PATH environment variable in your MCP config.",
    );
  }
}

export function rakalyInstallHint(): string {
  const plat = process.platform;
  const arch = process.arch;
  let asset = "x86_64-unknown-linux-musl.tar.gz";
  if (plat === "darwin") asset = arch === "arm64" ? "aarch64-apple-darwin.tar.gz" : "x86_64-apple-darwin.tar.gz";
  else if (plat === "win32") asset = "x86_64-pc-windows-msvc.zip";
  return `Download rakaly-<version>-${asset} from https://github.com/rakaly/cli/releases/latest, extract it, then put it on PATH or set RAKALY_PATH.`;
}
