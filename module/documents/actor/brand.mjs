// Brand tests and sector turns (pp.221-223), and lifestyle payments (p.46).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, SYSTEM_ID, AGONARCH_TN } from "../../config.mjs";
import { autoSuccesses, sectorHeatPenalty } from "../../helpers/brand.mjs";
import { payLifestyle, buyLifestyle } from "../../helpers/lifestyle.mjs";
import { testDialog } from "../../apps/test-dialog.mjs";
import { performTest } from "../../dice/test-roll.mjs";

export const BrandActor = Base => class SinlessBrandActor extends Base {
  /** Dialog defaults for a brand test: roll dice equal to the statistic, no pools. */
  _brandDefaults(label, stat) {
    const sys = this.system;
    return {
      label,
      simple: true,
      pool: null,
      mode: "rank",
      rank: sys.stats[stat],
      rankLabel: game.i18n.localize(SINLESS.BRAND_STATS[stat]),
      gear: 0,
      bonus: 0,
      penalty: sectorHeatPenalty(sys.sector.heat, stat),
      kismet: 0,
      kismetAvailable: 0,
      hasKismet: false,
      target: AGONARCH_TN,
      reroll: 0,
      threshold: "",
      spendPool: false,
      conflict: false,
      poolValues: {},
      showFiring: false,
      firingMode: "none",
      notes: [],
      autoSuccesses: autoSuccesses([...sys.traits])
    };
  }

  async rollBrandStat(stat) {
    if (this.type !== "brand") return null;
    return this._runTest(this._brandDefaults(game.i18n.localize(SINLESS.BRAND_STATS[stat]), stat));
  }

  /** Roll a sector action, count it against the turn and apply its heat. */
  async rollBrandAction(key) {
    const def = SINLESS.BRAND_ACTIONS[key];
    if (this.type !== "brand" || !def) return null;
    const label = game.i18n.localize(`SINLESS.BrandAction.${key}.label`);
    const defaults = this._brandDefaults(label, def.stat);
    defaults.notes = [game.i18n.localize(SINLESS.BRAND_STATS[def.stat])];
    if (this.system.actionsLeft <= 0) {
      ui.notifications.warn("SINLESS.Notify.noSectorActions", { localize: true });
    }
    const config = await testDialog(defaults);
    if (!config) return null;
    if (config.plan.impossible || config.plan.total <= 0) {
      ui.notifications.warn("SINLESS.Test.impossible", { localize: true });
      return null;
    }
    const updates = { "system.actionsUsed": this.system.actionsUsed + 1 };
    let heatRaised = null;
    if (def.heat) {
      heatRaised = Math.min(4, this.system.sector.heat + def.heat);
      updates["system.sector.heat"] = heatRaised;
    }
    await this.update(updates);
    return performTest({
      actor: this,
      label,
      pool: null,
      plan: config.plan,
      target: config.target,
      reroll: config.reroll,
      spendPool: false,
      threshold: config.threshold,
      notes: defaults.notes,
      autoSuccesses: config.autoSuccesses,
      extra: { effect: game.i18n.localize(`SINLESS.BrandAction.${key}.effect`), heatRaised }
    });
  }

  /**
   * End the sector turn (p.221): profit is banked, a shortfall is paid from the
   * bank, and anything still unpaid is reported as unmet upkeep.
   */
  async endSectorTurn() {
    if (this.type !== "brand") return null;
    const sys = this.system;
    const { marketCap, upkeep, net } = sys.finance;
    let bank = sys.bank + net;
    let unmet = 0;
    if (bank < 0) {
      unmet = -bank;
      bank = 0;
    }
    await this.update({
      "system.bank": bank,
      "system.actionsUsed": 0,
      "system.sectorTurn": sys.sectorTurn + 1
    });
    // Members pay their lifestyle for the new sector turn (pp.46, 76).
    const lifestyles = [];
    for (const id of sys.members) {
      const member = game.actors.get(id);
      if (!member) continue;
      if (!member.isOwner) {
        lifestyles.push({ name: member.name, text: game.i18n.localize("SINLESS.Lifestyle.noPermission"), warn: true });
        continue;
      }
      const r = await member.payLifestyle({ message: false });
      lifestyles.push({ name: member.name, text: member._lifestyleText(r), warn: r.mode === "unpaid" });
    }
    const content = await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/chat/sector-turn.hbs`,
      { turn: sys.sectorTurn, marketCap, upkeep, net, bank, unmet, heat: sys.sector.heat, lifestyles }
    );
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }

  /**
   * Pay this character's lifestyle for one sector turn (p.46): a pre-purchased
   * month first, otherwise the monthly cost in zuzus.
   */
  async payLifestyle({ message = true } = {}) {
    const sys = this.system;
    if (this.type !== "character") return null;
    const r = payLifestyle({ lifestyle: sys.lifestyle, months: sys.lifestyleMonths, zuzu: sys.zuzu });
    if (r.mode === "prepaid" || r.mode === "cash") {
      await this.update({ "system.lifestyleMonths": r.months, "system.zuzu": r.zuzu });
    }
    if (message) await this._lifestyleMessage(this._lifestyleText(r), r.mode === "unpaid");
    return r;
  }

  /** Pre-purchase months of the current lifestyle (p.46). */
  async buyLifestyle(count) {
    const sys = this.system;
    if (this.type !== "character" || !(count > 0)) return null;
    const r = buyLifestyle({ lifestyle: sys.lifestyle, months: sys.lifestyleMonths, zuzu: sys.zuzu }, count);
    if (!r.ok) {
      ui.notifications.warn(game.i18n.format("SINLESS.Lifestyle.cannotAfford", { cost: r.cost.toLocaleString() }));
      return null;
    }
    await this.update({ "system.lifestyleMonths": r.months, "system.zuzu": r.zuzu });
    return this._lifestyleMessage(game.i18n.format("SINLESS.Lifestyle.bought", {
      n: count, lifestyle: game.i18n.localize(SINLESS.LIFESTYLES[sys.lifestyle]), cost: r.cost.toLocaleString(), months: r.months
    }));
  }

  /** Localized result of a lifestyle payment. */
  _lifestyleText(r) {
    const lifestyle = game.i18n.localize(SINLESS.LIFESTYLES[this.system.lifestyle]);
    return game.i18n.format(`SINLESS.Lifestyle.paid.${r.mode}`, {
      lifestyle, cost: r.cost.toLocaleString(), months: r.months, zuzu: r.zuzu.toLocaleString()
    });
  }

  async _lifestyleMessage(text, warn = false) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<div class="sinless-card"><header class="card-header"><h3>${game.i18n.localize("SINLESS.Lifestyle.title")}</h3></header><p class="effect${warn ? " warn" : ""}">${foundry.utils.escapeHTML(text)}</p></div>`
    });
  }

  /** Add a character as a brand member. */
  async addBrandMember(actor) {
    if (this.type !== "brand" || actor?.type !== "character") return null;
    if (this.system.members.includes(actor.id)) return this;
    await actor.update({ "system.brand": this.name });
    return this.update({ "system.members": [...this.system.members, actor.id] });
  }

  async removeBrandMember(id) {
    return this.update({ "system.members": this.system.members.filter(m => m !== id) });
  }
};
