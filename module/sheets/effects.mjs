/**
 * Active Effect helpers shared by actor and item sheets.
 * Works with the v14 data layout (effect.system.changes with `type`) and the
 * v13 layout (effect.changes with numeric `mode`).
 */

const MODE_TYPES = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };
const TYPE_SYMBOLS = { add: "+", multiply: "×", override: "=", upgrade: "≥", downgrade: "≤", custom: "?" };

/** Short human-readable form of one change, e.g. "attributes.str.value +2". */
function describeChange(change) {
  const type = change.type ?? MODE_TYPES[change.mode] ?? "custom";
  const key = String(change.key ?? "").replace(/^system\./, "");
  let value = change.value;
  if (typeof value === "object" && value !== null) value = JSON.stringify(value);
  const sym = TYPE_SYMBOLS[type] ?? `${type} `;
  if (type === "add" && /^-/.test(String(value))) return `${key} ${value}`;
  return `${key} ${sym}${value}`;
}

/** Row data for one effect. */
function effectRow(effect, owner) {
  const changes = effect.system?.changes ?? effect.changes ?? [];
  return {
    uuid: effect.uuid,
    name: effect.name,
    img: effect.img,
    disabled: effect.disabled,
    suppressed: effect.isSuppressed,
    source: effect.parent === owner ? "" : effect.parent?.name ?? "",
    changes: changes.filter(c => c.key).map(describeChange).join(" · "),
    // Continuous spell (p.167): resistance successes gathered so far.
    sustained: effect.getFlag?.("sinless", "sustained") ?? null
  };
}

/** Effects applying to an actor (own and transferred from items). */
export function actorEffects(actor) {
  return [...actor.allApplicableEffects()].map(e => effectRow(e, actor));
}

/** Effects stored on an item. */
export function itemEffects(item) {
  return item.effects.contents.map(e => effectRow(e, item));
}

/** Common change keys shown as a reminder on sheets. */
export const EFFECT_KEYS = [
  "system.attributes.str.value",
  "system.pools.brawn.bonus",
  "system.condition.physical.bonus",
  "system.armorBonus.ballistic",
  "system.skills.firearms.rank",
  "system.etiquettes.street.rank",
  "system.initiativeBonus",
  "system.kismet.poolBonus",
  "system.zoetic.bonus"
];

const effectFrom = target => fromUuidSync(target.closest("[data-effect-uuid]")?.dataset.effectUuid);

/** Sheet action handlers; `this` is the sheet. */
export const effectActions = {
  async effectCreate() {
    const parent = this.document;
    const cls = foundry.utils.getDocumentClass("ActiveEffect");
    const [effect] = await parent.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("SINLESS.Effect.new"),
      img: cls.DEFAULT_ICON ?? "icons/svg/aura.svg",
      origin: parent.uuid
    }]);
    effect?.sheet.render(true);
  },
  async effectEdit(event, target) {
    effectFrom(target)?.sheet.render(true);
  },
  async effectDelete(event, target) {
    return effectFrom(target)?.deleteDialog();
  },
  async effectToggle(event, target) {
    const effect = effectFrom(target);
    return effect?.update({ disabled: !effect.disabled });
  }
};

/**
 * Disable inputs whose value is currently set by an Active Effect: saving the
 * displayed (modified) value would bake the effect into the base data.
 * Inputs marked with data-source-value show the base value and stay editable.
 */
export function lockOverriddenInputs(sheet) {
  const overrides = foundry.utils.flattenObject(sheet.document.overrides ?? {});
  if (foundry.utils.isEmpty(overrides)) return;
  const hint = game.i18n.localize("SINLESS.Effect.overridden");
  for (const input of sheet.element.querySelectorAll("input[name], select[name]")) {
    if (!(input.name in overrides) || ("sourceValue" in input.dataset)) continue;
    input.disabled = true;
    input.classList.add("overridden");
    input.dataset.tooltip = hint;
  }
}
