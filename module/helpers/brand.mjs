/**
 * Pure brand / sector rules (pp.47, 218-224). No Foundry globals.
 */
import { BRAND_STATS, BRAND_TRAITS, RESOURCE_CLASSES } from "../config.mjs";

/** Sector actions per turn: 3, +1 at market cap 10, 100, 1,000, 10,000, 100,000 (p.222). */
export function sectorActionCount(marketCap) {
  let n = 3;
  for (let t = 10; t <= 100000; t *= 10) if (marketCap >= t) n++;
  return n;
}

/** Brand trait slots: 2, a third at market cap 10, a fourth at 100 (pp.47, 223). */
export function traitSlots(marketCap) {
  return 2 + (marketCap >= 10 ? 1 : 0) + (marketCap >= 100 ? 1 : 0);
}

/** Condition boxes for a resource class. */
export function resourceBoxes(cls) {
  return RESOURCE_CLASSES[cls] ?? 1;
}

/** A resource works only when controlled and undamaged (p.219). */
export function resourceFunctions(resource) {
  return !!resource.controlled && (resource.damage ?? 0) <= 0;
}

/**
 * Market cap a functioning resource provides, after sector heat (p.220) and
 * trait modifiers (p.223).
 * @param {{market: number, marketBonus?: number, tags?: string[]}} resource
 * @param {{heat?: number, traits?: string[]}} context
 */
export function resourceMarket(resource, { heat = 0, traits = [] } = {}) {
  const tags = new Set(resource.tags ?? []);
  let market = (resource.market ?? 0) + (resource.marketBonus ?? 0);
  for (const key of traits) {
    for (const [tag, bonus] of Object.entries(BRAND_TRAITS[key]?.marketTags ?? {})) {
      if (tags.has(tag)) market += bonus;
    }
  }
  switch (Number(heat)) {
    case 0:
      if (tags.has("vice")) market -= 1;
      if (tags.has("business")) market += 2;
      break;
    case 2:
      if (tags.has("vice")) market += Math.max(1, Math.floor(market * 0.1));
      break;
    case 3:
      market -= 1;
      break;
    case 4:
      if (tags.has("business")) market = 0;
      break;
  }
  return Math.max(0, market);
}

/**
 * Brand statistics: base (1 + player raises) + traits + functioning resources.
 * @param {Record<string, number>} base
 * @param {string[]} traits
 * @param {Array<Record<string, number>>} resourceBonuses
 */
export function brandStats(base, traits = [], resourceBonuses = []) {
  const stats = {};
  for (const key of Object.keys(BRAND_STATS)) {
    let v = base[key] ?? 1;
    for (const t of traits) v += BRAND_TRAITS[t]?.stats?.[key] ?? 0;
    for (const b of resourceBonuses) v += b?.[key] ?? 0;
    stats[key] = v;
  }
  return stats;
}

/**
 * Market cap and upkeep for a brand (pp.221-222).
 * @param {object} o
 * @param {Array} o.resources  {market, marketBonus, upkeep, tags, controlled, damage}
 * @param {Array} o.assets     {upkeep, free}
 * @param {string[]} [o.traits]
 * @param {number} [o.heat]
 * @param {number} [o.adjust]  Manual market cap adjustment (assets that raise it, etc.)
 */
export function brandFinances({ resources = [], assets = [], traits = [], heat = 0, adjust = 0 }) {
  let marketCap = adjust;
  let resourceUpkeep = 0;
  for (const r of resources) {
    if (!r.controlled) continue;
    resourceUpkeep += r.upkeep ?? 0;
    if (resourceFunctions(r)) marketCap += resourceMarket(r, { heat, traits });
  }
  const perAsset = traits.reduce((n, t) => n + (BRAND_TRAITS[t]?.assetUpkeep ?? 0), 0);
  let assetUpkeep = 0;
  for (const a of assets) {
    if (a.free) continue;
    assetUpkeep += Math.max(0, (a.upkeep ?? 0) + perAsset);
  }
  const totalReduction = traits.reduce((n, t) => n + (BRAND_TRAITS[t]?.totalUpkeep ?? 0), 0);
  const upkeep = Math.max(0, resourceUpkeep + assetUpkeep + totalReduction);
  marketCap = Math.max(0, marketCap);
  return {
    marketCap,
    resourceUpkeep,
    assetUpkeep,
    upkeep,
    net: marketCap - upkeep,
    assetCapacityExceeded: assetUpkeep > marketCap
  };
}

/** Automatic successes from traits (Competence). */
export function autoSuccesses(traits = []) {
  return traits.reduce((n, t) => n + (BRAND_TRAITS[t]?.autoSuccess ?? 0), 0);
}

/** Penalty dice from sector heat for a brand action on a given stat (p.220). */
export function sectorHeatPenalty(heat, stat) {
  if (Number(heat) >= 2 && stat === "media") return 1;
  return 0;
}
