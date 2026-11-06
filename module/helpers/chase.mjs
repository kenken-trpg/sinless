/**
 * Car chase framework (pp.151-152, 230-232).
 * Pure functions, unit-tested without Foundry.
 */

/** Legs to escape by run difficulty: 3 / 4 / 5 (p.151). */
export const CHASE_LEGS = Object.freeze({ veteran: 3, professional: 4, prime: 5 });

/** Path decks: two on veteran runs, three on professional and prime runs (p.230). */
export const CHASE_PATHS = Object.freeze({ veteran: 2, professional: 3, prime: 3 });

/** Enemy positions, nearest first. Dropping back from distant leaves the chase (p.152). */
export const CHASE_RANGES = Object.freeze(["engaged", "close", "fallingBack", "distant"]);

/**
 * Rigger chase actions (p.231-232): Drive/Fly + handling, complex actions.
 * `needed` is a fixed number of successes; maneuver needs the target's handling.
 */
export const CHASE_ACTIONS = Object.freeze({
  maneuver: { needed: null },
  trap: { needed: 4, failBackfires: true },
  book: { needed: 2 },
  burn: { needed: 4 },
  switch: { needed: 2 },
  plot: { needed: 1 }
});

/** Marker for path cards that complete a leg. */
const LEG_PATTERN = /^\s*(\+|\[leg\]|leg\b|区間)/i;

/**
 * Parse the Agonarch's path options, one card per line. Lines starting with
 * "+" (or "[leg]") are "leg completed" cards.
 * @returns {{text: string, leg: boolean}[]}
 */
export function parseDeck(text) {
  return String(text ?? "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const leg = LEG_PATTERN.test(line);
    const clean = line.replace(/^\s*(\+|\[leg\])\s*/i, "").trim();
    return { text: clean || line, leg };
  });
}

/** Fisher-Yates shuffle with an injectable random source. */
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffle the deck and deal it round-robin into `count` face-down paths (p.230). */
export function dealPaths(cards, count, random = Math.random) {
  const paths = Array.from({ length: Math.max(1, count) }, () => []);
  shuffle(cards, random).forEach((card, i) => paths[i % paths.length].push({ ...card, revealed: false }));
  return paths;
}

/**
 * Move an enemy by range categories (positive = falls back). Flying enemies
 * cannot be escaped and stay close (p.152). Falling back from distant is "out".
 */
export function moveRange(range, delta, { flying = false } = {}) {
  if (flying) return "close";
  const i = CHASE_RANGES.indexOf(range);
  const next = (i < 0 ? 1 : i) + delta;
  if (next >= CHASE_RANGES.length) return "out";
  return CHASE_RANGES[Math.max(0, next)];
}

/** Whether an enemy can be attacked: engaged or close (catching up) (p.231). */
export function inAttackRange(range) {
  return range === "engaged" || range === "close";
}

/**
 * Successes needed for a chase action. Maneuver: the target's handling, at
 * least one even when damage pushed it below one; between riggers it must be
 * exceeded (p.152).
 */
export function chaseNeeded(action, { handling = 0, rigger = false } = {}) {
  const def = CHASE_ACTIONS[action];
  if (!def) return null;
  if (def.needed !== null) return def.needed;
  const h = Math.max(1, handling);
  return rigger ? h + 1 : h;
}

/**
 * How the chase stands: escaped when all legs are done or no pursuer remains
 * (p.232); wrecked when the players' vehicle is wrecked.
 * @param {{legs: number, legsDone: number, enemies: {range: string, wrecked?: boolean}[], wrecked?: boolean}} s
 */
export function chaseOutcome(s) {
  if (s.wrecked) return "wrecked";
  if (s.legsDone >= s.legs) return "legs";
  const remaining = (s.enemies ?? []).filter(e => e.range !== "out" && !e.wrecked);
  if (s.enemies?.length && !remaining.length) return "evaded";
  return null;
}
