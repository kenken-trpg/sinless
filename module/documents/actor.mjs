import { SINLESS, skillLabel } from "../config.mjs";
import { currentTargetNumber, currentHeatBonus } from "../settings.mjs";
import { entityDefenseDice } from "../helpers/grid.mjs";
import { spiritDefenseBonus } from "../helpers/magic.mjs";
import { testDialog } from "../apps/test-dialog.mjs";
import { performTest } from "../dice/test-roll.mjs";
import { CombatActor } from "./actor/combat.mjs";
import { ConditionActor } from "./actor/condition.mjs";
import { VehicleActor } from "./actor/vehicle.mjs";
import { DigitalActor } from "./actor/digital.mjs";
import { MagicActor } from "./actor/magic.mjs";
import { BrandActor } from "./actor/brand.mjs";
import { AdvancementActor } from "./actor/advancement.mjs";

/**
 * The Sinless actor. Shared test plumbing (dialog defaults, running a test,
 * skill modes, defenses) is here; each rules area is a mixin in ./actor/.
 */
const RULES = [CombatActor, ConditionActor, VehicleActor, DigitalActor, MagicActor, BrandActor, AdvancementActor];

export class SinlessActor extends RULES.reduce((base, mixin) => mixin(base), Actor) {
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
    // Shadow tests while sneaking raise the alert level (p.236).
    const extra = skillKey === "shadow" ? { shadow: true } : {};
    return this._runTest(this._testDefaults({
      label: game.i18n.localize(skillLabel(skillKey)), pool, mode, rank, spec
    }), extra);
  }

  /**
   * Roll a pool for defense (dodge, soak, resist): no limit applies (p.29).
   * Opponents with bestiary defenses roll their listed dice instead (p.195).
   */
  /**
   * @param {string} key
   * @param {object} [o]
   * @param {"physical"|"magic"|"digital"|null} [o.attack]  What is being defended against:
   *   network entities double their dice against physical and magic attacks,
   *   spirits add their force against physical attacks (pp.199, 205).
   */
  async rollDefense(key, { attack = null } = {}) {
    const def = SINLESS.DEFENSES[key];
    if (!def) return null;
    // Vehicles: a hot-seated rigger dodges with their own Finesse pool (p.144).
    if (this.type === "vehicle" && key !== "soak") {
      const rigger = this.vehicleController;
      if (key === "dodge" && rigger && this.controlMode === "hotseat") return rigger.rollDefense("dodge");
      ui.notifications.warn("SINLESS.Notify.vehicleNoDefense", { localize: true });
      return null;
    }
    let fixed = this.system.fixedDefense?.(key) ?? null;
    // Programs double their defense dice against physical and magical attacks (p.205).
    if (fixed !== null && this.isEntity && attack) fixed = entityDefenseDice(fixed, { entity: true, digital: attack === "digital" });
    const spirit = spiritDefenseBonus(this.system.spiritForce, attack);
    if (fixed !== null) return this._rollFixedDefense(key, fixed + spirit, spirit);
    const defaults = this._testDefaults({
      label: game.i18n.localize(def.label), pool: def.pool, mode: "defense", bonus: spirit
    });
    defaults.penalty = 0;
    defaults.spendPool = this.inConflict;
    return this._runTest(defaults);
  }

  /** Critter rules (p.195): roll the listed dice, no pool is spent. */
  async _rollFixedDefense(key, dice, spirit = 0) {
    const label = game.i18n.localize(SINLESS.DEFENSES[key].label);
    const defaults = this._fixedDiceDefaults(label, dice);
    defaults.penalty = 0;
    if (spirit) defaults.notes.push(game.i18n.localize("SINLESS.Spirit.defenseNote"));
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

  /** Targeted tokens other than this actor, for attack cards. */
  _currentTargets() {
    return [...(game.user?.targets ?? [])]
      .filter(t => t.actor && t.actor !== this)
      .map(t => ({ uuid: t.document.uuid, name: t.name }));
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

  /** Refresh all dice pools (start of a conflict round, p.85). */
  async refreshPools() {
    if (!this.system.pools) return this;
    const updates = {};
    for (const key of Object.keys(this.system.pools)) updates[`system.pools.${key}.spent`] = 0;
    if (this.system.grid) updates["system.grid.mcpSpent"] = 0;
    if (this.system.rig) updates["system.rig.vcrSpent"] = 0;
    return this.update(updates);
  }

  /** Refresh the Kismet pool (after a scene or 10 minutes of rest, p.39). */
  async refreshKismet() {
    if (!this.system.kismet) return this;
    return this.update({ "system.kismet.spent": 0 });
  }
}
