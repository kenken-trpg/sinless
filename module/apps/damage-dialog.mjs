import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { resolveDamage } from "../helpers/damage.mjs";
import { summarize } from "../dice/test-roll.mjs";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/damage-dialog.hbs`;
const { DialogV2 } = foundry.applications.api;

/** Successes of a test card message (0 if the roll was cancelled). */
function messageSuccesses(message) {
  const state = message?.getFlag?.(SYSTEM_ID, "test");
  return state ? summarize(state).successes : 0;
}

/**
 * Resolve an attack card against one defender (pp.89, 92-94): dodge, armor,
 * soak, then apply damage. Dodge and soak can be rolled from the dialog.
 * @param {ChatMessage} message  The attack card.
 * @param {Actor} actor          The defender.
 */
export async function damageDialog(message, actor) {
  const state = message.getFlag(SYSTEM_ID, "test");
  const weapon = state?.extra;
  if (!weapon?.weapon || !actor?.system.condition) return null;
  const hits = summarize(state).successes;
  // Network entities: hardening works as armor against every attack (p.133).
  const h = actor.isEntity ? actor.hardening : 0;
  const armor = actor.isEntity
    ? { ballistic: { total: h, highest: h }, impact: { total: h, highest: h } }
    : actor.system.armor ?? {};
  const choices = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v]));

  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    attack: state.label,
    defender: actor.name,
    hits,
    weapon,
    armor,
    canRoll: actor.isOwner && (!!actor.system.pools || actor.type === "vehicle"),
    armorTypeChoices: { ballistic: "SINLESS.Armor.ballistic", impact: "SINLESS.Armor.impact" },
    trackChoices: choices(SINLESS.DAMAGE_TRACKS),
    // Spells: targets resist with a pool instead of dodging, and armor does not apply (p.167).
    magic: !!weapon.magic,
    resistLabel: weapon.resistPool
      ? game.i18n.format("SINLESS.Magic.resist", { pool: game.i18n.localize(SINLESS.POOLS[weapon.resistPool]) })
      : null
  });

  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const result = resolveDamage({
      base: n(data.base),
      hits: n(data.hits),
      dodge: n(data.dodge),
      armorType: data.armorType,
      penetration: n(data.penetration),
      armor,
      energy: !!data.energy,
      stun: !!data.stun,
      blast: !!data.blast,
      halve: !!data.halve,
      modifier: n(data.modifier),
      soak: n(data.soak),
      multiplier: weapon.multiplier ?? 1,
      vehicle: actor.type === "vehicle",
      ignoreArmor: !!weapon.magic
    });
    if (data.track === "physical" || data.track === "stun") result.track = data.track;
    result.source = state.label;
    return result;
  };

  const updatePreview = dialog => {
    const form = dialog.element.querySelector("form");
    if (!form) return;
    const r = read(form);
    const out = dialog.element.querySelector(".sinless-damage-preview");
    if (r.immune) {
      out.innerHTML = `<strong>${game.i18n.localize("SINLESS.Damage.immune")}</strong>`;
      return;
    }
    out.innerHTML = r.hit
      ? game.i18n.format("SINLESS.Damage.preview", {
        raw: r.raw,
        armor: r.armorReduction,
        soak: r.afterArmor - r.final,
        final: r.final,
        track: game.i18n.localize(`SINLESS.Condition.${r.track}`)
      })
      : `<strong>${game.i18n.localize("SINLESS.Damage.miss")}</strong>`;
  };

  /** Roll a defense test for the defender and copy its successes into a field. */
  const rollInto = async (dialog, key) => {
    // "resist" fills the dodge field: resistance successes cancel the caster's successes.
    const msg = key === "resist" ? await actor.rollResistance(weapon.resistPool) : await actor.rollDefense(key, { digital: false });
    if (!msg) return;
    const input = dialog.element.querySelector(`input[name="${key === "resist" ? "dodge" : key}"]`);
    if (input) input.value = messageSuccesses(msg);
    updatePreview(dialog);
  };

  return DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Damage.title", { name: actor.name }), icon: "fa-solid fa-shield-halved" },
    classes: ["sinless", "sinless-damage-dialog"],
    position: { width: 480 },
    content,
    buttons: [
      {
        action: "apply",
        label: "SINLESS.Damage.apply",
        icon: "fa-solid fa-heart-crack",
        default: true,
        callback: (event, button) => read(button.form)
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      form?.addEventListener("input", () => updatePreview(dialog));
      form?.addEventListener("change", () => updatePreview(dialog));
      for (const button of dialog.element.querySelectorAll("[data-sinless-roll]")) {
        button.addEventListener("click", async ev => {
          ev.preventDefault();
          button.disabled = true;
          try {
            await rollInto(dialog, button.dataset.sinlessRoll);
          } finally {
            button.disabled = false;
          }
        });
      }
      updatePreview(dialog);
    },
    rejectClose: false
  }).then(async result => {
    if (!result || typeof result !== "object") return null;
    if (!result.hit) {
      ui.notifications.info(game.i18n.format("SINLESS.Damage.missed", { name: actor.name }));
      return null;
    }
    if (result.immune) {
      ui.notifications.info(game.i18n.format("SINLESS.Damage.immuneNotice", { name: actor.name }));
      return null;
    }
    return actor.applyDamage(result);
  });
}

/** Defenders for a "use selected tokens" click: controlled tokens the user owns. */
export function controlledDefenders() {
  return (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(a => a?.isOwner && a.system.condition);
}
