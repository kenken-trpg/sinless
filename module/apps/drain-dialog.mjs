import { SYSTEM_ID } from "../config.mjs";
import { drainResult } from "../helpers/magic.mjs";
import { summarize } from "../dice/test-roll.mjs";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/drain-dialog.hbs`;
const { DialogV2 } = foundry.applications.api;

const successesOf = message => {
  const state = message?.getFlag?.(SYSTEM_ID, "test");
  return state ? summarize(state).successes : 0;
};

/**
 * Resist and apply drain (pp.166-167, 183): channel with Channeling + fetish,
 * soak stun drain with Brawn, then mark the track (at least one stun box).
 * @param {Actor} actor
 * @param {{label: string, drain: number, lethal: boolean, fetish: number}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function drainDialog(actor, o) {
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    ...o, canRoll: actor.isOwner && !!actor.system.pools
  });

  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const lethal = !!data.lethal;
    const drain = n(data.drain);
    const r = drainResult({ drain, lethal, channel: n(data.channel), soak: lethal ? 0 : n(data.soak) });
    return { ...r, drain, lethal };
  };

  const update = dialog => {
    const form = dialog.element.querySelector("form");
    if (!form) return;
    const r = read(form);
    const soak = dialog.element.querySelector("input[name=soak]");
    if (soak) soak.disabled = r.lethal;
    dialog.element.querySelector(".sinless-drain-preview").innerHTML = game.i18n.format("SINLESS.Magic.drainResult", {
      n: r.amount, track: game.i18n.localize(`SINLESS.Condition.${r.track}`)
    });
  };

  return DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Magic.drainTitle", { name: o.label }), icon: "fa-solid fa-hand-sparkles" },
    classes: ["sinless", "sinless-damage-dialog"],
    position: { width: 440 },
    content,
    buttons: [
      { action: "apply", label: "SINLESS.Damage.apply", icon: "fa-solid fa-heart-crack", default: true, callback: (event, button) => read(button.form) },
      { action: "cancel", label: "SINLESS.Dialog.cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      form?.addEventListener("input", () => update(dialog));
      form?.addEventListener("change", () => update(dialog));
      for (const button of dialog.element.querySelectorAll("[data-sinless-roll]")) {
        button.addEventListener("click", async ev => {
          ev.preventDefault();
          button.disabled = true;
          try {
            const key = button.dataset.sinlessRoll;
            const msg = key === "channel" ? await actor.rollChanneling(o.fetish, o.label) : await actor.rollDefense("soak");
            if (msg) dialog.element.querySelector(`input[name=${key}]`).value = successesOf(msg);
            update(dialog);
          } finally {
            button.disabled = false;
          }
        });
      }
      update(dialog);
    },
    rejectClose: false
  }).then(result => {
    if (!result || typeof result !== "object") return null;
    return actor.applyDamage({
      hit: true, raw: result.drain, armorReduction: 0, afterArmor: result.drain, final: result.amount,
      track: result.track, stripped: [], source: game.i18n.format("SINLESS.Magic.drainTitle", { name: o.label })
    });
  });
}
