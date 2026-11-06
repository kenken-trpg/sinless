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
 * Protocols running in the I/O (p.136), never below 0. Sensor daemons watching
 * the action add their own alert afterwards, which Shadow Protocols do not hide (p.205).
 */
export function softwareAlert({ alert = 0, alertPerSuccess = 0 } = {}, successes = 0, shadow = 0, sensor = 0) {
  const raw = (alert || 0) + (alertPerSuccess || 0) * Math.max(0, successes || 0);
  return Math.max(0, raw - Math.max(0, shadow || 0)) + Math.max(0, sensor || 0);
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

/* ---------------- Digital combat (pp.130, 133, 135-137, 205-206) ---------------- */

/** Digital attack software kinds. */
export const DIGITAL_ATTACKS = Object.freeze(["derez", "acid", "strike"]);

/**
 * Hardening of a decker, deck or software agent works as armor against digital
 * damage (p.130); some ICE ignores part of it (BEEs ignore 4, p.205).
 */
export function hardeningReduction(hardening, ignore = 0) {
  return Math.max(0, (Number(hardening) || 0) - Math.max(0, Number(ignore) || 0));
}

/**
 * Successes left after defense and hardening (De-rez, Acid Burn: "hardening and
 * defensive routines reduce these successes", pp.135-136).
 */
export function digitalNet({ hits = 0, defense = 0, hardening = 0, ignore = 0 } = {}) {
  return Math.max(0, (Number(hits) || 0) - Math.max(0, Number(defense) || 0) - hardeningReduction(hardening, ignore));
}

/**
 * Acid Burn (p.135): on a success, hardening drops by net successes plus half
 * the software rating (rounded down).
 * @returns {{net: number, reduction: number, hardening: number}}
 */
export function acidBurnResult({ hits = 0, defense = 0, hardening = 0, rating = 0 } = {}) {
  const net = digitalNet({ hits, defense, hardening });
  const reduction = net > 0 ? net + Math.floor(Math.max(0, rating) / 2) : 0;
  return { net, reduction, hardening: Math.max(0, (Number(hardening) || 0) - reduction) };
}

/**
 * Which track a digital hit marks (p.133): software entities only have a
 * cohesion track (the stun track here); people in AR take stun, or physical
 * damage when hot-seated through a nerve rig (p.129).
 */
export function digitalTrack({ entity = false, hotseat = false } = {}) {
  if (entity) return "stun";
  return hotseat ? "physical" : "stun";
}

/** Network entities double their defense dice against physical and magical attacks (p.205). */
export function entityDefenseDice(dice, { entity = false, digital = false } = {}) {
  const n = Math.max(0, Number(dice) || 0);
  return entity && !digital ? n * 2 : n;
}

/** RNID and enemy deckers shrink the influence field: 2 m per success by default (p.205). */
export function shrinkInfluence(influence, successes, meters = 2) {
  const loss = Math.max(0, Number(successes) || 0) * Math.max(0, Number(meters) || 0);
  const before = Math.max(0, Number(influence) || 0);
  return { loss: Math.min(before, loss), influence: Math.max(0, before - loss) };
}

/**
 * Resolve one digital attack against one target.
 * - weapon (ICE sting, digital weapons): net = hits − defense; damage = base + net,
 *   reduced by hardening (less what the attack ignores), then soak.
 * - strike (Electric Strike, p.137): 1d6 + successes, cannot be dodged, ignores
 *   armor and hardening, can be soaked; doubled against machines and software.
 * - derez (p.136): successes left after defense and hardening each deal 1d6 to cohesion.
 * - acid (p.135): lowers hardening (see acidBurnResult).
 */
export function resolveDigital({ kind = "weapon", base = 0, hits = 0, defense = 0, hardening = 0, ignore = 0, soak = 0, machine = false, rating = 0 } = {}) {
  const n = v => Math.max(0, Number(v) || 0);
  switch (kind) {
    case "strike": {
      const raw = (n(base) + n(hits)) * (machine ? 2 : 1);
      return { kind, hit: true, net: n(hits), raw, reduction: 0, afterArmor: raw, final: Math.max(0, raw - n(soak)) };
    }
    case "derez": {
      const net = digitalNet({ hits, defense, hardening, ignore });
      return { kind, hit: net > 0, net, dice: net };
    }
    case "acid": {
      const r = acidBurnResult({ hits, defense, hardening, rating });
      return { kind, hit: r.net > 0, net: r.net, reduction: r.reduction, hardening: r.hardening };
    }
    default: {
      const net = n(hits) - n(defense);
      if (net <= 0) return { kind: "weapon", hit: false, net: 0, raw: 0, reduction: 0, afterArmor: 0, final: 0 };
      const raw = n(base) + net;
      const reduction = hardeningReduction(hardening, ignore);
      const afterArmor = Math.max(0, raw - reduction);
      return { kind: "weapon", hit: true, net, raw, reduction, afterArmor, final: Math.max(0, afterArmor - n(soak)) };
    }
  }
}
