// Kismet advancement: awards, advances and boons (p.238).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, skillLabel } from "../../config.mjs";
import {
  awardTotal, skillRaiseCost, attributeRaiseCost, zoeticRaiseCost, boonStatus, boonChoices, BOONS, WINDFALLS
} from "../../helpers/advancement.mjs";

export const AdvancementActor = Base => class SinlessAdvancementActor extends Base {
  /** Post a short advancement note to chat. */
  async _kismetMessage(text) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sinless-card sinless-kismet-card"><header class="card-header"><h3>${game.i18n.localize("SINLESS.Advance.title")}</h3></header><p>${text}</p></div>`
    });
  }

  /** Append a history entry and apply the updates. */
  async _recordAdvance(entry, updates) {
    const history = [...(this.system.kismet.history ?? []), { ...entry, time: Date.now() }];
    return this.update({ ...updates, "system.kismet.history": history });
  }

  /** Award end-of-session Kismet (p.238): adds to both earned and unspent Kismet. */
  async awardKismet(selected = [], extra = 0) {
    const amount = awardTotal(selected, extra);
    if (!this.system.kismet || amount <= 0) return null;
    const k = this.system.kismet;
    const before = boonStatus(k.earned, k.boons).total;
    await this._recordAdvance({ kind: "award", amount, awards: selected }, {
      "system.kismet.earned": k.earned + amount,
      "system.kismet.unspent": k.unspent + amount
    });
    const after = boonStatus(this.system.kismet.earned, this.system.kismet.boons);
    let text = game.i18n.format("SINLESS.Advance.awarded", { name: foundry.utils.escapeHTML(this.name), n: amount });
    if (after.total > before) text += `<br><strong>${game.i18n.format("SINLESS.Advance.boonEarned", { n: after.available })}</strong>`;
    return this._kismetMessage(text);
  }

  /** Purchasable advances with their costs (skills, attributes, Zoetic Potential). */
  get advanceOptions() {
    const src = this._source.system;
    const unspent = this.system.kismet?.unspent ?? 0;
    const options = [];
    const add = (kind, key, label, from, cost) => {
      if (cost === null) return;
      options.push({ kind, key, label, from, to: from + 1, cost, affordable: cost <= unspent });
    };
    for (const key of Object.keys(SINLESS.ATTRIBUTES)) {
      const a = src.attributes[key];
      add("attribute", key, game.i18n.localize(SINLESS.ATTRIBUTES[key]), a.value, attributeRaiseCost(a.value, a.max));
    }
    for (const key of Object.keys(SINLESS.SKILLS)) {
      const rank = src.skills[key]?.rank ?? 0;
      add("skill", key, game.i18n.localize(skillLabel(key)), rank, skillRaiseCost(rank));
    }
    const zp = this.system.zoetic?.value ?? 0;
    add("zoetic", "zoetic", game.i18n.localize("SINLESS.Zoetic"), zp, zoeticRaiseCost(zp));
    return options;
  }

  /** Spend unspent Kismet on one advance (p.238). */
  async buyAdvance(kind, key) {
    const option = this.advanceOptions.find(o => o.kind === kind && o.key === key);
    if (!option) return null;
    if (!option.affordable) {
      ui.notifications.warn("SINLESS.Advance.notEnough", { localize: true });
      return null;
    }
    const updates = { "system.kismet.unspent": this.system.kismet.unspent - option.cost };
    if (kind === "attribute") updates[`system.attributes.${key}.value`] = option.to;
    else if (kind === "skill") updates[`system.skills.${key}.rank`] = option.to;
    else updates["system.zoetic.bonus"] = this._source.system.zoetic.bonus + 1;
    await this._recordAdvance({ kind, key, label: option.label, from: option.from, to: option.to, cost: option.cost }, updates);
    return this._kismetMessage(game.i18n.format("SINLESS.Advance.bought", {
      name: foundry.utils.escapeHTML(this.name), label: option.label, from: option.from, to: option.to, cost: option.cost
    }));
  }

  /**
   * Take the next boon (p.238).
   * @param {string} boon            BOONS key.
   * @param {object} [opts]
   * @param {string} [opts.skill]    Skill raised by mastery (6→7) or guru (7→8).
   * @param {string} [opts.pool]     Pool gaining a resilience die.
   * @param {string} [opts.note]     Free text (asset, magic item).
   */
  async takeBoon(boon, { skill, pool, note = "" } = {}) {
    const k = this.system.kismet;
    const status = boonStatus(k.earned, k.boons);
    if (!status.available || !boonChoices(status.next).includes(boon)) {
      ui.notifications.warn("SINLESS.Advance.noBoon", { localize: true });
      return null;
    }
    const entry = { kind: "boon", boon, index: status.next, note };
    const updates = { "system.kismet.boons": k.boons + 1 };
    const def = BOONS[boon];
    if (def.skillFrom) {
      const rank = this._source.system.skills[skill]?.rank;
      if (rank !== def.skillFrom) {
        ui.notifications.warn(game.i18n.format("SINLESS.Advance.skillMustBe", { n: def.skillFrom }));
        return null;
      }
      Object.assign(entry, { key: skill, label: game.i18n.localize(skillLabel(skill)), from: rank, to: rank + 1 });
      updates[`system.skills.${skill}.rank`] = rank + 1;
    } else if (boon === "resilience") {
      if (!SINLESS.POOLS[pool]) return null;
      Object.assign(entry, { key: pool, label: game.i18n.localize(SINLESS.POOLS[pool]) });
      updates[`system.kismet.resilience.${pool}`] = (k.resilience[pool] ?? 0) + 1;
    } else if (boon === "windfall") {
      const roll = await new Roll("1d6").evaluate();
      entry.roll = roll.total;
      entry.windfall = WINDFALLS[roll.total - 1];
    }
    await this._recordAdvance(entry, updates);
    return this._kismetMessage(this._boonText(entry));
  }

  /** Chat text for a boon entry. */
  _boonText(entry) {
    const name = foundry.utils.escapeHTML(this.name);
    let text = game.i18n.format("SINLESS.Advance.boonTaken", { name, boon: game.i18n.localize(`SINLESS.Boon.${entry.boon}.label`) });
    if (entry.from !== undefined) text += ` — ${foundry.utils.escapeHTML(entry.label)} ${entry.from} → ${entry.to}`;
    else if (entry.boon === "resilience") text += ` — ${foundry.utils.escapeHTML(entry.label)}`;
    if (entry.windfall) text += `<br>1d6 = ${entry.roll}: ${game.i18n.localize(`SINLESS.Windfall.${entry.windfall}`)}`;
    if (entry.note) text += `<br>${foundry.utils.escapeHTML(entry.note)}`;
    return text;
  }

  /** Undo the most recent award, purchase or boon, refunding its Kismet. */
  async undoAdvance() {
    const history = [...(this.system.kismet?.history ?? [])];
    const entry = history.pop();
    if (!entry) return null;
    const k = this.system.kismet;
    const updates = { "system.kismet.history": history };
    switch (entry.kind) {
      case "award":
        updates["system.kismet.earned"] = Math.max(0, k.earned - entry.amount);
        updates["system.kismet.unspent"] = Math.max(0, k.unspent - entry.amount);
        break;
      case "attribute":
        updates[`system.attributes.${entry.key}.value`] = entry.from;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "skill":
        updates[`system.skills.${entry.key}.rank`] = entry.from;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "zoetic":
        updates["system.zoetic.bonus"] = this._source.system.zoetic.bonus - 1;
        updates["system.kismet.unspent"] = k.unspent + entry.cost;
        break;
      case "boon":
        updates["system.kismet.boons"] = Math.max(0, k.boons - 1);
        if (entry.from !== undefined) updates[`system.skills.${entry.key}.rank`] = entry.from;
        if (entry.boon === "resilience") updates[`system.kismet.resilience.${entry.key}`] = Math.max(0, (k.resilience[entry.key] ?? 0) - 1);
        break;
    }
    await this.update(updates);
    return this._kismetMessage(game.i18n.format("SINLESS.Advance.undone", { name: foundry.utils.escapeHTML(this.name) }));
  }
};
