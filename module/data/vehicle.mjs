import {
  VEHICLE_KINDS, VEHICLE_FRAMES, VEHICLE_MOBILITY, CONTROL_MODES
} from "../config.mjs";
import { woundPenalty } from "../helpers/rules.mjs";
import { vehicleSoakDice } from "../helpers/rigging.mjs";

const { NumberField, StringField, SchemaField, BooleanField, HTMLField } = foundry.data.fields;
const int = (initial = 0, opts = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, min: 0, initial, ...opts });
const choice = (initial, choices) => new StringField({ required: true, initial, choices });
const labels = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));

/**
 * Drones and vehicles (ch.8). Body is the length of the physical track, the
 * weapon weight limit, and the soak dice. Tests are rolled by the controlling rigger.
 */
export class VehicleData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SINLESS.Vehicle"];

  static defineSchema() {
    return {
      kind: choice("drone", () => VEHICLE_KINDS),
      frame: choice("small", () => VEHICLE_FRAMES),
      mobility: choice("ground", () => labels(VEHICLE_MOBILITY)),
      body: int(6),
      weaponWeight: int(0),
      movement: int(8),
      handling: int(0),
      hardening: int(2),
      cargo: int(0),
      inertia: int(0),
      cost: int(0),
      battleRam: new BooleanField({ initial: false }),
      armorBonus: new SchemaField({ ballistic: int(0), impact: int(0) }),
      condition: new SchemaField({
        physical: new SchemaField({ value: int(0) }),
        stun: new SchemaField({ value: int(0) }),
        overflow: int(0)
      }),
      controller: new StringField({ required: true, blank: true, initial: "" }),
      controlMode: choice("vcr", () => CONTROL_MODES),
      penalty: int(0),
      notes: new HTMLField({ required: true, blank: true })
    };
  }

  /** Vehicles without a rigger are run by the Agonarch (TN 4). */
  get isAgonarch() {
    return !this.controller;
  }

  prepareDerivedData() {
    // Physical track = Body; the vehicle integrity track (stun) uses the same length.
    this.condition.physical.max = this.body;
    this.condition.stun.max = this.body;
    // Every 3 damage lowers the dice usable on tests by one (p.152).
    this.condition.penalty = woundPenalty(this.condition.physical.value, this.condition.stun.value);
    // Street vehicles suffer one penalty die per point of inertia; drones never gain inertia (p.143).
    this.inertiaPenalty = this.kind === "vehicle" ? this.inertia : 0;
    this.totalPenalty = this.condition.penalty + this.penalty + this.inertiaPenalty;
    this.soakDice = vehicleSoakDice(this.body, this.condition.physical.value);

    const armor = { ballistic: { total: 0, highest: 0 }, impact: { total: 0, highest: 0 } };
    for (const kind of ["ballistic", "impact"]) {
      armor[kind].total = this.armorBonus[kind];
      armor[kind].highest = this.armorBonus[kind];
    }
    this.armor = armor;

    let mounted = 0;
    for (const item of this.parent.items) if (item.type === "weapon") mounted += (item.system.weight ?? 0) * (item.system.quantity ?? 1);
    this.mountedWeight = mounted;
    this.skill = VEHICLE_MOBILITY[this.mobility]?.skill ?? "drive";
  }

  /** Vehicles soak with their current Body; they cannot dodge on their own (p.144). */
  fixedDefense(key) {
    if (key === "soak") return this.soakDice;
    return null;
  }
}
