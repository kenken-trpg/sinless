import { SYSTEM_ID, SINLESS } from "../config.mjs";
import { resolveTest, rerollCount } from "../helpers/rules.mjs";
import { splitDeckingDice, softwareAlert, nanHackResult, shrinkInfluence } from "../helpers/grid.mjs";
import { overdriveGain, ramResult } from "../helpers/rigging.mjs";
import { summonResult, wardedSuccesses, shatterWardResult } from "../helpers/magic.mjs";
import { permanentInjury } from "../helpers/condition.mjs";
import { shadowAlert } from "../helpers/operation.mjs";
import { applyChaseAction } from "../apps/chase.mjs";
import { adjustAlert } from "../settings.mjs";
import { damageDialog, controlledDefenders } from "../apps/damage-dialog.mjs";
import { digitalDialog } from "../apps/digital-dialog.mjs";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/test-card.hbs`;

/** Roll `count` d6 with the Foundry dice engine and return the results. */
async function rollD6(count) {
  if (count <= 0) return { roll: null, results: [] };
  const roll = await new Roll(`${count}d6`).evaluate();
  return { roll, results: roll.dice[0].results.map(r => r.result) };
}

/**
 * Execute a planned test and post it to chat.
 *
 * @param {object} o
 * @param {Actor} o.actor
 * @param {string} o.label           Localized title of the test.
 * @param {string|null} o.pool       Pool the dice are drawn from.
 * @param {object} o.plan            Result of planTest().
 * @param {number} o.target          Target number.
 * @param {number} o.reroll          0, 1 or 2.
 * @param {boolean} o.spendPool      Deduct the drawn dice from the pool.
 * @param {number|null} [o.threshold] Required successes (>=).
 * @param {string[]} [o.notes]       Extra lines shown on the card (already localized).
 * @param {object} [o.extra]         Extra card data (weapon damage etc.).
 * @param {number} [o.autoSuccesses] Successes added without rolling (brand Competence).
 */
export async function performTest(o) {
  const { actor, plan } = o;
  const main = await rollD6(plan.total);
  const rerolls = await rollD6(rerollCount(main.results, o.reroll));
  const result = resolveTest({
    dice: main.results, target: o.target, reroll: o.reroll,
    rerollResults: rerolls.results, untrained: plan.untrained
  });

  const updates = {};
  let mcpUsed = 0;
  if (o.spendPool && plan.usesPool && o.pool && plan.poolDice > 0) {
    // MCP dice are spent before Focus dice on decking tests (p.130).
    const split = splitDeckingDice(plan.poolDice, o.mcpAvailable ?? 0);
    mcpUsed = split.mcp;
    if (split.focus) updates[`system.pools.${o.pool}.spent`] = actor.system.pools[o.pool].spent + split.focus;
    if (split.mcp) updates["system.grid.mcpSpent"] = actor.system.grid.mcpSpent + split.mcp;
  }
  // VCR bonus dice used on a hot-seated vehicle test (p.142).
  const vcrUsed = Math.max(0, o.vcrUsed ?? 0);
  if (vcrUsed && actor.system.rig) updates["system.rig.vcrSpent"] = actor.system.rig.vcrSpent + vcrUsed;
  // Resilience dice are never exhausted: only the dice taken from the Kismet pool are spent.
  const kismetSpent = Math.max(0, plan.kismetDice - (o.kismetFree ?? 0));
  if (kismetSpent > 0 && actor.system.kismet) {
    updates["system.kismet.spent"] = actor.system.kismet.spent + kismetSpent;
  }
  if (!foundry.utils.isEmpty(updates)) await actor.update(updates);

  const state = {
    label: o.label,
    pool: o.pool,
    target: o.target,
    untrained: plan.untrained,
    plan,
    reroll: o.reroll,
    threshold: o.threshold ?? null,
    notes: o.notes ?? [],
    extra: o.extra ?? {},
    initial: result.initial,
    final: result.final,
    rerolledIndices: result.rerolledIndices,
    rerollCancelled: result.rerollCancelled,
    abf: result.abf,
    kismetAdded: [],
    autoSuccesses: o.autoSuccesses ?? 0,
    mcpUsed,
    vcrUsed
  };

  const rolls = [main.roll, rerolls.roll].filter(Boolean);
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: await renderCard(state),
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined,
    flags: { [SYSTEM_ID]: { test: state, actorUuid: actor.uuid } }
  });
}

/** Alert raised by a decking card: NAN hack or software, plus sensor daemons (pp.134, 205). */
function gridAlert(x, successes) {
  if (x.nan) return nanHackResult(x.nan, successes, x.io).alert + Math.max(0, x.sensor ?? 0);
  return softwareAlert(x, successes, x.shadow, x.sensor);
}

/** Defend with the dialog that fits the attack: digital or physical. */
function defendDialog(message, actor) {
  const x = message.getFlag(SYSTEM_ID, "test")?.extra;
  return x?.digital ? digitalDialog(message, actor) : damageDialog(message, actor);
}

/** Recompute success totals for a stored card state. */
export function summarize(state) {
  const all = [...state.final, ...state.kismetAdded];
  const raw = all.filter(d => d >= state.target).length;
  // A ward between the caster and the target removes successes (p.168).
  const successes = wardedSuccesses((state.untrained ? Math.floor(raw / 4) : raw) + (state.autoSuccesses ?? 0), state.extra?.ward?.crossed ?? 0);
  let outcome = null;
  if (state.abf) outcome = "abf";
  else if (state.threshold !== null && state.threshold !== undefined) {
    outcome = successes >= state.threshold ? "success" : "failure";
  }
  return { raw, successes, outcome };
}

export async function renderCard(state) {
  const sum = summarize(state);
  const dieView = (value, extra = {}) => ({
    value, success: value >= state.target, one: value === 1, ...extra
  });
  const context = {
    ...state,
    sum,
    initialDice: state.initial.map((v, i) => dieView(v, { rerolled: state.rerolledIndices.includes(i) })),
    finalDice: state.rerolledIndices.length ? state.final.map(v => dieView(v)) : null,
    kismetDice: state.kismetAdded.map(v => dieView(v, { kismet: true })),
    canAddKismet: !state.abf,
    // A hit needs successes, except explosives which always land somewhere (p.93).
    // Recoil capacity reached: the shot cannot hit (p.92).
    canDefend: !!state.extra?.weapon && !state.abf && !state.extra.recoil?.jammed
      && (sum.successes > 0 || !!state.extra.blast)
  };
  // Rigging and decking results, recomputed when Kismet dice are added.
  const x = state.extra ?? {};
  // Full condition tracks (p.97): overload test failure and permanent injury.
  if (x.overload && !state.abf) context.overloadFailed = sum.outcome === "failure";
  if (x.overload && state.abf) context.overloadFailed = true;
  if (x.injury) {
    const result = state.abf ? "organ" : permanentInjury(sum.successes, x.injury.overflow);
    context.injury = {
      result,
      attributeLabel: x.injury.attribute ? SINLESS.ATTRIBUTES[x.injury.attribute] ?? x.injury.attribute : null
    };
  }
  // Car chase action (pp.231-232): success against the needed successes.
  if (x.chase) {
    const success = !state.abf && sum.successes >= x.chase.needed;
    context.chase = { success, applicable: (success || x.chase.action === "trap") && !x.chase.applied };
  }
  // Shadow test: alert raised while sneaking (p.236); an ABF counts as no success.
  if (x.shadow) context.shadowAlert = shadowAlert(state.abf ? 0 : sum.successes);
  // Magic: spirit summoning outcome (p.183); a linked spirit actor can be placed once.
  if (x.summon && !state.abf) {
    context.summon = summonResult(sum.successes, x.summon.force, x.summon.bag);
    context.summon.canPlace = !!x.summon.spiritActor && context.summon.outcome !== "failed" && !x.summon.placed;
  }
  // Wards (pp.168-170): successes lost crossing one, or a Shatter Ward against one.
  if (x.ward?.crossed) context.wardCrossed = x.ward.crossed;
  if (x.ward?.target && !state.abf) context.shatter = { ...shatterWardResult({ force: x.ward.force, successes: sum.successes, ward: x.ward.target }), from: x.ward.target };
  // Continuous spells (p.167): place the effect on each target once.
  if (x.spell?.continuous && !state.abf && sum.successes > 0 && x.spell.targets?.length) {
    context.sustained = x.spell.targets.map(t => ({ ...t, applied: (x.spell.applied ?? []).includes(t.uuid) }));
  }
  // Rigging: overdrive movement and ramming damage to the ramming vehicle.
  if (x.overdrive && !state.abf) context.overdrive = { gain: overdriveGain(sum.successes), inertia: x.overdrive.inertia };
  if (x.ram && !state.abf) {
    const r = ramResult({ successes: sum.successes, body: 0, inertia: x.ram.inertia, targetBody: x.ram.targetBody, battleRam: x.ram.battleRam });
    context.ram = { selfDamage: r.selfDamage, applied: !!x.ram.applied };
  }
  // Decking: alert raised and NAN influence gained.
  if (x.nan && !state.abf) {
    const r = nanHackResult(x.nan, sum.successes, x.io);
    context.grid = { gain: r.gain, alert: gridAlert(x, sum.successes), nan: true };
  } else if (x.software && !state.abf) {
    context.grid = { alert: gridAlert(x, sum.successes), nan: false };
  }
  // RNID: each success shrinks the targeted deckers' influence (p.205).
  if (x.shrink && !state.abf) {
    context.shrink = {
      loss: sum.successes * (x.shrink.meters ?? 2),
      targets: (x.shrink.targets ?? []).map(t => ({ ...t, applied: (x.shrink.applied ?? []).includes(t.uuid) }))
    };
  }
  return foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, context);
}

/** Roll one post-test Kismet die (p.39) and update the chat card. */
export async function addKismetDie(message) {
  const flags = message.getFlag(SYSTEM_ID, "test");
  if (!flags) return;
  const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
  if (actor?.system.kismet) {
    if (actor.system.kismet.pool.value <= 0) {
      ui.notifications.warn("SINLESS.Notify.noKismet", { localize: true });
      return;
    }
    await actor.update({ "system.kismet.spent": actor.system.kismet.spent + 1 });
  }
  const { roll, results } = await rollD6(1);
  const state = foundry.utils.deepClone(flags);
  state.kismetAdded.push(...results);
  await message.update({
    content: await renderCard(state),
    rolls: [...message.rolls.map(r => r.toJSON()), roll.toJSON()],
    [`flags.${SYSTEM_ID}.test`]: state
  });
  if (game.dice3d) game.dice3d.showForRoll(roll, game.user, true);
}

/** Chat card listeners (Foundry v13+ passes an HTMLElement). */
export function onRenderChatMessage(message, html) {
  if (!html.querySelector) return;
  const guard = (button, fn) => button.addEventListener("click", async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      await fn();
    } finally {
      button.disabled = false;
    }
  });

  const kismet = html.querySelector("[data-sinless-action='kismet']");
  if (kismet) {
    if (message.isOwner) guard(kismet, () => addKismetDie(message));
    else kismet.remove();
  }

  // Defend buttons: only for users who control the target (or the GM).
  for (const button of html.querySelectorAll("[data-sinless-action='defend']")) {
    const actor = fromUuidSync(button.dataset.targetUuid)?.actor;
    if (!actor || !(game.user.isGM || actor.isOwner)) {
      button.remove();
      continue;
    }
    guard(button, () => defendDialog(message, actor));
  }
  // Continuous spells: the target's owner (or GM) resists and takes the effect.
  for (const button of html.querySelectorAll("[data-sinless-action='apply-sustained']")) {
    const actor = fromUuidSync(button.dataset.targetUuid)?.actor ?? fromUuidSync(button.dataset.targetUuid);
    if (!actor || !(game.user.isGM || actor.isOwner)) {
      button.remove();
      continue;
    }
    guard(button, async () => (await import("../apps/spell-effects.mjs")).applySustained(message, button.dataset.targetUuid));
  }
  for (const button of html.querySelectorAll("[data-sinless-action='resist-sustained']")) {
    const effect = fromUuidSync(button.dataset.effectUuid);
    const actor = effect?.parent;
    if (!effect || !actor?.isOwner) {
      button.remove();
      continue;
    }
    guard(button, () => actor.resistSustainedSpell(effect));
  }
  const place = html.querySelector("[data-sinless-action='place-spirit']");
  if (place) {
    if (game.user.isGM) guard(place, async () => (await import("../apps/spell-effects.mjs")).placeSpirit(message));
    else place.remove();
  }
  // RNID: the GM or the roller shrinks a targeted decker's influence once.
  for (const button of html.querySelectorAll("[data-sinless-action='apply-shrink']")) {
    if (!(game.user.isGM || message.isOwner)) {
      button.remove();
      continue;
    }
    guard(button, () => applyShrink(message, button.dataset.targetUuid));
  }
  // Drain: the caster resists and applies it once, even if the spell failed (p.167).
  const drain = html.querySelector("[data-sinless-action='resist-drain']");
  if (drain) {
    if (message.isOwner) guard(drain, () => resistDrain(message));
    else drain.remove();
  }

  // Ramming: the rigger applies the damage to their own vehicle once.
  const ramSelf = html.querySelector("[data-sinless-action='apply-ram-self']");
  if (ramSelf) {
    if (message.isOwner) guard(ramSelf, () => applyRamSelf(message));
    else ramSelf.remove();
  }

  // Decking results: influence is applied by the roller, alert by the GM.
  const influence = html.querySelector("[data-sinless-action='apply-influence']");
  if (influence) {
    if (message.isOwner) guard(influence, () => applyGridResult(message, "influence"));
    else influence.remove();
  }
  const alert = html.querySelector("[data-sinless-action='apply-alert']");
  if (alert) {
    if (game.user.isGM) guard(alert, () => applyGridResult(message, "alert"));
    else alert.remove();
  }

  // Full tracks (p.97): the actor's owner rolls overload tests and applies the results.
  for (const button of html.querySelectorAll("[data-sinless-action='overload']")) {
    const actor = fromUuidSync(message.getFlag(SYSTEM_ID, "actorUuid"));
    if (!actor?.isOwner) {
      button.remove();
      continue;
    }
    guard(button, () => actor.rollOverload(button.dataset.track));
  }
  const chase = html.querySelector("[data-sinless-action='apply-chase']");
  if (chase) {
    if (game.user.isGM) guard(chase, () => applyChaseResult(message));
    else chase.remove();
  }
  const shadow = html.querySelector("[data-sinless-action='apply-shadow-alert']");
  if (shadow) {
    if (game.user.isGM) guard(shadow, () => applyShadowAlert(message));
    else shadow.remove();
  }
  for (const action of ["apply-overload", "apply-organ"]) {
    const button = html.querySelector(`[data-sinless-action='${action}']`);
    if (!button) continue;
    if (message.isOwner || game.user.isGM) guard(button, () => applyConditionResult(message, action));
    else button.remove();
  }

  const selected = html.querySelector("[data-sinless-action='defend-selected']");
  if (selected) {
    guard(selected, async () => {
      const defenders = controlledDefenders();
      if (!defenders.length) {
        ui.notifications.warn("SINLESS.Notify.noDefender", { localize: true });
        return;
      }
      for (const actor of defenders) await defendDialog(message, actor);
    });
  }
}

/** Apply the influence gain or alert increase shown on a decking card once. */
async function applyGridResult(message, what) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  if (!state?.extra) return;
  const sum = summarize(state);
  const x = state.extra;
  if (what === "influence" && x.nan && !x.influenceApplied) {
    const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
    const { gain } = nanHackResult(x.nan, sum.successes, x.io);
    await actor?.addInfluence(gain);
    x.influenceApplied = true;
  } else if (what === "alert" && !x.alertApplied) {
    const value = gridAlert(x, sum.successes);
    x.alertNow = await adjustAlert(value);
    x.alertApplied = true;
  } else return;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/** Shrink the influence of a targeted decker (RNID, p.205) and mark the target done. */
async function applyShrink(message, uuid) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const x = state?.extra;
  if (!x?.shrink || (x.shrink.applied ?? []).includes(uuid)) return;
  const actor = fromUuidSync(uuid)?.actor ?? fromUuidSync(uuid);
  if (!actor?.system.grid) return;
  if (!actor.isOwner) {
    ui.notifications.warn("SINLESS.Digital.noPermission", { localize: true });
    return;
  }
  const r = shrinkInfluence(actor.system.grid.influence, summarize(state).successes, x.shrink.meters);
  await actor.update({ "system.grid.influence": r.influence });
  x.shrink.applied = [...(x.shrink.applied ?? []), uuid];
  x.shrink.results = { ...(x.shrink.results ?? {}), [uuid.replaceAll(".", "_")]: r.influence };
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
  const text = game.i18n.format(r.influence > 0 ? "SINLESS.Digital.shrunk" : "SINLESS.Digital.shrunkOut", { name: actor.name, loss: r.loss, n: r.influence });
  return ChatMessage.create({ speaker: message.speaker, content: `<p class="sinless-note">${foundry.utils.escapeHTML(text)}</p>` });
}

/** Apply a chase action from a test card to the chase board once. */
async function applyChaseResult(message) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const x = state?.extra;
  if (!x?.chase || x.chase.applied) return;
  const sum = summarize(state);
  const success = !state.abf && sum.successes >= x.chase.needed;
  const applied = await applyChaseAction(x.chase.action, { success, targetUuid: x.chase.targetUuid });
  if (!applied) return;
  x.chase.applied = true;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/** Raise the alert level by a shadow test's result once (p.236). */
async function applyShadowAlert(message) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const x = state?.extra;
  if (!x?.shadow || x.shadowApplied) return;
  const sum = summarize(state);
  x.alertNow = await adjustAlert(shadowAlert(state.abf ? 0 : sum.successes));
  x.shadowApplied = true;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/** Apply a failed overload test or organ damage once (p.97). */
async function applyConditionResult(message, action) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const x = state?.extra;
  const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
  if (!x || !actor) return;
  if (action === "apply-overload" && x.overload && !x.overload.applied) {
    await actor.applyOverloadFailure(x.overload.track, x.overload.rounds);
    x.overload.applied = true;
  } else if (action === "apply-organ" && x.injury?.attribute && !x.injury.applied) {
    await actor.applyOrganDamage(x.injury.attribute);
    x.injury.applied = true;
  } else return;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/** Apply ramming damage to the ramming vehicle (p.144). */
async function applyRamSelf(message) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const x = state?.extra;
  if (!x?.ram || x.ram.applied) return;
  const vehicle = await fromUuid(x.vehicleUuid);
  const sum = summarize(state);
  const { selfDamage } = ramResult({ successes: sum.successes, body: 0, inertia: x.ram.inertia, targetBody: x.ram.targetBody, battleRam: x.ram.battleRam });
  if (vehicle && selfDamage) {
    await vehicle.applyDamage({
      hit: true, raw: selfDamage, armorReduction: 0, afterArmor: selfDamage, final: selfDamage,
      track: "physical", stripped: [], source: game.i18n.localize("SINLESS.Rig.action.ram")
    });
  }
  x.ram.applied = true;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/** Open the drain dialog for a spell card and mark the drain as taken. */
async function resistDrain(message) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  const spell = state?.extra?.spell;
  if (!spell || spell.applied) return;
  const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
  if (!actor) return;
  const { drainDialog } = await import("../apps/drain-dialog.mjs");
  const result = await drainDialog(actor, spell);
  if (!result) return;
  spell.applied = true;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}
