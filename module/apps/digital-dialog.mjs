import { SYSTEM_ID } from "../config.mjs";
import { resolveDigital, digitalTrack } from "../helpers/grid.mjs";
import { summarize } from "../dice/test-roll.mjs";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/digital-dialog.hbs`;
const { DialogV2 } = foundry.applications.api;

/** Successes of a test card message (0 if the roll was cancelled). */
function messageSuccesses(message) {
  const state = message?.getFlag?.(SYSTEM_ID, "test");
  return state ? summarize(state).successes : 0;
}

/**
 * Resolve a digital attack card against one target (pp.130, 133, 135-137, 205):
 * ICE and digital weapons are reduced by hardening, Electric Strike cannot be
 * dodged, De-rez deals 1d6 per net success to cohesion, Acid Burn lowers hardening.
 * @param {ChatMessage} message  The attack card.
 * @param {Actor} actor          The target.
 */
export async function digitalDialog(message, actor) {
  const state = message.getFlag(SYSTEM_ID, "test");
  const x = state?.extra;
  if (!x?.digital || !actor) return null;
  const kind = x.digital;
  if (kind !== "acid" && !actor.system.condition) return null;
  const hits = summarize(state).successes;
  const track = kind === "weapon" ? digitalTrack({ entity: actor.isEntity, hotseat: actor.hotseated }) : "stun";
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    attack: state.label,
    defender: actor.name,
    kind,
    kindLabel: `SINLESS.Digital.attack.${kind === "weapon" ? "weapon" : kind}`,
    hits,
    base: x.damage ?? 0,
    hardening: actor.hardening,
    ignore: x.ignoreHardening ?? 0,
    rating: x.rating ?? 0,
    machine: actor.isMachine,
    canDodge: kind !== "strike",
    canSoak: kind === "weapon" || kind === "strike",
    showBase: kind === "weapon" || kind === "strike",
    canRoll: actor.isOwner && (!!actor.system.pools || actor.type === "vehicle"),
    trackLabel: `SINLESS.Condition.${track}`,
    entity: actor.isEntity
  });

  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return resolveDigital({
      kind,
      base: n(data.base),
      hits: n(data.hits),
      defense: n(data.defense),
      hardening: n(data.hardening),
      ignore: n(data.ignore),
      soak: n(data.soak),
      machine: !!data.machine,
      rating: n(data.rating)
    });
  };

  const fmt = (key, data) => game.i18n.format(key, data);
  const updatePreview = dialog => {
    const form = dialog.element.querySelector("form");
    const out = dialog.element.querySelector(".sinless-damage-preview");
    if (!form || !out) return;
    const r = read(form);
    if (!r.hit) {
      out.innerHTML = `<strong>${game.i18n.localize("SINLESS.Damage.miss")}</strong>`;
      return;
    }
    if (kind === "derez") out.innerHTML = fmt("SINLESS.Digital.preview.derez", { n: r.dice });
    else if (kind === "acid") out.innerHTML = fmt("SINLESS.Digital.preview.acid", { reduction: r.reduction, hardening: r.hardening });
    else out.innerHTML = fmt("SINLESS.Digital.preview.damage", {
      raw: r.raw, hardening: r.reduction, soak: r.afterArmor - r.final, final: r.final,
      track: game.i18n.localize(`SINLESS.${actor.isEntity ? "Grid.cohesion" : `Condition.${track}`}`)
    });
  };

  /** Roll the target's defense or soak and copy its successes into the field. */
  const rollInto = async (dialog, key) => {
    const msg = await actor.rollDefense(key, { attack: "digital" });
    if (!msg) return;
    const input = dialog.element.querySelector(`input[name="${key === "dodge" ? "defense" : key}"]`);
    if (input) input.value = messageSuccesses(msg);
    updatePreview(dialog);
  };

  const result = await DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Digital.title", { name: actor.name }), icon: "fa-solid fa-microchip" },
    classes: ["sinless", "sinless-damage-dialog"],
    position: { width: 460 },
    content,
    buttons: [
      { action: "apply", label: "SINLESS.Damage.apply", icon: "fa-solid fa-bolt", default: true, callback: (event, button) => read(button.form) },
      { action: "cancel", label: "SINLESS.Dialog.cancel", icon: "fa-solid fa-xmark", type: "button" }
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
  });
  if (!result || typeof result !== "object") return null;
  if (!result.hit) {
    ui.notifications.info(game.i18n.format("SINLESS.Damage.missed", { name: actor.name }));
    return null;
  }
  const source = state.label;
  if (kind === "acid") {
    const before = actor.hardening;
    await actor.setHardening(result.hardening);
    const text = fmt("SINLESS.Digital.acidApplied", { name: actor.name, from: before, to: result.hardening });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p class="sinless-note">${foundry.utils.escapeHTML(text)}</p>` });
  }
  if (kind === "derez") {
    const roll = await new Roll(`${result.dice}d6`).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: fmt("SINLESS.Digital.derezRoll", { name: actor.name, n: result.dice }) });
    // Direct damage to cohesion: nothing reduces it further (p.136).
    return actor.applyDamage({
      hit: true, raw: roll.total, armorReduction: 0, afterArmor: roll.total, final: roll.total,
      track: "stun", stripped: [], source, digital: true
    });
  }
  return actor.applyDamage({
    hit: true, raw: result.raw, armorReduction: result.reduction, afterArmor: result.afterArmor, final: result.final,
    track, stripped: [], source, digital: true
  });
}
