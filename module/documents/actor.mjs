import { SINLESS, SYSTEM_ID, skillLabel, AGONARCH_TN } from "../config.mjs";
import { autoSuccesses, sectorHeatPenalty } from "../helpers/brand.mjs";
import { damageFormula, weaponArmorType, applyConditionDamage } from "../helpers/damage.mjs";
import { currentTargetNumber, currentHeatBonus } from "../settings.mjs";
import { testDialog } from "../apps/test-dialog.mjs";
import { performTest } from "../dice/test-roll.mjs";

export class SinlessActor extends Actor {
  /** @override Characters get linked tokens so pools and damage stay on the actor. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (this.type === "character" && data.prototypeToken?.actorLink === undefined) {
      this.updateSource({ "prototypeToken.actorLink": true });
    }
  }

  /** @override */
  getRollData() {
    const data = { ...super.getRollData() };
    if (this.system.attributes) {
      for (const [k, a] of Object.entries(this.system.attributes)) data[k] = a.value;
    }
    data.tn = currentTargetNumber(this.system.isAgonarch);
    return data;
  }

  /** Whether this actor currently takes part in an active combat. */
  get inConflict() {
    const combat = game.combat;
    if (!combat?.started) return false;
    return combat.combatants.some(c => c.actor === this);
  }

  /** Best rank among other skills in the same group (for defaulting at -2). */
  groupRank(skillKey) {
    const group = SINLESS.SKILLS[skillKey]?.group;
    if (!group) return 0;
    return Object.entries(SINLESS.SKILLS)
      .filter(([k, s]) => k !== skillKey && s.group === group)
      .reduce((best, [k]) => Math.max(best, this.system.skills[k]?.rank ?? 0), 0);
  }

  /** Common defaults for the test dialog. */
  _testDefaults({ label, pool = null, mode = "skill", rank = 0, gear = 0, bonus = 0, notes = [] }) {
    const sys = this.system;
    const conflict = this.inConflict;
    if (mode === "skill" && !conflict) mode = "rank";
    const poolValues = Object.fromEntries(Object.entries(sys.pools).map(([k, p]) => [k, conflict ? p.value : p.max]));
    let penalty = sys.totalPenalty ?? 0;
    // Lifestyle effects during a run (p.46).
    if (sys.lifestyle === "squatter") penalty += 1;
    if (["high", "wealthy"].includes(sys.lifestyle) && penalty > 0) penalty -= 1;
    return {
      label,
      pool,
      mode,
      rank,
      gear,
      bonus: bonus + currentHeatBonus(sys.isAgonarch),
      penalty,
      kismet: 0,
      kismetAvailable: sys.kismet?.pool?.value ?? 0,
      hasKismet: !!sys.kismet,
      target: currentTargetNumber(sys.isAgonarch),
      reroll: 0,
      threshold: "",
      spendPool: conflict,
      conflict,
      poolValues,
      showFiring: false,
      firingMode: "none",
      notes
    };
  }

  async _runTest(defaults, extra = {}) {
    const config = await testDialog(defaults);
    if (!config) return null;
    if (config.plan.impossible || config.plan.total <= 0) {
      ui.notifications.warn("SINLESS.Test.impossible", { localize: true });
      return null;
    }
    const notes = [...(defaults.notes ?? [])];
    if (config.mode !== "skill" && config.mode !== "rank") {
      notes.push(game.i18n.localize(SINLESS.TEST_MODES[config.mode]));
    }
    if (config.firingMode && config.firingMode !== "none") {
      notes.push(game.i18n.localize(SINLESS.FIRING_MODES[config.firingMode].label));
    }
    return performTest({
      actor: this,
      label: defaults.label,
      pool: config.pool,
      plan: config.plan,
      target: config.target,
      reroll: config.reroll,
      spendPool: config.spendPool,
      threshold: config.threshold,
      notes,
      extra,
      autoSuccesses: config.autoSuccesses
    });
  }

  /** Roll an active skill. Chooses defaulting or untrained use automatically. */
  async rollSkill(skillKey) {
    const def = SINLESS.SKILLS[skillKey];
    if (!def) return null;
    const skill = this.system.skills[skillKey];
    let mode = "skill";
    let rank = skill.rank;
    const notes = [];
    if (rank <= 0) {
      const groupRank = this.groupRank(skillKey);
      if (groupRank > 0) {
        mode = "default";
        rank = groupRank;
      } else if (!def.trainedOnly) mode = "untrained";
    }
    if (skill.spec) notes.push(skill.spec);
    return this._runTest(this._testDefaults({
      label: game.i18n.localize(skillLabel(skillKey)), pool: def.pool, mode, rank, notes
    }));
  }

  /**
   * Roll a pool for defense (dodge, soak, resist): no limit applies (p.29).
   * Opponents with bestiary defenses roll their listed dice instead (p.195).
   */
  async rollDefense(key) {
    const def = SINLESS.DEFENSES[key];
    if (!def) return null;
    const fixed = this.system.fixedDefense?.(key) ?? null;
    if (fixed !== null) return this._rollFixedDefense(key, fixed);
    const defaults = this._testDefaults({
      label: game.i18n.localize(def.label), pool: def.pool, mode: "defense"
    });
    defaults.penalty = 0;
    defaults.spendPool = this.inConflict;
    return this._runTest(defaults);
  }

  /** Critter rules (p.195): roll the listed dice, no pool is spent. */
  async _rollFixedDefense(key, dice) {
    const label = game.i18n.localize(SINLESS.DEFENSES[key].label);
    const defaults = this._fixedDiceDefaults(label, dice);
    defaults.penalty = 0;
    return this._runTest(defaults);
  }

  /**
   * Dialog defaults for a fixed-dice opponent test. Penalty dice still apply
   * (p.195: player abilities that apply penalties affect all opponent tests).
   */
  _fixedDiceDefaults(label, dice, notes = []) {
    const defaults = this._testDefaults({
      label, mode: "rank", rank: dice,
      notes: [...notes, game.i18n.localize("SINLESS.Npc.fixedDiceNote")]
    });
    return Object.assign(defaults, {
      simple: true,
      pool: null,
      mode: "rank",
      rankLabel: game.i18n.localize("SINLESS.Npc.fixedDice"),
      spendPool: false,
      conflict: false,
      showFiring: false
    });
  }

  /** Etiquette test: roll dice equal to the etiquette rank (p.69). */
  async rollEtiquette(key, { label, bonus = 0, penalty = 0 } = {}) {
    let rank = this.system.etiquettes[key]?.rank ?? 0;
    let extraBonus = bonus;
    // Wealthy lifestyle: +1 die on etiquette tests, even at rank 0 (p.46).
    if (this.system.lifestyle === "wealthy") extraBonus += 1;
    const defaults = this._testDefaults({
      label: label ?? game.i18n.localize(SINLESS.ETIQUETTES[key]), mode: "rank", rank, bonus: extraBonus
    });
    defaults.mode = "rank";
    defaults.spendPool = false;
    defaults.penalty += penalty;
    return this._runTest(defaults);
  }

  async rollWeapon(item) {
    const sys = item.system;
    const skillKey = sys.skill;
    if (this.type === "npc" && Number.isInteger(sys.attackDice)) {
      const defaults = this._fixedDiceDefaults(item.name, sys.attackDice, [game.i18n.localize(skillLabel(skillKey))]);
      return this._runTest(defaults, await this._weaponCardData(item));
    }
    const def = SINLESS.SKILLS[skillKey];
    let rank = this.system.skills[skillKey]?.rank ?? 0;
    let mode = "skill";
    if (rank <= 0) {
      const g = this.groupRank(skillKey);
      if (g > 0) { mode = "default"; rank = g; }
      else if (!def?.trainedOnly) mode = "untrained";
    }
    const defaults = this._testDefaults({
      label: item.name, pool: def?.pool ?? "finesse", mode, rank,
      gear: sys.accuracy, notes: [game.i18n.localize(skillLabel(skillKey))]
    });
    defaults.showFiring = sys.category === "firearm" || sys.category === "energy" || sys.category === "heavy";
    return this._runTest(defaults, await this._weaponCardData(item));
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
    const after = applyConditionDamage(before, max, result.final, result.track);
    await this.update({
      "system.condition.physical.value": after.physical,
      "system.condition.stun.value": after.stun,
      "system.condition.overflow": after.overflow
    });
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
        trackLabel: `SINLESS.Condition.${result.track}`,
        before, after, max,
        overflowAdded: after.overflow - before.overflow,
        strippedNames
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

  async rollRitual(item) {
    return this._runTest(this._testDefaults({
      label: item.name, pool: item.system.pool, rank: item.system.rank
    }));
  }

  /**
   * Asset test (p.70). On a brand, the member with the best matching etiquette
   * rolls; sector heat 3+ penalizes asset tests (p.220).
   */
  async rollAsset(item) {
    const key = item.system.etiquette;
    if (this.type !== "brand") return this.rollEtiquette(key, { label: item.name });
    const heat = this.system.sector.heat;
    const penalty = heat >= 4 ? 4 : heat >= 3 ? 2 : 0;
    const members = this.system.members.map(id => game.actors.get(id)).filter(a => a?.isOwner);
    const best = members.sort((a, b) =>
      (b.system.etiquettes[key]?.rank ?? 0) - (a.system.etiquettes[key]?.rank ?? 0))[0];
    if (!best) {
      ui.notifications.warn("SINLESS.Notify.noMember", { localize: true });
      return null;
    }
    return best.rollEtiquette(key, { label: `${item.name} (${best.name})`, penalty });
  }

  /** Free roll from a pool (e.g. an attribute-only test decided by the Agonarch). */
  async rollPool(pool) {
    return this._runTest(this._testDefaults({
      label: game.i18n.localize(SINLESS.POOLS[pool]), pool, mode: "defense"
    }));
  }

  /* ---------------- Brand (pp.221-223) ---------------- */

  /** Dialog defaults for a brand test: roll dice equal to the statistic, no pools. */
  _brandDefaults(label, stat) {
    const sys = this.system;
    return {
      label,
      simple: true,
      pool: null,
      mode: "rank",
      rank: sys.stats[stat],
      rankLabel: game.i18n.localize(SINLESS.BRAND_STATS[stat]),
      gear: 0,
      bonus: 0,
      penalty: sectorHeatPenalty(sys.sector.heat, stat),
      kismet: 0,
      kismetAvailable: 0,
      hasKismet: false,
      target: AGONARCH_TN,
      reroll: 0,
      threshold: "",
      spendPool: false,
      conflict: false,
      poolValues: {},
      showFiring: false,
      firingMode: "none",
      notes: [],
      autoSuccesses: autoSuccesses([...sys.traits])
    };
  }

  async rollBrandStat(stat) {
    if (this.type !== "brand") return null;
    return this._runTest(this._brandDefaults(game.i18n.localize(SINLESS.BRAND_STATS[stat]), stat));
  }

  /** Roll a sector action, count it against the turn and apply its heat. */
  async rollBrandAction(key) {
    const def = SINLESS.BRAND_ACTIONS[key];
    if (this.type !== "brand" || !def) return null;
    const label = game.i18n.localize(`SINLESS.BrandAction.${key}.label`);
    const defaults = this._brandDefaults(label, def.stat);
    defaults.notes = [game.i18n.localize(SINLESS.BRAND_STATS[def.stat])];
    if (this.system.actionsLeft <= 0) {
      ui.notifications.warn("SINLESS.Notify.noSectorActions", { localize: true });
    }
    const config = await testDialog(defaults);
    if (!config) return null;
    if (config.plan.impossible || config.plan.total <= 0) {
      ui.notifications.warn("SINLESS.Test.impossible", { localize: true });
      return null;
    }
    const updates = { "system.actionsUsed": this.system.actionsUsed + 1 };
    let heatRaised = null;
    if (def.heat) {
      heatRaised = Math.min(4, this.system.sector.heat + def.heat);
      updates["system.sector.heat"] = heatRaised;
    }
    await this.update(updates);
    return performTest({
      actor: this,
      label,
      pool: null,
      plan: config.plan,
      target: config.target,
      reroll: config.reroll,
      spendPool: false,
      threshold: config.threshold,
      notes: defaults.notes,
      autoSuccesses: config.autoSuccesses,
      extra: { effect: game.i18n.localize(`SINLESS.BrandAction.${key}.effect`), heatRaised }
    });
  }

  /**
   * End the sector turn (p.221): profit is banked, a shortfall is paid from the
   * bank, and anything still unpaid is reported as unmet upkeep.
   */
  async endSectorTurn() {
    if (this.type !== "brand") return null;
    const sys = this.system;
    const { marketCap, upkeep, net } = sys.finance;
    let bank = sys.bank + net;
    let unmet = 0;
    if (bank < 0) {
      unmet = -bank;
      bank = 0;
    }
    await this.update({
      "system.bank": bank,
      "system.actionsUsed": 0,
      "system.sectorTurn": sys.sectorTurn + 1
    });
    const content = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/chat/sector-turn.hbs`,
      { turn: sys.sectorTurn, marketCap, upkeep, net, bank, unmet, heat: sys.sector.heat }
    );
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }

  /** Add a character as a brand member. */
  async addBrandMember(actor) {
    if (this.type !== "brand" || actor?.type !== "character") return null;
    if (this.system.members.includes(actor.id)) return this;
    await actor.update({ "system.brand": this.name });
    return this.update({ "system.members": [...this.system.members, actor.id] });
  }

  async removeBrandMember(id) {
    return this.update({ "system.members": this.system.members.filter(m => m !== id) });
  }

  /** Refresh all dice pools (start of a conflict round, p.85). */
  async refreshPools() {
    if (!this.system.pools) return this;
    const updates = {};
    for (const key of Object.keys(this.system.pools)) updates[`system.pools.${key}.spent`] = 0;
    return this.update(updates);
  }

  /** Refresh the Kismet pool (after a scene or 10 minutes of rest, p.39). */
  async refreshKismet() {
    if (!this.system.kismet) return this;
    return this.update({ "system.kismet.spent": 0 });
  }
}
