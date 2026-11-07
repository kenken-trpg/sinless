// Full condition tracks: overload, bleeding out and permanent injury (p.97).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { overloadTests, overloadDice, bleedOutRounds, organDamageMax } from "../../helpers/condition.mjs";

export const ConditionActor = Base => class SinlessConditionActor extends Base {
  /** Overload tests due at the start of this actor's turn. */
  get overloadTests() {
    const c = this.system.condition;
    if (!c || this.type === "vehicle" || this.isEntity) return [];
    return overloadTests(c);
  }

  /** Body for bleeding out; NPCs without attributes have no countdown. */
  get _bleedOutRounds() {
    const body = this.system.attributes?.bod?.value;
    return Number.isFinite(body) ? bleedOutRounds(body, this.system.condition.overflow) : null;
  }

  /** Free Brawn pool test with dice reduced by the wound penalty, no limit (p.97). */
  _brawnTestDefaults(label, dice, needed) {
    const defaults = this._testDefaults({ label, mode: "rank", rank: dice });
    return Object.assign(defaults, {
      simple: true, pool: null, mode: "rank", bonus: 0, penalty: 0, spendPool: false, conflict: false,
      rankLabel: game.i18n.localize("SINLESS.Overload.dice"), threshold: needed, showFiring: false
    });
  }

  /** Roll an overload test for a full track (p.97). */
  async rollOverload(track) {
    const test = this.overloadTests.find(t => t.track === track);
    if (!test) {
      ui.notifications.info("SINLESS.Overload.notNeeded", { localize: true });
      return null;
    }
    const c = this.system.condition;
    const dice = overloadDice(this.system.pools?.brawn?.max, c.penalty);
    const defaults = this._brawnTestDefaults(game.i18n.localize(`SINLESS.Overload.title.${track}`), dice, test.needed);
    defaults.notes = [game.i18n.localize("SINLESS.Overload.restricted")];
    return this._runTest(defaults, { overload: { track, needed: test.needed, rounds: track === "physical" ? this._bleedOutRounds : null } });
  }

  /** A failed overload test: unconscious; a physical failure also bleeds out (p.97). */
  async applyOverloadFailure(track, rounds = this._bleedOutRounds) {
    await this.toggleStatusEffect("unconscious", { active: true });
    if (track !== "physical") return this;
    await this.toggleStatusEffect("bleeding", { active: true });
    return this.update({ "system.condition.bleedOut": rounds });
  }

  /** Any Biotech success stabilizes the dying; they wake in 1d6 days (p.97). */
  async stabilizeDying() {
    await this.toggleStatusEffect("bleeding", { active: false });
    return this.update({ "system.condition.bleedOut": null });
  }

  /** Mark the actor dead (bled out or killed outright). */
  async markDead() {
    await this.toggleStatusEffect("bleeding", { active: false });
    await this.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
    if (this.system.condition?.bleedOut !== null) await this.update({ "system.condition.bleedOut": null });
    return this;
  }

  /** One combat round passes for a dying character: bleed out at zero. */
  async tickBleedOut() {
    const left = this.system.condition?.bleedOut;
    if (left === null || left === undefined) return null;
    const next = left - 1;
    if (next > 0) return this.update({ "system.condition.bleedOut": next });
    await this.markDead();
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sinless-card"><p class="effect warn">${game.i18n.format("SINLESS.Overload.bledOut", { name: foundry.utils.escapeHTML(this.name) })}</p></div>`
    });
  }

  /**
   * Permanent damage after the run (p.97): an unmodified Brawn pool test needing
   * successes equal to the overflow damage taken.
   */
  async rollPermanentInjury() {
    const overflow = this.system.condition?.overflow ?? 0;
    if (overflow <= 0) {
      ui.notifications.info("SINLESS.Injury.notNeeded", { localize: true });
      return null;
    }
    const keys = Object.keys(this.system.attributes ?? {});
    const attribute = keys.length ? keys[Math.floor(CONFIG.Dice.randomUniform() * keys.length)] : null;
    const defaults = this._brawnTestDefaults(game.i18n.localize("SINLESS.Injury.title"), this.system.pools?.brawn?.max ?? 0, overflow);
    return this._runTest(defaults, { injury: { overflow, attribute } });
  }

  /** Organ damage: the randomly chosen statistic loses 1 maximum, permanently (p.97). */
  async applyOrganDamage(attribute) {
    const attr = this.system.attributes?.[attribute];
    if (!attr) return null;
    return this.update({ [`system.attributes.${attribute}.max`]: organDamageMax(attr.max) });
  }
};
