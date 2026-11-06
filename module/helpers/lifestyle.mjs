/**
 * Lifestyle upkeep each sector turn (pp.39, 46, 76).
 * Pure functions, unit-tested without Foundry.
 */
import { LIFESTYLE_COSTS } from "./creation.mjs";

/**
 * Pay one sector turn (about a month) of lifestyle: use a pre-purchased month
 * if there is one, otherwise pay the monthly cost in zuzus (p.46).
 * @returns {{mode: "free"|"prepaid"|"cash"|"unpaid", cost: number, months: number, zuzu: number}}
 */
export function payLifestyle({ lifestyle, months = 0, zuzu = 0 }) {
  const cost = LIFESTYLE_COSTS[lifestyle] ?? 0;
  if (months > 0) return { mode: "prepaid", cost: 0, months: months - 1, zuzu };
  if (cost === 0) return { mode: "free", cost: 0, months, zuzu };
  if (zuzu >= cost) return { mode: "cash", cost, months, zuzu: zuzu - cost };
  return { mode: "unpaid", cost, months, zuzu };
}

/** Pre-purchase months of a lifestyle (p.46). */
export function buyLifestyle({ lifestyle, months = 0, zuzu = 0 }, count) {
  const n = Math.max(0, Math.trunc(count));
  const cost = (LIFESTYLE_COSTS[lifestyle] ?? 0) * n;
  if (cost > zuzu) return { ok: false, cost, months, zuzu };
  return { ok: true, cost, months: months + n, zuzu: zuzu - cost };
}
