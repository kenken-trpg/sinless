import { SYSTEM_ID, SINLESS, skillLabel } from "../config.mjs";
import { currentTargetNumber } from "../settings.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const T = path => `systems/${SYSTEM_ID}/templates/${path}`;

const ITEM_GROUPS = {
  gear: ["weapon", "armor", "gear", "implant"],
  magic: ["power", "ritual"],
  social: ["asset", "knowledge"]
};

/** Shared behavior for character and NPC sheets. */
class SinlessActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sinless", "sheet", "actor"],
    position: { width: 820, height: 860 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollSkill: SinlessActorSheet.#onRollSkill,
      rollDefense: SinlessActorSheet.#onRollDefense,
      rollPool: SinlessActorSheet.#onRollPool,
      rollEtiquette: SinlessActorSheet.#onRollEtiquette,
      rollItem: SinlessActorSheet.#onRollItem,
      refreshPools: SinlessActorSheet.#onRefreshPools,
      refreshKismet: SinlessActorSheet.#onRefreshKismet,
      setCondition: SinlessActorSheet.#onSetCondition,
      itemCreate: SinlessActorSheet.#onItemCreate,
      itemEdit: SinlessActorSheet.#onItemEdit,
      itemDelete: SinlessActorSheet.#onItemDelete,
      itemToggle: SinlessActorSheet.#onItemToggle
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const sys = actor.system;
    const loc = k => game.i18n.localize(k);

    context.actor = actor;
    context.system = sys;
    context.config = SINLESS;
    context.isGM = game.user.isGM;
    context.targetNumber = currentTargetNumber(sys.isAgonarch);

    context.pools = Object.entries(SINLESS.POOLS).map(([key, label]) => ({
      key, label, ...sys.pools[key],
      skills: Object.entries(SINLESS.SKILLS)
        .filter(([, s]) => s.pool === key)
        .map(([k, s]) => ({
          key: k,
          label: loc(skillLabel(k)),
          rank: sys.skills[k].rank,
          spec: sys.skills[k].spec,
          trainedOnly: !!s.trainedOnly,
          group: s.group ? loc(SINLESS.SKILL_GROUPS[s.group]) : ""
        }))
    }));

    context.etiquettes = Object.entries(SINLESS.ETIQUETTES).map(([key, label]) => ({
      key, label, rank: sys.etiquettes[key].rank
    }));

    context.defenses = Object.entries(SINLESS.DEFENSES).map(([key, d]) => ({
      key, label: d.label, pool: d.pool, value: sys.pools[d.pool].value
    }));

    const boxes = (value, max) => Array.from({ length: max }, (_, i) => ({
      n: i + 1, filled: i < value, mark: (i + 1) % 3 === 0
    }));
    context.physicalBoxes = boxes(sys.condition.physical.value, sys.condition.physical.max);
    context.stunBoxes = boxes(sys.condition.stun.value, sys.condition.stun.max);

    const items = {};
    for (const item of actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
      (items[item.type] ??= []).push(item);
    }
    context.items = items;
    context.itemGroups = Object.fromEntries(Object.entries(ITEM_GROUPS).map(([tab, types]) => [
      tab, types.map(type => ({ type, label: `TYPES.Item.${type}`, items: items[type] ?? [] }))
    ]));

    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    context.enrichedNotes = await TextEditor.enrichHTML(sys.notes, { relativeTo: actor, secrets: actor.isOwner });
    context.fields = sys.schema.fields;
    return context;
  }

  /* ------------------------------------------------------------------ */

  static async #onRollSkill(event, target) {
    return this.actor.rollSkill(target.dataset.skill);
  }

  static async #onRollDefense(event, target) {
    return this.actor.rollDefense(target.dataset.defense);
  }

  static async #onRollPool(event, target) {
    return this.actor.rollPool(target.dataset.pool);
  }

  static async #onRollEtiquette(event, target) {
    return this.actor.rollEtiquette(target.dataset.etiquette);
  }

  static async #onRollItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    switch (item.type) {
      case "weapon": return this.actor.rollWeapon(item);
      case "ritual": return this.actor.rollRitual(item);
      case "asset": return this.actor.rollAsset(item);
      default: return item.toMessage?.();
    }
  }

  static async #onRefreshPools() {
    return this.actor.refreshPools();
  }

  static async #onRefreshKismet() {
    return this.actor.refreshKismet();
  }

  /** Click a condition box: fill up to it, or clear it if it is the last filled box. */
  static async #onSetCondition(event, target) {
    const track = target.dataset.track;
    const n = Number(target.dataset.n);
    const current = this.actor.system.condition[track].value;
    const value = current === n ? n - 1 : n;
    return this.actor.update({ [`system.condition.${track}.value`]: value });
  }

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const name = game.i18n.format("DOCUMENT.New", { type: game.i18n.localize(`TYPES.Item.${type}`) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    item?.sheet.render(true);
  }

  static async #onItemEdit(event, target) {
    this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    return item?.deleteDialog();
  }

  static async #onItemToggle(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    const field = target.dataset.field;
    if (!item || !field) return;
    return item.update({ [`system.${field}`]: !foundry.utils.getProperty(item.system, field) });
  }
}

export class CharacterSheet extends SinlessActorSheet {
  static DEFAULT_OPTIONS = { classes: ["character"] };

  static PARTS = {
    header: { template: T("actor/character-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("actor/tab-main.hbs"), scrollable: [""] },
    gear: { template: T("actor/tab-items.hbs"), scrollable: [""] },
    magic: { template: T("actor/tab-items.hbs"), scrollable: [""] },
    social: { template: T("actor/tab-social.hbs"), scrollable: [""] },
    bio: { template: T("actor/tab-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "gear" }, { id: "magic" }, { id: "social" }, { id: "bio" }],
      initial: "main",
      labelPrefix: "SINLESS.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    context.attributes = Object.entries(SINLESS.ATTRIBUTES).map(([key, label]) => ({
      key, label, ...sys.attributes[key]
    }));
    const opts = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));
    context.heritageChoices = opts(SINLESS.HERITAGES);
    context.talentChoices = SINLESS.MAGIC_TALENTS;
    context.lifestyleChoices = SINLESS.LIFESTYLES;
    context.charismaPoolChoices = { "": "—", ...SINLESS.POOLS };
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    context.enrichedBiography = await TextEditor.enrichHTML(sys.biography, { relativeTo: this.actor, secrets: this.actor.isOwner });
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    if (partId === "gear" || partId === "magic") context.groups = context.itemGroups[partId];
    return context;
  }
}

export class NpcSheet extends SinlessActorSheet {
  static DEFAULT_OPTIONS = { classes: ["npc"], position: { width: 720, height: 760 } };

  static PARTS = {
    header: { template: T("actor/npc-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("actor/tab-main.hbs"), scrollable: [""] },
    gear: { template: T("actor/tab-items.hbs"), scrollable: [""] },
    bio: { template: T("actor/tab-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "gear" }, { id: "bio" }],
      initial: "main",
      labelPrefix: "SINLESS.Tab"
    }
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    if (partId === "gear") {
      context.groups = [...context.itemGroups.gear, ...context.itemGroups.magic];
    }
    return context;
  }
}
