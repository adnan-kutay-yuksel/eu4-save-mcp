import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPath, preview, searchTree } from "./core/clausewitz.js";
import { humanSize, platformInfo } from "./core/platform.js";
import { findRakaly, rakalyInstallHint } from "./core/rakaly.js";
import {
  activeWars, compareCountries, compareSnapshots, countryOverview, diplomacyReport, economyReport, findProblems,
  label, militaryReport, provinceReport, rankings, RANK_METRICS, resolveTag, trends,
} from "./eu4/analysis.js";
import { explainMechanic, versionNotes, WIKI_BASE } from "./eu4/knowledge.js";
import { hasGameLocalisation } from "./eu4/names.js";
import { eu4GameDirs, eu4InstalledVersion, eu4Language, eu4SaveDirs, eu4UserDirs } from "./eu4/paths.js";
import { findSaves, loadSave, readSaveMeta, resolveSavePath, type LoadedSave } from "./eu4/save.js";

export const VERSION = "1.0.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
const fail = (e: unknown): ToolResult => ({ content: [{ type: "text", text: `Error: ${(e as Error).message ?? String(e)}` }], isError: true });

async function guard(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

const saveArg = z.string().optional().describe('Save to use: "latest" (newest save on disk), a file name like "autosave.eu4", or a full path. Defaults to the last loaded save, else the newest.');
const tagArg = z.string().optional().describe("Country tag (e.g. FRA, TUR) or name. Defaults to the player's country.");

async function getSave(save?: string): Promise<LoadedSave> {
  return loadSave(resolveSavePath(save));
}

function saveHeader(s: LoadedSave) {
  return {
    file: s.file,
    date: s.meta.date,
    player: s.meta.player ? `${s.meta.player} (${label(s, s.meta.player)})` : "observer",
    version: s.meta.version,
  };
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "eu4-save-mcp", version: VERSION },
    {
      instructions:
        "Tools for chatting with a Europa Universalis IV campaign. Start with eu4_load_save (or eu4_list_saves), then use " +
        "eu4_find_problems for a health check and the specific reports (economy, military, diplomacy, provinces, wars, rankings, trends) " +
        "to answer questions. All data comes from the user's own save file; ground advice in those numbers and say when a value is missing. " +
        "Use eu4_query / eu4_search to look up raw fields not covered by the reports.",
    },
  );

  server.registerTool(
    "eu4_environment",
    {
      title: "Detect EU4 setup",
      description: "Detect OS, EU4 user/save folders, game install + version, language, and whether the rakaly CLI (needed for ironman saves) is available. Call this first if saves can't be found.",
      inputSchema: {},
    },
    async () => guard(() => {
      const installed = eu4InstalledVersion();
      const rakaly = findRakaly();
      return {
        platform: platformInfo(),
        userDirs: eu4UserDirs(),
        saveDirs: eu4SaveDirs(),
        gameInstallDirs: eu4GameDirs(),
        installedGameVersion: installed.version ?? "unknown (launcher-settings.json not found)",
        language: eu4Language(),
        countryNamesFromGameFiles: hasGameLocalisation(),
        rakaly: rakaly ? { found: true, path: rakaly } : { found: false, hint: rakalyInstallHint() },
        overrides: "Env vars: EU4_SAVE_DIR (one or more folders), EU4_USER_DIR, EU4_GAME_DIR, RAKALY_PATH.",
        saveCount: findSaves().length,
      };
    }),
  );

  server.registerTool(
    "eu4_list_saves",
    {
      title: "List EU4 saves",
      description: "List EU4 save files (newest first) with date, player country, version, ironman flag and size.",
      inputSchema: {
        dir: z.string().optional().describe("Extra folder to scan."),
        limit: z.number().int().min(1).max(100).default(15),
      },
    },
    async ({ dir, limit }) => guard(() => {
      const saves = findSaves(dir).slice(0, limit);
      if (!saves.length) return { saves: [], hint: "No .eu4 files found. Run eu4_environment to see searched folders, or pass dir." };
      return {
        saves: saves.map((s) => {
          let meta: ReturnType<typeof readSaveMeta> | undefined;
          try { meta = readSaveMeta(s.path); } catch { /* unreadable */ }
          return {
            name: s.name, path: s.path, modified: s.modified.toISOString(), size: humanSize(s.size), location: s.dirKind,
            gameDate: meta?.date, player: meta?.player, country: meta?.displayedCountryName, version: meta?.version,
            format: meta?.encoding, ironman: meta?.ironman,
          };
        }),
      };
    }),
  );

  server.registerTool(
    "eu4_load_save",
    {
      title: "Load an EU4 save",
      description: "Parse a save (text, compressed, or ironman via rakaly) and return a campaign summary: date, player, version, DLCs, mods and the player's headline stats. Later tools reuse this save by default.",
      inputSchema: {
        save: saveArg,
        full: z.boolean().default(false).describe("Parse everything including province histories and trade (slower, more memory). Only needed for eu4_query on skipped sections."),
      },
    },
    async ({ save, full }) => guard(async () => {
      const s = await loadSave(resolveSavePath(save ?? "latest"), { full });
      const player = s.meta.player;
      return {
        ...saveHeader(s),
        format: s.encoding + (s.melted ? " (decoded with rakaly)" : ""),
        ironman: s.meta.ironman,
        multiplayer: s.meta.multiplayer,
        humanPlayers: s.meta.playersCountries,
        dlcEnabled: s.meta.dlcs,
        mods: s.meta.mods,
        installedGameVersion: eu4InstalledVersion().version,
        versionNotes: versionNotes(s.meta.versionNumbers?.major, s.meta.versionNumbers?.minor),
        fileSize: humanSize(s.size),
        parseSeconds: s.loadMs / 1000,
        partialParse: s.partial ? "Heavy sections (province history, trade nodes, flags) were skipped. Use full=true if you need them." : false,
        playerSnapshot: player ? countryOverview(s, player) : undefined,
        activeWars: activeWars(s).length,
      };
    }),
  );

  server.registerTool(
    "eu4_country_overview",
    {
      title: "Country overview",
      description: "Headline state of a country: ruler/heir stats, government, tech, monarch points, ideas, treasury & balance, loans, stability, prestige, war exhaustion, overextension, manpower, army/navy size, subjects and wars.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return { save: saveHeader(s), ...countryOverview(s, resolveTag(s, tag)) };
    }),
  );

  server.registerTool(
    "eu4_economy",
    {
      title: "Economy report",
      description: "Last month's income/expense breakdown (taxation, production, trade, army maintenance …) with percentages, last year totals, lifetime spending, loans with interest, inflation and corruption.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return economyReport(s, resolveTag(s, tag));
    }),
  );

  server.registerTool(
    "eu4_military",
    {
      title: "Military report",
      description: "Armies (regiments by infantry/cavalry/artillery, strength, morale, location), navies, manpower, traditions, professionalism, and a strength comparison against rivals and current enemies.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return militaryReport(s, resolveTag(s, tag));
    }),
  );

  server.registerTool(
    "eu4_diplomacy",
    {
      title: "Diplomacy report",
      description: "Alliances, royal marriages, subjects (with liberty desire), overlord, guarantees, rivals and who rivals you, active wars, and the best/worst opinions toward the player's country.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return diplomacyReport(s, resolveTag(s, tag));
    }),
  );

  server.registerTool(
    "eu4_wars",
    {
      title: "Active wars",
      description: "All active wars (or only those involving a country): sides, war goal, participants' contribution and losses, recent battles.",
      inputSchema: { tag: z.string().optional().describe("Only wars involving this tag. Omit for all wars."), save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      const t = tag ? resolveTag(s, tag) : undefined;
      const wars = activeWars(s).filter((w) => !t || w.attackers.includes(t) || w.defenders.includes(t));
      return { date: s.meta.date, count: wars.length, wars };
    }),
  );

  server.registerTool(
    "eu4_provinces",
    {
      title: "Province report",
      description: "Owned provinces with development, trade goods, culture/religion mismatches, cores, autonomy, devastation, buildings, occupation. Also lists uncored provinces and trade-good totals.",
      inputSchema: {
        tag: tagArg,
        sort: z.enum(["development", "tax", "production", "manpower", "autonomy", "devastation", "buildings"]).default("development"),
        limit: z.number().int().min(1).max(500).default(30),
        save: saveArg,
      },
    },
    async ({ tag, sort, limit, save }) => guard(async () => {
      const s = await getSave(save);
      return provinceReport(s, resolveTag(s, tag), sort, limit);
    }),
  );

  server.registerTool(
    "eu4_find_problems",
    {
      title: "Campaign health check",
      description: "Scan a country for problems and missed opportunities (deficits, loans, inflation, low stability, overextension, wasted monarch points, empty idea slots, tech gaps, low manpower, rebels, estates, succession…) with concrete advice, sorted by severity.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return findProblems(s, resolveTag(s, tag));
    }),
  );

  server.registerTool(
    "eu4_rankings",
    {
      title: "World rankings",
      description: "Rank all living countries by a metric and show where the player stands.",
      inputSchema: {
        metric: z.enum(RANK_METRICS).default("development"),
        limit: z.number().int().min(1).max(100).default(15),
        save: saveArg,
      },
    },
    async ({ metric, limit, save }) => guard(async () => rankings(await getSave(save), metric, limit)),
  );

  server.registerTool(
    "eu4_compare_countries",
    {
      title: "Compare countries",
      description: "Side-by-side comparison of several countries (development, economy, tech, manpower, army, navy, stability…).",
      inputSchema: { tags: z.array(z.string()).min(1).max(10), save: saveArg },
    },
    async ({ tags, save }) => guard(async () => {
      const s = await getSave(save);
      return compareCountries(s, tags.map((t) => resolveTag(s, t)));
    }),
  );

  server.registerTool(
    "eu4_trends",
    {
      title: "History trends",
      description: "Yearly history of a country's income, size, score and inflation recorded by the game ledger since the campaign start.",
      inputSchema: { tag: tagArg, save: saveArg },
    },
    async ({ tag, save }) => guard(async () => {
      const s = await getSave(save);
      return trends(s, resolveTag(s, tag));
    }),
  );

  server.registerTool(
    "eu4_compare_saves",
    {
      title: "Progress between two saves",
      description: "Compare a country between an older and a newer save of the same campaign (development, provinces, income, debt, tech, army, rank…).",
      inputSchema: {
        older: z.string().describe("Older save (name or path)."),
        newer: z.string().default("latest").describe("Newer save (name, path or 'latest')."),
        tag: tagArg,
      },
    },
    async ({ older, newer, tag }) => guard(async () => {
      const b = await loadSave(resolveSavePath(newer));
      const a = await loadSave(resolveSavePath(older));
      return compareSnapshots(a, b, resolveTag(b, tag));
    }),
  );

  server.registerTool(
    "eu4_query",
    {
      title: "Raw save lookup",
      description: "Read any raw field by dotted path, e.g. 'countries.FRA.technology', 'provinces.-183', 'diplomacy', 'great_powers'. Returns a depth-limited preview. Use eu4_search to discover paths.",
      inputSchema: {
        path: z.string().default("").describe("Dotted path; empty for top-level keys."),
        depth: z.number().int().min(1).max(6).default(2),
        save: saveArg,
      },
    },
    async ({ path, depth, save }) => guard(async () => {
      const s = await getSave(save);
      const v = getPath(s.game, path);
      if (v === undefined) return { path, found: false, hint: s.partial ? "Not found. It may be in a skipped section — reload with eu4_load_save full=true." : "Not found." };
      return { path, value: preview(v, depth, 80) };
    }),
  );

  server.registerTool(
    "eu4_search",
    {
      title: "Search save keys",
      description: "Find keys (and optionally values) matching a regex anywhere in the save, optionally under a path (e.g. under='countries.FRA').",
      inputSchema: {
        pattern: z.string().describe("Case-insensitive regular expression."),
        under: z.string().default(""),
        values: z.boolean().default(false).describe("Also match scalar values."),
        limit: z.number().int().min(1).max(200).default(40),
        save: saveArg,
      },
    },
    async ({ pattern, under, values, limit, save }) => guard(async () => {
      const s = await getSave(save);
      const root = getPath(s.game, under);
      if (root === undefined) throw new Error(`Path not found: ${under}`);
      const hits = searchTree(root, new RegExp(pattern, "i"), { values, limit });
      return { under, hits: hits.map((h) => ({ ...h, path: under ? `${under}.${h.path}` : h.path })) };
    }),
  );

  server.registerTool(
    "eu4_explain",
    {
      title: "Explain a mechanic",
      description: "Short explanation + tips for an EU4 mechanic (overextension, aggressive expansion, stability, war exhaustion, inflation, corruption, monarch points, ideas, development, trade, institutions, manpower, autonomy, estates, loans) with a wiki link.",
      inputSchema: { topic: z.string() },
    },
    async ({ topic }) => guard(() => explainMechanic(topic)),
  );

  server.registerPrompt(
    "campaign_review",
    {
      title: "Review my EU4 campaign",
      description: "Load the latest save and give a full strategic review.",
      argsSchema: { focus: z.string().optional().describe("Optional focus, e.g. 'economy' or 'next war'.") },
    },
    ({ focus }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Load my latest EU4 save with eu4_load_save, run eu4_find_problems, then look at economy, military and diplomacy. ` +
            `Give me a concise strategic review: what is going well, the top 3 problems with concrete fixes, and a plan for the next 25 years.` +
            (focus ? ` Focus especially on: ${focus}.` : ""),
        },
      }],
    }),
  );

  server.registerResource(
    "eu4-wiki",
    "eu4://wiki",
    { title: "EU4 wiki", description: "Link to the official EU4 wiki", mimeType: "text/plain" },
    async (uri) => ({ contents: [{ uri: uri.href, text: `${WIKI_BASE}` }] }),
  );

  return server;
}
