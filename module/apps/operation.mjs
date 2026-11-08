import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { addControlButton } from "./control-button.mjs";
import { getSetting, onOperationChange } from "../settings.mjs";
import {
  heatAfterAlert, heatWhenDiscovered, crossedResponses, activeResponses,
  sectorHeatGain, sectorHeatNeedsRoll, CAMERA_FALLOUT, cacheValue
} from "../helpers/operation.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const loc = k => game.i18n.localize(k);

/** Current operation state with defaults. */
function operationState() {
  const op = foundry.utils.deepClone(getSetting("operation") ?? {});
  return { responses: [], lastAlert: 0, lastHeat: 0, htr: null, ...op };
}

async function saveState(op) {
  return game.settings.set(SYSTEM_ID, "operation", op);
}

/** A chat card for the operation (whispered to GMs unless `public`). */
async function operationMessage(html, { public: isPublic = false } = {}) {
  return ChatMessage.create({
    speaker: { alias: loc("SINLESS.Operation.title") },
    content: `<div class="sinless-card sinless-operation-card">${html}</div>`,
    whisper: isPublic ? [] : ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  });
}

export async function setAlert(value) {
  if (!game.user.isGM) return null;
  return game.settings.set(SYSTEM_ID, "alert", Math.max(0, Math.trunc(value)));
}

export async function setHeat(value) {
  if (!game.user.isGM) return null;
  return game.settings.set(SYSTEM_ID, "heat", Math.clamp(Math.trunc(value), 0, 4));
}

/**
 * React to alert changes (active GM only): announce the alert responses whose
 * threshold was crossed, and raise heat to two stars above 50 alert (p.236).
 */
async function alertChanged(alert) {
  const op = operationState();
  const before = op.lastAlert ?? 0;
  if (alert === before) return;
  const crossed = crossedResponses(op.responses, before, alert);
  op.lastAlert = alert;
  await saveState(op);
  if (crossed.length) {
    const items = crossed.map(r => `<li>${esc(r.label)} <span class="threshold">(${r.threshold})</span></li>`).join("");
    await operationMessage(`<header class="card-header"><h3>${esc(game.i18n.format("SINLESS.Operation.alertReached", { n: alert }))}</h3></header><ul>${items}</ul>`);
  }
  const heat = Number(getSetting("heat")) || 0;
  const next = heatAfterAlert(alert, heat);
  if (next !== heat) await setHeat(next);
}

/** React to heat changes: announce rising heat to everyone; four stars call the HTR team (p.81). */
async function heatChanged(heat) {
  const op = operationState();
  const before = op.lastHeat ?? 0;
  if (heat === before) return;
  op.lastHeat = heat;
  let html = "";
  if (heat > before) {
    html = `<header class="card-header"><h3>${esc(loc(SINLESS.HEAT_LEVELS[heat]))}</h3></header><p>${esc(loc(`SINLESS.Operation.heatEffect.${heat}`))}</p>`;
  }
  if (heat >= 4 && before < 4) {
    const roll = await new Roll("2d6").evaluate();
    op.htr = roll.total;
    await operationMessage(`<p class="effect warn">${esc(game.i18n.format("SINLESS.Operation.htr", { n: roll.total }))}</p>`);
  }
  if (heat < 4) op.htr = null;
  await saveState(op);
  if (html) await operationMessage(html, { public: true });
}

/**
 * Fallout at the end of the operation (pp.81, 236): sector heat for a brand,
 * camera fallout per character, paydata caches, permanent injury reminders.
 * Then alert and heat are reset.
 */
export async function endOperation() {
  const heat = Number(getSetting("heat")) || 0;
  const difficulty = getSetting("difficulty");
  const brands = game.actors.filter(a => a.type === "brand");
  // Player characters; worlds without player owners fall back to every character.
  const allCharacters = game.actors.filter(a => a.type === "character");
  const owned = allCharacters.filter(a => a.hasPlayerOwner);
  const characters = owned.length ? owned : allCharacters;
  const brandOptions = [`<option value="">—</option>`, ...brands.map(b => `<option value="${b.id}">${esc(b.name)} (${esc(loc(SINLESS.SECTOR_HEAT[b.system.sector.heat]))})</option>`)].join("");
  const camRows = characters.map(c => `<label class="camera"><input type="checkbox" name="camera-${c.id}"> ${esc(c.name)}</label>`).join("");
  const content = `<div class="sinless-advance sinless-fallout">
    <p>${esc(loc(SINLESS.HEAT_LEVELS[heat]))}: ${esc(loc(`SINLESS.Operation.sectorHeat.${Math.min(heat, 4)}`))}</p>
    <div class="form-group"><label>${esc(loc("SINLESS.Operation.brand"))}</label><select name="brand">${brandOptions}</select></div>
    <p class="hint">${esc(loc("SINLESS.Operation.cameraHint"))}</p>
    ${camRows || `<p class="hint">${esc(loc("SINLESS.Operation.noCharacters"))}</p>`}
    <div class="form-group"><label>${esc(loc("SINLESS.Operation.caches"))}</label><input type="number" name="caches" value="0" min="0"></div>
    <p class="hint">${esc(loc("SINLESS.Operation.cachesHint"))}</p>
  </div>`;
  const data = await DialogV2.wait({
    window: { title: "SINLESS.Operation.end", icon: "fa-solid fa-flag-checkered" },
    classes: ["sinless", "sinless-advance-dialog"],
    position: { width: 460 },
    content,
    buttons: [
      { action: "end", label: "SINLESS.Operation.end", icon: "fa-solid fa-flag-checkered", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
      { action: "cancel", label: "SINLESS.Dialog.cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    rejectClose: false
  });
  if (!data || typeof data !== "object") return null;

  const lines = [];
  const rolls = [];
  // Sector heat (p.81).
  let roll = null;
  if (sectorHeatNeedsRoll(heat)) {
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    roll = r.total;
  }
  const gain = sectorHeatGain(heat, roll);
  const brand = data.brand ? game.actors.get(data.brand) : null;
  let heatLine = game.i18n.format("SINLESS.Operation.sectorGain", { n: gain });
  if (roll !== null) heatLine += ` (1d6 = ${roll})`;
  if (brand && gain) {
    const next = Math.min(4, brand.system.sector.heat + gain);
    await brand.update({ "system.sector.heat": next });
    heatLine += ` — ${esc(brand.name)}: ${esc(loc(SINLESS.SECTOR_HEAT[next]))}`;
  }
  lines.push(heatLine);

  // Cameras (p.236).
  for (const actor of characters.filter(c => data[`camera-${c.id}`])) {
    const r = await new Roll("1d6").evaluate();
    rolls.push(r);
    const entry = CAMERA_FALLOUT[r.total];
    let text = `${esc(actor.name)}: 1d6 = ${r.total} — ${esc(loc(`SINLESS.Operation.camera.${entry.key}`))}`;
    if (entry.ghost) {
      const g = await new Roll(entry.ghost).evaluate();
      if (g.dice.length) rolls.push(g);
      const ghost = Math.max(0, (actor.system.ghost ?? 0) - g.total);
      await actor.update({ "system.ghost": ghost });
      text += ` ${esc(game.i18n.format("SINLESS.Operation.ghostLoss", { n: g.total, ghost }))}`;
    }
    lines.push(text);
  }

  // Paydata and relics (p.236).
  const caches = Math.max(0, Math.trunc(Number(data.caches) || 0));
  for (let i = 0; i < caches; i++) {
    const kind = await new Roll("1d6").evaluate();
    const value = await new Roll("3d6").evaluate();
    rolls.push(kind, value);
    const c = cacheValue(difficulty, kind.total, value.total);
    lines.push(game.i18n.format(c.relic ? "SINLESS.Operation.relic" : "SINLESS.Operation.paydata", { n: c.value.toLocaleString() }));
  }

  // Permanent injury reminders (p.97).
  const injured = characters.filter(c => (c.system.condition?.overflow ?? 0) > 0);
  if (injured.length) lines.push(game.i18n.format("SINLESS.Operation.injuryReminder", { names: injured.map(c => esc(c.name)).join(", ") }));

  await operationMessage(`<header class="card-header"><h3>${esc(loc("SINLESS.Operation.fallout"))}</h3></header><ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul>`, { public: true });
  if (game.dice3d) for (const r of rolls) game.dice3d.showForRoll(r, game.user, true);

  // Reset for the next operation.
  const op = operationState();
  Object.assign(op, { lastAlert: 0, lastHeat: 0, htr: null });
  await saveState(op);
  await game.settings.set(SYSTEM_ID, "alert", 0);
  await game.settings.set(SYSTEM_ID, "heat", 0);
  return true;
}

/** GM window for the current operation: difficulty, alert responses and operational heat. */
export class OperationApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  /** Skip the re-render caused by our own form save, so typing keeps focus. */
  static #skipRefresh = false;

  static DEFAULT_OPTIONS = {
    id: "sinless-operation",
    classes: ["sinless", "sinless-operation"],
    tag: "form",
    window: { title: "SINLESS.Operation.title", icon: "fa-solid fa-user-secret", resizable: true },
    position: { width: 460, height: "auto" },
    form: { handler: OperationApp.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      alert: OperationApp.#onAlert,
      heat: OperationApp.#onHeat,
      discovered: OperationApp.#onDiscovered,
      addResponse: OperationApp.#onAddResponse,
      removeResponse: OperationApp.#onRemoveResponse,
      endOperation: OperationApp.#onEnd
    }
  };

  static PARTS = { main: { template: `systems/${SYSTEM_ID}/templates/apps/operation.hbs` } };

  static open() {
    if (!game.user.isGM) return null;
    OperationApp.#instance ??= new OperationApp();
    return OperationApp.#instance.render({ force: true });
  }

  static refresh(what) {
    if (what === "state" && OperationApp.#skipRefresh) {
      OperationApp.#skipRefresh = false;
      return;
    }
    if (OperationApp.#instance?.rendered) OperationApp.#instance.render();
  }

  async _prepareContext() {
    const op = operationState();
    const alert = Number(getSetting("alert")) || 0;
    const heat = Number(getSetting("heat")) || 0;
    const active = new Set(activeResponses(op.responses, alert));
    return {
      difficulty: getSetting("difficulty"),
      difficultyChoices: Object.fromEntries(Object.entries(SINLESS.DIFFICULTIES).map(([k, v]) => [k, v.label])),
      alert,
      heat,
      heatLabel: SINLESS.HEAT_LEVELS[heat],
      heatEffect: `SINLESS.Operation.heatEffect.${heat}`,
      stars: [1, 2, 3, 4].map(n => ({ n, on: n <= heat })),
      htr: op.htr,
      responses: op.responses.map((r, i) => ({ ...r, index: i, number: i + 1, active: active.has(r) }))
        .sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0))
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if (data.difficulty && data.difficulty !== getSetting("difficulty")) await game.settings.set(SYSTEM_ID, "difficulty", data.difficulty);
    if (Number.isFinite(Number(data.alert)) && Number(data.alert) !== Number(getSetting("alert"))) await setAlert(Number(data.alert));
    if (data.responses) {
      const op = operationState();
      for (const [i, r] of Object.entries(data.responses)) {
        if (!op.responses[i]) continue;
        op.responses[i] = { label: String(r.label ?? ""), threshold: Math.max(1, Math.trunc(Number(r.threshold) || 1)) };
      }
      // Only a real change fires the setting's onChange (and its re-render) to skip.
      if (JSON.stringify(op) === JSON.stringify(operationState())) return;
      OperationApp.#skipRefresh = true;
      await saveState(op);
    }
  }

  static async #onAlert(event, target) {
    return setAlert((Number(getSetting("alert")) || 0) + Number(target.dataset.delta));
  }

  static async #onHeat(event, target) {
    const n = Number(target.dataset.heat);
    const heat = Number(getSetting("heat")) || 0;
    // Clicking the highest lit star turns it off.
    return setHeat(n === heat ? n - 1 : n);
  }

  static async #onDiscovered() {
    return setHeat(heatWhenDiscovered(Number(getSetting("heat")) || 0));
  }

  static async #onAddResponse() {
    const op = operationState();
    const last = op.responses.reduce((m, r) => Math.max(m, r.threshold ?? 0), 0);
    op.responses.push({ label: "", threshold: Math.min(50, last + 10) });
    return saveState(op);
  }

  static async #onRemoveResponse(event, target) {
    const op = operationState();
    op.responses.splice(Number(target.dataset.index), 1);
    return saveState(op);
  }

  static async #onEnd() {
    return endOperation();
  }
}

/** Wire the tracker: react to setting changes and add a scene control button for the GM. */
export function registerOperation() {
  onOperationChange(async (what, value) => {
    OperationApp.refresh(what);
    if (!game.user.isActiveGM) return;
    if (what === "alert") await alertChanged(Number(value) || 0);
    if (what === "heat") await heatChanged(Number(value) || 0);
  });
  addControlButton("sinlessOperation", { title: "SINLESS.Operation.title", icon: "fa-solid fa-user-secret", gmOnly: true, open: () => OperationApp.open() });
}
