import { SINLESS, SYSTEM_ID, skillLabel, AGONARCH_TN } from "../config.mjs";
import { autoSuccesses, sectorHeatPenalty } from "../helpers/brand.mjs";
import { damageFormula, weaponArmorType, applyConditionDamage } from "../helpers/damage.mjs";
import { currentTargetNumber, currentHeatBonus, getSetting } from "../settings.mjs";
import { INTRUSION_PENALTY, NO_NERVE_RIG_PENALTY, influencePenalty } from "../helpers/grid.mjs";
import { CONTROL_PENALTY, effectiveControl, hotseatFeedback } from "../helpers/rigging.mjs";
import { forceFormula, drainIsLethal } from "../helpers/magic.mjs";
import {
  RANGED_CATEGORIES, RECOIL_CATEGORIES, firingAction, recoilAfterShot, recoilJammed, specMatches
} from "../helpers/combat.mjs";
import {
  overloadTests, overloadDice, bleedOutRounds, killedOutright, organDamageMax
} from "../helpers/condition.mjs";
import {
  awardTotal, skillRaiseCost, attributeRaiseCost, zoeticRaiseCost, boonStatus, boonChoices, BOONS, WINDFALLS
} from "../helpers/advancement.mjs";
import { testDialog } from "../apps/test-dialog.mjs";
import { performTest } from "../dice/test-roll.mjs";

export class SinlessActor extends Actor {
  /** @override Characters get linked tokens so pools and damage stay on the actor. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (this.type === "character" && data.prototypeToken?.actorLink === undefined) {
      this.updateSource({ "prototypeToken.actorLink": true });
    }
    if (this.type === "character" && data.system?.creation?.active === undefined) {
      this.updateSource({ "system.creation.active": true });
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
  _testDefaults({ label, pool = null, mode = "skill", rank = 0, gear = 0, bonus = 0, notes = [], spec = "", specApplies = false }) {
    const sys = this.system;
    const conflict = this.inConflict;
    if (mode === "skill" && !conflict) mode = "rank";
    const poolValues = Object.fromEntries(Object.entries(sys.pools ?? {}).map(([k, p]) => [k, conflict ? p.value : p.max]));
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
      // Pool resilience boons: free Kismet dice that are never exhausted (p.238).
      resilience: { ...(sys.kismet?.resilience ?? {}) },
      hasKismet: !!sys.kismet,
      target: currentTargetNumber(sys.isAgonarch),
      reroll: 0,
      threshold: "",
      spendPool: conflict,
      conflict,
      poolValues,
      showFiring: false,
      firingMode: "none",
      // Specialization (p.41): +1 when it applies, −1 otherwise; only for a skill the actor has.
      spec: mode === "skill" || mode === "rank" ? spec : "",
      specApplies,
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
    if (typeof extra === "function") extra = await extra(config);
    const notes = [...(defaults.notes ?? [])];
    if (config.mode !== "skill" && config.mode !== "rank") {
      notes.push(game.i18n.localize(SINLESS.TEST_MODES[config.mode]));
    }
    if (config.firingMode && config.firingMode !== "none") {
      notes.push(game.i18n.localize(SINLESS.FIRING_MODES[config.firingMode].label));
    }
    notes.push(...(config.notes ?? []));
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
      autoSuccesses: config.autoSuccesses,
      kismetFree: config.kismetFree ?? 0,
      mcpAvailable: config.pool === "focus" ? defaults.mcpAvailable ?? 0 : 0,
      vcrUsed: defaults.vcrAvailable
        ? Math.clamp((config.bonusField ?? 0) - (defaults.bonusBase ?? 0), 0, defaults.vcrAvailable)
        : 0
    });
  }

  /** Mode and rank for a skill: defaulting to a grouped skill, or untrained use. */
  _skillMode(skillKey) {
    const def = SINLESS.SKILLS[skillKey];
    let rank = this.system.skills?.[skillKey]?.rank ?? 0;
    let mode = "skill";
    if (rank <= 0) {
      const g = this.groupRank(skillKey);
      if (g > 0) { mode = "default"; rank = g; }
      else if (!def?.trainedOnly) mode = "untrained";
    }
    const spec = mode === "skill" ? this.system.skills?.[skillKey]?.spec ?? "" : "";
    return { mode, rank, pool: def?.pool ?? "focus", spec };
  }

  /** Roll an active skill. Chooses defaulting or untrained use automatically. */
  async rollSkill(skillKey) {
    if (!SINLESS.SKILLS[skillKey]) return null;
    const { mode, rank, pool, spec } = this._skillMode(skillKey);
    return this._runTest(this._testDefaults({
      label: game.i18n.localize(skillLabel(skillKey)), pool, mode, rank, spec
    }));
  }

  /**
   * Roll a pool for defense (dodge, soak, resist): no limit applies (p.29).
   * Opponents with bestiary defenses roll their listed dice instead (p.195).
   */
  async rollDefense(key) {
    const def = SINLESS.DEFENSES[key];
    if (!def) return null;
    // Vehicles: a hot-seated rigger dodges with their own Finesse pool (p.144).
    if (this.type === "vehicle" && key !== "soak") {
      const rigger = this.vehicleController;
      if (key === "dodge" && rigger && this.controlMode === "hotseat") return rigger.rollDefense("dodge");
      ui.notifications.warn("SINLESS.Notify.vehicleNoDefense", { localize: true });
      return null;
    }
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
    // More damage in one attack than the whole physical track is fatal (p.97).
    const killed = this.type !== "vehicle" && result.final > 0 && killedOutright(result.final, max.physical);
    if (killed) await this.markDead();
    // Hot-seated rigger takes the vehicle's physical damage as stun, less VCR hardening (p.142).
    if (this.type === "vehicle" && this.controlMode === "hotseat" && result.final > 0) {
      const rigger = this.vehicleController;
      const damage = after.physical - before.physical;
      const feedback = hotseatFeedback(damage, rigger?.vcr?.system.hardeningBonus ?? 0);
      if (rigger && feedback > 0) {
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
        trackLabel: `SINLESS.Condition.${result.track}`,
        before, after, max,
        overflowAdded: after.overflow - before.overflow,
        strippedNames,
        killed
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

  /* ---------------- Rigging (ch.8) ---------------- */

  /** The character controlling this vehicle. */
  get vehicleController() {
    const id = this.system.controller;
    return id ? game.actors.get(id) ?? null : null;
  }

  /** A character's equipped vehicle control rig. */
  get vcr() {
    const id = this.system.rig?.vcrId;
    return id ? this.items.get(id) : null;
  }

  /** Control method in effect for this vehicle (needs a VCR, hot-seating needs a nerve rig). */
  get controlMode() {
    if (this.type !== "vehicle") return null;
    return effectiveControl(this.system.controlMode, this.vehicleController?.vcr?.system ?? null);
  }

  /** Vehicles controlled by this character. */
  get controlledVehicles() {
    return game.actors.filter(a => a.type === "vehicle" && a.system.controller === this.id);
  }

  async setVehicleController(actor) {
    if (this.type !== "vehicle") return null;
    if (actor && actor.type !== "character" && actor.type !== "npc") return null;
    return this.update({ "system.controller": actor?.id ?? "" });
  }

  /**
   * Test defaults for the rigger operating this vehicle: control method penalty,
   * vehicle damage and inertia penalties, and VCR bonus dice when hot-seated.
   */
  _rigDefaults({ label, skillKey, gear = 0, notes = [] }) {
    const rigger = this.vehicleController;
    if (!rigger) {
      ui.notifications.warn("SINLESS.Notify.noController", { localize: true });
      return null;
    }
    if (!rigger.isOwner) {
      ui.notifications.warn("SINLESS.Notify.notController", { localize: true });
      return null;
    }
    const { mode, rank, pool, spec } = rigger._skillMode(skillKey);
    const control = this.controlMode;
    const defaults = rigger._testDefaults({
      label, pool, mode, rank, gear, spec, specApplies: specMatches(spec, this.name, label),
      notes: [game.i18n.localize(skillLabel(skillKey)), this.name, game.i18n.localize(SINLESS.CONTROL_MODES[control]), ...notes]
    });
    const v = this.system;
    defaults.penalty += CONTROL_PENALTY[control] + v.totalPenalty;
    if (v.inertiaPenalty) defaults.notes.push(game.i18n.format("SINLESS.Rig.inertiaNote", { n: v.inertiaPenalty }));
    if (control === "hotseat") {
      const vcrDice = rigger.system.rig?.bonus?.value ?? 0;
      defaults.bonusBase = defaults.bonus;
      defaults.vcrAvailable = vcrDice;
      defaults.bonus += vcrDice;
      if (vcrDice) defaults.notes.push(game.i18n.format("SINLESS.Rig.vcrNote", { n: vcrDice }));
    }
    return { rigger, defaults };
  }

  /**
   * Drive/Fly + handling tests (pp.143-144).
   * @param {"maneuver"|"overdrive"|"ram"} kind
   */
  async rollVehicleTest(kind = "maneuver") {
    if (this.type !== "vehicle") return null;
    const v = this.system;
    const label = `${game.i18n.localize(`SINLESS.Rig.action.${kind}`)}: ${this.name}`;
    const prepared = this._rigDefaults({ label, skillKey: v.skill, gear: v.handling });
    if (!prepared) return null;
    const { rigger, defaults } = prepared;
    const extra = { vehicleUuid: this.uuid };
    if (kind === "overdrive") extra.overdrive = { inertia: v.kind === "vehicle" };
    if (kind === "ram") {
      const target = [...(game.user?.targets ?? [])].map(t => t.actor).find(a => a && a !== this);
      const targetBody = target?.type === "vehicle" ? target.system.body
        : target?.system.attributes?.bod?.value ?? null;
      Object.assign(extra, {
        weapon: true,
        damage: v.body + 2 * v.inertia,
        damageText: game.i18n.localize("SINLESS.Rig.ramDamage"),
        damageFormula: "",
        damageNote: "",
        penetration: 0,
        armorType: "impact",
        energy: false,
        stun: false,
        blast: false,
        multiplier: v.battleRam ? 2 : 1,
        targets: [...(game.user?.targets ?? [])].filter(t => t.actor && t.actor !== this)
          .map(t => ({ uuid: t.document.uuid, name: t.name })),
        ram: { inertia: v.inertia, targetBody, battleRam: v.battleRam }
      });
    }
    const message = await rigger._runTest(defaults, extra);
    // Ramming removes all inertia (p.144).
    if (message && kind === "ram" && v.inertia) await this.update({ "system.inertia": 0 });
    return message;
  }

  /** Fire a mounted weapon: the rigger's Gunnery + accuracy (p.143). */
  async rollVehicleWeapon(item) {
    const sys = item.system;
    const prepared = this._rigDefaults({ label: `${item.name} (${this.name})`, skillKey: sys.skill || "gunnery", gear: sys.accuracy });
    if (!prepared) return null;
    const { rigger, defaults } = prepared;
    defaults.showFiring = ["firearm", "energy", "heavy", "vehicle"].includes(sys.category);
    // Drones have recoil compensation and do not track recoil (p.148).
    this._combatDefaults(defaults, item);
    return rigger._runTest(defaults, await this._weaponCardData(item));
  }

  /* ---------------- Decking (ch.7) ---------------- */

  /** The equipped deck item, if any. */
  get deck() {
    const id = this.system.grid?.deckId;
    return id ? this.items.get(id) : null;
  }

  /** The base hacking program on the equipped deck (p.133). */
  get hackingProgram() {
    return this.items.find(i => i.type === "software" && i.system.base) ?? null;
  }

  /**
   * Dialog defaults for a decking test: Focus pool plus MCP dice, limit skill +
   * software rating, intrusion difficulty and missing nerve rig penalties.
   */
  _deckingDefaults({ label, skillKey, rating, extraPenalty = 0, notes = [] }) {
    const deck = this.deck;
    if (!deck) {
      ui.notifications.warn("SINLESS.Notify.noDeck", { localize: true });
      return null;
    }
    const { mode, rank, spec } = this._skillMode(skillKey);
    const defaults = this._testDefaults({
      label, pool: "focus", mode, rank, gear: rating, spec, specApplies: specMatches(spec, label),
      notes: [game.i18n.localize(skillLabel(skillKey)), deck.name, ...notes]
    });
    const intrusion = getSetting("intrusion");
    const intrusionPenalty = INTRUSION_PENALTY[intrusion] ?? 0;
    if (intrusionPenalty) {
      defaults.penalty += intrusionPenalty;
      defaults.notes.push(`${game.i18n.localize(SINLESS.INTRUSION_LEVELS[intrusion])} −${intrusionPenalty}`);
    }
    if (!deck.system.nerveRig) {
      defaults.penalty += NO_NERVE_RIG_PENALTY;
      defaults.notes.push(`${game.i18n.localize("SINLESS.Grid.noNerveRig")} −${NO_NERVE_RIG_PENALTY}`);
    }
    if (extraPenalty) defaults.penalty += extraPenalty;
    const mcp = this.system.grid.mcp;
    defaults.mcpAvailable = defaults.conflict ? mcp.value : mcp.max;
    defaults.poolValues = { ...defaults.poolValues, focus: (defaults.poolValues.focus ?? 0) + defaults.mcpAvailable };
    return defaults;
  }

  /** Use a piece of decking software (p.133). */
  async rollSoftware(item) {
    const sys = item.system;
    if (sys.base) return this.rollNanHack("device", item);
    const defaults = this._deckingDefaults({ label: item.name, skillKey: sys.skill, rating: sys.rating });
    if (!defaults) return null;
    if (sys.requiresNan && (this.system.grid.influence ?? 0) <= 0) {
      ui.notifications.warn("SINLESS.Notify.noNan", { localize: true });
    }
    const shadow = this.items
      .filter(i => i.type === "software" && i.system.running && i.system.reducesAlert && i.id !== item.id)
      .reduce((max, i) => Math.max(max, i.system.rating), 0);
    return this._runTest(defaults, {
      software: true,
      alert: sys.alert,
      alertPerSuccess: sys.alertPerSuccess,
      alertNote: sys.alertNote,
      shadow,
      effect: sys.effect
    });
  }

  /**
   * Hacking with the base program (p.134): a device, or a network access node by
   * brute force or stealth infiltration.
   * @param {"device"|"brute"|"stealth"} mode
   */
  async rollNanHack(mode = "brute", program = this.hackingProgram) {
    if (!program) {
      ui.notifications.warn("SINLESS.Notify.noHackingProgram", { localize: true });
      return null;
    }
    const influence = this.system.grid.influence ?? 0;
    const extraPenalty = mode === "device" ? 0 : influencePenalty(influence);
    const defaults = this._deckingDefaults({
      label: game.i18n.localize(`SINLESS.Grid.hack.${mode}`),
      skillKey: program.system.skill,
      rating: program.system.rating,
      extraPenalty,
      notes: extraPenalty ? [game.i18n.format("SINLESS.Grid.rangePenalty", { n: extraPenalty })] : []
    });
    if (!defaults) return null;
    const extra = { software: true, nan: mode === "device" ? null : mode, io: this.deck?.system.io ?? 0 };
    if (mode === "device") extra.effect = game.i18n.localize("SINLESS.Grid.deviceHint");
    return this._runTest(defaults, extra);
  }

  /** Add meters of influence around the hacked node. */
  async addInfluence(meters) {
    if (!this.system.grid) return null;
    return this.update({ "system.grid.influence": Math.max(0, this.system.grid.influence + meters) });
  }

  async rollRitual(item) {
    const drain = forceFormula(item.system.drain, 0);
    return this._runTest(this._testDefaults({
      label: item.name, pool: item.system.pool, rank: item.system.rank
    }), drain ? { spell: { drain, lethal: false, fetish: 0, label: item.name } } : {});
  }

  /* ---------------- Magic (ch.9) ---------------- */

  /** Use a power item: cast a spell or infusion, or summon a spirit. */
  async usePower(item) {
    switch (item.system.category) {
      case "spirit": return this.summonSpirit(item);
      case "amplification": return item.toMessage?.() ?? null;
      default: return this.castSpell(item);
    }
  }

  /** Current Zoetic Potential, the threshold for lethal drain (p.167). */
  get zoeticPotential() {
    return this.system.zoetic?.value ?? 0;
  }

  /**
   * Cast a spell (p.167): Sorcery + focus rank from the Resolve pool, at a chosen
   * force up to the force learned. Drain and damage use that force.
   */
  async castSpell(item) {
    const sys = item.system;
    const { mode, rank, spec } = this._skillMode("sorcery");
    const defaults = this._testDefaults({
      label: item.name, pool: "resolve", mode, rank, gear: sys.focus,
      spec, specApplies: specMatches(spec, item.name, sys.school),
      notes: [game.i18n.localize(skillLabel("sorcery")), sys.school].filter(Boolean)
    });
    defaults.force = { value: Math.max(1, sys.force), max: Math.max(1, sys.force), drain: sys.drain, zoetic: this.zoeticPotential };
    return this._runTest(defaults, async config => {
      const force = config.force ?? sys.force;
      const extra = {
        spell: {
          force,
          drain: forceFormula(sys.drain, force) ?? 0,
          lethal: drainIsLethal(force, this.zoeticPotential),
          fetish: sys.fetish,
          label: item.name
        },
        effect: sys.effect
      };
      const damage = forceFormula(sys.damage, force);
      if (damage !== null) {
        Object.assign(extra, {
          weapon: true,
          magic: true,
          damage,
          damageText: sys.damage,
          damageFormula: "",
          damageNote: "",
          penetration: 0,
          armorType: "ballistic",
          energy: false,
          stun: sys.damageTrack === "stun",
          blast: false,
          resistPool: sys.resistPool,
          targets: [...(game.user?.targets ?? [])].filter(t => t.actor && t.actor !== this)
            .map(t => ({ uuid: t.document.uuid, name: t.name }))
        });
      }
      return extra;
    });
  }

  /** Summon a spirit (p.183): Conjuring + focus against the spirit's force less the spirit bag. */
  async summonSpirit(item) {
    const sys = item.system;
    const { mode, rank, spec } = this._skillMode("conjuring");
    const defaults = this._testDefaults({
      label: item.name, pool: "resolve", mode, rank, gear: sys.focus,
      spec, specApplies: specMatches(spec, item.name),
      notes: [game.i18n.localize(skillLabel("conjuring"))]
    });
    defaults.force = { value: Math.max(1, sys.force), max: Math.max(1, sys.force), drain: "", zoetic: this.zoeticPotential };
    return this._runTest(defaults, config => ({
      summon: { force: config.force ?? sys.force, bag: sys.spiritBag }
    }));
  }

  /** Invoke a bound spirit (p.183): drain equal to its force, lethal above the Zoetic Potential. */
  async invokeSpirit(item) {
    const { drainDialog } = await import("../apps/drain-dialog.mjs");
    const force = item.system.force;
    return drainDialog(this, {
      label: game.i18n.format("SINLESS.Magic.invoke", { name: item.name }),
      drain: force,
      lethal: drainIsLethal(force, this.zoeticPotential),
      fetish: item.system.fetish
    });
  }

  /** Channeling test to resist drain: Channeling + fetish rank from Resolve (p.167). */
  async rollChanneling(fetish = 0, label = null) {
    const { mode, rank, spec } = this._skillMode("channeling");
    return this._runTest(this._testDefaults({
      label: label ?? game.i18n.localize("SINLESS.Magic.channeling"),
      pool: "resolve", mode, rank, gear: fetish, spec,
      notes: [game.i18n.localize(skillLabel("channeling"))]
    }));
  }

  /**
   * Resist a spell with a pool (p.167), as many dice as wished, no limit.
   * Opponents with fixed bestiary defenses roll those instead.
   */
  async rollResistance(pool) {
    const fixedKey = { finesse: "dodge", brawn: "soak", resolve: "resist" }[pool];
    if (fixedKey && this.system.fixedDefense?.(fixedKey) != null) return this.rollDefense(fixedKey);
    if (!this.system.pools?.[pool]) return null;
    const defaults = this._testDefaults({
      label: game.i18n.format("SINLESS.Magic.resist", { pool: game.i18n.localize(SINLESS.POOLS[pool]) }),
      pool, mode: "defense"
    });
    defaults.penalty = 0;
    return this._runTest(defaults);
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

  /* ---------------- Full condition tracks (p.97) ---------------- */

  /** Overload tests due at the start of this actor's turn. */
  get overloadTests() {
    const c = this.system.condition;
    if (!c || this.type === "vehicle") return [];
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

  /** Refresh all dice pools (start of a conflict round, p.85). */
  async refreshPools() {
    if (!this.system.pools) return this;
    const updates = {};
    for (const key of Object.keys(this.system.pools)) updates[`system.pools.${key}.spent`] = 0;
    if (this.system.grid) updates["system.grid.mcpSpent"] = 0;
    if (this.system.rig) updates["system.rig.vcrSpent"] = 0;
    return this.update(updates);
  }

  /* ---------------- Kismet advancement (p.238) ---------------- */

  /** Post a short advancement note to chat. */
  async _kismetMessage(text) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sinless-card sinless-kismet-card"><header class="card-header"><h3>${game.i18n.localize("SINLESS.Advance.title")}</h3></header><p>${text}</p></div>`
    });
  }

  /** Append a history entry and apply the updates. */
  async _recordAdvance(entry, updates) {
    const history = [...(this.system.kismet.history ?? []), { ...entry, time: Date.now() }];
    return this.update({ ...updates, "system.kismet.history": history });
  }

  /** Award end-of-session Kismet (p.238): adds to both earned and unspent Kismet. */
  async awardKismet(selected = [], extra = 0) {
    const amount = awardTotal(selected, extra);
    if (!this.system.kismet || amount <= 0) return null;
    const k = this.system.kismet;
    const before = boonStatus(k.earned, k.boons).total;
    await this._recordAdvance({ kind: "award", amount, awards: selected }, {
      "system.kismet.earned": k.earned + amount,
      "system.kismet.unspent": k.unspent + amount
    });
    const after = boonStatus(this.system.kismet.earned, this.system.kismet.boons);
    let text = game.i18n.format("SINLESS.Advance.awarded", { name: foundry.utils.escapeHTML(this.name), n: amount });
    if (after.total > before) text += `<br><strong>${game.i18n.format("SINLESS.Advance.boonEarned", { n: after.available })}</strong>`;
    return this._kismetMessage(text);
  }

  /** Purchasable advances with their costs (skills, attributes, Zoetic Potential). */
  get advanceOptions() {
    const src = this._source.system;
    const unspent = this.system.kismet?.unspent ?? 0;
    const options = [];
    const add = (kind, key, label, from, cost) => {
      if (cost === null) return;
      options.push({ kind, key, label, from, to: from + 1, cost, affordable: cost <= unspent });
    };
    for (const key of Object.keys(SINLESS.ATTRIBUTES)) {
      const a = src.attributes[key];
      add("attribute", key, game.i18n.localize(SINLESS.ATTRIBUTES[key]), a.value, attributeRaiseCost(a.value, a.max));
    }
    for (const key of Object.keys(SINLESS.SKILLS)) {
      const rank = src.skills[key]?.rank ?? 0;
      add("skill", key, game.i18n.localize(skillLabel(key)), rank, skillRaiseCost(rank));
    }
    const zp = this.system.zoetic?.value ?? 0;
    add("zoetic", "zoetic", game.i18n.localize("SINLESS.Zoetic"), zp, zoeticRaiseCost(zp));
    return options;
  }

  /** Spend unspent Kismet on one advance (p.238). */
  async buyAdvance(kind, key) {
    const option = this.advanceOptions.find(o => o.kind === kind && o.key === key);
    if (!option) return null;
    if (!option.affordable) {
      ui.notifications.warn("SINLESS.Advance.notEnough", { localize: true });
      return null;
    }
    const updates = { "system.kismet.unspent": this.system.kismet.unspent - option.cost };
    if (kind === "attribute") updates[`system.attributes.${key}.value`] = option.to;
    else if (kind === "skill") updates[`system.skills.${key}.rank`] = option.to;
    else updates["system.zoetic.bonus"] = this._source.system.zoetic.bonus + 1;
    await this._recordAdvance({ kind, key, label: option.label, from: option.from, to: option.to, cost: option.cost }, updates);
    return this._kismetMessage(game.i18n.format("SINLESS.Advance.bought", {
      name: foundry.utils.escapeHTML(this.name), label: option.label, from: option.from, to: option.to, cost: option.cost
    }));
  }

  /**
   * Take the next boon (p.238).
   * @param {string} boon            BOONS key.
   * @param {object} [opts]
   * @param {string} [opts.skill]    Skill raised by mastery (6→7) or guru (7→8).
   * @param {string} [opts.pool]     Pool gaining a resilience die.
   * @param {string} [opts.note]     Free text (asset, magic item).
   */
  async takeBoon(boon, { skill, pool, note = "" } = {}) {
    const k = this.system.kismet;
    const status = boonStatus(k.earned, k.boons);
    if (!status.available || !boonChoices(status.next).includes(boon)) {
      ui.notifications.warn("SINLESS.Advance.noBoon", { localize: true });
      return null;
    }
    const entry = { kind: "boon", boon, index: status.next, note };
    const updates = { "system.kismet.boons": k.boons + 1 };
    const def = BOONS[boon];
    if (def.skillFrom) {
      const rank = this._source.system.skills[skill]?.rank;
      if (rank !== def.skillFrom) {
        ui.notifications.warn(game.i18n.format("SINLESS.Advance.skillMustBe", { n: def.skillFrom }));
        return null;
      }
      Object.assign(entry, { key: skill, label: game.i18n.localize(skillLabel(skill)), from: rank, to: rank + 1 });
      updates[`system.skills.${skill}.rank`] = rank + 1;
    } else if (boon === "resilience") {
      if (!SINLESS.POOLS[pool]) return null;
      Object.assign(entry, { key: pool, label: game.i18n.localize(SINLESS.POOLS[pool]) });
      updates[`system.kismet.resilience.${pool}`] = (k.resilience[pool] ?? 0) + 1;
    } else if (boon === "windfall") {
      const roll = await new Roll("1d6").evaluate();
      entry.roll = roll.total;
      entry.windfall = WINDFALLS[roll.total - 1];
    }
    await this._recordAdvance(entry, updates);
    return this._kismetMessage(this._boonText(entry));
  }

  /** Chat text for a boon entry. */
  _boonText(entry) {
    const name = foundry.utils.escapeHTML(this.name);
    let text = game.i18n.format("SINLESS.Advance.boonTaken", { name, boon: game.i18n.localize(`SINLESS.Boon.${entry.boon}.label`) });
    if (entry.from !== undefined) text += ` — ${foundry.utils.escapeHTML(entry.label)} ${entry.from} → ${entry.to}`;
    else if (entry.boon === "resilience") text += ` — ${foundry.utils.escapeHTML(entry.label)}`;
    if (entry.windfall) text += `<br>1d6 = ${entry.roll}: ${game.i18n.localize(`SINLESS.Windfall.${entry.windfall}`)}`;
    if (entry.note) text += `<br>${foundry.utils.escapeHTML(entry.note)}`;
    return text;
  }

  /** Undo the most recent award, purchase or boon, refunding its Kismet. */
  async undoAdvance() {
    const history = [...(this.system.kismet?.history ?? [])];
    const entry = history.pop();
    if (!entry) return null;
    const k = this.system.kismet;
    const updates = { "system.kismet.history": history };
    switch (entry.kind) {
      case "award":
        updates["system.kismet.earned"] = Math.max(0, k.earned - entry.amount);
        updates["system.kismet.unspent"] = Math.max(0, k.unspent - entry.amount);
        break;
      case "attribute":
        updates[`system.attributes.${entry.key}.value`] = entry.from;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "skill":
        updates[`system.skills.${entry.key}.rank`] = entry.from;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "zoetic":
        updates["system.zoetic.bonus"] = this._source.system.zoetic.bonus - 1;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "boon":
        updates["system.kismet.boons"] = Math.max(0, k.boons - 1);
        if (entry.from !== undefined) updates[`system.skills.${entry.key}.rank`] = entry.from;
        if (entry.boon === "resilience") updates[`system.kismet.resilience.${entry.key}`] = Math.max(0, (k.resilience[entry.key] ?? 0) - 1);
        break;
    }
    await this.update(updates);
    return this._kismetMessage(game.i18n.format("SINLESS.Advance.undone", { name: foundry.utils.escapeHTML(this.name) }));
  }

  /** Refresh the Kismet pool (after a scene or 10 minutes of rest, p.39). */
  async refreshKismet() {
    if (!this.system.kismet) return this;
    return this.update({ "system.kismet.spent": 0 });
  }
}
