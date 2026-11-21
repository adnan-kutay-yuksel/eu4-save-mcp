# EU4 Save Advisor — MCP server for Europa Universalis IV

Chat with your **Europa Universalis IV** campaign. This [Model Context Protocol](https://modelcontextprotocol.io) server lets Claude (Claude Desktop, Claude Code, or any MCP client) read your save files and give you grounded, strategic insights:

> *"Why am I losing money?"* · *"Can I beat the Ottomans right now?"* · *"What should I fix first?"* · *"How far have I come since my 1600 save?"* · *"Who hates me the most?"*

It works on **Windows, macOS and Linux**, auto-detects your save folders (local, OneDrive-redirected Documents, Steam Cloud, custom `userdir.txt`), reads your installed game version and language, and adapts to the save's own version, DLCs and mods. It is **read-only** — it never modifies your saves, and nothing leaves your computer except what you choose to send to Claude.

## What it can do

| Tool | What you get |
| --- | --- |
| `eu4_environment` | OS, detected save folders, game install + version, language, rakaly status |
| `eu4_list_saves` | Your saves, newest first, with in-game date, country, version, ironman flag |
| `eu4_load_save` | Campaign summary: date, version, DLCs, mods, human players, player snapshot |
| `eu4_country_overview` | Ruler/heir stats, government, tech, monarch points, ideas, treasury, loans, stability, manpower, army/navy, wars |
| `eu4_economy` | Last month's income/expense breakdown (taxation, trade, army maintenance …) with %, lifetime spending, loans & interest |
| `eu4_military` | Every army (infantry/cavalry/artillery, strength, morale, location), navies, traditions, and a comparison with rivals & enemies |
| `eu4_diplomacy` | Allies, royal marriages, subjects + liberty desire, rivals and who rivals you, best/worst opinions |
| `eu4_wars` | Active wars: sides, war goal, contribution, losses, recent battles |
| `eu4_provinces` | Owned provinces: development, trade goods, culture/religion mismatch, cores, autonomy, devastation, buildings |
| `eu4_find_problems` | **Health check** — deficits, loans, inflation, stability, overextension, wasted monarch points, empty idea slots, tech gaps, rebels, estates, succession… with concrete advice |
| `eu4_rankings` | World ranking by development, income, manpower, army, treasury, tech, debt … |
| `eu4_compare_countries` | Side-by-side comparison |
| `eu4_trends` | Yearly income / size / score / inflation history from the game's ledger |
| `eu4_compare_saves` | Your progress between two saves |
| `eu4_query` / `eu4_search` | Raw access to any field in the save, for anything the reports don't cover |
| `eu4_explain` | Short rules explanation + tips for core mechanics |

There is also a `campaign_review` prompt that runs a full review in one go.

## Install

### Claude Desktop (one click)

1. Download `eu4-save-mcp.mcpb` from the [latest release](https://github.com/adnan-kutay-yuksel/eu4-save-mcp/releases/latest).
2. Double-click it (or drag it into Claude Desktop → Settings → Extensions) and press **Install**.
3. Optional settings: a custom save folder and the path to `rakaly` (for ironman saves).

### Claude Code

```bash
claude mcp add eu4 -- npx -y github:adnan-kutay-yuksel/eu4-save-mcp
```

### Any MCP client (JSON config)

```json
{
  "mcpServers": {
    "eu4": {
      "command": "npx",
      "args": ["-y", "github:adnan-kutay-yuksel/eu4-save-mcp"],
      "env": { "EU4_SAVE_DIR": "", "RAKALY_PATH": "" }
    }
  }
}
```

Requires Node.js 18+ (Claude Desktop ships its own runtime for `.mcpb` extensions).

## Save formats & ironman

| Save type | Supported |
| --- | --- |
| Plaintext (`EU4txt`) | ✅ built in |
| Compressed (zip) | ✅ built in (deflate & zstd) |
| Ironman / binary (`EU4bin`) | ✅ with the free [rakaly CLI](https://github.com/rakaly/cli/releases) |

Paradox's binary token table is not public, so binary saves are decoded by **rakaly**, an open-source tool by the pdx.tools author. Download the build for your OS (`aarch64-apple-darwin` for Apple Silicon Macs, `x86_64-apple-darwin` for Intel Macs, `x86_64-pc-windows-msvc` for Windows), extract it, and either put it on your `PATH` or point `RAKALY_PATH` at it. The server also looks in `~/Downloads/rakaly-*` automatically. Run `eu4_environment` to check. Tested with rakaly 0.8.25.

Without the game installed, infantry/cavalry/artillery are estimated from unit names; when your EU4 install is found they come from the game files.

## Tested with real saves

Besides synthetic unit tests, every release is checked against 12 real community saves from the public [pdx.tools](https://pdx.tools) test corpus: patches 1.29 to 1.35, plaintext, compressed, ironman/binary, multiplayer, modded, no-DLC and Random New World games, from 1444 starts to 1817 late games with 970+ provinces. To run that yourself:

```bash
REAL_SAVES_DIR=/path/to/saves RAKALY_PATH=/path/to/rakaly npm test
```

## Where saves are found

| OS | Default location |
| --- | --- |
| Windows | `%USERPROFILE%\Documents\Paradox Interactive\Europa Universalis IV\save games` (also OneDrive\Documents) |
| macOS | `~/Documents/Paradox Interactive/Europa Universalis IV/save games` |
| Linux | `~/.local/share/Paradox Interactive/Europa Universalis IV/save games` |
| Steam Cloud | `<Steam>/userdata/<id>/236850/remote/save games` |

Overrides (environment variables): `EU4_SAVE_DIR` (one or more folders, separated by `;` on Windows / `:` elsewhere), `EU4_USER_DIR`, `EU4_GAME_DIR`, `RAKALY_PATH`.

When the game install is found, country/province names come from your installed localisation (matching your in-game language and mods); otherwise a built-in list of common tags is used.

## Example conversation

> **You:** Load my latest save and tell me what's wrong.
>
> **Claude:** *(calls `eu4_load_save`, `eu4_find_problems`)* It's 1550 and France is the #1 development power, but: you're running a −1.5 ducat/month deficit with two 200-ducat loans, stability is 0 while war exhaustion is 6.5, the Clergy is at 85% influence (disaster at 100%), and your ADM is sitting at 950/999 — spend it on coring Lorraine, which also brings overextension down from 60%…

## Development

```bash
npm install
npm run typecheck
npm test          # parser, analysis and stdio MCP integration tests
npm run build     # bundles to dist/index.js (committed, so `npx github:` works without a build)
npm run pack      # builds eu4-save-mcp.mcpb for Claude Desktop
```

The parser (`src/core/clausewitz.ts`) is a dependency-free byte-level Clausewitz parser that skips heavy sections (province history, trade nodes, flags) by default; a ~40 MB save loads in about 0.4 s.

## Related projects

- [EU5 Save Advisor](https://github.com/adnan-kutay-yuksel/eu5-save-mcp) — the same for Europa Universalis V
- [GTA 6 Guide MCP](https://github.com/adnan-kutay-yuksel/gta6-mcp) — knowledge-base companion for Grand Theft Auto VI
- [pdx.tools](https://pdx.tools) and [rakaly](https://github.com/rakaly) — the excellent open-source Paradox save tooling this project relies on for binary saves

## License

MIT. Not affiliated with or endorsed by Paradox Interactive. Europa Universalis is a trademark of Paradox Interactive AB.
