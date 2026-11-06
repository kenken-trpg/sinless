/**
 * Magic rules (ch.9, pp.166-184). Pure: no Foundry globals.
 */

/** Tiny arithmetic evaluator for +, -, *, / and parentheses (no eval). */
function evaluate(expr) {
  const tokens = expr.match(/\d+(?:\.\d+)?|[-+*/()]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const factor = () => {
    const t = next();
    if (t === "(") { const v = sum(); next(); return v; }
    if (t === "-") return -factor();
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };
  const term = () => {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const r = factor();
      v = op === "*" ? v * r : Math.floor(v / (r || 1));
    }
    return v;
  };
  const sum = () => {
    let v = term();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + term() : v - term();
    return v;
  };
  return tokens.length ? sum() : 0;
}

/**
 * Substitute Force into a formula such as "3 + (Force/2)", "½ Force" or "1+Force".
 * Halved Force is rounded down with a minimum of 1 (p.167).
 * @param {string} formula
 * @param {number} force
 * @returns {number|null} null when the formula is empty
 */
export function forceFormula(formula, force) {
  const f = Math.max(0, Math.floor(Number(force) || 0));
  const half = Math.max(1, Math.floor(f / 2));
  let s = String(formula ?? "").trim();
  if (!s) return null;
  s = s.replace(/[−–]/g, "-")
    .replace(/\(?\s*(?:½|1\/2)\s*force\s*\)?/gi, `(${half})`)
    .replace(/\(\s*force\s*\/\s*2\s*\)/gi, `(${half})`)
    .replace(/force\s*\/\s*2/gi, `(${half})`)
    .replace(/(\d)\s*force/gi, (_m, n) => `${n}*${f}`)
    .replace(/force/gi, `${f}`);
  if (!/^[\d\s+\-*/().]+$/.test(s)) return null;
  return Math.max(0, evaluate(s));
}

/** Drain is lethal (physical, unsoakable) when the force exceeds the Zoetic Potential (p.167). */
export function drainIsLethal(force, zoetic) {
  return (Number(force) || 0) > (Number(zoetic) || 0);
}

/**
 * Drain damage after channeling and soak (pp.166-167, 183).
 * Channeling reduces drain by its successes. Stun drain can also be soaked and
 * always marks at least one stun box. Lethal drain goes to the physical track
 * and cannot be soaked; if it is fully channeled, one stun box is still marked.
 * @returns {{track: "physical"|"stun", amount: number}}
 */
export function drainResult({ drain, lethal = false, channel = 0, soak = 0 }) {
  const afterChannel = Math.max(0, (drain || 0) - Math.max(0, channel || 0));
  if (lethal) return afterChannel > 0 ? { track: "physical", amount: afterChannel } : { track: "stun", amount: 1 };
  return { track: "stun", amount: Math.max(1, afterChannel - Math.max(0, soak || 0)) };
}

/**
 * Summoning a spirit (p.183): successes against the spirit's force, reduced by
 * the spirit bag. More successes bind it for one service per extra success;
 * equal successes make it appear uncontrolled; fewer and it does not appear.
 * @returns {{outcome: "bound"|"uncontrolled"|"failed", services: number, needed: number}}
 */
export function summonResult(successes, force, spiritBag = 0) {
  const needed = Math.max(0, (force || 0) - Math.max(0, spiritBag || 0));
  const s = Math.max(0, successes || 0);
  if (s > needed) return { outcome: "bound", services: s - needed, needed };
  if (s === needed) return { outcome: "uncontrolled", services: 0, needed };
  return { outcome: "failed", services: 0, needed };
}

/** Zoetic Potential spent on an amplification: amps pay half (p.180). */
export function amplificationCost(cost, isAmp) {
  return (Number(cost) || 0) * (isAmp ? 0.5 : 1);
}
