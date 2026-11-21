/** Short, stable mechanic notes so the model can ground advice in game rules. */

export const WIKI_BASE = "https://eu4.paradoxwikis.com";

export const MECHANICS: Record<string, { summary: string; tips: string[]; wiki: string }> = {
  overextension: {
    summary: "Overextension = development of uncored provinces (minus some exceptions) relative to your total. 100% overextension is a soft cap; above 0% you get unrest, more corruption, worse diplomatic reputation and higher AE impact, and at 100%+ disaster/coalition risk goes up sharply.",
    tips: ["Core the highest-development uncored provinces first", "Use 'release vassal' or feed subjects to shed overextension", "Stop declaring wars until it is under ~50%"],
    wiki: "Overextension",
  },
  aggressive_expansion: {
    summary: "Aggressive expansion (AE) is an opinion penalty from taking land or forcing conversion. Countries with high AE (≤ -50 opinion) and a threat perception join coalitions against you. AE decays yearly; improve relations reduces it for specific countries.",
    tips: ["Spread conquests over time and regions", "Use diplo-annex/vassal feeding with less AE", "Watch neighbouring coalitions in the diplomacy report"],
    wiki: "Aggressive_expansion",
  },
  stability: {
    summary: "Stability ranges from -3 to +3. Negative stability adds unrest, reduces tax and increases costs; positive stability lowers unrest and boosts legitimacy/tradition growth. Raising it costs ADM (base 100, modified).",
    tips: ["Keep +1 to +3 before war declarations that break truces or change religion", "Do not overspend: +3 costs a lot and stability hits from events can be expensive"],
    wiki: "Stability",
  },
  war_exhaustion: {
    summary: "War exhaustion (0–20) grows from battles, sieges and attrition. It adds unrest, reduces manpower recovery and makes your population want peace. It decays in peace and can be reduced with DIP points.",
    tips: ["Peace out when war score stalls", "Avoid attrition-heavy terrain and long sieges without artillery"],
    wiki: "War_exhaustion",
  },
  inflation: {
    summary: "Inflation increases the cost of nearly everything (buildings, advisors, coring scales indirectly). It comes from gold income, loans and some events. A Master of Mint/treasurer advisor and some idea groups reduce it.",
    tips: ["Avoid taking loans repeatedly", "Hire the inflation-reduction advisor when above ~5%"],
    wiki: "Inflation",
  },
  corruption: {
    summary: "Corruption (0–100) raises the cost of almost everything and lowers tax/production. It grows from overextension, territories, low-skill state management and some modifiers; the Root Out Corruption slider spends ducats to reduce it.",
    tips: ["Keep corruption under 2 by setting the slider early", "Reduce overextension and states over the governing limit"],
    wiki: "Corruption",
  },
  monarch_points: {
    summary: "ADM/DIP/MIL points are generated monthly from ruler stats, advisors and other sources. Each pool caps at 999; anything above is wasted. They are spent on technology, ideas, coring, development, stability, culture conversion and more.",
    tips: ["Never sit at 999", "Spend for tech on time and use surplus for development or coring"],
    wiki: "Monarch_power",
  },
  ideas: {
    summary: "Idea groups unlock at ADM technology 4, 7, 10, 13, 16, 19, 22 and 25 (8 groups). Each group has 7 ideas plus a completion bonus; national ideas unlock as you complete ideas.",
    tips: ["Fill each slot as soon as it opens", "Complete groups one at a time to get their policies and bonuses"],
    wiki: "Idea_groups",
  },
  development: {
    summary: "Development (tax + production + manpower) drives income, manpower, building slots, force limits and institution spread. You can buy it with monarch points; cost rises with existing development and is reduced by terrain/modifiers.",
    tips: ["Develop provinces with good trade goods or centres of trade", "Develop to spread an institution you are missing"],
    wiki: "Development",
  },
  trade: {
    summary: "Trade value flows downstream through trade nodes. You collect in your home node (main trade city) for free and with merchants elsewhere, or steer value toward your home node. Trade power share in a node determines your cut.",
    tips: ["Collect only in your home node and steer everything else toward it", "Light ships protecting trade add trade power", "Marketplaces and trade depots increase trade power"],
    wiki: "Trade",
  },
  institutions: {
    summary: "Institutions (Renaissance, Colonialism, Printing Press, Global Trade, Manufactories, Enlightenment, Industrialization) spread over time. Not embracing them makes technology much more expensive.",
    tips: ["Develop a province where the institution is present to speed spread", "Embrace once 10%+ of development has it if you can afford the ducats"],
    wiki: "Institutions",
  },
  manpower: {
    summary: "Manpower replenishes regiments and builds new ones. Max manpower comes from base manpower development, buildings (barracks/training fields), ideas and modifiers; recovery takes ~10 years to fill from empty.",
    tips: ["Use mercenaries to save manpower", "Avoid attrition and lost battles"],
    wiki: "Manpower",
  },
  autonomy: {
    summary: "Local autonomy reduces tax, production, manpower and sailors from a province. It decays over time; seizing land, harsh treatment and some actions raise it.",
    tips: ["Lower autonomy in high-development provinces with 'decrease autonomy' (costs unrest)"],
    wiki: "Autonomy",
  },
  estates: {
    summary: "Estates (Nobility, Clergy, Burghers, and others) have loyalty and influence. Privileges give bonuses but increase influence; an estate with 100% influence can trigger a disaster. Low loyalty raises rebel risk.",
    tips: ["Keep loyalty above 50%", "Revoke privileges when influence approaches 80%"],
    wiki: "Estates",
  },
  loans: {
    summary: "Loan size scales with your income; the interest rate depends on modifiers (ideas, advisors, inflation-related effects). Loans last 5 years and are extended if you cannot repay them on expiry. Too many loans or a negative treasury lead to bankruptcy.",
    tips: ["Pay back loans as soon as peace returns", "Never take loans to finance buildings with long payback"],
    wiki: "Loans",
  },
};

export function explainMechanic(topic: string) {
  const key = topic.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, string> = {
    ae: "aggressive_expansion", oe: "overextension", we: "war_exhaustion", mana: "monarch_points", points: "monarch_points",
    idea: "ideas", idea_groups: "ideas", dev: "development", institution: "institutions", loan: "loans", estate: "estates",
  };
  const found = MECHANICS[key] ?? MECHANICS[aliases[key] ?? ""] ?? Object.entries(MECHANICS).find(([k]) => k.includes(key) || key.includes(k))?.[1];
  if (!found) {
    return {
      topic,
      found: false,
      known: Object.keys(MECHANICS),
      wiki: `${WIKI_BASE}/index.php?search=${encodeURIComponent(topic)}`,
    };
  }
  return { topic, found: true, ...found, wiki: `${WIKI_BASE}/${found.wiki}` };
}

export function versionNotes(major?: number, minor?: number): string[] {
  const notes: string[] = [];
  if (major === undefined || minor === undefined) return ["Unknown save version."];
  if (major === 1 && minor < 30) notes.push("Save is older than 1.30 (pre-Emperor estate rework). Estate/privilege data may be missing or structured differently.");
  if (major === 1 && minor >= 37) notes.push("1.37-era save: analysis is tuned for the current ruleset.");
  notes.push("Mechanics and numbers can differ by patch and enabled DLC; DLCs active in this save are listed in the save metadata.");
  return notes;
}
