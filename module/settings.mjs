import { SYSTEM_ID, DIFFICULTIES, HEAT_LEVELS, AGONARCH_TN } from "./config.mjs";
import { playerTargetNumber, heatBonusDice } from "./helpers/rules.mjs";

export function registerSettings() {
  const choices = obj => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label])
  );
  const rerenderActors = () => {
    for (const actor of game.actors ?? []) actor.reset?.();
    for (const app of foundry.applications.instances.values()) {
      if (app.document?.documentName === "Actor") app.render();
    }
  };

  game.settings.register(SYSTEM_ID, "difficulty", {
    name: "SINLESS.Setting.difficulty.name",
    hint: "SINLESS.Setting.difficulty.hint",
    scope: "world",
    config: true,
    type: String,
    choices: choices(DIFFICULTIES),
    default: "veteran",
    onChange: rerenderActors
  });

  game.settings.register(SYSTEM_ID, "heat", {
    name: "SINLESS.Setting.heat.name",
    hint: "SINLESS.Setting.heat.hint",
    scope: "world",
    config: true,
    type: Number,
    choices: choices(HEAT_LEVELS),
    default: 0,
    onChange: rerenderActors
  });

  game.settings.register(SYSTEM_ID, "baseConditionBoxes", {
    name: "SINLESS.Setting.baseConditionBoxes.name",
    hint: "SINLESS.Setting.baseConditionBoxes.hint",
    scope: "world",
    config: true,
    type: Number,
    choices: { 3: "3", 6: "6", 9: "9", 12: "12" },
    default: 6,
    onChange: rerenderActors
  });

  game.settings.register(SYSTEM_ID, "woundPenalties", {
    name: "SINLESS.Setting.woundPenalties.name",
    hint: "SINLESS.Setting.woundPenalties.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: rerenderActors
  });

  game.settings.register(SYSTEM_ID, "refreshPoolsOnRound", {
    name: "SINLESS.Setting.refreshPoolsOnRound.name",
    hint: "SINLESS.Setting.refreshPoolsOnRound.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

export const getSetting = key => game.settings.get(SYSTEM_ID, key);

/** Current target number. NPCs controlled by the Agonarch always use 4+. */
export function currentTargetNumber(isAgonarch = false) {
  if (isAgonarch) return AGONARCH_TN;
  const base = DIFFICULTIES[getSetting("difficulty")]?.tn ?? 4;
  return playerTargetNumber(base, Number(getSetting("heat")) || 0);
}

/** Operational heat bonus dice for player tests. */
export function currentHeatBonus(isAgonarch = false) {
  return isAgonarch ? 0 : heatBonusDice(Number(getSetting("heat")) || 0);
}
