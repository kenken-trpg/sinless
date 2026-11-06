import { SYSTEM_ID } from "../config.mjs";
import { resolveTest, rerollCount } from "../helpers/rules.mjs";
import { splitDeckingDice, softwareAlert, nanHackResult } from "../helpers/grid.mjs";
import { adjustAlert } from "../settings.mjs";
import { damageDialog, controlledDefenders } from "../apps/damage-dialog.mjs";

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
    autoSuccesses: o.autoSuccesses ?? 0,
    mcpUsed
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
    canAddKismet: !state.abf,
    // A hit needs successes, except explosives which always land somewhere (p.93).
    canDefend: !!state.extra?.weapon && !state.abf && (sum.successes > 0 || !!state.extra.blast)
  };
  // Decking: alert raised and NAN influence gained, recomputed when Kismet dice are added.
  const x = state.extra ?? {};
  if (x.nan && !state.abf) {
    const r = nanHackResult(x.nan, sum.successes, x.io);
    context.grid = { gain: r.gain, alert: r.alert, nan: true };
  } else if (x.software && !state.abf) {
    context.grid = { alert: softwareAlert(x, sum.successes, x.shadow), nan: false };
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
    guard(button, () => damageDialog(message, actor));
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

  const selected = html.querySelector("[data-sinless-action='defend-selected']");
  if (selected) {
    guard(selected, async () => {
      const defenders = controlledDefenders();
      if (!defenders.length) {
        ui.notifications.warn("SINLESS.Notify.noDefender", { localize: true });
        return;
      }
      for (const actor of defenders) await damageDialog(message, actor);
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
    const value = x.nan ? nanHackResult(x.nan, sum.successes, x.io).alert : softwareAlert(x, sum.successes, x.shadow);
    x.alertNow = await adjustAlert(value);
    x.alertApplied = true;
  } else return;
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.test`]: state });
}
