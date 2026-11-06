import { SYSTEM_ID } from "../config.mjs";
import { getSetting } from "../settings.mjs";
import {
  CHASE_LEGS, CHASE_PATHS, CHASE_RANGES, parseDeck, dealPaths, moveRange, inAttackRange, chaseOutcome
} from "../helpers/chase.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const loc = k => game.i18n.localize(k);
const PATH_NAMES = ["A", "B", "C", "D"];

const EMPTY = { active: false, vehicleUuid: null, legs: 3, legsDone: 0, paths: [], primary: 0, discard: [], enemies: [], turn: 1, ended: null };

/** Current chase state with defaults. */
export function chaseState() {
  return { ...foundry.utils.deepClone(EMPTY), ...foundry.utils.deepClone(getSetting("chase") ?? {}) };
}

async function saveChase(state) {
  return game.settings.set(SYSTEM_ID, "chase", state);
}

async function chaseMessage(html) {
  return ChatMessage.create({
    speaker: { alias: loc("SINLESS.Chase.title") },
    content: `<div class="sinless-card sinless-chase-card">${html}</div>`
  });
}

/** Whether a vehicle (or any actor) has its physical track filled: wrecked (p.152). */
function isWrecked(actor) {
  const p = actor?.system.condition?.physical;
  return !!p && p.max > 0 && p.value >= p.max;
}

function enemyStatus(state) {
  return state.enemies.map(e => ({ ...e, wrecked: isWrecked(fromUuidSync(e.uuid)) }));
}

/** Check for the end of the chase and announce it once. */
async function checkOutcome(state) {
  if (state.ended) return state;
  const outcome = chaseOutcome({
    legs: state.legs, legsDone: state.legsDone, enemies: enemyStatus(state),
    wrecked: isWrecked(fromUuidSync(state.vehicleUuid))
  });
  if (!outcome) return state;
  state.ended = outcome;
  await chaseMessage(`<p class="effect ${outcome === "wrecked" ? "warn" : ""}"><strong>${esc(loc(`SINLESS.Chase.outcome.${outcome}`))}</strong></p>`);
  return state;
}

/** Flip the top card of a path and apply it (leg completed cards count toward escape). */
async function flipTop(state, pathIndex, { reason = "flip", target = "players" } = {}) {
  const path = state.paths[pathIndex];
  const card = path?.shift();
  if (!card) {
    ui.notifications.warn("SINLESS.Chase.emptyPath", { localize: true });
    return state;
  }
  state.discard.push(card);
  // A leg only counts when the players drive it, not when a trap turns it on the enemies.
  if (card.leg && target === "players") state.legsDone += 1;
  const name = PATH_NAMES[pathIndex];
  let html = `<header class="card-header"><h3>${esc(game.i18n.format(`SINLESS.Chase.reason.${reason}`, { path: name }))}</h3></header>`;
  html += `<p>${card.leg ? `<strong>${esc(loc("SINLESS.Chase.legCard"))}</strong> ` : ""}${esc(card.text)}</p>`;
  if (target === "enemies") html += `<p class="effect">${esc(loc("SINLESS.Chase.affectsEnemies"))}</p>`;
  if (card.leg && target === "players") html += `<p class="effect">${esc(game.i18n.format("SINLESS.Chase.legsProgress", { n: state.legsDone, legs: state.legs }))}</p>`;
  await chaseMessage(html);
  return checkOutcome(state);
}

/** The next path that still has cards, other than the primary one. */
function secondaryPath(state) {
  for (let k = 1; k < state.paths.length; k++) {
    const i = (state.primary + k) % state.paths.length;
    if (state.paths[i].length) return i;
  }
  return null;
}

/**
 * Apply a successful (or failed, for a trap) chase action from a test card (pp.231-232).
 * @returns {Promise<boolean>} Whether anything was applied.
 */
export async function applyChaseAction(action, { success, targetUuid } = {}) {
  if (!game.user.isGM) return false;
  let state = chaseState();
  if (!state.active) {
    ui.notifications.warn("SINLESS.Chase.notActive", { localize: true });
    return false;
  }
  switch (action) {
    case "maneuver": {
      const enemy = state.enemies.find(e => e.uuid === targetUuid);
      if (!success || !enemy) return false;
      enemy.range = moveRange(enemy.range, 1, { flying: enemy.flying });
      await chaseMessage(`<p>${esc(game.i18n.format("SINLESS.Chase.fellBack", { name: enemy.name, range: loc(`SINLESS.Chase.range.${enemy.range}`) }))}</p>`);
      state = await checkOutcome(state);
      break;
    }
    case "switch": {
      if (!success) return false;
      const next = secondaryPath(state);
      if (next === null) return false;
      state.primary = next;
      await chaseMessage(`<p>${esc(game.i18n.format("SINLESS.Chase.switched", { path: PATH_NAMES[next] }))}</p>`);
      break;
    }
    case "book":
      if (!success) return false;
      state = await flipTop(state, state.primary, { reason: "book" });
      break;
    case "burn": {
      if (!success) return false;
      const card = state.paths[state.primary]?.shift();
      if (!card) return false;
      state.discard.push(card);
      await chaseMessage(`<p>${esc(game.i18n.format("SINLESS.Chase.burned", { path: PATH_NAMES[state.primary] }))}</p>`);
      break;
    }
    case "plot": {
      if (!success) return false;
      const card = state.paths.flatMap((p, i) => p.map((c, j) => ({ c, i, j }))).find(x => !x.c.revealed && x.i === state.primary)
        ?? state.paths.flatMap((p, i) => p.map((c, j) => ({ c, i, j }))).find(x => !x.c.revealed);
      if (!card) return false;
      state.paths[card.i][card.j].revealed = true;
      await chaseMessage(`<p>${esc(game.i18n.format("SINLESS.Chase.plotted", { path: PATH_NAMES[card.i] }))}</p>`);
      break;
    }
    case "trap": {
      // Four successes: a non-primary path card hits the opponents; a failure hits the players (p.231).
      const i = secondaryPath(state);
      if (i === null) return false;
      state = await flipTop(state, i, { reason: "trap", target: success ? "enemies" : "players" });
      break;
    }
    default:
      return false;
  }
  await saveChase(state);
  return true;
}

/** Start a chase: legs, paths and the shuffled deck of path options (p.230). */
export async function startChase() {
  const difficulty = getSetting("difficulty");
  const legs = CHASE_LEGS[difficulty] ?? 3;
  const paths = CHASE_PATHS[difficulty] ?? 2;
  const sample = loc("SINLESS.Chase.sampleDeck");
  const content = `<div class="sinless-advance sinless-chase-setup">
    <div class="form-group"><label>${esc(loc("SINLESS.Chase.legs"))}</label><input type="number" name="legs" value="${legs}" min="1"></div>
    <div class="form-group"><label>${esc(loc("SINLESS.Chase.paths"))}</label><input type="number" name="paths" value="${paths}" min="1" max="4"></div>
    <p class="hint">${esc(loc("SINLESS.Chase.deckHint"))}</p>
    <textarea name="deck" rows="12">${esc(sample)}</textarea>
  </div>`;
  const data = await DialogV2.wait({
    window: { title: "SINLESS.Chase.start", icon: "fa-solid fa-car-side" },
    classes: ["sinless", "sinless-advance-dialog"],
    position: { width: 480 },
    content,
    buttons: [
      { action: "start", label: "SINLESS.Chase.start", icon: "fa-solid fa-flag", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    rejectClose: false
  });
  if (!data || typeof data !== "object") return null;
  const cards = parseDeck(data.deck);
  const legCards = cards.filter(c => c.leg).length;
  const need = Math.max(1, Math.trunc(Number(data.legs) || legs));
  if (legCards < need) ui.notifications.warn(game.i18n.format("SINLESS.Chase.fewLegs", { n: legCards, legs: need }));
  const state = {
    ...foundry.utils.deepClone(EMPTY),
    vehicleUuid: chaseState().vehicleUuid,
    enemies: chaseState().enemies,
    active: true,
    legs: need,
    paths: dealPaths(cards, Math.clamp(Math.trunc(Number(data.paths) || paths), 1, 4), () => CONFIG.Dice.randomUniform())
  };
  await saveChase(state);
  await chaseMessage(`<header class="card-header"><h3>${esc(loc("SINLESS.Chase.started"))}</h3></header><p>${esc(game.i18n.format("SINLESS.Chase.startedText", { legs: need, paths: state.paths.length }))}</p>`);
  return state;
}

/** GM window for the vehicle chase board. */
export class ChaseApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: "sinless-chase",
    classes: ["sinless", "sinless-chase"],
    tag: "form",
    window: { title: "SINLESS.Chase.title", icon: "fa-solid fa-car-side", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: ChaseApp.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      start: ChaseApp.#onStart,
      end: ChaseApp.#onEnd,
      flip: ChaseApp.#onFlip,
      reveal: ChaseApp.#onReveal,
      burn: ChaseApp.#onBurn,
      primary: ChaseApp.#onPrimary,
      setVehicle: ChaseApp.#onSetVehicle,
      addEnemies: ChaseApp.#onAddEnemies,
      removeEnemy: ChaseApp.#onRemoveEnemy,
      moveEnemy: ChaseApp.#onMoveEnemy,
      openActor: ChaseApp.#onOpenActor,
      leg: ChaseApp.#onLeg
    }
  };

  static PARTS = { main: { template: `systems/${SYSTEM_ID}/templates/apps/chase.hbs` } };

  static open() {
    if (!game.user.isGM) return null;
    ChaseApp.#instance ??= new ChaseApp();
    return ChaseApp.#instance.render({ force: true });
  }

  static refresh() {
    if (ChaseApp.#instance?.rendered) ChaseApp.#instance.render();
  }

  async _prepareContext() {
    const state = chaseState();
    const vehicle = fromUuidSync(state.vehicleUuid);
    const p = vehicle?.system.condition?.physical;
    return {
      ...state,
      vehicle: vehicle ? { name: vehicle.name, uuid: state.vehicleUuid, integrity: p ? `${p.value}/${p.max}` : "", wrecked: isWrecked(vehicle) } : null,
      legMarks: Array.from({ length: state.legs }, (_, i) => ({ done: i < state.legsDone })),
      pathViews: state.paths.map((cards, i) => ({
        index: i,
        name: PATH_NAMES[i],
        primary: i === state.primary,
        count: cards.length,
        top: cards[0] ?? null,
        revealed: cards.filter(c => c.revealed).length
      })),
      enemyViews: enemyStatus(state).map((e, i) => ({
        ...e, index: i,
        rangeLabel: `SINLESS.Chase.range.${e.range}`,
        attackable: inAttackRange(e.range)
      })),
      rangeChoices: Object.fromEntries([...CHASE_RANGES, "out"].map(r => [r, `SINLESS.Chase.range.${r}`])),
      outcomeLabel: state.ended ? `SINLESS.Chase.outcome.${state.ended}` : null
    };
  }

  /** Drop a vehicle or actor onto the window to add it as the players' vehicle or an enemy. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const zone of this.element.querySelectorAll("[data-drop]")) {
      zone.addEventListener("dragover", ev => ev.preventDefault());
      zone.addEventListener("drop", async ev => {
        ev.preventDefault();
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        if (data?.type !== "Actor") return;
        const actor = await fromUuid(data.uuid);
        if (!actor) return;
        const state = chaseState();
        if (zone.dataset.drop === "vehicle") state.vehicleUuid = actor.uuid;
        else if (!state.enemies.some(e => e.uuid === actor.uuid)) state.enemies.push(this.constructor.enemyEntry(actor));
        await saveChase(state);
      });
    }
  }

  static enemyEntry(actor) {
    return { uuid: actor.uuid, name: actor.name, range: "close", flying: actor.system?.mobility === "air" };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if (!data.enemies) return;
    const state = chaseState();
    for (const [i, e] of Object.entries(data.enemies)) {
      const enemy = state.enemies[i];
      if (!enemy) continue;
      enemy.flying = !!e.flying;
      enemy.range = enemy.flying ? "close" : e.range ?? enemy.range;
    }
    await saveChase(await checkOutcome(state));
  }

  static async #onStart() {
    return startChase();
  }

  static async #onEnd() {
    const state = chaseState();
    await saveChase({ ...foundry.utils.deepClone(EMPTY), vehicleUuid: state.vehicleUuid });
    return chaseMessage(`<p>${esc(loc("SINLESS.Chase.ended"))}</p>`);
  }

  /** End of turn: flip the primary path's top card (p.231). */
  static async #onFlip() {
    let state = chaseState();
    state = await flipTop(state, state.primary, { reason: "flip" });
    state.turn += 1;
    return saveChase(state);
  }

  static async #onReveal(event, target) {
    const state = chaseState();
    const card = state.paths[Number(target.dataset.path)]?.find(c => !c.revealed);
    if (!card) return null;
    card.revealed = true;
    return saveChase(state);
  }

  static async #onBurn(event, target) {
    const state = chaseState();
    const card = state.paths[Number(target.dataset.path)]?.shift();
    if (card) state.discard.push(card);
    return saveChase(state);
  }

  static async #onPrimary(event, target) {
    const state = chaseState();
    state.primary = Number(target.dataset.path);
    return saveChase(state);
  }

  static async #onLeg(event, target) {
    const state = chaseState();
    state.legsDone = Math.clamp(state.legsDone + Number(target.dataset.delta), 0, state.legs);
    return saveChase(await checkOutcome(state));
  }

  static async #onSetVehicle() {
    const token = canvas?.tokens?.controlled?.[0];
    if (!token?.actor) {
      ui.notifications.warn("SINLESS.Chase.selectToken", { localize: true });
      return null;
    }
    const state = chaseState();
    state.vehicleUuid = token.actor.uuid;
    return saveChase(state);
  }

  /** Add the GM's selected and targeted tokens as pursuers. */
  static async #onAddEnemies() {
    const state = chaseState();
    const actors = [...(canvas?.tokens?.controlled ?? []), ...(game.user.targets ?? [])].map(t => t.actor).filter(Boolean);
    for (const actor of actors) {
      if (actor.uuid === state.vehicleUuid || state.enemies.some(e => e.uuid === actor.uuid)) continue;
      state.enemies.push(ChaseApp.enemyEntry(actor));
    }
    if (!actors.length) ui.notifications.warn("SINLESS.Chase.selectToken", { localize: true });
    return saveChase(state);
  }

  static async #onRemoveEnemy(event, target) {
    const state = chaseState();
    state.enemies.splice(Number(target.dataset.index), 1);
    return saveChase(state);
  }

  static async #onMoveEnemy(event, target) {
    const state = chaseState();
    const enemy = state.enemies[Number(target.dataset.index)];
    if (!enemy) return null;
    enemy.range = moveRange(enemy.range, Number(target.dataset.delta), { flying: enemy.flying });
    return saveChase(await checkOutcome(state));
  }

  static async #onOpenActor(event, target) {
    return fromUuidSync(target.dataset.uuid)?.sheet?.render(true);
  }
}

/** World setting for the chase board and the GM scene control button. */
export function registerChase() {
  game.settings.register(SYSTEM_ID, "chase", {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(EMPTY),
    onChange: () => {
      ChaseApp.refresh();
      for (const app of foundry.applications.instances.values()) {
        if (app.document?.type === "vehicle") app.render();
      }
    }
  });
  // Damage to a chase vehicle may end the chase (wrecked).
  Hooks.on("updateActor", async actor => {
    if (!game.user.isActiveGM || actor.type !== "vehicle") return;
    const state = chaseState();
    if (!state.active || state.ended) return;
    if (actor.uuid !== state.vehicleUuid && !state.enemies.some(e => e.uuid === actor.uuid)) return;
    ChaseApp.refresh();
    const next = await checkOutcome(state);
    if (next.ended) await saveChase(next);
  });
  Hooks.on("getSceneControlButtons", controls => {
    if (!game.user.isGM) return;
    const tokens = controls.tokens ?? controls.token;
    if (!tokens?.tools) return;
    tokens.tools.sinlessChase = {
      name: "sinlessChase",
      title: "SINLESS.Chase.title",
      icon: "fa-solid fa-car-side",
      order: Object.keys(tokens.tools).length,
      button: true,
      visible: true,
      onChange: () => ChaseApp.open()
    };
  });
}

