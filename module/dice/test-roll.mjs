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

/** Ramming damage to the ramming vehicle (p.144). */
function ramSelfDamage(ram, successes) {
  return ramResult({ successes, body: 0, inertia: ram.inertia, targetBody: ram.targetBody, battleRam: ram.battleRam }).selfDamage;
}

/** A chase action succeeds with the needed successes (pp.231-232). */
function chaseSucceeded(state, sum) {
  return !state.abf && sum.successes >= state.extra.chase.needed;
}

/** Alert raised by a shadow test (p.236); an ABF counts as no success. */
function shadowTestAlert(state, sum) {
  return shadowAlert(state.abf ? 0 : sum.successes);
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
    const success = chaseSucceeded(state, sum);
    context.chase = { success, applicable: (success || x.chase.action === "trap") && !x.chase.applied };
  }
  // Shadow test: alert raised while sneaking (p.236).
  if (x.shadow) context.shadowAlert = shadowTestAlert(state, sum);
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
  if (x.ram && !state.abf) context.ram = { selfDamage: ramSelfDamage(x.ram, sum.successes), applied: !!x.ram.applied };
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

/** Store a changed card state and re-render the card. */
export async function saveCard(message, state) {
  return message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}

/**
 * Apply a card result once: `change(state, extra)` gets a copy of the card state and returns
 * true when it applied something; the card is then saved. Returns whether it was saved.
 */
async function changeCard(message, change) {
  const state = foundry.utils.deepClone(message.getFlag(SYSTEM_ID, "test"));
  if (!state?.extra || !(await change(state, state.extra))) return false;
  await saveCard(message, state);
  return true;
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
  const gm = game.user.isGM;
  const owner = message.isOwner;
  const spellEffects = () => import("../apps/spell-effects.mjs");
  // Each button of an action gets the handler `handlerFor(button)` returns, or is removed when
  // it returns nothing (the user may not use it). A button is disabled while its handler runs.
  const bind = (action, handlerFor) => {
    for (const button of html.querySelectorAll(`[data-sinless-action='${action}']`)) {
      const handler = handlerFor(button);
      if (!handler) {
        button.remove();
        continue;
      }
      button.addEventListener("click", async event => {
        event.preventDefault();
        button.disabled = true;
        try {
          await handler();
        } finally {
          button.disabled = false;
        }
      });
    }
  };
  const when = (allowed, handler) => (allowed ? handler : null);

  bind("kismet", () => when(owner, () => addKismetDie(message)));
  // Defend buttons: only for users who control the target (or the GM).
  bind("defend", button => {
    const actor = fromUuidSync(button.dataset.targetUuid)?.actor;
    return when(actor && (gm || actor.isOwner), () => defendDialog(message, actor));
  });
  bind("defend-selected", () => async () => {
    const defenders = controlledDefenders();
    if (!defenders.length) return ui.notifications.warn("SINLESS.Notify.noDefender", { localize: true });
    for (const actor of defenders) await defendDialog(message, actor);
  });
  // Continuous spells: the target's owner (or GM) resists and takes the effect.
  bind("apply-sustained", button => {
    const uuid = button.dataset.targetUuid;
    const actor = fromUuidSync(uuid)?.actor ?? fromUuidSync(uuid);
    return when(actor && (gm || actor.isOwner), async () => (await spellEffects()).applySustained(message, uuid));
  });
  bind("resist-sustained", button => {
    const effect = fromUuidSync(button.dataset.effectUuid);
    return when(effect?.parent?.isOwner, () => effect.parent.resistSustainedSpell(effect));
  });
  bind("place-spirit", () => when(gm, async () => (await spellEffects()).placeSpirit(message)));
  // RNID: the GM or the roller shrinks a targeted decker's influence once.
  bind("apply-shrink", button => when(gm || owner, () => applyShrink(message, button.dataset.targetUuid)));
  // Drain: the caster resists and applies it once, even if the spell failed (p.167).
  bind("resist-drain", () => when(owner, () => resistDrain(message)));
  // Ramming: the rigger applies the damage to their own vehicle once (the GM if the rigger does not own it).
  bind("apply-ram-self", () => {
    const uuid = message.getFlag(SYSTEM_ID, "test")?.extra?.vehicleUuid;
    const vehicle = uuid ? fromUuidSync(uuid) : null;
    return when(gm || (owner && vehicle?.isOwner), () => applyRamSelf(message));
  });
  // Decking results: influence is applied by the roller, alert by the GM.
  bind("apply-influence", () => when(owner, () => applyGridResult(message, "influence")));
  bind("apply-alert", () => when(gm, () => applyGridResult(message, "alert")));
  // Full tracks (p.97): the actor's owner rolls overload tests and applies the results.
  bind("overload", button => {
    const actor = fromUuidSync(message.getFlag(SYSTEM_ID, "actorUuid"));
    return when(actor?.isOwner, () => actor.rollOverload(button.dataset.track));
  });
  for (const action of ["apply-overload", "apply-organ"]) {
    bind(action, () => when(owner || gm, () => applyConditionResult(message, action)));
  }
  bind("apply-chase", () => when(gm, () => applyChaseResult(message)));
  bind("apply-shadow-alert", () => when(gm, () => applyShadowAlert(message)));
}

/** Apply the influence gain or alert increase shown on a decking card once. */
function applyGridResult(message, what) {
  return changeCard(message, async (state, x) => {
    const sum = summarize(state);
    if (what === "influence" && x.nan && !x.influenceApplied) {
      const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
      await actor?.addInfluence(nanHackResult(x.nan, sum.successes, x.io).gain);
      x.influenceApplied = true;
    } else if (what === "alert" && !x.alertApplied) {
      x.alertNow = await adjustAlert(gridAlert(x, sum.successes));
      x.alertApplied = true;
    } else return false;
    return true;
  });
}

/** Shrink the influence of a targeted decker (RNID, p.205) and mark the target done. */
async function applyShrink(message, uuid) {
  const actor = fromUuidSync(uuid)?.actor ?? fromUuidSync(uuid);
  let r;
  await changeCard(message, async (state, x) => {
    if (!x.shrink || (x.shrink.applied ?? []).includes(uuid) || !actor?.system.grid) return false;
    if (!actor.isOwner) {
      ui.notifications.warn("SINLESS.Digital.noPermission", { localize: true });
      return false;
    }
    r = shrinkInfluence(actor.system.grid.influence, summarize(state).successes, x.shrink.meters);
    await actor.update({ "system.grid.influence": r.influence });
    x.shrink.applied = [...(x.shrink.applied ?? []), uuid];
    x.shrink.results = { ...(x.shrink.results ?? {}), [uuid.replaceAll(".", "_")]: r.influence };
    return true;
  });
  if (!r) return;
  const text = game.i18n.format(r.influence > 0 ? "SINLESS.Digital.shrunk" : "SINLESS.Digital.shrunkOut", { name: actor.name, loss: r.loss, n: r.influence });
  return ChatMessage.create({ speaker: message.speaker, content: `<p class="sinless-note">${foundry.utils.escapeHTML(text)}</p>` });
}

/** Apply a chase action from a test card to the chase board once. */
function applyChaseResult(message) {
  return changeCard(message, async (state, x) => {
    if (!x.chase || x.chase.applied) return false;
    const success = chaseSucceeded(state, summarize(state));
    if (!(await applyChaseAction(x.chase.action, { success, targetUuid: x.chase.targetUuid }))) return false;
    x.chase.applied = true;
    return true;
  });
}

/** Raise the alert level by a shadow test's result once (p.236). */
function applyShadowAlert(message) {
  return changeCard(message, async (state, x) => {
    if (!x.shadow || x.shadowApplied) return false;
    x.alertNow = await adjustAlert(shadowTestAlert(state, summarize(state)));
    x.shadowApplied = true;
    return true;
  });
}

/** Apply a failed overload test or organ damage once (p.97). */
function applyConditionResult(message, action) {
  return changeCard(message, async (state, x) => {
    const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
    if (!actor) return false;
    if (action === "apply-overload" && x.overload && !x.overload.applied) {
      await actor.applyOverloadFailure(x.overload.track, x.overload.rounds);
      x.overload.applied = true;
    } else if (action === "apply-organ" && x.injury?.attribute && !x.injury.applied) {
      await actor.applyOrganDamage(x.injury.attribute);
      x.injury.applied = true;
    } else return false;
    return true;
  });
}

/** Apply ramming damage to the ramming vehicle (p.144). */
function applyRamSelf(message) {
  return changeCard(message, async (state, x) => {
    if (!x.ram || x.ram.applied) return false;
    const vehicle = await fromUuid(x.vehicleUuid);
    const selfDamage = ramSelfDamage(x.ram, summarize(state).successes);
    if (vehicle && selfDamage) {
      await vehicle.applyDamage({
        hit: true, raw: selfDamage, armorReduction: 0, afterArmor: selfDamage, final: selfDamage,
        track: "physical", stripped: [], source: game.i18n.localize("SINLESS.Rig.action.ram")
      });
    }
    x.ram.applied = true;
    return true;
  });
}

/** Open the drain dialog for a spell card and mark the drain as taken. */
function resistDrain(message) {
  return changeCard(message, async (state, x) => {
    if (!x.spell || x.spell.applied) return false;
    const actor = await fromUuid(message.getFlag(SYSTEM_ID, "actorUuid"));
    if (!actor) return false;
    const { drainDialog } = await import("../apps/drain-dialog.mjs");
    if (!(await drainDialog(actor, x.spell))) return false;
    x.spell.applied = true;
    return true;
  });
}
