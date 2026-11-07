// Rigging: vehicle control and vehicle tests (ch.8).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, SYSTEM_ID, skillLabel } from "../../config.mjs";
import { CONTROL_PENALTY, effectiveControl } from "../../helpers/rigging.mjs";
import { specMatches } from "../../helpers/combat.mjs";
import { CHASE_ACTIONS, chaseNeeded } from "../../helpers/chase.mjs";

export const VehicleActor = Base => class SinlessVehicleActor extends Base {
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
    const chaseKind = kind !== "maneuver" && CHASE_ACTIONS[kind];
    const label = `${game.i18n.localize(chaseKind ? `SINLESS.Chase.action.${kind}` : `SINLESS.Rig.action.${kind}`)}: ${this.name}`;
    const prepared = this._rigDefaults({ label, skillKey: v.skill, gear: v.handling });
    if (!prepared) return null;
    const { rigger, defaults } = prepared;
    const extra = { vehicleUuid: this.uuid };
    // Car chase actions (pp.231-232): successes needed, applied to the chase board by the GM.
    const chase = game.settings.get(SYSTEM_ID, "chase");
    if (chase?.active && CHASE_ACTIONS[kind]) {
      const targetActor = [...(game.user?.targets ?? [])].map(t => t.actor).find(a => a && a !== this);
      const target = kind === "maneuver" ? chase.enemies.find(e => e.uuid === targetActor?.uuid) : null;
      if (kind !== "maneuver" || target) {
        const needed = chaseNeeded(kind, {
          handling: targetActor?.system.handling ?? 0,
          rigger: targetActor?.type === "vehicle" && !!targetActor.system.controller
        });
        defaults.threshold = needed;
        extra.chase = { action: kind, needed, targetUuid: target?.uuid ?? null, targetName: target?.name ?? null };
        defaults.notes.push(game.i18n.format("SINLESS.Chase.needed", { n: needed }));
      }
    }
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
};
