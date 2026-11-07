import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { CONTROL_PENALTY } from "../helpers/rigging.mjs";
import { SinlessActorSheet, actorCall } from "./actor-sheet.mjs";

const T = path => `systems/${SYSTEM_ID}/templates/${path}`;
const labels = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));

/** Sheet for drones and vehicles (ch.8). */
export class VehicleSheet extends SinlessActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["vehicle"],
    position: { width: 720, height: 760 },
    actions: {
      rollVehicleTest: actorCall("rollVehicleTest", "kind"),
      adjustInertia: VehicleSheet.#onAdjustInertia,
      openController: VehicleSheet.#onOpenController,
      removeController: VehicleSheet.#onRemoveController
    }
  };

  static PARTS = {
    header: { template: T("actor/vehicle-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("actor/vehicle-main.hbs"), scrollable: [""] },
    effects: { template: T("actor/tab-effects.hbs"), scrollable: [""] },
    bio: { template: T("actor/tab-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "effects" }, { id: "bio" }],
      initial: "main",
      labelPrefix: "SINLESS.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    context.kindChoices = SINLESS.VEHICLE_KINDS;
    context.frameChoices = SINLESS.VEHICLE_FRAMES;
    context.mobilityChoices = labels(SINLESS.VEHICLE_MOBILITY);
    context.controlChoices = SINLESS.CONTROL_MODES;
    // Car chase actions while a chase is running (pp.231-232).
    context.chaseActive = !!game.settings.get(SYSTEM_ID, "chase")?.active;
    context.chaseActions = ["trap", "book", "burn", "switch", "plot"].map(key => ({
      key, label: `SINLESS.Chase.action.${key}`, hint: `SINLESS.Chase.actionHint.${key}`
    }));
    const rigger = actor.vehicleController;
    const control = actor.controlMode;
    context.rigger = rigger;
    context.control = {
      label: SINLESS.CONTROL_MODES[control],
      penalty: CONTROL_PENALTY[control],
      downgraded: control !== sys.controlMode
    };
    context.skillLabel = `SINLESS.Skill.${sys.skill}`;
    // Weapon weight: drones list WW; vehicles carry 1 weight per 3 Body (pp.144, 151).
    context.weaponLimit = sys.kind === "drone" ? sys.weaponWeight : Math.floor(sys.body / 3);
    context.overweight = sys.mountedWeight > context.weaponLimit;
    context.groups = ["weapon", "gear"].map(type => ({ type, label: `TYPES.Item.${type}`, items: context.items[type] ?? [] }));
    return context;
  }

  /** Dropping a character on the sheet makes it the controlling rigger. */
  async _onDropActor(event, actor) {
    if (!this.isEditable) return null;
    return this.actor.setVehicleController(actor);
  }

  static async #onAdjustInertia(event, target) {
    const value = Math.max(0, this.actor.system.inertia + Number(target.dataset.delta));
    return this.actor.update({ "system.inertia": value });
  }

  static async #onOpenController() {
    this.actor.vehicleController?.sheet.render(true);
  }

  static async #onRemoveController() {
    return this.actor.setVehicleController(null);
  }
}
