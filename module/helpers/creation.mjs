/**
 * Character creation checks (pp.44-46). Pure: no Foundry globals.
 */
import { attributeCost } from "./rules.mjs";

export const PRIORITY_LEVELS = ["A", "B", "C", "D", "E"];
export const PRIORITY_CATEGORIES = ["heritage", "magic", "attributes", "skills", "resources"];

/** Priority table (p.44). */
export const PRIORITY_TABLE = Object.freeze({
  attributes: { A: 46, B: 38, C: 32, D: 29, E: 27 },
  skills: { A: 48, B: 36, C: 30, D: 27, E: 24 },
  resources: { A: 1200000, B: 600000, C: 250000, D: 60000, E: 25000 }
});

/** Lowest priority that still allows a heritage or magical talent (p.44). */
export const HERITAGE_MIN_PRIORITY = Object.freeze({
  human: "E", green: "C", blighted: "C", uplifted: "C", synthetic: "D"
});
export const TALENT_MIN_PRIORITY = Object.freeze({
  hedge: "E", amp: "C", speaker: "C", mage: "B", archmage: "A"
});

/** Monthly lifestyle cost in zuzus (p.46). */
export const LIFESTYLE_COSTS = Object.freeze({
  squatter: 0, low: 300, middle: 800, high: 1200, wealthy: 5000
});

/** Skills that cost more than one point per rank (Martial Arts: 2, p.67). */
export const SKILL_RANK_COST = Object.freeze({ martialArts: 2 });

/** Maximum skill rank at character creation (p.46). */
export const CREATION_SKILL_MAX = 6;

const rankOf = level => PRIORITY_LEVELS.indexOf(level);
/** Whether `level` is at least as good as `min` (A is best). */
const meets = (level, min) => rankOf(level) !== -1 && rankOf(level) <= rankOf(min);

/**
 * Check a character against the creation rules.
 *
 * @param {object} c
 * @param {Record<string, string>} c.priorities     Category → "A".."E" or "".
 * @param {Record<string, number>} c.attributes     Purchased (base) attribute values.
 * @param {Record<string, number>} [c.attributeMax] Attribute maxima.
 * @param {number} [c.attributeAdjust=0]            Heritage change to the attribute points (uplifted dog −1).
 * @param {Record<string, number>} c.skills         Active skill ranks.
 * @param {number[]} [c.rituals=[]]                 Ritual ranks (rituals are learned as skills, p.69).
 * @param {number[]} [c.knowledge=[]]               Knowledge skill ranks.
 * @param {Record<string, number>} c.etiquettes     Etiquette ranks.
 * @param {number} c.int                            Intelligence (knowledge points = 2 × INT).
 * @param {number} c.cha                            Charisma (etiquette points = 2 × CHA).
 * @param {string} c.heritage
 * @param {string} c.talent
 * @param {number} [c.spent=0]                      Zuzus spent on gear, implants, assets, lifestyle.
 * @returns {{budgets: object[], issues: {code: string, data?: object}[], ok: boolean}}
 */
export function creationReport(c) {
  const p = c.priorities ?? {};
  const issues = [];

  // Each priority level can only be used once.
  const used = PRIORITY_CATEGORIES.map(k => p[k]).filter(Boolean);
  const missing = PRIORITY_CATEGORIES.filter(k => !p[k]);
  if (missing.length) issues.push({ code: "priorityMissing", data: { categories: missing } });
  const dupes = [...new Set(used.filter((l, i) => used.indexOf(l) !== i))];
  if (dupes.length) issues.push({ code: "priorityDuplicate", data: { levels: dupes } });

  if (p.heritage && c.heritage in HERITAGE_MIN_PRIORITY && !meets(p.heritage, HERITAGE_MIN_PRIORITY[c.heritage])) {
    issues.push({ code: "heritagePriority", data: { min: HERITAGE_MIN_PRIORITY[c.heritage] } });
  }
  if (p.magic && c.talent in TALENT_MIN_PRIORITY && !meets(p.magic, TALENT_MIN_PRIORITY[c.talent])) {
    issues.push({ code: "talentPriority", data: { min: TALENT_MIN_PRIORITY[c.talent] } });
  }

  // Attributes (p.45): start at 1; 1 point up to 10, 2 points to 15, 3 points beyond.
  const attrSpent = Object.values(c.attributes).reduce((sum, v) => sum + attributeCost(v), 0);
  const attrBudget = p.attributes ? PRIORITY_TABLE.attributes[p.attributes] + (c.attributeAdjust ?? 0) : null;
  for (const [key, value] of Object.entries(c.attributes)) {
    if (value < 1) issues.push({ code: "attributeLow", data: { key } });
    const max = c.attributeMax?.[key];
    if (Number.isFinite(max) && value > max) issues.push({ code: "attributeHigh", data: { key, max } });
  }

  // Active skills (p.45), including rituals; Martial Arts costs 2 per rank.
  let skillSpent = 0;
  for (const [key, rank] of Object.entries(c.skills)) {
    skillSpent += rank * (SKILL_RANK_COST[key] ?? 1);
    if (rank > CREATION_SKILL_MAX) issues.push({ code: "skillHigh", data: { key, max: CREATION_SKILL_MAX } });
  }
  for (const rank of c.rituals ?? []) {
    skillSpent += rank;
    if (rank > CREATION_SKILL_MAX) issues.push({ code: "ritualHigh", data: { max: CREATION_SKILL_MAX } });
  }
  const skillBudget = p.skills ? PRIORITY_TABLE.skills[p.skills] : null;

  const knowledgeSpent = (c.knowledge ?? []).reduce((s, r) => s + r, 0);
  const etiquetteSpent = Object.values(c.etiquettes).reduce((s, r) => s + r, 0);
  for (const rank of [...(c.knowledge ?? []), ...Object.values(c.etiquettes)]) {
    if (rank > CREATION_SKILL_MAX) {
      issues.push({ code: "skillHigh", data: { key: null, max: CREATION_SKILL_MAX } });
      break;
    }
  }

  const resourceBudget = p.resources ? PRIORITY_TABLE.resources[p.resources] : null;

  const budgets = [
    { key: "attributes", spent: attrSpent, budget: attrBudget },
    { key: "skills", spent: skillSpent, budget: skillBudget },
    { key: "knowledge", spent: knowledgeSpent, budget: 2 * (c.int ?? 0) },
    { key: "etiquettes", spent: etiquetteSpent, budget: 2 * (c.cha ?? 0) },
    { key: "resources", spent: c.spent ?? 0, budget: resourceBudget }
  ].map(b => ({ ...b, over: b.budget !== null && b.spent > b.budget, left: b.budget === null ? null : b.budget - b.spent }));

  for (const b of budgets) if (b.over) issues.push({ code: "overBudget", data: { key: b.key, over: b.spent - b.budget } });

  return { budgets, issues, ok: issues.length === 0 };
}

/**
 * Zuzus spent on items and prepaid lifestyle.
 * @param {{type: string, cost?: number, quantity?: number, hireCost?: number, free?: boolean}[]} items
 * @param {string} lifestyle
 * @param {number} months
 */
export function creationSpending(items, lifestyle, months) {
  let total = (LIFESTYLE_COSTS[lifestyle] ?? 0) * Math.max(0, months ?? 0);
  for (const i of items) {
    if (i.type === "asset") total += i.free ? 0 : (i.hireCost ?? 0);
    else total += (i.cost ?? 0) * (i.quantity ?? 1);
  }
  return total;
}
