import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { planTest } from "../helpers/rules.mjs";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/test-dialog.hbs`;
const { DialogV2 } = foundry.applications.api;

/**
 * Show the test configuration dialog.
 * @param {object} defaults  Initial values (see SinlessActor#_testDefaults).
 * @returns {Promise<object|null>} The submitted configuration, or null when cancelled.
 */
export async function testDialog(defaults) {
  const choices = obj => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label])
  );
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    ...defaults,
    poolChoices: choices(SINLESS.POOLS),
    modeChoices: choices(SINLESS.TEST_MODES),
    rerollChoices: choices(SINLESS.REROLL_OPTIONS),
    firingChoices: choices(SINLESS.FIRING_MODES)
  });

  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const n = (v, d = 0) => (v === null || v === "" || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
    const pool = data.pool || null;
    const firingBonus = SINLESS.FIRING_MODES[data.firingMode]?.bonus ?? 0;
    const poolAvailable = pool ? defaults.poolValues[pool] : 0;
    const config = {
      pool,
      mode: data.mode,
      rank: n(data.rank),
      gear: n(data.gear),
      bonus: n(data.bonus) + firingBonus,
      penalty: n(data.penalty),
      kismet: Math.min(n(data.kismet), defaults.kismetAvailable ?? 0),
      poolDice: data.poolDice === "" || data.poolDice === null ? undefined : n(data.poolDice),
      target: Math.clamp(n(data.target, 4), 2, 6),
      reroll: n(data.reroll),
      threshold: data.threshold === "" || data.threshold === null ? null : n(data.threshold),
      spendPool: !!data.spendPool,
      firingMode: data.firingMode,
      poolAvailable
    };
    config.plan = planTest(config);
    return config;
  };

  const updatePreview = dialog => {
    const form = dialog.element.querySelector("form");
    if (!form) return;
    const { plan, poolAvailable } = read(form);
    const out = dialog.element.querySelector(".sinless-test-preview");
    out.innerHTML = plan.impossible
      ? `<strong class="impossible">${game.i18n.localize("SINLESS.Test.impossible")}</strong>`
      : game.i18n.format("SINLESS.Test.preview", {
        limit: plan.usesPool ? plan.limit : "—",
        available: plan.usesPool ? poolAvailable : "—",
        pool: plan.poolDice,
        bonus: plan.bonusDice,
        kismet: plan.kismetDice,
        total: plan.total
      });
  };

  return DialogV2.wait({
    window: { title: defaults.label, icon: "fa-solid fa-dice-six" },
    classes: ["sinless", "sinless-test-dialog"],
    position: { width: 460 },
    content,
    buttons: [
      {
        action: "roll",
        label: "SINLESS.Test.roll",
        icon: "fa-solid fa-dice",
        default: true,
        callback: (event, button) => read(button.form)
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      form?.addEventListener("input", () => updatePreview(dialog));
      form?.addEventListener("change", () => updatePreview(dialog));
      updatePreview(dialog);
    },
    rejectClose: false
  }).then(result => (result && typeof result === "object" ? result : null));
}
