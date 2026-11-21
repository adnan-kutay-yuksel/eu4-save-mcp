/**
 * Optional regression run against real saves (e.g. the public pdx.tools fixtures:
 * https://cdn-dev.pdx.tools/eu4-saves/<name>). Usage:
 *   REAL_SAVES_DIR=/path/to/saves RAKALY_PATH=/path/to/rakaly npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadSave, readSaveMeta } from "../src/eu4/save.ts";
import * as A from "../src/eu4/analysis.ts";

const dir = process.env.REAL_SAVES_DIR;
const files = dir ? fs.readdirSync(dir).filter((f) => f.endsWith(".eu4")) : [];

test("real saves", { skip: !dir }, async (t) => {
  for (const f of files) {
    await t.test(f, async () => {
      const p = path.join(dir!, f);
      readSaveMeta(p);
      const s = await loadSave(p);
      const tag = s.meta.player ?? A.rankings(s, "development", 1).top[0].tag;
      const o = A.countryOverview(s, tag);
      assert.ok(o.provinces > 0);
      A.economyReport(s, tag); A.militaryReport(s, tag); A.diplomacyReport(s, tag);
      A.provinceReport(s, tag); A.findProblems(s, tag); A.trends(s, tag); A.rankings(s, "army", 5);
    });
  }
});
