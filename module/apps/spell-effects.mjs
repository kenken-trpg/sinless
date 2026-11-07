import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { sustainedNeeded, summonResult } from "../helpers/magic.mjs";
import { summarize, saveCard } from "../dice/test-roll.mjs";

const { DialogV2 } = foundry.applications.api;

/** Successes of a test card message (0 if the roll was cancelled). */
function messageSuccesses(message) {
  const state = message?.getFlag?.(SYSTEM_ID, "test");
  return state ? summarize(state).successes : 0;
}

const note = (actor, text, flags = {}) => ChatMessage.create({
  speaker: ChatMessage.getSpeaker({ actor }),
  content: `<p class="sinless-note">${foundry.utils.escapeHTML(text)}</p>`,
  flags: { [SYSTEM_ID]: flags }
});

/** A defender can resolve another user's card without updating that user's message. */
export function sustainedApplied(message, uuid) {
  return message.getFlag(SYSTEM_ID, "test")?.extra?.spell?.applied?.includes(uuid)
    || game.messages.some(m => {
      const receipt = m.getFlag(SYSTEM_ID, "sustainedApplication");
      return receipt?.message === message.uuid && receipt.target === uuid;
    });
}

/**
 * Place a continuous spell on one target (p.167). The target first resists for
 * free; the caster's remaining successes are what the target must accumulate on
 * later resistance tests to throw the spell off.
 * @param {ChatMessage} message  The spell card.
 * @param {string} uuid          Target token or actor UUID.
 */
export async function applySustained(message, uuid) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const spell = state?.extra?.spell;
  if (!spell?.continuous || state.abf || !spell.targets?.some(t => t.uuid === uuid) || sustainedApplied(message, uuid)) return null;
  const doc = fromUuidSync(uuid);
  const actor = doc?.actor ?? doc;
  if (!actor) return null;
  if (!actor.isOwner) {
    ui.notifications.warn("SINLESS.Digital.noPermission", { localize: true });
    return null;
  }
  const hits = summarize(state).successes;
  const poolLabel = game.i18n.localize(SINLESS.POOLS[spell.resistPool] ?? "");
  const resistLabel = foundry.utils.escapeHTML(game.i18n.format("SINLESS.Magic.resist", { pool: poolLabel }));
  const content = `<div class="sinless-damage">
    <p class="notes"><span>${foundry.utils.escapeHTML(spell.label)}</span><span>${foundry.utils.escapeHTML(actor.name)}</span></p>
    <div class="form-group"><label>${game.i18n.localize("SINLESS.Damage.hits")}</label><input type="number" name="hits" value="${hits}" min="0"></div>
    <div class="form-group"><label>${resistLabel}</label>
      <div class="with-button"><input type="number" name="resist" value="0" min="0">
      <button type="button" data-sinless-roll="resist" data-tooltip="${resistLabel}" aria-label="${resistLabel}"><i class="fa-solid fa-dice"></i></button></div></div>
    <p class="sinless-damage-preview"></p></div>`;
  const read = form => {
    const data = new foundry.applications.ux.FormDataExtended(form).object;
    return sustainedNeeded(Number(data.hits) || 0, Number(data.resist) || 0);
  };
  const preview = dialog => {
    const out = dialog.element.querySelector(".sinless-damage-preview");
    const needed = read(dialog.element.querySelector("form"));
    out.innerHTML = needed > 0
      ? game.i18n.format("SINLESS.Sustained.preview", { n: needed })
      : `<strong>${game.i18n.localize("SINLESS.Sustained.resisted")}</strong>`;
  };
  const needed = await DialogV2.wait({
    window: { title: game.i18n.format("SINLESS.Sustained.title", { name: actor.name }), icon: "fa-solid fa-wand-sparkles" },
    classes: ["sinless", "sinless-damage-dialog"],
    position: { width: 420 },
    content,
    buttons: [
      { action: "apply", label: "SINLESS.Sustained.apply", icon: "fa-solid fa-wand-sparkles", default: true, callback: (event, button) => read(button.form) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", type: "button" }
    ],
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form");
      form?.addEventListener("input", () => preview(dialog));
      dialog.element.querySelector("[data-sinless-roll]")?.addEventListener("click", async ev => {
        ev.preventDefault();
        const msg = await actor.rollResistance(spell.resistPool, { attack: "magic" });
        if (msg) dialog.element.querySelector("input[name=resist]").value = messageSuccesses(msg);
        preview(dialog);
      });
      preview(dialog);
    },
    rejectClose: false
  });
  if (needed === null || needed === undefined || typeof needed !== "number") return null;
  // A second open dialog may have resolved this target while this one was waiting.
  if (sustainedApplied(message, uuid)) return null;
  const flags = { sustainedApplication: { message: message.uuid, target: uuid } };
  if (needed <= 0) {
    await note(actor, game.i18n.format("SINLESS.Sustained.resistedNote", { name: actor.name, spell: spell.label }), flags);
  } else {
    const caster = fromUuidSync(message.getFlag(SYSTEM_ID, "actorUuid"));
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell.label,
      img: spell.img || "icons/svg/aura.svg",
      origin: caster?.uuid ?? null,
      description: spell.duration ? foundry.utils.escapeHTML(`${game.i18n.localize("SINLESS.Item.FIELDS.duration.label")}: ${spell.duration}`) : "",
      flags: { [SYSTEM_ID]: { sustained: { needed, accumulated: 0, pool: spell.resistPool, force: spell.force, caster: caster?.name ?? "" } } }
    }]);
    await note(actor, game.i18n.format("SINLESS.Sustained.placed", { name: actor.name, spell: spell.label, n: needed }), flags);
  }
  // Only the author or GM may update the original casting card.
  if (message.isOwner) {
    const latest = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
    latest.extra.spell.applied = [...new Set([...(latest.extra.spell.applied ?? []), uuid])];
    await saveCard(message, latest);
  }
}

/**
 * Put a summoned spirit on the scene next to its summoner (p.183): a token of
 * the spirit's NPC actor, with its force, joining the combat if there is one.
 * @param {ChatMessage} message  The summoning card.
 */
export async function placeSpirit(message) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const summon = state?.extra?.summon;
  if (!game.user.isGM || state?.abf || !summon?.spiritActor || summon.placed) return null;
  const result = summonResult(summarize(state).successes, summon.force, summon.bag);
  const outcome = result.outcome;
  if (outcome === "failed") return null;
  const source = await fromUuid(summon.spiritActor);
  if (!(source instanceof Actor) || source.type !== "npc") {
    ui.notifications.warn("SINLESS.Spirit.noActor", { localize: true });
    return null;
  }
  const scene = canvas?.scene;
  if (!scene || !game.user.can("TOKEN_CREATE")) {
    ui.notifications.warn("SINLESS.Spirit.cannotPlace", { localize: true });
    return null;
  }
  const caster = fromUuidSync(message.getFlag(SYSTEM_ID, "actorUuid"));
  const near = caster?.getActiveTokens?.(false, true).find(t => t.parent === scene)
    ?? scene.tokens.get(message.speaker?.token);
  const grid = scene.grid.size;
  const x = near ? near.x + grid * (near.width ?? 1) : (canvas.stage?.pivot?.x ?? 0);
  const y = near ? near.y : (canvas.stage?.pivot?.y ?? 0);
  const name = game.i18n.format("SINLESS.Spirit.tokenName", { name: source.name, force: summon.force });
  const td = await source.getTokenDocument({ x, y, name, actorLink: false });
  const data = td.toObject();
  data.delta = { ...(data.delta ?? {}), system: { ...(data.delta?.system ?? {}), spiritForce: summon.force } };
  // An uncontrolled spirit acts for the Agonarch; a bound one assists its summoner (p.183).
  data.disposition = outcome === "bound" ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE;
  const [token] = await scene.createEmbeddedDocuments("Token", [data]);
  const combat = game.combat;
  if (token && combat?.scene?.id === scene.id && combat.combatants.some(c => c.actorId === caster?.id)) {
    await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: source.id }]);
  }
  summon.placed = true;
  await saveCard(message, state);
  return note(caster ?? source, game.i18n.format(outcome === "bound" ? "SINLESS.Spirit.placedBound" : "SINLESS.Spirit.placedWild", { name, services: result.services }));
}
