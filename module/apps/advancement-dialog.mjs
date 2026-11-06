import { SINLESS } from "../config.mjs";
import { KISMET_AWARDS, BOONS, boonStatus, boonChoices } from "../helpers/advancement.mjs";

const { DialogV2 } = foundry.applications.api;
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const loc = k => game.i18n.localize(k);

/** End-of-session Kismet award (p.238). The Agonarch ticks what the character achieved. */
export async function awardDialog(actor) {
  const rows = Object.entries(KISMET_AWARDS).map(([key, n]) => `
    <label class="award"><input type="checkbox" name="${key}"> ${esc(loc(`SINLESS.Award.${key}`))} <span class="cost">+${n}</span></label>`).join("");
  const content = `<div class="sinless-advance">
    <p class="hint">${esc(loc("SINLESS.Award.hint"))}</p>
    ${rows}
    <div class="form-group"><label>${esc(loc("SINLESS.Award.extra"))}</label><input type="number" name="extra" value="0" min="0"></div>
  </div>`;
  const result = await DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Award.title", { name: actor.name }), icon: "fa-solid fa-star" },
    classes: ["sinless", "sinless-advance-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      {
        action: "award", label: "SINLESS.Award.give", icon: "fa-solid fa-star", default: true,
        callback: (event, button) => {
          const data = new foundry.applications.ux.FormDataExtended(button.form).object;
          return { selected: Object.keys(KISMET_AWARDS).filter(k => data[k]), extra: Number(data.extra) || 0 };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    rejectClose: false
  });
  if (!result || typeof result !== "object") return null;
  return actor.awardKismet(result.selected, result.extra);
}

/** Spend unspent Kismet on a skill, attribute or the Zoetic Potential (pp.214, 238). */
export async function advanceDialog(actor) {
  const options = actor.advanceOptions;
  const group = kind => options.filter(o => o.kind === kind).map(o => `
    <option value="${o.kind}:${o.key}" ${o.affordable ? "" : "disabled"}>${esc(o.label)} ${o.from} → ${o.to} (${o.cost})</option>`).join("");
  const content = `<div class="sinless-advance">
    <p>${esc(game.i18n.format("SINLESS.Advance.unspent", { n: actor.system.kismet.unspent }))}</p>
    <div class="form-group"><label>${esc(loc("SINLESS.Advance.choose"))}</label>
      <select name="choice">
        <optgroup label="${esc(loc("SINLESS.Advance.groupAttributes"))}">${group("attribute")}</optgroup>
        <optgroup label="${esc(loc("SINLESS.Advance.groupSkills"))}">${group("skill")}</optgroup>
        <optgroup label="${esc(loc("SINLESS.Zoetic"))}">${group("zoetic")}</optgroup>
      </select>
    </div>
    <p class="hint">${esc(loc("SINLESS.Advance.costHint"))}</p>
    <label class="talisman"><input type="checkbox" name="talisman"> ${esc(loc("SINLESS.Advance.talisman"))}</label>
  </div>`;
  const result = await DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Advance.spendTitle", { name: actor.name }), icon: "fa-solid fa-arrow-up" },
    classes: ["sinless", "sinless-advance-dialog"],
    position: { width: 460 },
    content,
    buttons: [
      {
        action: "buy", label: "SINLESS.Advance.buy", icon: "fa-solid fa-arrow-up", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    rejectClose: false
  });
  if (!result?.choice) return null;
  const [kind, key] = result.choice.split(":");
  // Raising the Zoetic Potential needs a talisman of power or similar item (p.214).
  if (kind === "zoetic" && !result.talisman) {
    ui.notifications.warn("SINLESS.Advance.needTalisman", { localize: true });
    return null;
  }
  return actor.buyAdvance(kind, key);
}

/** Choose the next boon (p.238). */
export async function boonDialog(actor) {
  const k = actor.system.kismet;
  const status = boonStatus(k.earned, k.boons);
  if (!status.available) {
    ui.notifications.warn("SINLESS.Advance.noBoon", { localize: true });
    return null;
  }
  const skills = rank => Object.keys(SINLESS.SKILLS)
    .filter(s => actor._source.system.skills[s]?.rank === rank)
    .map(s => `<option value="${s}">${esc(loc(`SINLESS.Skill.${s}`))}</option>`).join("");
  const pools = Object.entries(SINLESS.POOLS).map(([p, l]) => `<option value="${p}">${esc(loc(l))}</option>`).join("");
  const rows = boonChoices(status.next).map(b => {
    const def = BOONS[b];
    let extra = "";
    if (def.skillFrom) {
      const opts = skills(def.skillFrom);
      extra = opts ? `<select name="skill-${b}">${opts}</select>` : `<span class="hint">${esc(game.i18n.format("SINLESS.Advance.skillMustBe", { n: def.skillFrom }))}</span>`;
    } else if (b === "resilience") extra = `<select name="pool">${pools}</select>`;
    else if (b === "asset" || b === "item") extra = `<input type="text" name="note-${b}" placeholder="${esc(loc("SINLESS.Boon.notePlaceholder"))}">`;
    const disabled = def.skillFrom && !skills(def.skillFrom) ? "disabled" : "";
    return `<div class="boon ${def.tier}">
      <label><input type="radio" name="boon" value="${b}" ${disabled}> <strong>${esc(loc(`SINLESS.Boon.${b}.label`))}</strong></label>
      <p class="hint">${esc(loc(`SINLESS.Boon.${b}.hint`))}</p>${extra}</div>`;
  }).join("");
  const content = `<div class="sinless-advance">
    <p>${esc(game.i18n.format(status.major ? "SINLESS.Advance.boonMajor" : "SINLESS.Advance.boonMinor", { n: status.next }))}</p>
    ${rows}
  </div>`;
  const result = await DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Advance.boonTitle", { name: actor.name }), icon: "fa-solid fa-gift" },
    classes: ["sinless", "sinless-advance-dialog"],
    position: { width: 500 },
    content,
    buttons: [
      {
        action: "take", label: "SINLESS.Advance.takeBoon", icon: "fa-solid fa-gift", default: true,
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    rejectClose: false
  });
  if (!result?.boon) return null;
  const b = result.boon;
  return actor.takeBoon(b, { skill: result[`skill-${b}`], pool: result.pool, note: result[`note-${b}`] ?? "" });
}
