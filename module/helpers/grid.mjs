/**
 * Decking rules (ch.7, pp.128-138). Pure: no Foundry globals.
 */

/** Intrusion difficulty penalty dice (p.129). */
export const INTRUSION_PENALTY = Object.freeze({ open: 0, secure: 1, red: 2, black: 4 });

/** Penalty dice for not hot-seating without a nerve rig (p.129). */
export const NO_NERVE_RIG_PENALTY = 2;

/** Penalty to extend a NAN influence radius (p.134): −2 at 40 m, another −2 every 20 m. */
export function influencePenalty(radius) {
  const r = Math.max(0, Number(radius) || 0);
  return r < 40 ? 0 : 2 * (1 + Math.floor((r - 40) / 20));
}

/**
 * Result of hacking a network access node (p.134).
 * Brute force: on a success, 2 × I/O meters plus 2 m per success; alert +2 per success.
 * Stealth infiltration: 1 m per success; alert +1 flat.
 * @param {"brute"|"stealth"} mode
 * @param {number} successes
 * @param {number} io
 * @returns {{gain: number, alert: number}}
 */
export function nanHackResult(mode, successes, io) {
  const s = Math.max(0, Number(successes) || 0);
  if (mode === "brute") return s > 0 ? { gain: 2 * (io ?? 0) + 2 * s, alert: 2 * s } : { gain: 0, alert: 0 };
  return { gain: s, alert: 1 };
}

/**
 * Alert raised by a software action: flat + per success, reduced by Shadow
 * Protocols running in the I/O (p.136), never below 0.
 */
export function softwareAlert({ alert = 0, alertPerSuccess = 0 } = {}, successes = 0, shadow = 0) {
  const raw = (alert || 0) + (alertPerSuccess || 0) * Math.max(0, successes || 0);
  return Math.max(0, raw - Math.max(0, shadow || 0));
}

/**
 * Split pool dice between MCP dice and the Focus pool (p.130): MCP dice can only
 * be used for decking, so they are spent first.
 */
export function splitDeckingDice(dice, mcpAvailable) {
  const mcp = Math.min(Math.max(0, dice), Math.max(0, mcpAvailable));
  return { mcp, focus: Math.max(0, dice) - mcp };
}

/**
 * Deck loadout problems (pp.130-133). The base hacking program is always
 * running and uses neither a thread nor an I/O slot.
 * @param {{mcp: number, threads: number, io: number}} deck
 * @param {{loaded: boolean, running: boolean, base: boolean, rating: number}[]} software
 * @returns {{loaded: number, running: number, issues: {code: string, data?: object}[]}}
 */
export function deckStatus(deck, software) {
  const loaded = software.filter(s => s.loaded && !s.base).length;
  const running = software.filter(s => s.running && !s.base).length;
  const issues = [];
  if (loaded > deck.threads) issues.push({ code: "threads", data: { loaded, max: deck.threads } });
  if (running > deck.io) issues.push({ code: "io", data: { running, max: deck.io } });
  const base = software.find(s => s.base);
  const minBase = Math.ceil((deck.mcp ?? 0) / 2);
  if (!base) issues.push({ code: "noBase" });
  else if (base.rating < minBase) issues.push({ code: "baseRating", data: { min: minBase } });
  return { loaded, running, issues };
}
