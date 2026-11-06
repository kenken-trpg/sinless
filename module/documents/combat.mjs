import { SYSTEM_ID } from "../config.mjs";
import { currentTargetNumber } from "../settings.mjs";

/**
 * Initiative (p.38): roll the entire Focus pool, add successes to Reaction.
 * Ties go to the higher Reaction (added as a fraction). Opponents controlled by
 * the Agonarch have a static initiative number.
 */
export class SinlessCombatant extends Combatant {
  /** @override */
  _getInitiativeFormula() {
    const actor = this.actor;
    if (!actor) return "0";
    const sys = actor.system;
    if (actor.type === "npc") return `${sys.initiative}`;
    if (!sys.pools) return "0";
    const dice = Math.max(0, sys.pools.focus.max);
    const rea = sys.attributes.rea.value;
    const tn = currentTargetNumber(false);
    const bonus = sys.initiativeBonus ?? 0;
    const roll = dice > 0 ? `${dice}d6cs>=${tn}` : "0";
    return `${roll} + ${rea + bonus} + ${rea / 100}`;
  }
}

/** Refresh dice pools for every combatant at the start of each round (p.85). */
export function registerCombatHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!game.user.isActiveGM) return;
    if (!("round" in changed)) return;
    if (!game.settings.get(SYSTEM_ID, "refreshPoolsOnRound")) return;
    const actors = new Set(combat.combatants.map(c => c.actor).filter(Boolean));
    for (const actor of actors) await actor.refreshPools();
  });

  // Recoil tokens do not outlast the fight (p.92).
  Hooks.on("deleteCombat", async combat => {
    if (!game.user.isActiveGM) return;
    const actors = new Set(combat.combatants.map(c => c.actor).filter(a => a?.system.combat?.recoil || a?.system.combat?.recoilPrimed));
    for (const actor of actors) await actor.stabilize();
  });
}
