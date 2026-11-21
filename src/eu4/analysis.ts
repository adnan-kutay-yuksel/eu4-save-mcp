/** EU4 game-state analysis: turns raw save data into insight-ready summaries. */
import { all, isObject, list, num, one, str, yes, type PObject, type PValue } from "../core/clausewitz.js";
import { countries, livingCountries, provinces, type LoadedSave } from "./save.js";
import { countryName, provinceName, unitCategory } from "./names.js";

export const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const INCOME_LABELS: Record<number, string> = {
  0: "taxation", 1: "production", 2: "trade", 3: "gold", 4: "tariffs", 5: "vassals", 6: "harbor_fees",
  7: "subsidies", 8: "war_reparations", 9: "interest", 10: "gifts", 11: "events", 12: "spoils_of_war",
  13: "treasure_fleet", 14: "siphoning_income", 15: "condottieri", 16: "knowledge_sharing",
  17: "blockading_foreign_ports", 18: "looting_foreign_cities",
};
export const EXPENSE_LABELS: Record<number, string> = {
  0: "advisor_maintenance", 1: "interest", 2: "state_maintenance", 4: "subsidies", 5: "war_reparations",
  6: "army_maintenance", 7: "fleet_maintenance", 8: "fort_maintenance", 9: "colonists", 10: "missionaries",
  11: "raising_armies", 12: "building_fleets", 13: "building_fortresses", 14: "buildings", 16: "repaid_loans",
  17: "gifts", 18: "advisors", 19: "events", 20: "peace", 21: "vassal_fee", 22: "tariffs", 23: "support_loyalists",
  26: "condottieri", 27: "root_out_corruption", 28: "embrace_institution", 30: "knowledge_sharing",
  31: "trade_company_investments", 33: "ports_blockaded", 34: "cities_looted", 35: "monuments",
  36: "cot_upgrades", 37: "colony_changes",
};

const GENERIC_IDEAS = new Set([
  "aristocracy_ideas", "plutocracy_ideas", "innovativeness_ideas", "religious_ideas", "spy_ideas", "diplomatic_ideas",
  "offensive_ideas", "defensive_ideas", "trade_ideas", "economic_ideas", "exploration_ideas", "maritime_ideas",
  "quality_ideas", "quantity_ideas", "expansion_ideas", "administrative_ideas", "humanist_ideas", "influence_ideas",
  "naval_ideas", "horde_gov_ideas", "theocracy_gov_ideas", "indigenous_ideas", "mercenary_ideas",
]);
/** ADM tech levels that unlock idea-group slots. */
const IDEA_SLOT_TECHS = [4, 7, 10, 13, 16, 19, 22, 25];

export class EU4Error extends Error {}

export function resolveTag(save: LoadedSave, tag?: string): string {
  const t = (tag ?? save.meta.player ?? "").toUpperCase();
  if (!t) throw new EU4Error("No country given and the save has no player country (observer game). Pass a tag like FRA.");
  if (!countries(save.game)[t]) {
    // allow a country name instead of a tag
    const byName = Object.keys(countries(save.game)).find((k) => countryName(k).toLowerCase() === (tag ?? "").toLowerCase());
    if (byName) return byName;
    throw new EU4Error(`Country ${t} not found in this save.`);
  }
  return t;
}

export function country(save: LoadedSave, tag: string): PObject {
  const c = countries(save.game)[tag];
  if (!c) throw new EU4Error(`Country ${tag} not found.`);
  return c;
}

export function label(save: LoadedSave, tag: string): string {
  const c = countries(save.game)[tag];
  const custom = c ? str(c["name"]) : undefined;
  if (tag === save.meta.player && save.meta.displayedCountryName) return save.meta.displayedCountryName;
  return countryName(tag, custom);
}

function tableToMap(v: PValue | undefined, labels: Record<number, string>): { breakdown: Record<string, number>; total: number } {
  const arr = Array.isArray(v) ? v.map((x) => num(x as PValue)) : [];
  const breakdown: Record<string, number> = {};
  let other = 0, total = 0;
  arr.forEach((val, i) => {
    total += val;
    const name = labels[i];
    if (name) {
      if (val !== 0) breakdown[name] = r(val);
    } else other += val;
  });
  if (other) breakdown["other"] = r(other);
  return { breakdown, total: r(total) };
}

// ---------- people ----------

interface Person {
  name?: string; dynasty?: string; adm?: number; dip?: number; mil?: number; birthDate?: string; age?: number;
  culture?: string; religion?: string; claim?: number; personalities?: string[];
}

function idOf(v: PValue | undefined): number | undefined {
  if (isObject(v)) return num(v["id"], NaN);
  return typeof v === "number" ? v : undefined;
}

function yearsBetween(from?: string, to?: string): number | undefined {
  if (!from || !to) return undefined;
  const [y1, m1 = 1] = from.split(".").map(Number);
  const [y2, m2 = 1] = to.split(".").map(Number);
  return Math.floor(y2 - y1 + (m2 - m1) / 12);
}

/** Find the full record of a monarch/heir/queen in the country's history block. */
function findPerson(c: PObject, ref: PValue | undefined, date?: string): Person | undefined {
  const wantId = idOf(isObject(ref) ? ref["id"] ?? ref : ref);
  if (wantId === undefined || Number.isNaN(wantId)) return undefined;
  const hist = c["history"];
  if (!isObject(hist)) return undefined;
  for (const entry of Object.values(hist)) {
    for (const e of Array.isArray(entry) ? entry : [entry]) {
      if (!isObject(e)) continue;
      for (const k of ["monarch", "heir", "queen", "monarch_heir", "monarch_consort", "monarch_foreign_heir", "consort"]) {
        for (const p of all(e, k)) {
          if (!isObject(p) || idOf(p["id"]) !== wantId) continue;
          const pers = all(p, "personality").map(String);
          return {
            name: str(p["name"]),
            dynasty: str(p["dynasty"]),
            adm: num(p["ADM"] ?? p["adm"]),
            dip: num(p["DIP"] ?? p["dip"]),
            mil: num(p["MIL"] ?? p["mil"]),
            birthDate: str(p["birth_date"]),
            age: yearsBetween(str(p["birth_date"]), date),
            culture: str(p["culture"]),
            religion: str(p["religion"]),
            claim: p["claim"] !== undefined ? num(p["claim"]) : undefined,
            personalities: pers.length ? pers : undefined,
          };
        }
      }
    }
  }
  return undefined;
}

// ---------- overview ----------

export function provName(save: LoadedSave, id: PValue | undefined): string | undefined {
  if (id === undefined) return undefined;
  const provs = save.game["provinces"];
  const p = isObject(provs) ? provs[`-${id}`] : undefined;
  return provinceName(String(id), isObject(p) ? str(p["name"]) : undefined);
}

function capitalName(save: LoadedSave, c: PObject): string | undefined {
  return provName(save, c["capital"]);
}

export function legitimacyLike(c: PObject): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ["legitimacy", "republican_tradition", "devotion", "horde_unity", "meritocracy", "absolutism", "mercantilism"]) {
    if (c[k] !== undefined) out[k] = r(num(c[k]));
  }
  return out;
}

export function countryOverview(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const date = save.meta.date;
  const tech = isObject(c["technology"]) ? c["technology"] : {};
  const powers = list(c["powers"]).map((x) => num(x));
  const ideas = isObject(c["active_idea_groups"]) ? c["active_idea_groups"] : {};
  const gov = isObject(c["government"]) ? c["government"] : {};
  const reforms = isObject(gov["reform_stack"]) ? list(one(gov["reform_stack"], "reforms")).map(String) : [];
  const ledger = isObject(c["ledger"]) ? c["ledger"] : {};
  const income = tableToMap(ledger["lastmonthincometable"] ?? ledger["last_month_income_table"], INCOME_LABELS);
  const expense = tableToMap(ledger["lastmonthexpensetable"] ?? ledger["last_month_expense_table"], EXPENSE_LABELS);
  const loans = all(c, "loan").filter(isObject);
  const rank = developmentRank(save, tag);
  const mil = militarySummary(save, tag);

  return {
    tag,
    name: label(save, tag),
    date,
    isPlayer: tag === save.meta.player || yes(c["human"]),
    government: {
      type: str(gov["government"]),
      rank: ["", "duchy", "kingdom", "empire"][num(c["government_rank"])] ?? num(c["government_rank"]),
      reforms,
      ...legitimacyLike(c),
    },
    ruler: findPerson(c, c["monarch"], date),
    heir: findPerson(c, c["heir"], date) ?? (c["heir"] ? { note: "heir exists (details not in save history)" } : null),
    consort: findPerson(c, c["queen"] ?? c["consort"], date),
    religion: str(c["religion"]),
    primaryCulture: str(c["primary_culture"]),
    acceptedCultures: all(c, "accepted_culture").map(String),
    capital: capitalName(save, c),
    provinces: num(c["num_of_cities"]),
    development: r(num(c["development"] ?? c["raw_development"])),
    developmentRank: rank,
    greatPower: yes(c["is_great_power"]),
    greatPowerScore: c["great_power_score"] !== undefined ? r(num(c["great_power_score"])) : undefined,
    technology: { adm: num(tech["adm_tech"]), dip: num(tech["dip_tech"]), mil: num(tech["mil_tech"]) },
    institutionsEmbraced: list(c["institutions"]).filter((x) => num(x) === 1).length,
    monarchPoints: { adm: powers[0], dip: powers[1], mil: powers[2] },
    ideaGroups: Object.fromEntries(Object.entries(ideas).map(([k, v]) => [k, num(v)])),
    economy: {
      treasury: r(num(c["treasury"])),
      monthlyIncome: r(num(ledger["lastmonthincome"] ?? ledger["last_month_income"] ?? income.total)),
      monthlyExpense: r(num(ledger["lastmonthexpense"] ?? ledger["last_month_expense"] ?? expense.total)),
      monthlyBalance: r(num(ledger["lastmonthincome"] ?? income.total) - num(ledger["lastmonthexpense"] ?? expense.total)),
      inflation: r(num(c["inflation"])),
      corruption: r(num(c["corruption"])),
      loans: loans.length,
      debt: r(loans.reduce((s, l) => s + num(l["amount"]), 0)),
      mercantilism: c["mercantilism"] !== undefined ? r(num(c["mercantilism"])) : undefined,
    },
    stability: num(c["stability"]),
    prestige: r(num(c["prestige"])),
    warExhaustion: r(num(c["war_exhaustion"])),
    overextension: r(num(c["overextension_percentage"]) * 100) + "%",
    manpower: { current: Math.round(num(c["manpower"]) * 1000), max: Math.round(num(c["max_manpower"]) * 1000) },
    sailors: { current: Math.round(num(c["sailors"])), max: Math.round(num(c["max_sailors"])) },
    army: mil.armySummary,
    navy: mil.navySummary,
    armyTradition: r(num(c["army_tradition"])),
    navyTradition: r(num(c["navy_tradition"])),
    armyProfessionalism: c["army_professionalism"] !== undefined ? r(num(c["army_professionalism"]) * 100) + "%" : undefined,
    overlord: str(c["overlord"]),
    subjects: list(c["subjects"]).map(String),
    atWar: activeWars(save).filter((w) => w.attackers.includes(tag) || w.defenders.includes(tag)).map((w) => w.name),
  };
}

export function developmentRank(save: LoadedSave, tag: string): number | undefined {
  const sorted = livingCountries(save.game)
    .map(([t, c]) => [t, num(c["development"] ?? c["raw_development"])] as const)
    .sort((a, b) => b[1] - a[1]);
  const i = sorted.findIndex(([t]) => t === tag);
  return i >= 0 ? i + 1 : undefined;
}

// ---------- economy ----------

export function economyReport(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const ledger = isObject(c["ledger"]) ? c["ledger"] : {};
  const income = tableToMap(ledger["lastmonthincometable"] ?? ledger["last_month_income_table"], INCOME_LABELS);
  const expense = tableToMap(ledger["lastmonthexpensetable"] ?? ledger["last_month_expense_table"], EXPENSE_LABELS);
  const totalExpense = tableToMap(ledger["totalexpensetable"] ?? ledger["total_expense_table"], EXPENSE_LABELS);
  const loans = all(c, "loan").filter(isObject).map((l) => ({
    amount: num(l["amount"]), interest: r(num(l["interest"])), expires: str(l["expiry_date"]), lender: str(l["lender"]),
  }));
  const share = (b: Record<string, number>, total: number) =>
    Object.fromEntries(Object.entries(b).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => [k, { value: v, pct: total ? r((v / total) * 100, 1) : 0 }]));
  const incTotal = num(ledger["lastmonthincome"] ?? income.total);
  const expTotal = num(ledger["lastmonthexpense"] ?? expense.total);
  return {
    tag,
    name: label(save, tag),
    treasury: r(num(c["treasury"])),
    lastMonth: {
      income: r(incTotal),
      expense: r(expTotal),
      balance: r(incTotal - expTotal),
      incomeBreakdown: share(income.breakdown, incTotal),
      expenseBreakdown: share(expense.breakdown, expTotal),
    },
    lastYear: { income: r(num(ledger["lastyearincome"])), expense: r(num(ledger["lastyearexpense"])) },
    lifetimeExpenseBreakdown: share(totalExpense.breakdown, totalExpense.total),
    inflation: r(num(c["inflation"])),
    corruption: r(num(c["corruption"])),
    mercantilism: r(num(c["mercantilism"])),
    loans,
    totalDebt: loans.reduce((s, l) => s + l.amount, 0),
    estimatedMonthlyInterest: r(loans.reduce((s, l) => s + (l.amount * l.interest) / 100 / 12, 0)),
    tradeIncomePct: incTotal ? r(((income.breakdown["trade"] ?? 0) / incTotal) * 100, 1) : 0,
  };
}

// ---------- military ----------

export function militarySummary(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const armies = all(c, "army").filter(isObject).map((a) => {
    const regs = all(a, "regiment").filter(isObject);
    const byCat: Record<string, number> = {};
    let men = 0;
    for (const rg of regs) {
      const cat = unitCategory(str(rg["type"]) ?? "");
      byCat[cat] = (byCat[cat] ?? 0) + 1;
      men += num(rg["strength"], 1) * 1000;
    }
    const morale = regs.length ? regs.reduce((s, rg) => s + num(rg["morale"]), 0) / regs.length : 0;
    return {
      name: str(a["name"]),
      location: provName(save, a["location"]),
      regiments: regs.length,
      composition: byCat,
      men: Math.round(men),
      fullStrengthPct: regs.length ? r((men / (regs.length * 1000)) * 100, 1) : 0,
      avgMorale: r(morale, 2),
      mercenary: a["mercenary_company"] !== undefined,
    };
  });
  const navies = all(c, "navy").filter(isObject).map((n) => {
    const ships = all(n, "ship").filter(isObject);
    const byCat: Record<string, number> = {};
    for (const s of ships) {
      const cat = unitCategory(str(s["type"]) ?? "");
      byCat[cat] = (byCat[cat] ?? 0) + 1;
    }
    return { name: str(n["name"]), location: provName(save, n["location"]), ships: ships.length, composition: byCat };
  });
  const tot = (k: "infantry" | "cavalry" | "artillery") => armies.reduce((s, a) => s + (a.composition[k] ?? 0), 0);
  const regiments = armies.reduce((s, a) => s + a.regiments, 0);
  return {
    armies,
    navies,
    armySummary: {
      armies: armies.length,
      regiments,
      infantry: tot("infantry"),
      cavalry: tot("cavalry"),
      artillery: tot("artillery"),
      men: armies.reduce((s, a) => s + a.men, 0),
    },
    navySummary: { fleets: navies.length, ships: navies.reduce((s, n) => s + n.ships, 0) },
  };
}

export function militaryReport(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const m = militarySummary(save, tag);
  const leaders = all(c, "leader").length;
  const ratio = m.armySummary.regiments
    ? { infantryPct: r((m.armySummary.infantry / m.armySummary.regiments) * 100, 1), cavalryPct: r((m.armySummary.cavalry / m.armySummary.regiments) * 100, 1), artilleryPct: r((m.armySummary.artillery / m.armySummary.regiments) * 100, 1) }
    : undefined;
  return {
    tag,
    name: label(save, tag),
    manpower: { current: Math.round(num(c["manpower"]) * 1000), max: Math.round(num(c["max_manpower"]) * 1000) },
    sailors: { current: Math.round(num(c["sailors"])), max: Math.round(num(c["max_sailors"])) },
    armyTradition: r(num(c["army_tradition"])),
    navyTradition: r(num(c["navy_tradition"])),
    armyProfessionalism: r(num(c["army_professionalism"]) * 100, 1),
    milTech: num(isObject(c["technology"]) ? c["technology"]["mil_tech"] : 0),
    leaders,
    totals: m.armySummary,
    composition: ratio,
    navy: m.navySummary,
    armies: m.armies,
    navies: m.navies,
    comparison: neighbourStrength(save, tag),
  };
}

/** Rough land strength of the country vs its rivals, allies and enemies. */
function neighbourStrength(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const tags = new Set<string>();
  for (const rv of all(c, "rival")) {
    const t = isObject(rv) ? str(rv["country"]) : str(rv);
    if (t) tags.add(t);
  }
  for (const e of list(c["enemies"] ?? c["enemy"])) tags.add(String(e));
  for (const w of activeWars(save)) {
    if (w.attackers.includes(tag)) w.defenders.forEach((t) => tags.add(t));
    if (w.defenders.includes(tag)) w.attackers.forEach((t) => tags.add(t));
  }
  const rows = [tag, ...[...tags].filter((t) => t !== tag)].slice(0, 12).flatMap((t) => {
    if (!countries(save.game)[t]) return [];
    const ms = militarySummary(save, t).armySummary;
    const cc = country(save, t);
    return [{
      tag: t, name: label(save, t), regiments: ms.regiments, men: ms.men,
      manpower: Math.round(num(cc["manpower"]) * 1000),
      milTech: num(isObject(cc["technology"]) ? cc["technology"]["mil_tech"] : 0),
    }];
  });
  return rows;
}

// ---------- diplomacy & wars ----------

interface Rel { type: string; first: string; second: string; subjectType?: string; start?: string }

export function diplomaticRelations(save: LoadedSave): Rel[] {
  const d = save.game["diplomacy"];
  if (!isObject(d)) return [];
  const out: Rel[] = [];
  for (const [type, vals] of Object.entries(d)) {
    for (const v of Array.isArray(vals) ? vals : [vals]) {
      if (!isObject(v)) continue;
      const first = str(v["first"]), second = str(v["second"]);
      if (!first || !second) continue;
      out.push({ type, first, second, subjectType: str(v["subject_type"]), start: str(v["start_date"]) });
    }
  }
  return out;
}

export function diplomacyReport(save: LoadedSave, tag: string) {
  const c = country(save, tag);
  const rels = diplomaticRelations(save).filter((x) => x.first === tag || x.second === tag);
  const other = (x: Rel) => (x.first === tag ? x.second : x.first);
  const group = (type: string) => rels.filter((x) => x.type === type).map((x) => ({ tag: other(x), name: label(save, other(x)) }));
  const subjects = rels.filter((x) => x.type === "dependency" && x.first === tag).map((x) => ({
    tag: x.second, name: label(save, x.second), type: x.subjectType,
    libertyDesire: (() => { const s = countries(save.game)[x.second]; return s && s["liberty_desire"] !== undefined ? r(num(s["liberty_desire"])) : undefined; })(),
  }));
  const overlord = rels.find((x) => x.type === "dependency" && x.second === tag);
  const rivals = all(c, "rival").map((rv) => (isObject(rv) ? str(rv["country"]) : str(rv))).filter(Boolean) as string[];

  // opinions from the player's active relations (kept during parsing)
  const ar = c["active_relations"];
  let opinions: { tag: string; name: string; opinion: number; trust?: number }[] | undefined;
  if (isObject(ar)) {
    opinions = Object.entries(ar)
      .filter(([, v]) => isObject(v))
      .map(([t, v]) => {
        const o = v as PObject;
        const opinion = num(o["cached_sum"] ?? o["opinion"], 0);
        return { tag: t, name: label(save, t), opinion: r(opinion, 0), trust: o["trust"] !== undefined ? r(num(o["trust"]), 0) : undefined };
      })
      .filter((x) => x.opinion !== 0 || x.trust !== undefined)
      .sort((a, b) => a.opinion - b.opinion);
  }

  return {
    tag,
    name: label(save, tag),
    overlord: overlord ? { tag: overlord.first, name: label(save, overlord.first), type: overlord.subjectType } : undefined,
    subjects,
    alliances: group("alliance"),
    royalMarriages: group("royal_marriage"),
    guarantees: rels.filter((x) => x.type === "guarantee").map((x) => ({ guarantor: x.first, guaranteed: x.second })),
    warnings: rels.filter((x) => x.type === "warning").map((x) => ({ from: x.first, to: x.second })),
    subsidies: rels.filter((x) => x.type === "subsidies").map((x) => ({ from: x.first, to: x.second })),
    militaryAccess: rels.filter((x) => x.type === "military_access" || x.type === "fleet_access").map((x) => ({ from: x.first, to: x.second, type: x.type })),
    rivals: rivals.map((t) => ({ tag: t, name: label(save, t) })),
    rivaledBy: Object.entries(countries(save.game))
      .filter(([t, cc]) => t !== tag && all(cc, "rival").some((rv) => (isObject(rv) ? str(rv["country"]) : str(rv)) === tag))
      .map(([t]) => ({ tag: t, name: label(save, t) })),
    wars: activeWars(save).filter((w) => w.attackers.includes(tag) || w.defenders.includes(tag)),
    worstOpinions: opinions?.slice(0, 10),
    bestOpinions: opinions?.slice(-10).reverse(),
  };
}

export function activeWars(save: LoadedSave) {
  return all(save.game, "active_war").filter(isObject).map((w) => warSummary(save, w));
}

function warSummary(save: LoadedSave, w: PObject) {
  const attackers = list(w["attackers"]).map(String);
  const defenders = list(w["defenders"]).map(String);
  const participants = all(w, "participants").filter(isObject).map((p) => {
    const losses = isObject(p["losses"]) ? list(one(p["losses"], "members")).map((x) => num(x)) : [];
    return { tag: str(p["tag"]) ?? "", contribution: r(num(p["value"])), losses: losses.reduce((s, x) => s + x, 0) };
  });
  const battles: { date: string; name?: string; location?: string; result?: string }[] = [];
  const hist = w["history"];
  if (isObject(hist)) {
    for (const [date, ev] of Object.entries(hist)) {
      for (const e of Array.isArray(ev) ? ev : [ev]) {
        for (const b of all(e, "battle").filter(isObject)) {
          battles.push({ date, name: str(b["name"]), location: provName(save, b["location"]), result: yes(b["result"]) ? "attacker won" : "defender won" });
        }
      }
    }
  }
  const startDate = isObject(hist) ? Object.keys(hist).find((k) => /^\d+\.\d+\.\d+$/.test(k)) : undefined;
  const wg = isObject(hist) ? (Object.values(hist).find((v) => isObject(v) && v["war_goal"] !== undefined) as PObject | undefined) : undefined;
  return {
    name: str(w["name"]) ?? "War",
    startDate,
    attackers: attackers.length ? attackers : [str(w["original_attacker"]) ?? ""].filter(Boolean),
    defenders: defenders.length ? defenders : [str(w["original_defender"]) ?? ""].filter(Boolean),
    attackerNames: attackers.map((t) => label(save, t)),
    defenderNames: defenders.map((t) => label(save, t)),
    originalAttacker: str(w["original_attacker"]),
    originalDefender: str(w["original_defender"]),
    warGoal: wg && isObject(wg["war_goal"]) ? { type: str(wg["war_goal"]["type"]), casusBelli: str(wg["war_goal"]["casus_belli"]), province: wg["war_goal"]["province"] } : undefined,
    warScore: w["defender_score"] !== undefined ? { defenderScore: r(num(w["defender_score"])) } : undefined,
    participants,
    recentBattles: battles.slice(-8),
  };
}

// ---------- provinces ----------

export function provinceReport(save: LoadedSave, tag: string, sortBy = "development", limit = 30) {
  const c = country(save, tag);
  const accepted = new Set([str(c["primary_culture"]), ...all(c, "accepted_culture").map(String)]);
  const stateReligion = str(c["religion"]);
  const rows = provinces(save.game)
    .filter(([, p]) => str(p["owner"]) === tag)
    .map(([id, p]) => {
      const tax = num(p["base_tax"]), prod = num(p["base_production"]), mp = num(p["base_manpower"]);
      const cores = list(p["cores"]).map(String);
      const buildings = isObject(p["buildings"]) ? Object.keys(p["buildings"]) : [];
      return {
        id: Number(id),
        name: provinceName(id, str(p["name"])),
        development: r(tax + prod + mp, 1),
        tax, production: prod, manpower: mp,
        tradeGood: str(p["trade_goods"]),
        culture: str(p["culture"]),
        religion: str(p["religion"]),
        wrongCulture: !accepted.has(str(p["culture"])),
        wrongReligion: str(p["religion"]) !== stateReligion,
        cored: cores.includes(tag),
        autonomy: r(num(p["local_autonomy"]), 1),
        devastation: r(num(p["devastation"]), 1),
        occupiedBy: str(p["controller"]) && str(p["controller"]) !== tag ? str(p["controller"]) : undefined,
        buildings,
        centerOfTrade: num(p["center_of_trade"]) || undefined,
        tradePower: p["trade_power"] !== undefined ? r(num(p["trade_power"]), 1) : undefined,
        hre: yes(p["hre"]) || undefined,
        isCity: p["is_city"] !== undefined ? yes(p["is_city"]) : undefined,
        colonySize: p["colonysize"] !== undefined ? r(num(p["colonysize"]), 0) : undefined,
      };
    });
  const key = (x: (typeof rows)[number]) => {
    switch (sortBy) {
      case "autonomy": return x.autonomy;
      case "devastation": return x.devastation;
      case "buildings": return -x.buildings.length; // fewest buildings first
      case "tax": return x.tax;
      case "production": return x.production;
      case "manpower": return x.manpower;
      default: return x.development;
    }
  };
  rows.sort((a, b) => key(b) - key(a));
  const totalDev = rows.reduce((s, x) => s + x.development, 0);
  const goods: Record<string, number> = {};
  for (const x of rows) if (x.tradeGood) goods[x.tradeGood] = (goods[x.tradeGood] ?? 0) + 1;
  return {
    tag,
    name: label(save, tag),
    count: rows.length,
    totalDevelopment: r(totalDev, 1),
    averageDevelopment: rows.length ? r(totalDev / rows.length, 1) : 0,
    uncored: rows.filter((x) => !x.cored).map((x) => x.name),
    wrongCultureCount: rows.filter((x) => x.wrongCulture).length,
    wrongReligionCount: rows.filter((x) => x.wrongReligion).length,
    occupied: rows.filter((x) => x.occupiedBy).map((x) => ({ name: x.name, by: x.occupiedBy })),
    tradeGoods: Object.fromEntries(Object.entries(goods).sort((a, b) => b[1] - a[1])),
    sortedBy: sortBy,
    provinces: rows.slice(0, limit),
  };
}

// ---------- rankings ----------

export const RANK_METRICS = ["development", "income", "manpower", "army", "treasury", "provinces", "prestige", "great_power_score", "tech", "debt"] as const;
export type RankMetric = (typeof RANK_METRICS)[number];

export function rankings(save: LoadedSave, metric: RankMetric, limit = 15) {
  const val = (t: string, c: PObject): number => {
    const ledger = isObject(c["ledger"]) ? c["ledger"] : {};
    const tech = isObject(c["technology"]) ? c["technology"] : {};
    switch (metric) {
      case "development": return num(c["development"] ?? c["raw_development"]);
      case "income": return num(ledger["lastmonthincome"]);
      case "manpower": return num(c["max_manpower"]) * 1000;
      case "army": return militarySummary(save, t).armySummary.regiments;
      case "treasury": return num(c["treasury"]);
      case "provinces": return num(c["num_of_cities"]);
      case "prestige": return num(c["prestige"]);
      case "great_power_score": return num(c["great_power_score"]);
      case "tech": return num(tech["adm_tech"]) + num(tech["dip_tech"]) + num(tech["mil_tech"]);
      case "debt": return all(c, "loan").filter(isObject).reduce((s, l) => s + num(l["amount"]), 0);
    }
  };
  const rows = livingCountries(save.game).map(([t, c]) => ({ tag: t, name: label(save, t), value: r(val(t, c)), isPlayer: yes(c["human"]) || t === save.meta.player }));
  rows.sort((a, b) => b.value - a.value);
  const player = save.meta.player;
  const playerRank = player ? rows.findIndex((x) => x.tag === player) + 1 : undefined;
  return { metric, totalCountries: rows.length, playerRank: playerRank || undefined, top: rows.slice(0, limit).map((x, i) => ({ rank: i + 1, ...x })) };
}

// ---------- history trends from ledgers ----------

export function trends(save: LoadedSave, tag: string) {
  const out: Record<string, { year: number; value: number }[]> = {};
  for (const [key, label2] of [["income_statistics", "monthlyIncome"], ["nation_size_statistics", "provinces"], ["score_statistics", "score"], ["inflation_statistics", "inflation"]] as const) {
    const block = save.game[key];
    if (!isObject(block)) continue;
    for (const ld of all(block, "ledger_data")) {
      if (!isObject(ld) || str(ld["name"]) !== tag) continue;
      const data = ld["data"];
      if (!isObject(data)) continue;
      const pts = Object.entries(data).map(([y, v]) => ({ year: Number(y), value: r(key === "income_statistics" ? num(v) / 12 : num(v)) }));
      pts.sort((a, b) => a.year - b.year);
      out[label2] = pts;
    }
  }
  const summarise = (pts: { year: number; value: number }[]) => {
    if (!pts.length) return undefined;
    const first = pts[0], last = pts[pts.length - 1];
    const step = Math.max(1, Math.ceil(pts.length / 25));
    return { from: first, to: last, change: r(last.value - first.value), samples: pts.filter((_, i) => i % step === 0 || i === pts.length - 1) };
  };
  return { tag, name: label(save, tag), note: "Yearly snapshots recorded by the game's ledger.", series: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, summarise(v)])) };
}

// ---------- problem finder ----------

export interface Insight {
  severity: "critical" | "warning" | "opportunity" | "info";
  area: string;
  finding: string;
  advice: string;
}

export function findProblems(save: LoadedSave, tag: string): { tag: string; name: string; date?: string; insights: Insight[] } {
  const c = country(save, tag);
  const ov = countryOverview(save, tag);
  const econ = economyReport(save, tag);
  const prov = provinceReport(save, tag, "development", 10_000);
  const ins: Insight[] = [];
  const add = (severity: Insight["severity"], area: string, finding: string, advice: string) => ins.push({ severity, area, finding, advice });

  // economy
  if (econ.lastMonth.balance < 0) {
    const biggest = Object.entries(econ.lastMonth.expenseBreakdown)[0];
    add(econ.treasury < Math.abs(econ.lastMonth.balance) * 6 ? "critical" : "warning", "economy",
      `Running a deficit of ${Math.abs(econ.lastMonth.balance).toFixed(2)} ducats/month (treasury ${econ.treasury}).`,
      `Biggest expense: ${biggest ? `${biggest[0]} (${biggest[1].value})` : "n/a"}. Lower army/navy maintenance sliders in peacetime, dismiss surplus mercenaries, cut advisors, and avoid new loans.`);
  }
  if (econ.loans.length) {
    add(econ.loans.length >= 5 ? "critical" : "warning", "economy",
      `${econ.loans.length} loan(s) totalling ${econ.totalDebt} ducats (~${econ.estimatedMonthlyInterest}/month in interest).`,
      econ.treasury > (econ.loans[0]?.amount ?? 0) ? "You can afford to repay at least one loan now — interest is pure waste." : "Repay the highest-interest loans first once peace allows; 5+ loans risks bankruptcy spiral.");
  }
  if (num(c["inflation"]) >= 5) add(num(c["inflation"]) >= 10 ? "critical" : "warning", "economy",
    `Inflation is ${r(num(c["inflation"]))}%, increasing every cost.`, "Hire a Master of Mint (treasurer) advisor or use reduce-inflation options; stop taking loans and avoid gold-heavy income.");
  if (num(c["corruption"]) >= 2) add(num(c["corruption"]) >= 5 ? "critical" : "warning", "economy",
    `Corruption is ${r(num(c["corruption"]))}.`, "Increase the Root Out Corruption budget slider, reduce state overrun, and keep advisors below skill cost limits.");
  if (econ.tradeIncomePct < 15 && econ.lastMonth.income > 10) add("opportunity", "economy",
    `Trade is only ${econ.tradeIncomePct}% of income.`, "Send merchants to steer trade toward your home node, build marketplaces/trade depots in high trade-power provinces, and consider trade/merchant ideas.");

  // stability & legitimacy
  if (num(c["stability"]) < 0) add("critical", "stability", `Stability is ${num(c["stability"])} — unrest and penalties everywhere.`, "Spend ADM to raise stability as soon as possible (costs rise with low stability modifiers).");
  else if (num(c["stability"]) < 1) add("warning", "stability", `Stability is ${num(c["stability"])}.`, "Raise stability to at least +1 before declaring wars or changing religion/culture.");
  const leg = legitimacyLike(c);
  if (leg.legitimacy !== undefined && leg.legitimacy < 50) add("warning", "government", `Legitimacy is ${leg.legitimacy}.`, "Low legitimacy reduces tax, increases unrest and rebel risk; avoid regency, marry well, consider a heir with good claim.");
  if (leg.republican_tradition !== undefined && leg.republican_tradition < 30) add("warning", "government", `Republican tradition is ${leg.republican_tradition}.`, "Avoid re-electing the same ruler, and look for events/reforms that raise tradition.");
  if (num(c["war_exhaustion"]) >= 5) add(num(c["war_exhaustion"]) >= 10 ? "critical" : "warning", "military", `War exhaustion is ${r(num(c["war_exhaustion"]))}.`, "Make peace if the war is stalled, or spend DIP to reduce war exhaustion. It adds unrest and reduces manpower recovery.");
  const oe = num(c["overextension_percentage"]) * 100;
  if (oe >= 50) add(oe >= 100 ? "critical" : "warning", "expansion", `Overextension is ${r(oe, 0)}% (${prov.uncored.length} uncored province(s)).`, "Stop conquering until you core the provinces listed in province_report; overextension causes unrest, corruption and AE disasters.");
  else if (prov.uncored.length) add("info", "expansion", `${prov.uncored.length} uncored province(s): ${prov.uncored.slice(0, 6).join(", ")}${prov.uncored.length > 6 ? "…" : ""}.`, "Core them with ADM points when affordable.");

  // monarch points
  const pts = ov.monarchPoints;
  for (const [k, v] of Object.entries(pts)) {
    if (v !== undefined && v >= 900) add("warning", "monarch points", `${k.toUpperCase()} points are at ${v}/999 — about to be wasted.`, `Spend ${k.toUpperCase()} now: ${k === "adm" ? "tech, ideas, coring, stability, development" : k === "dip" ? "tech, ideas, culture conversion, reducing war exhaustion, development" : "tech, ideas, generals, development, harsh treatment"}.`);
  }

  // technology vs neighbours & ideas
  const tech = ov.technology;
  const avgMilTop = (() => {
    const rows = livingCountries(save.game).map(([, cc]) => num(isObject(cc["technology"]) ? cc["technology"]["mil_tech"] : 0)).sort((a, b) => b - a).slice(0, 20);
    return rows.length ? rows.reduce((s, x) => s + x, 0) / rows.length : 0;
  })();
  if (tech.mil < avgMilTop - 2) add("warning", "military", `MIL tech ${tech.mil} is behind the top-20 average (${r(avgMilTop, 1)}).`, "Falling behind on MIL tech loses battles even with bigger armies. Prioritise MIL tech before new wars.");
  const genericIdeas = Object.keys(ov.ideaGroups).filter((g) => GENERIC_IDEAS.has(g));
  const slots = IDEA_SLOT_TECHS.filter((t) => tech.adm >= t).length;
  if (slots > genericIdeas.length) add("opportunity", "ideas", `You can pick ${slots - genericIdeas.length} more idea group(s) (ADM tech ${tech.adm} unlocks ${slots}, you have ${genericIdeas.length}).`, "Pick a new idea group — an empty slot is wasted potential.");
  const unfinished = Object.entries(ov.ideaGroups).filter(([g, n]) => GENERIC_IDEAS.has(g) && n < 7);
  if (unfinished.length > 1) add("info", "ideas", `${unfinished.length} idea groups unfinished: ${unfinished.map(([g, n]) => `${g} ${n}/7`).join(", ")}.`, "Finishing groups unlocks their bonus/policies; focus one at a time.");

  // military
  if (ov.manpower.max > 0 && ov.manpower.current / ov.manpower.max < 0.25) add("warning", "military", `Manpower is low: ${ov.manpower.current.toLocaleString()} / ${ov.manpower.max.toLocaleString()}.`, "Use mercenaries, raise manpower via ideas/advisors, or reduce war intensity until it recovers.");
  const mil = militarySummary(save, tag);
  const understrength = mil.armies.filter((a) => a.regiments > 0 && a.fullStrengthPct < 60);
  if (understrength.length) add("info", "military", `${understrength.length} army/armies below 60% strength (${understrength.slice(0, 4).map((a) => a.name).join(", ")}).`, "Let them reinforce in owned territory before engaging.");
  if (ov.army.regiments >= 20 && ov.army.artillery === 0 && tech.mil >= 7) add("opportunity", "military", "Your armies have no artillery.", "Artillery in the back row adds fire damage and siege ability; aim for ~ half your combat width in artillery late game.");

  // succession
  if ((ov.government.type ?? "").includes("monarchy") && !c["heir"]) add("warning", "government", "No heir — risk of a regency or succession crisis/personal union loss.", "Arrange royal marriages and consider seeking a new heir via decisions/events.");
  if (ov.ruler && ov.ruler.age !== undefined && ov.ruler.age >= 60) add("info", "government", `Ruler ${ov.ruler.name} is ${ov.ruler.age} years old.`, "Plan for succession (heir quality, consort, regency) now.");

  // provinces
  if (prov.wrongReligionCount > 0) add("info", "religion", `${prov.wrongReligionCount} province(s) do not follow ${str(c["religion"])}.`, "Send missionaries to high-development heretic/heathen provinces to cut unrest and raise tax.");
  if (prov.wrongCultureCount > Math.max(3, prov.count * 0.3)) add("info", "culture", `${prov.wrongCultureCount}/${prov.count} provinces are non-accepted culture.`, "Promote large cultures (when you have slots) or convert culture in key provinces with DIP.");
  const devast = prov.provinces.filter((p) => p.devastation >= 10);
  if (devast.length) add("warning", "provinces", `${devast.length} province(s) are devastated (≥10): ${devast.slice(0, 5).map((p) => p.name).join(", ")}.`, "Devastation reduces income and manpower; avoid fighting there and use reduce-devastation actions if available.");
  if (prov.occupied.length) add("warning", "war", `${prov.occupied.length} of your provinces are occupied by enemies.`, "Retake them — occupation lowers war score and income.");

  // rebels
  const rebels = all(save.game, "rebel_faction").filter((rb) => isObject(rb) && str(rb["country"]) === tag) as PObject[];
  const hot = rebels.filter((rb) => num(rb["progress"]) >= 50);
  if (hot.length) add("warning", "stability", `${hot.length} rebel faction(s) above 50% progress (${hot.map((rb) => str(rb["type"])).join(", ")}).`, "Station troops in their provinces, raise stability or use harsh treatment/estates to prevent uprisings.");

  // estates
  for (const e of all(c, "estate").filter(isObject)) {
    const loyalty = num(e["loyalty"]), influence = num(e["influence"]);
    const type = str(e["type"]) ?? "estate";
    if (influence >= 80) add("critical", "estates", `${type} influence is ${r(influence, 0)}%.`, "At ≥100% influence the estate can take over (disaster). Revoke privileges or seize land.");
    else if (loyalty < 30 && influence > 40) add("warning", "estates", `${type} has low loyalty (${r(loyalty, 0)}) and high influence (${r(influence, 0)}).`, "Grant a privilege or use 'Support' interactions to avoid rebellions.");
  }

  if (!ins.length) add("info", "overall", "No major problems detected.", "Looks healthy — consider expansion targets, development, or trade optimisation.");
  const order = { critical: 0, warning: 1, opportunity: 2, info: 3 } as const;
  ins.sort((a, b) => order[a.severity] - order[b.severity]);
  return { tag, name: label(save, tag), date: save.meta.date, insights: ins };
}

// ---------- compare ----------

export function compareCountries(save: LoadedSave, tags: string[]) {
  return tags.map((t) => {
    const o = countryOverview(save, t);
    return {
      tag: t, name: o.name, development: o.development, provinces: o.provinces, treasury: o.economy.treasury,
      monthlyIncome: o.economy.monthlyIncome, debt: o.economy.debt, tech: o.technology, manpower: o.manpower,
      regiments: o.army.regiments, ships: o.navy.ships, stability: o.stability, prestige: o.prestige,
      greatPower: o.greatPower, ideas: Object.keys(o.ideaGroups).length,
    };
  });
}

export function compareSnapshots(a: LoadedSave, b: LoadedSave, tag: string) {
  const oa = countryOverview(a, tag), ob = countryOverview(b, tag);
  const d = (x: number, y: number) => r(y - x);
  return {
    tag, name: ob.name,
    from: a.meta.date, to: b.meta.date,
    development: { from: oa.development, to: ob.development, change: d(oa.development, ob.development) },
    provinces: { from: oa.provinces, to: ob.provinces, change: ob.provinces - oa.provinces },
    treasury: { from: oa.economy.treasury, to: ob.economy.treasury, change: d(oa.economy.treasury, ob.economy.treasury) },
    monthlyIncome: { from: oa.economy.monthlyIncome, to: ob.economy.monthlyIncome, change: d(oa.economy.monthlyIncome, ob.economy.monthlyIncome) },
    debt: { from: oa.economy.debt, to: ob.economy.debt, change: d(oa.economy.debt, ob.economy.debt) },
    tech: { from: oa.technology, to: ob.technology },
    regiments: { from: oa.army.regiments, to: ob.army.regiments, change: ob.army.regiments - oa.army.regiments },
    manpowerMax: { from: oa.manpower.max, to: ob.manpower.max, change: ob.manpower.max - oa.manpower.max },
    prestige: { from: oa.prestige, to: ob.prestige },
    stability: { from: oa.stability, to: ob.stability },
    developmentRank: { from: oa.developmentRank, to: ob.developmentRank },
    ideas: { from: oa.ideaGroups, to: ob.ideaGroups },
  };
}

export { countries };
