import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { planTest } from "../helpers/rules.mjs";
import { forceFormula, drainIsLethal } from "../helpers/magic.mjs";
import { combatModifiers, specializedRank, recoilJammed } from "../helpers/combat.mjs";

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
    firingChoices: choices(SINLESS.FIRING_MODES),
    lightChoices: SINLESS.LIGHT_LEVELS,
    coverChoices: SINLESS.COVER_LEVELS,
    recoilJammed: defaults.combat?.recoil ? recoilJammed(defaults.combat.recoil.tokens, defaults.combat.recoil.capacity) : false
  });

  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    const n = (v, d = 0) => (v === null || v === "" || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
    const pool = data.pool || null;
    const firingBonus = SINLESS.FIRING_MODES[data.firingMode]?.bonus ?? 0;
    const poolAvailable = pool ? defaults.poolValues[pool] : 0;
    const mode = data.mode ?? defaults.mode;
    const notes = [];
    const resilience = pool ? defaults.resilience?.[pool] ?? 0 : 0;
    if (resilience) notes.push(game.i18n.format("SINLESS.Boon.resilience.note", { n: resilience }));
    // Specialization (p.41): ±1 rank for a skill the actor has.
    let rank = n(data.rank);
    if (defaults.spec && (mode === "skill" || mode === "rank")) {
      const applies = !!data.specApplies;
      rank = specializedRank(rank, defaults.spec, applies);
      notes.push(game.i18n.format(applies ? "SINLESS.Spec.applies" : "SINLESS.Spec.general", { spec: defaults.spec }));
    }
    // Ranged combat modifiers (pp.88-92).
    let gear = n(data.gear);
    let combat = null;
    if (defaults.combat) {
      const m = combatModifiers({
        light: data.light, cover: data.cover, pointBlank: !!data.pointBlank, prone: !!data.prone,
        aim: n(data.aim), accuracy: defaults.combat.accuracy, extraTargets: n(data.extraTargets),
        dualWield: !!data.dualWield, range: n(data.range)
      });
      // Two guns: the weapon's accuracy no longer raises the limit (p.91).
      if (data.dualWield) gear = Math.max(0, gear - defaults.combat.accuracy);
      for (const p of m.parts) {
        const sign = p.value > 0 ? "+" : "−";
        // Light and cover labels already show their value.
        if (p.key === "light") notes.push(game.i18n.localize(SINLESS.LIGHT_LEVELS[data.light]));
        else if (p.key === "cover") notes.push(game.i18n.localize(SINLESS.COVER_LEVELS[data.cover]));
        else notes.push(`${game.i18n.localize(`SINLESS.Combat.part.${p.key}`)} ${sign}${Math.abs(p.value)}`);
      }
      combat = { ...m, recoil: defaults.combat.recoil };
    }
    const config = {
      pool,
      mode,
      rank,
      gear,
      bonus: n(data.bonus) + firingBonus + (combat?.bonus ?? 0),
      bonusField: n(data.bonus),
      penalty: n(data.penalty) + (combat?.penalty ?? 0),
      notes,
      combat,
      // Pool resilience boons add free Kismet dice to tests with that pool (p.238).
      kismet: Math.min(n(data.kismet), defaults.kismetAvailable ?? 0) + (pool ? defaults.resilience?.[pool] ?? 0 : 0),
      kismetFree: pool ? defaults.resilience?.[pool] ?? 0 : 0,
      poolDice: data.poolDice === "" || data.poolDice === null || data.poolDice === undefined ? undefined : n(data.poolDice),
      target: Math.clamp(n(data.target, 4), 2, 6),
      reroll: n(data.reroll),
      threshold: data.threshold === "" || data.threshold === null ? null : n(data.threshold),
      spendPool: !!data.spendPool,
      autoSuccesses: defaults.autoSuccesses ?? 0,
      firingMode: data.firingMode,
      force: defaults.force ? Math.clamp(n(data.force, defaults.force.value), 1, defaults.force.max) : null,
      ward: defaults.ward ? Math.max(0, n(data.ward)) : 0,
      poolAvailable
    };
    config.plan = planTest(config);
    return config;
  };

  const updatePreview = dialog => {
    const form = dialog.element.querySelector("form");
    if (!form) return;
    const { plan, poolAvailable, force, notes } = read(form);
    const out = dialog.element.querySelector(".sinless-test-preview");
    const fmt = plan.usesPool ? "SINLESS.Test.preview" : "SINLESS.Test.previewDice";
    out.innerHTML = plan.impossible
      ? `<strong class="impossible">${game.i18n.localize("SINLESS.Test.impossible")}</strong>`
      : game.i18n.format(fmt, {
        limit: plan.usesPool ? plan.limit : "—",
        available: plan.usesPool ? poolAvailable : "—",
        pool: plan.poolDice,
        bonus: plan.bonusDice,
        kismet: plan.kismetDice,
        total: plan.total
      });
    if (notes.length) out.innerHTML += `<br><span class="modifiers">${foundry.utils.escapeHTML(notes.join(" · "))}</span>`;
    const recoil = defaults.combat?.recoil;
    if (recoil && recoilJammed(recoil.tokens, recoil.capacity)) {
      out.innerHTML += `<br><strong class="impossible">${game.i18n.localize("SINLESS.Combat.recoilJammed")}</strong>`;
    }
    // Spells: show the drain the chosen force will cause (p.167).
    if (defaults.force?.drain) {
      const drain = forceFormula(defaults.force.drain, force) ?? 0;
      const lethal = drainIsLethal(force, defaults.force.zoetic);
      out.innerHTML += `<br><span class="${lethal ? "lethal" : ""}">${game.i18n.format("SINLESS.Magic.drainPreview", {
        drain, type: game.i18n.localize(lethal ? "SINLESS.Magic.lethal" : "SINLESS.Condition.stun"), zoetic: defaults.force.zoetic
      })}</span>`;
    }
  };

  return DialogV2.wait({
    window: { title: defaults.label, icon: "fa-solid fa-dice-six" },
    classes: ["sinless", "sinless-test-dialog"],
    position: { width: defaults.combat ? 520 : 460 },
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
