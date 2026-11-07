// Weapon attacks, recoil and damage (ch.5).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, SYSTEM_ID, skillLabel } from "../../config.mjs";
import { damageFormula, weaponArmorType, applyConditionDamage } from "../../helpers/damage.mjs";
import { hotseatFeedback } from "../../helpers/rigging.mjs";
import {
  RANGED_CATEGORIES, RECOIL_CATEGORIES, firingAction, recoilAfterShot, recoilJammed, specMatches
} from "../../helpers/combat.mjs";
import { killedOutright } from "../../helpers/condition.mjs";

export const CombatActor = Base => class SinlessCombatActor extends Base {
  async rollWeapon(item) {
    const sys = item.system;
    const skillKey = sys.skill;
    if (this.type === "vehicle") return this.rollVehicleWeapon(item);
    if (this.type === "npc" && Number.isInteger(sys.attackDice)) {
      const defaults = this._fixedDiceDefaults(item.name, sys.attackDice, [game.i18n.localize(skillLabel(skillKey))]);
      this._combatDefaults(defaults, item, { fixed: true });
      return this._runTest(defaults, await this._weaponCardData(item));
    }
    const { mode, rank, spec } = this._skillMode(skillKey);
    const defaults = this._testDefaults({
      label: item.name, pool: SINLESS.SKILLS[skillKey]?.pool ?? "finesse", mode, rank,
      gear: sys.accuracy, notes: [game.i18n.localize(skillLabel(skillKey))],
      spec, specApplies: specMatches(spec, item.name)
    });
    defaults.showFiring = sys.category === "firearm" || sys.category === "energy" || sys.category === "heavy";
    this._combatDefaults(defaults, item);
    return this._runTest(defaults, config => this._attackCardData(item, config));
  }

  /** Ranged modifiers (pp.88-92) and recoil state for an attack dialog. */
  _combatDefaults(defaults, item, { fixed = false } = {}) {
    const sys = item.system;
    if (!RANGED_CATEGORIES.includes(sys.category)) return defaults;
    const range = [sys.rangeClose, sys.rangeMax].filter(Boolean).join(" / ");
    const tracksRecoil = !fixed && !!this.system.combat && RECOIL_CATEGORIES.includes(sys.category);
    const capacity = (this.system.combat?.recoilCapacity ?? 1) + (sys.recoilComp ?? 0);
    defaults.combat = {
      accuracy: fixed ? 0 : sys.accuracy,
      range,
      recoil: tracksRecoil ? { tokens: this.system.combat.recoil, capacity, primed: this.system.combat.recoilPrimed } : null
    };
    return defaults;
  }

  /**
   * Attack card data plus recoil (p.91): the shot misses when the capacity was
   * already reached, then the firing action adds recoil tokens.
   */
  async _attackCardData(item, config) {
    const data = await this._weaponCardData(item);
    const recoil = config.combat?.recoil;
    if (!recoil) return data;
    const jammed = recoilJammed(recoil.tokens, recoil.capacity);
    const next = recoilAfterShot({ tokens: recoil.tokens, primed: recoil.primed }, firingAction(config.firingMode));
    await this.update({ "system.combat.recoil": next.tokens, "system.combat.recoilPrimed": next.primed });
    data.recoil = { tokens: next.tokens, capacity: recoil.capacity, gained: next.gained, jammed };
    return data;
  }

  /** Stabilize the weapon (p.92): remove all recoil tokens. */
  async stabilize() {
    if (!this.system.combat) return this;
    return this.update({ "system.combat.recoil": 0, "system.combat.recoilPrimed": false });
  }

  /** Strength used for melee and thrown damage (p.94). */
  get strength() {
    return this.system.attributes?.str?.value ?? this.system.strength ?? 0;
  }

  /**
   * Weapon data stored on the attack card: damage is evaluated now (it may use
   * Strength or dice), and the current targets are recorded for the defenders.
   */
  async _weaponCardData(item) {
    const sys = item.system;
    const { formula, note } = damageFormula(sys.damage, this.strength);
    let damage = 0;
    let damageRoll = null;
    try {
      damageRoll = await new Roll(formula).evaluate();
      damage = Math.max(0, Math.floor(damageRoll.total));
    } catch (err) {
      console.warn(`${SYSTEM_ID} | Cannot evaluate damage "${sys.damage}" of ${item.name}`, err);
    }
    const targets = [...(game.user?.targets ?? [])]
      .filter(t => t.actor && t.actor !== this)
      .map(t => ({ uuid: t.document.uuid, name: t.name }));
    return {
      weapon: true,
      damage,
      damageText: sys.damage,
      damageFormula: damageRoll?.isDeterministic === false ? damageRoll.result : "",
      damageNote: note,
      penetration: sys.penetration,
      armorType: weaponArmorType(sys.category, sys.armorType),
      energy: sys.category === "energy",
      stun: sys.stun || sys.category === "unarmed",
      blast: sys.blast,
      digital: sys.digital ? "weapon" : null,
      ignoreHardening: sys.digital ? sys.ignoreHardening : 0,
      targets
    };
  }

  /**
   * Mark damage on the condition tracks (overflowing as needed), strip armor
   * hit by energy weapons, and post a summary card.
   * @param {object} result   Output of resolveDamage plus `source` (attack label).
   */
  async applyDamage(result) {
    const sys = this.system;
    if (!sys.condition) return null;
    const max = { physical: sys.condition.physical.max, stun: sys.condition.stun.max };
    const before = {
      physical: sys.condition.physical.value,
      stun: sys.condition.stun.value,
      overflow: sys.condition.overflow
    };
    // Software entities only have a cohesion track: every hit marks it (p.133).
    if (this.isEntity) result = { ...result, track: "stun" };
    const after = applyConditionDamage(before, max, result.final, result.track);
    await this.update({
      "system.condition.physical.value": after.physical,
      "system.condition.stun.value": after.stun,
      "system.condition.overflow": after.overflow
    });
    // More damage in one attack than the whole physical track is fatal (p.97).
    const killed = this.type !== "vehicle" && !this.isEntity && result.final > 0 && killedOutright(result.final, max.physical);
    if (killed) await this.markDead();
    // A full cohesion track crashes the software until it reboots (p.133).
    const crashed = this.isEntity && max.stun > 0 && after.stun >= max.stun && before.stun < max.stun;
    if (crashed) await this.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
    // Hot-seated rigger takes the vehicle's physical damage as stun, less VCR hardening (p.142).
    let feedbackPending = null;
    if (this.type === "vehicle" && this.controlMode === "hotseat" && result.final > 0) {
      const rigger = this.vehicleController;
      const damage = after.physical - before.physical;
      const feedback = hotseatFeedback(damage, rigger?.vcr?.system.hardeningBonus ?? 0);
      // Whoever cannot update the rigger leaves the feedback to the rigger's owner or the GM.
      if (rigger && feedback > 0 && !rigger.isOwner) {
        feedbackPending = { name: rigger.name, n: feedback };
        ui.notifications.warn(game.i18n.format("SINLESS.Rig.feedbackPending", feedbackPending));
      } else if (rigger && feedback > 0) {
        await rigger.applyDamage({
          hit: true, raw: damage, armorReduction: damage - feedback, afterArmor: feedback, final: feedback,
          track: "stun", stripped: [], source: game.i18n.format("SINLESS.Rig.feedback", { name: this.name })
        });
      }
    }
    const strippedNames = [];
    for (const kind of result.stripped ?? []) {
      const name = await this._stripArmor(kind);
      if (name) strippedNames.push(`${name} (${game.i18n.localize(`SINLESS.Armor.${kind}`)} −1)`);
    }
    const content = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/chat/damage-card.hbs`,
      {
        name: this.name,
        source: result.source,
        result,
        trackLabel: this.isEntity ? "SINLESS.Grid.cohesion" : `SINLESS.Condition.${result.track}`,
        before, after, max,
        overflowAdded: after.overflow - before.overflow,
        strippedNames,
        killed,
        crashed,
        feedbackPending,
        entity: this.isEntity
      }
    );
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }

  /** Energy weapons lower the best armor of a type by one point (p.110). */
  async _stripArmor(kind) {
    const worn = this.items.filter(i => i.type === "armor" && i.system.equipped && i.system[kind] > 0);
    const best = worn.sort((a, b) => b.system[kind] - a.system[kind])[0];
    const bonus = this.system.armorBonus?.[kind] ?? 0;
    if (best && best.system[kind] >= bonus) {
      await best.update({ [`system.${kind}`]: best.system[kind] - 1 });
      return best.name;
    }
    if (bonus > 0) {
      await this.update({ [`system.armorBonus.${kind}`]: bonus - 1 });
      return game.i18n.localize("SINLESS.Damage.armorBonus");
    }
    return null;
  }
};
