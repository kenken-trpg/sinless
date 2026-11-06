import { SYSTEM_ID } from "../config.mjs";
import { resolveTest, rerollCount } from "../helpers/rules.mjs";

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
  if (o.spendPool && plan.usesPool && o.pool && plan.poolDice > 0) {
    updates[`system.pools.${o.pool}.spent`] = actor.system.pools[o.pool].spent + plan.poolDice;
  }
  if (plan.kismetDice > 0 && actor.system.kismet) {
    updates["system.kismet.spent"] = actor.system.kismet.spent + plan.kismetDice;
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
    autoSuccesses: o.autoSuccesses ?? 0
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

/** Recompute success totals for a stored card state. */
export function summarize(state) {
  const all = [...state.final, ...state.kismetAdded];
  const raw = all.filter(d => d >= state.target).length;
  const successes = (state.untrained ? Math.floor(raw / 4) : raw) + (state.autoSuccesses ?? 0);
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
    canAddKismet: !state.abf
  };
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
  const button = html.querySelector?.("[data-sinless-action='kismet']");
  if (!button) return;
  if (!message.isOwner) {
    button.remove();
    return;
  }
  button.addEventListener("click", async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      await addKismetDie(message);
    } finally {
      button.disabled = false;
    }
  });
}
