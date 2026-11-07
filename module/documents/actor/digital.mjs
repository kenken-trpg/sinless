// Decking: decks, software and network entities (ch.7).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, skillLabel } from "../../config.mjs";
import { getSetting } from "../../settings.mjs";
import { INTRUSION_PENALTY, NO_NERVE_RIG_PENALTY, influencePenalty } from "../../helpers/grid.mjs";
import { specMatches } from "../../helpers/combat.mjs";

export const DigitalActor = Base => class SinlessDigitalActor extends Base {
  /** The equipped deck item, if any. */
  get deck() {
    const id = this.system.grid?.deckId;
    return id ? this.items.get(id) : null;
  }

  /** The base hacking program on the equipped deck (p.133). */
  get hackingProgram() {
    return this.items.find(i => i.type === "software" && i.system.base) ?? null;
  }

  /** A network entity: ICE or a daemon with only a cohesion track (p.133). */
  get isEntity() {
    return !!this.system.isEntity;
  }

  /** Machines take double Electric Strike damage (p.137). */
  get isMachine() {
    return this.type === "vehicle" || this.isEntity;
  }

  /** Deckers with a nerve rig are hot-seated: digital hits are physical damage (p.129). */
  get hotseated() {
    return !!this.deck?.system.nerveRig;
  }

  /** Hardening against digital attacks: entity, vehicle or the equipped deck (p.130). */
  get hardening() {
    if (this.isEntity) return this.system.network.hardening;
    if (this.type === "vehicle") return this.system.hardening ?? 0;
    return this.deck?.system.hardening ?? 0;
  }

  /** Lower hardening (Acid Burn, p.135) where it is stored. */
  async setHardening(value) {
    const v = Math.max(0, Math.floor(value));
    if (this.isEntity) return this.update({ "system.network.hardening": v });
    if (this.type === "vehicle") return this.update({ "system.hardening": v });
    return this.deck?.update({ "system.hardening": v }) ?? null;
  }

  /**
   * Alert added by sensor daemons on the current scene (p.205): any grid action
   * in their range raises the alert by 2 more. Crashed daemons do not count.
   */
  get sensorAlert() {
    const tokens = canvas?.scene?.tokens ?? [];
    let total = 0;
    for (const token of tokens) {
      const a = token.actor;
      if (!a?.isEntity || a.statuses?.has(CONFIG.specialStatusEffects.DEFEATED)) continue;
      total += a.system.network.alertAura ?? 0;
    }
    return total;
  }

  /**
   * Digital attack software (pp.135-137): De-rez and Acid Burn against hardening
   * and defense; Electric Strike rolls 1d6 + successes stun, doubled on machines.
   */
  async _digitalAttackData(item) {
    const kind = item.system.digitalAttack;
    const data = { weapon: true, digital: kind, rating: item.system.rating, damage: 0, penetration: 0, armorType: "ballistic", targets: this._currentTargets() };
    if (kind === "strike") {
      const roll = await new Roll("1d6").evaluate();
      Object.assign(data, { damage: roll.total, damageText: "1d6", damageFormula: String(roll.total), stun: true, ignoreArmor: true });
    }
    return data;
  }

  /**
   * RNID and enemy deckers (p.205): roll the shrink dice; each success shrinks a
   * targeted decker's influence field.
   */
  async rollShrinkInfluence() {
    const net = this.system.network;
    if (!net?.shrinkDice) return null;
    const label = game.i18n.localize("SINLESS.Digital.shrink");
    const defaults = this._fixedDiceDefaults(label, net.shrinkDice);
    return this._runTest(defaults, { shrink: { meters: net.shrinkMeters, targets: this._currentTargets() } });
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
    const extra = {
      software: true,
      alert: sys.alert,
      alertPerSuccess: sys.alertPerSuccess,
      alertNote: sys.alertNote,
      shadow,
      sensor: this.sensorAlert,
      effect: sys.effect
    };
    if (sys.digitalAttack) Object.assign(extra, await this._digitalAttackData(item));
    return this._runTest(defaults, extra);
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
    const extra = { software: true, nan: mode === "device" ? null : mode, io: this.deck?.system.io ?? 0, sensor: this.sensorAlert };
    if (mode === "device") extra.effect = game.i18n.localize("SINLESS.Grid.deviceHint");
    return this._runTest(defaults, extra);
  }

  /** Add meters of influence around the hacked node. */
  async addInfluence(meters) {
    if (!this.system.grid) return null;
    return this.update({ "system.grid.influence": Math.max(0, this.system.grid.influence + meters) });
  }
};
