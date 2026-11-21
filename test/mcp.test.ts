import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFixtures } from "./fixtures.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
let client: Client;
let fx: ReturnType<typeof writeFixtures>;

before(async () => {
  fx = writeFixtures();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(here, "..", "dist", "index.js")],
    env: { ...process.env, EU4_SAVE_DIR: fx.dir, RAKALY_PATH: "/nonexistent", PATH: "" } as Record<string, string>,
  });
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
});
after(async () => { await client?.close(); });

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  return { text: res.content[0].text, isError: !!res.isError };
};

test("lists all tools", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ["eu4_environment", "eu4_list_saves", "eu4_load_save", "eu4_find_problems", "eu4_economy", "eu4_query"]) assert.ok(names.includes(n), n);
});

test("end-to-end flow over stdio", async () => {
  const env = JSON.parse((await call("eu4_environment")).text);
  assert.equal(env.saveCount, 3);
  const list = JSON.parse((await call("eu4_list_saves")).text);
  assert.equal(list.saves[0].name, "France_text.eu4");
  assert.equal(list.saves[2].format, "binary");
  const loaded = JSON.parse((await call("eu4_load_save", { save: "latest" })).text);
  assert.equal(loaded.playerSnapshot.name, "France");
  const probs = JSON.parse((await call("eu4_find_problems")).text);
  assert.ok(probs.insights.length > 5);
  const q = JSON.parse((await call("eu4_query", { path: "countries.FRA.technology" })).text);
  assert.equal(q.value.mil_tech, 8);
  const s = JSON.parse((await call("eu4_search", { pattern: "^treasury$", under: "countries" })).text);
  assert.ok(s.hits.length >= 3);
  const ex = JSON.parse((await call("eu4_explain", { topic: "AE" })).text);
  assert.equal(ex.found, true);
  const cmp = JSON.parse((await call("eu4_compare_countries", { tags: ["FRA", "England"] })).text);
  assert.equal(cmp[1].tag, "ENG");
  const iron = await call("eu4_load_save", { save: "Ironman.eu4" });
  assert.equal(iron.isError, true);
  assert.match(iron.text, /rakaly/);
});
