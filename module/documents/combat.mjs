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

  // Full condition tracks (p.97): bleed out each round, overload tests at the start of a turn.
  Hooks.on("updateCombat", async (combat, changed, options) => {
    if (!game.user.isActiveGM) return;
    if (!("turn" in changed || "round" in changed) || options?.direction === -1) return;
    // Starting the combat (round 0 → 1) does not count as a round passing.
    if ((changed.round ?? 0) > 1) {
      const dying = new Set(combat.combatants.map(c => c.actor).filter(a => Number.isInteger(a?.system.condition?.bleedOut)));
      for (const actor of dying) await actor.tickBleedOut();
    }
    const actor = combat.combatant?.actor;
    if (actor) await promptOverload(actor);
  });

  // Recoil tokens do not outlast the fight (p.92).
  Hooks.on("deleteCombat", async combat => {
    if (!game.user.isActiveGM) return;
    const actors = new Set(combat.combatants.map(c => c.actor).filter(a => a?.system.combat?.recoil || a?.system.combat?.recoilPrimed));
    for (const actor of actors) await actor.stabilize();
  });
}

/** Remind the owners at the start of a turn: overload tests (p.97) and continuous spells to resist (p.167). */
export async function promptOverload(actor) {
  const tests = actor.overloadTests ?? [];
  // Continuous spells (p.167): each round the target may spend a complex action to resist.
  const spells = (actor.sustainedSpells ?? []).map(s => ({ uuid: s.effect.uuid, name: s.effect.name, accumulated: s.accumulated, needed: s.needed }));
  const out = actor.statuses?.has("unconscious") || actor.statuses?.has(CONFIG.specialStatusEffects.DEFEATED);
  if ((!tests.length && !spells.length) || out) return null;
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/overload-prompt.hbs`,
    { name: actor.name, tests: tests.map(t => ({ ...t, label: `SINLESS.Overload.title.${t.track}` })), spells }
  );
  const owners = game.users.filter(u => actor.testUserPermission(u, "OWNER")).map(u => u.id);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    whisper: owners,
    flags: { [SYSTEM_ID]: { actorUuid: actor.uuid, overloadPrompt: true } }
  });
}
