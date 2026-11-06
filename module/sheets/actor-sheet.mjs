import { SYSTEM_ID, SINLESS, skillLabel } from "../config.mjs";
import { currentTargetNumber, getSetting, adjustAlert } from "../settings.mjs";
import { deckStatus, influencePenalty, INTRUSION_PENALTY } from "../helpers/grid.mjs";
import { actorEffects, effectActions, lockOverriddenInputs, EFFECT_KEYS } from "./effects.mjs";
import { creationReport, creationSpending, PRIORITY_CATEGORIES } from "../helpers/creation.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const T = path => `systems/${SYSTEM_ID}/templates/${path}`;

const ITEM_GROUPS = {
  gear: ["weapon", "armor", "gear", "implant"],
  grid: ["deck", "software", "vcr"],
  magic: ["power", "ritual"],
  social: ["asset", "knowledge"]
};

/** Shared behavior for character and NPC sheets. */
export class SinlessActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
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
      itemToggle: SinlessActorSheet.#onItemToggle,
      ...effectActions
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

    context.items = {};
    context.itemGroups = {};
    for (const item of actor.items.contents.sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
      (context.items[item.type] ??= []).push(item);
    }
    context.itemGroups = Object.fromEntries(Object.entries(ITEM_GROUPS).map(([tab, types]) => [
      tab, types.map(type => ({ type, label: `TYPES.Item.${type}`, items: context.items[type] ?? [] }))
    ]));
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    context.enrichedNotes = await TextEditor.enrichHTML(sys.notes, { relativeTo: actor, secrets: actor.isOwner });
    context.fields = sys.schema.fields;
    context.effects = actorEffects(actor);
    context.effectKeys = EFFECT_KEYS;
    if (!sys.pools) return context;

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

    context.hasFixedDefenses = !!sys.defenses;
    context.defenses = Object.entries(SINLESS.DEFENSES).map(([key, d]) => ({
      key, label: d.label, pool: d.pool, value: sys.pools[d.pool].value,
      fixed: sys.defenses ? sys.defenses[key] : undefined,
      poolLabel: d.pool ? game.i18n.localize(SINLESS.POOLS[d.pool]) : ""
    }));

    const boxes = (value, max) => Array.from({ length: max }, (_, i) => ({
      n: i + 1, filled: i < value, mark: (i + 1) % 3 === 0
    }));
    context.physicalBoxes = boxes(sys.condition.physical.value, sys.condition.physical.max);
    context.stunBoxes = boxes(sys.condition.stun.value, sys.condition.stun.max);
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    lockOverriddenInputs(this);
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
      case "software": return this.actor.rollSoftware(item);
      case "deck": return item.sheet.render(true);
      case "resource": return item.sheet.render(true);
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
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    actions: {
      rollGhost: CharacterSheet.#onRollGhost,
      rollNanHack: CharacterSheet.#onRollNanHack,
      adjustAlert: CharacterSheet.#onAdjustAlert,
      resetInfluence: CharacterSheet.#onResetInfluence,
      setCohesion: CharacterSheet.#onSetCohesion,
      openVehicle: CharacterSheet.#onOpenVehicle,
      rollSeedMoney: CharacterSheet.#onRollSeedMoney,
      finishCreation: CharacterSheet.#onFinishCreation
    }
  };

  static PARTS = {
    header: { template: T("actor/character-header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: T("actor/tab-main.hbs"), scrollable: [""] },
    gear: { template: T("actor/tab-items.hbs"), scrollable: [""] },
    magic: { template: T("actor/tab-items.hbs"), scrollable: [""] },
    social: { template: T("actor/tab-social.hbs"), scrollable: [""] },
    grid: { template: T("actor/tab-grid.hbs"), scrollable: [""] },
    effects: { template: T("actor/tab-effects.hbs"), scrollable: [""] },
    bio: { template: T("actor/tab-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "gear" }, { id: "magic" }, { id: "social" }, { id: "grid" }, { id: "effects" }, { id: "bio" }],
      initial: "main",
      labelPrefix: "SINLESS.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    const source = this.actor._source.system.attributes ?? {};
    context.attributes = Object.entries(SINLESS.ATTRIBUTES).map(([key, label]) => {
      const base = source[key]?.value ?? sys.attributes[key].value;
      return { key, label, ...sys.attributes[key], base, modified: base !== sys.attributes[key].value };
    });
    const opts = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label]));
    context.heritageChoices = opts(SINLESS.HERITAGES);
    context.talentChoices = SINLESS.MAGIC_TALENTS;
    context.lifestyleChoices = SINLESS.LIFESTYLES;
    context.charismaPoolChoices = { "": "—", ...SINLESS.POOLS };
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    context.enrichedBiography = await TextEditor.enrichHTML(sys.biography, { relativeTo: this.actor, secrets: this.actor.isOwner });
    if (sys.creation.active) context.creation = this.#creationContext();
    context.grid = this.#gridContext();
    context.rig = this.#rigContext();
    return context;
  }

  /** Deck, MCP dice, intrusion, alert and NAN influence for the Grid tab (ch.7). */
  #gridContext() {
    const actor = this.actor;
    const sys = actor.system;
    const deck = actor.deck;
    const intrusion = getSetting("intrusion");
    const software = actor.items.filter(i => i.type === "software").map(i => i.system);
    const ctx = {
      deck,
      mcp: sys.grid.mcp,
      intrusionLabel: SINLESS.INTRUSION_LEVELS[intrusion],
      intrusionPenalty: INTRUSION_PENALTY[intrusion] ?? 0,
      alert: Number(getSetting("alert")) || 0,
      influence: sys.grid.influence,
      influencePenalty: influencePenalty(sys.grid.influence),
      hasProgram: !!actor.hackingProgram
    };
    if (!deck) return ctx;
    const d = deck.system;
    const status = deckStatus({ mcp: d.mcp, threads: d.threads, io: d.io }, software);
    ctx.loaded = status.loaded;
    ctx.running = status.running;
    ctx.coreLabel = SINLESS.DECK_CORES[d.core];
    ctx.issues = status.issues.map(i => game.i18n.format(`SINLESS.Grid.issue.${i.code}`, i.data ?? {}));
    ctx.cohesionBoxes = Array.from({ length: d.mcp }, (_, i) => ({
      n: i + 1, filled: i < d.cohesion, mark: (i + 1) % 3 === 0
    }));
    return ctx;
  }

  /** VCR and controlled vehicles for the Grid tab (ch.8). */
  #rigContext() {
    const actor = this.actor;
    const vcr = actor.vcr;
    const vehicles = actor.controlledVehicles.map(v => ({
      id: v.id, name: v.name, img: v.img, control: SINLESS.CONTROL_MODES[v.controlMode]
    }));
    if (!vcr && !vehicles.length) return null;
    return {
      vcr,
      bonus: actor.system.rig.bonus,
      coreLabel: vcr ? SINLESS.DECK_CORES[vcr.system.core] : "",
      vehicles,
      overLinks: vcr ? vehicles.length > vcr.system.links : false
    };
  }

  static async #onOpenVehicle(event, target) {
    game.actors.get(target.closest("[data-vehicle-id]")?.dataset.vehicleId)?.sheet.render(true);
  }

  static async #onRollNanHack(event, target) {
    return this.actor.rollNanHack(target.dataset.mode);
  }

  static async #onAdjustAlert(event, target) {
    return adjustAlert(Number(target.dataset.delta) || 0);
  }

  static async #onResetInfluence() {
    return this.actor.update({ "system.grid.influence": 0 });
  }

  /** Click a deck cohesion box: fill up to it, or clear it if it is the last filled box. */
  static async #onSetCohesion(event, target) {
    const deck = this.actor.deck;
    if (!deck) return;
    const n = Number(target.dataset.n);
    return deck.update({ "system.cohesion": deck.system.cohesion === n ? n - 1 : n });
  }

  /** Budgets and rule problems for the creation panel (pp.44-46). */
  #creationContext() {
    const actor = this.actor;
    const sys = actor.system;
    const src = actor._source.system;
    const loc = k => game.i18n.localize(k);
    const fmt = (k, d) => game.i18n.format(k, d);
    const items = actor.items.contents;
    const report = creationReport({
      priorities: sys.creation.priorities,
      attributes: Object.fromEntries(Object.keys(SINLESS.ATTRIBUTES).map(k => [k, src.attributes?.[k]?.value ?? 1])),
      attributeMax: Object.fromEntries(Object.keys(SINLESS.ATTRIBUTES).map(k => [k, sys.attributes[k].max])),
      attributeAdjust: sys.creation.attributeAdjust,
      skills: Object.fromEntries(Object.keys(SINLESS.SKILLS).map(k => [k, src.skills?.[k]?.rank ?? 0])),
      rituals: items.filter(i => i.type === "ritual").map(i => i.system.rank),
      knowledge: items.filter(i => i.type === "knowledge").map(i => i.system.rank),
      etiquettes: Object.fromEntries(Object.keys(SINLESS.ETIQUETTES).map(k => [k, src.etiquettes?.[k]?.rank ?? 0])),
      int: sys.attributes.int.value,
      cha: sys.attributes.cha.value,
      heritage: sys.heritage,
      talent: sys.talent,
      spent: creationSpending(items.map(i => ({
        type: i.type, cost: i.system.cost, quantity: i.system.quantity, hireCost: i.system.hireCost, free: i.system.free
      })), sys.lifestyle, sys.lifestyleMonths)
    });
    const num = n => (n === null ? "—" : n.toLocaleString(game.i18n.lang));
    const describe = issue => {
      const d = { ...issue.data };
      if (d.categories) d.categories = d.categories.map(c => loc(`SINLESS.Creation.category.${c}`)).join(", ");
      if (d.levels) d.levels = d.levels.join(", ");
      if (issue.code === "attributeLow" || issue.code === "attributeHigh") d.key = loc(SINLESS.ATTRIBUTES[d.key]);
      else if (issue.code === "skillHigh") d.key = d.key ? loc(skillLabel(d.key)) : loc("SINLESS.Creation.otherSkills");
      else if (issue.code === "overBudget") d.key = loc(`SINLESS.Creation.budget.${d.key}`);
      return fmt(`SINLESS.Creation.issue.${issue.code}`, d);
    };
    return {
      priorities: PRIORITY_CATEGORIES.map(key => ({
        key, label: `SINLESS.Creation.category.${key}`, value: sys.creation.priorities[key]
      })),
      priorityChoices: { "": "—", A: "A", B: "B", C: "C", D: "D", E: "E" },
      budgets: report.budgets.map(b => ({
        ...b, label: `SINLESS.Creation.budget.${b.key}`, spentText: num(b.spent), budgetText: num(b.budget)
      })),
      issues: report.issues.map(describe),
      ok: report.ok,
      extraAsset: sys.attributes.cha.value >= 11
    };
  }

  static async #onRollGhost() {
    const roll = await new Roll("2d6").evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.localize("SINLESS.Creation.ghostFlavor")
    });
    return this.actor.update({ "system.ghost": roll.total });
  }

  static async #onRollSeedMoney() {
    const roll = await new Roll("4d6 * 100").evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.localize("SINLESS.Creation.seedFlavor")
    });
    return this.actor.update({ "system.zuzu": this.actor.system.zuzu + roll.total });
  }

  static async #onFinishCreation() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "SINLESS.Creation.finish" },
      content: `<p>${game.i18n.localize("SINLESS.Creation.finishConfirm")}</p>`
    });
    if (ok) return this.actor.update({ "system.creation.active": false });
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId in context.tabs) context.tab = context.tabs[partId];
    if (partId === "gear" || partId === "magic" || partId === "grid") context.groups = context.itemGroups[partId];
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
    effects: { template: T("actor/tab-effects.hbs"), scrollable: [""] },
    bio: { template: T("actor/tab-bio.hbs"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "main" }, { id: "gear" }, { id: "effects" }, { id: "bio" }],
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
