import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { SinlessActorSheet, actorCall, confirmAction } from "./actor-sheet.mjs";

const T = path => `systems/${SYSTEM_ID}/templates/${path}`;

/** Sheet for the group's brand (pp.47, 221-224). */
export class BrandSheet extends SinlessActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["brand"],
    position: { width: 780, height: 820 },
    actions: {
      rollBrandStat: actorCall("rollBrandStat", "stat"),
      rollBrandAction: actorCall("rollBrandAction", "brandAction"),
      toggleTrait: BrandSheet.#onToggleTrait,
      endSectorTurn: BrandSheet.#onEndSectorTurn,
      adjustItem: BrandSheet.#onAdjustItem,
      openMember: BrandSheet.#onOpenMember,
      removeMember: BrandSheet.#onRemoveMember
    }
  };

  static PARTS = {
    header: { template: T("actor/brand-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("actor/brand-main.hbs"), scrollable: [""] },
    resources: { template: T("actor/brand-resources.hbs"), scrollable: [""] },
    members: { template: T("actor/brand-members.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "resources" }, { id: "members" }],
      initial: "main",
      labelPrefix: "SINLESS.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const traits = sys.traits;
    const loc = k => game.i18n.localize(k);

    context.stats = Object.entries(SINLESS.BRAND_STATS).map(([key, label]) => ({
      key, label, base: sys.base[key], value: sys.stats[key]
    }));

    context.traits = Object.entries(SINLESS.BRAND_TRAITS).map(([key]) => ({
      key,
      label: `SINLESS.BrandTrait.${key}.label`,
      hint: `SINLESS.BrandTrait.${key}.hint`,
      active: traits.has(key)
    }));

    context.traitCount = traits.size;
    context.actions = Object.entries(SINLESS.BRAND_ACTIONS).map(([key, def]) => ({
      key,
      label: `SINLESS.BrandAction.${key}.label`,
      effect: `SINLESS.BrandAction.${key}.effect`,
      stat: loc(SINLESS.BRAND_STATS[def.stat]),
      dice: sys.stats[def.stat],
      heat: def.heat ?? 0
    }));

    context.heatChoices = SINLESS.SECTOR_HEAT;
    context.heatEffect = `SINLESS.SectorHeatEffect.${sys.sector.heat}`;

    context.resources = (context.items.resource ?? []).map(item => {
      const r = item.system;
      const boxes = Array.from({ length: r.boxes }, (_, i) => {
        const fromRight = r.boxes - i;
        return {
          damaged: i < r.damage,
          influenced: fromRight <= r.influence,
          demolished: i < r.demolished
        };
      });
      const count = key => boxes.filter(b => b[key]).length;
      return {
        item,
        boxes,
        track: { total: boxes.length, damaged: count("damaged"), influenced: count("influenced"), demolished: count("demolished") },
        tags: [...r.tags].map(t => loc(SINLESS.RESOURCE_TAGS[t])).join(", ")
      };
    });
    context.assets = context.items.asset ?? [];

    context.members = sys.members.map(id => {
      const actor = game.actors.get(id);
      return actor
        ? { id, name: actor.name, img: actor.img, ghost: actor.system.ghost, missing: false }
        : { id, name: loc("SINLESS.Brand.missingMember"), img: "icons/svg/mystery-man.svg", missing: true };
    });
    return context;
  }

  /** Dropping a character on the sheet adds it as a member. */
  async _onDropActor(event, actor) {
    if (!this.isEditable) return null;
    return this.actor.addBrandMember(actor);
  }

  /* ------------------------------------------------------------------ */

  static async #onToggleTrait(event, target) {
    const key = target.dataset.trait;
    const traits = new Set(this.actor.system.traits);
    if (traits.has(key)) traits.delete(key);
    else {
      traits.add(key);
      if (traits.size > this.actor.system.traitSlots) {
        ui.notifications.warn("SINLESS.Notify.tooManyTraits", { localize: true });
      }
    }
    return this.actor.update({ "system.traits": [...traits] });
  }

  static async #onEndSectorTurn() {
    const ok = await confirmAction("SINLESS.SectorTurn.end", "SINLESS.SectorTurn.confirm");
    if (ok) return this.actor.endSectorTurn();
  }

  /** +/- buttons for resource damage and influence. */
  static async #onAdjustItem(event, target) {
    const item = this._itemFrom(target);
    const field = target.dataset.field;
    if (!item || !field) return;
    const max = item.system.boxes;
    const value = Math.clamp((item.system[field] ?? 0) + Number(target.dataset.delta), 0, max);
    return item.update({ [`system.${field}`]: value });
  }

  static async #onOpenMember(event, target) {
    game.actors.get(target.closest("[data-member-id]")?.dataset.memberId)?.sheet.render(true);
  }

  static async #onRemoveMember(event, target) {
    return this.actor.removeBrandMember(target.closest("[data-member-id]")?.dataset.memberId);
  }
}
