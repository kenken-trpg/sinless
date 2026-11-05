import { SYSTEM_ID, SINLESS, skillLabel } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const T = path => `systems/${SYSTEM_ID}/templates/${path}`;

export class SinlessItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sinless", "sheet", "item"],
    position: { width: 520, height: 600 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    header: { template: T("item/header.hbs") },
    details: { template: T("item/details.hbs"), scrollable: [""] },
    description: { template: T("item/description.hbs"), scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    context.item = item;
    context.system = item.system;
    context.fields = item.system.schema.fields;
    context.config = SINLESS;
    context.isType = Object.fromEntries([[item.type, true]]);
    context.physical = "carried" in item.system;
    context.skillChoices = Object.fromEntries(Object.keys(SINLESS.SKILLS).map(k => [k, skillLabel(k)]));
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
      relativeTo: item, secrets: item.isOwner
    });
    return context;
  }
}
