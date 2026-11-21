import { test, before } from "node:test";
import assert from "node:assert/strict";
import { writeFixtures } from "./fixtures.ts";
import { detectEncoding, loadSave, readSaveMeta } from "../src/eu4/save.ts";
import {
  countryOverview, economyReport, findProblems, militaryReport, diplomacyReport, provinceReport, rankings, activeWars, trends, compareSnapshots,
} from "../src/eu4/analysis.ts";
import fs from "node:fs";

let fx: ReturnType<typeof writeFixtures>;
before(() => { fx = writeFixtures(); process.env.EU4_SAVE_DIR = fx.dir; });

test("detects encodings", () => {
  assert.equal(detectEncoding(fs.readFileSync(fx.text)), "text");
  assert.equal(detectEncoding(fs.readFileSync(fx.zip)), "text-zip");
  assert.equal(detectEncoding(fs.readFileSync(fx.bin)), "binary");
});

test("reads metadata quickly from text and zip saves", () => {
  for (const f of [fx.text, fx.zip]) {
    const m = readSaveMeta(f);
    assert.equal(m.player, "FRA");
    assert.equal(m.date, "1550.3.1");
    assert.equal(m.version, "1.37.5.0 (Inheritance)");
    assert.deepEqual(m.dlcs.length, 3);
  }
});

test("zip save loads same as text save", async () => {
  const a = await loadSave(fx.text);
  const b = await loadSave(fx.zip);
  assert.equal(countryOverview(a, "FRA").economy.treasury, countryOverview(b, "FRA").economy.treasury);
  assert.equal(b.meta.player, "FRA");
  assert.deepEqual(b.meta.playersCountries, [{ player: "Player One", tag: "FRA" }]);
});

test("binary save without rakaly gives a helpful error", async () => {
  const old = process.env.PATH; process.env.PATH = ""; process.env.RAKALY_PATH = "/nonexistent";
  try {
    await assert.rejects(loadSave(fx.bin), /rakaly/);
  } finally { process.env.PATH = old; delete process.env.RAKALY_PATH; }
});

test("country overview", async () => {
  const s = await loadSave(fx.text);
  const o = countryOverview(s, "FRA");
  assert.equal(o.name, "France");
  assert.equal(o.ruler?.name, "Louis XII");
  assert.equal(o.ruler?.adm, 6);
  assert.equal(o.ruler?.age, 65);
  assert.equal(o.capital, "Paris");
  assert.equal(o.government.rank, "kingdom");
  assert.deepEqual(o.monarchPoints, { adm: 950, dip: 300, mil: 120 });
  assert.equal(o.economy.loans, 2);
  assert.equal(o.economy.debt, 400);
  assert.equal(o.manpower.current, 8500);
  assert.equal(o.army.regiments, 3);
  assert.equal(o.army.cavalry, 2);
  assert.equal(o.army.infantry, 1);
  assert.equal(o.navy.ships, 2);
  assert.deepEqual(o.atWar, ["Anglo-French War"]);
  assert.equal(o.developmentRank, 1);
});

test("economy breakdown uses ledger labels", async () => {
  const e = economyReport(await loadSave(fx.text), "FRA");
  assert.equal(e.lastMonth.incomeBreakdown.taxation.value, 4);
  assert.equal(e.lastMonth.incomeBreakdown.trade.value, 3);
  assert.equal(e.lastMonth.incomeBreakdown.events.value, 2);
  assert.equal(e.lastMonth.expenseBreakdown.army_maintenance.value, 7);
  assert.equal(e.lastMonth.balance, -1.5);
  assert.equal(e.totalDebt, 400);
});

test("military, diplomacy, provinces, wars, rankings, trends", async () => {
  const s = await loadSave(fx.text);
  const m = militaryReport(s, "FRA");
  assert.equal(m.armies[0].men, 2400);
  assert.ok(m.comparison.some((x) => x.tag === "ENG" && x.regiments === 4));
  const d = diplomacyReport(s, "FRA");
  assert.deepEqual(d.alliances.map((x) => x.tag), ["CAS"]);
  assert.equal(d.subjects[0].tag, "PRO");
  assert.equal(d.subjects[0].libertyDesire, 55);
  assert.deepEqual(d.rivals.map((x) => x.tag), ["ENG"]);
  assert.deepEqual(d.rivaledBy.map((x) => x.tag), ["ENG"]);
  assert.equal(d.worstOpinions?.[0].tag, "ENG");
  const p = provinceReport(s, "FRA");
  assert.equal(p.count, 3);
  assert.deepEqual(p.uncored, ["Lorraine"]);
  assert.equal(p.provinces[0].name, "Paris");
  assert.equal(p.occupied[0].by, "ENG");
  const w = activeWars(s);
  assert.equal(w[0].recentBattles[0].location, "Calais");
  const rk = rankings(s, "development", 5);
  assert.equal(rk.top[0].tag, "FRA");
  assert.equal(rk.playerRank, 1);
  const t = trends(s, "FRA");
  assert.equal(t.series.monthlyIncome?.to.value, 50);
  const c = compareSnapshots(s, s, "FRA");
  assert.equal(c.development.change, 0);
});

test("problem finder flags the seeded issues", async () => {
  const pr = findProblems(await loadSave(fx.text), "FRA");
  const text = pr.insights.map((i) => i.finding).join("\n");
  for (const needle of ["deficit", "loan", "Inflation", "Stability is 0", "Legitimacy", "War exhaustion", "Overextension", "ADM points", "idea group", "No heir", "rebel", "estate_church", "devastated", "occupied"]) {
    assert.match(text, new RegExp(needle, "i"), `missing insight: ${needle}`);
  }
  assert.equal(pr.insights[0].severity, "critical");
});
