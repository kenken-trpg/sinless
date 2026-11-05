import { SINLESS, skillLabel } from "../config.mjs";
import { currentTargetNumber, currentHeatBonus } from "../settings.mjs";
import { testDialog } from "../apps/test-dialog.mjs";
import { performTest } from "../dice/test-roll.mjs";

export class SinlessActor extends Actor {
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
    return !!game.combat?.started && game.combat.combatants.some(c => c.actor === this);
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
      extra
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

  /** Roll a pool for defense (dodge, soak, resist): no limit applies (p.29). */
  async rollDefense(key) {
    const def = SINLESS.DEFENSES[key];
    if (!def) return null;
    const defaults = this._testDefaults({
      label: game.i18n.localize(def.label), pool: def.pool, mode: "defense"
    });
    defaults.penalty = 0;
    defaults.spendPool = this.inConflict;
    return this._runTest(defaults);
  }

  /** Etiquette test: roll dice equal to the etiquette rank (p.69). */
  async rollEtiquette(key, { label, bonus = 0 } = {}) {
    let rank = this.system.etiquettes[key]?.rank ?? 0;
    let extraBonus = bonus;
    // Wealthy lifestyle: +1 die on etiquette tests, even at rank 0 (p.46).
    if (this.system.lifestyle === "wealthy") extraBonus += 1;
    const defaults = this._testDefaults({
      label: label ?? game.i18n.localize(SINLESS.ETIQUETTES[key]), mode: "rank", rank, bonus: extraBonus
    });
    defaults.mode = "rank";
    defaults.spendPool = false;
    return this._runTest(defaults);
  }

  async rollWeapon(item) {
    const sys = item.system;
    const skillKey = sys.skill;
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
    return this._runTest(defaults, {
      damage: sys.damage, penetration: sys.penetration, weapon: true
    });
  }

  async rollRitual(item) {
    return this._runTest(this._testDefaults({
      label: item.name, pool: item.system.pool, rank: item.system.rank
    }));
  }

  async rollAsset(item) {
    return this.rollEtiquette(item.system.etiquette, { label: item.name });
  }

  /** Free roll from a pool (e.g. an attribute-only test decided by the Agonarch). */
  async rollPool(pool) {
    return this._runTest(this._testDefaults({
      label: game.i18n.localize(SINLESS.POOLS[pool]), pool, mode: "defense"
    }));
  }

  /** Refresh all dice pools (start of a conflict round, p.85). */
  async refreshPools() {
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
