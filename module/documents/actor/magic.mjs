// Magic: spells, spirits, drain, rituals and resistance (ch.9).
// Mixed into SinlessActor (../actor.mjs); shared test helpers such as _testDefaults live there.

import { SINLESS, SYSTEM_ID, skillLabel } from "../../config.mjs";
import { entityDefenseDice } from "../../helpers/grid.mjs";
import {
  forceFormula, drainIsLethal, leyLineDice, voidResistBonus, isContinuous, resistSustained
} from "../../helpers/magic.mjs";
import { specMatches } from "../../helpers/combat.mjs";

export const MagicActor = Base => class SinlessMagicActor extends Base {
  async rollRitual(item) {
    const drain = forceFormula(item.system.drain, 0);
    const defaults = this._testDefaults({ label: item.name, pool: item.system.pool, rank: item.system.rank, notes: [] });
    return this._runTest(this._leyLineDefaults(defaults), drain ? { spell: { drain, lethal: false, fetish: 0, label: item.name } } : {});
  }

  /** Use a power item: cast a spell or infusion, or summon a spirit. */
  async usePower(item) {
    switch (item.system.category) {
      case "spirit": return this.summonSpirit(item);
      // Amplifications have no test: their zoetic cost is always applied (open the item).
      case "amplification": return item.sheet.render(true);
      default: return this.castSpell(item);
    }
  }

  /** Current Zoetic Potential, the threshold for lethal drain (p.167). */
  get zoeticPotential() {
    return this.system.zoetic?.value ?? 0;
  }

  /**
   * Cast a spell (p.167): Sorcery + focus rank from the Resolve pool, at a chosen
   * force up to the force learned. Drain and damage use that force.
   */
  async castSpell(item) {
    const sys = item.system;
    const { mode, rank, spec } = this._skillMode("sorcery");
    const defaults = this._testDefaults({
      label: item.name, pool: "resolve", mode, rank, gear: sys.focus,
      spec, specApplies: specMatches(spec, item.name, sys.school),
      notes: [game.i18n.localize(skillLabel("sorcery")), sys.school].filter(Boolean)
    });
    defaults.force = { value: Math.max(1, sys.force), max: Math.max(1, sys.force), drain: sys.drain, zoetic: this.zoeticPotential };
    defaults.ward = { shatter: sys.shatterWard };
    this._leyLineDefaults(defaults);
    return this._runTest(defaults, async config => {
      const force = config.force ?? sys.force;
      const targets = this._currentTargets();
      const continuous = isContinuous(sys.duration) && !!sys.resistPool;
      const extra = {
        spell: {
          force,
          drain: forceFormula(sys.drain, force) ?? 0,
          lethal: drainIsLethal(force, this.zoeticPotential),
          fetish: sys.fetish,
          label: item.name,
          // Continuous spells (p.167): targets accumulate resistance successes to end them.
          continuous,
          resistPool: sys.resistPool,
          duration: sys.duration,
          img: item.img,
          targets: continuous ? targets : []
        },
        effect: sys.effect
      };
      // Wards (pp.168-170): a crossed ward removes successes; Shatter Ward targets one.
      if (config.ward) extra.ward = sys.shatterWard ? { target: config.ward, force } : { crossed: config.ward };
      const damage = forceFormula(sys.damage, force);
      if (damage !== null) {
        Object.assign(extra, {
          weapon: true,
          magic: true,
          damage,
          damageText: sys.damage,
          damageFormula: "",
          damageNote: "",
          penetration: 0,
          armorType: "ballistic",
          energy: false,
          stun: sys.damageTrack === "stun",
          blast: false,
          resistPool: sys.resistPool,
          targets
        });
      }
      return extra;
    });
  }

  /** Summon a spirit (p.183): Conjuring + focus against the spirit's force less the spirit bag. */
  async summonSpirit(item) {
    const sys = item.system;
    const { mode, rank, spec } = this._skillMode("conjuring");
    const defaults = this._testDefaults({
      label: item.name, pool: "resolve", mode, rank, gear: sys.focus,
      spec, specApplies: specMatches(spec, item.name),
      notes: [game.i18n.localize(skillLabel("conjuring"))]
    });
    defaults.force = { value: Math.max(1, sys.force), max: Math.max(1, sys.force), drain: "", zoetic: this.zoeticPotential };
    this._leyLineDefaults(defaults);
    return this._runTest(defaults, config => ({
      summon: { force: config.force ?? sys.force, bag: sys.spiritBag, spiritActor: sys.spiritActor, name: item.name }
    }));
  }

  /** Invoke a bound spirit (p.183): drain equal to its force, lethal above the Zoetic Potential. */
  async invokeSpirit(item) {
    const { drainDialog } = await import("../../apps/drain-dialog.mjs");
    const force = item.system.force;
    return drainDialog(this, {
      label: game.i18n.format("SINLESS.Magic.invoke", { name: item.name }),
      drain: force,
      lethal: drainIsLethal(force, this.zoeticPotential),
      fetish: item.system.fetish
    });
  }

  /** Channeling test to resist drain: Channeling + fetish rank from Resolve (p.167). */
  async rollChanneling(fetish = 0, label = null) {
    const { mode, rank, spec } = this._skillMode("channeling");
    const defaults = this._testDefaults({
      label: label ?? game.i18n.localize("SINLESS.Magic.channeling"),
      pool: "resolve", mode, rank, gear: fetish, spec,
      notes: [game.i18n.localize(skillLabel("channeling"))]
    });
    return this._runTest(this._leyLineDefaults(defaults));
  }

  /** Ley line bonus or void line penalty dice for a magic test (p.167). */
  _leyLineDefaults(defaults) {
    const ley = this.system.leyLine;
    if (!ley || ley.kind === "none" || !ley.force) return defaults;
    const { bonus, penalty } = leyLineDice(ley.kind, ley.force);
    defaults.bonus += bonus;
    defaults.penalty += penalty;
    defaults.notes.push(game.i18n.format(`SINLESS.LeyLine.note.${ley.kind}`, { n: bonus || penalty }));
    return defaults;
  }

  /**
   * Resist a continuous spell placed on this actor (p.167): a complex action,
   * successes accumulate until they reach the caster's successes.
   * @param {ActiveEffect} effect
   */
  async resistSustainedSpell(effect) {
    const data = effect?.getFlag(SYSTEM_ID, "sustained");
    if (!data || effect.parent !== this || !this.isOwner || effect.disabled || effect.isSuppressed) return null;
    const msg = await this.rollResistance(data.pool, { attack: "magic" });
    if (!msg) return null;
    const { summarize } = await import("../../dice/test-roll.mjs");
    const state = msg.getFlag(SYSTEM_ID, "test");
    const r = resistSustained(data, state ? summarize(state).successes : 0);
    const fmt = (k, d) => game.i18n.format(k, d);
    let text;
    if (r.ended) {
      await effect.delete();
      text = fmt("SINLESS.Sustained.ended", { name: this.name, spell: effect.name });
    } else {
      await effect.setFlag(SYSTEM_ID, "sustained", { ...data, accumulated: r.accumulated });
      text = fmt("SINLESS.Sustained.progress", { name: this.name, spell: effect.name, n: r.accumulated, needed: data.needed });
    }
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<p class="sinless-note">${foundry.utils.escapeHTML(text)}</p>` });
  }

  /** Continuous spells on this actor that can still be resisted. */
  get sustainedSpells() {
    return this.effects.filter(e => !e.disabled && !e.isSuppressed && e.getFlag(SYSTEM_ID, "sustained")).map(e => ({ effect: e, ...e.getFlag(SYSTEM_ID, "sustained") }));
  }

  /**
   * Resist a spell with a pool (p.167), as many dice as wished, no limit.
   * Opponents with fixed bestiary defenses roll those instead.
   */
  async rollResistance(pool, { attack = "magic" } = {}) {
    const fixedKey = { finesse: "dodge", brawn: "soak", resolve: "resist" }[pool];
    const ley = this.system.leyLine;
    const bonus = attack === "magic" && ley ? voidResistBonus(ley.kind, ley.force) : 0;
    const fixed = fixedKey ? this.system.fixedDefense?.(fixedKey) : null;
    if (fixed != null) {
      const dice = this.isEntity ? entityDefenseDice(fixed, { entity: true, digital: attack === "digital" }) : fixed;
      const defaults = this._fixedDiceDefaults(game.i18n.localize(SINLESS.DEFENSES[fixedKey].label), dice + bonus);
      defaults.penalty = 0;
      if (bonus) defaults.notes.push(game.i18n.format("SINLESS.LeyLine.note.voidResist", { n: bonus }));
      return this._runTest(defaults);
    }
    if (!this.system.pools?.[pool]) return null;
    const defaults = this._testDefaults({
      label: game.i18n.format("SINLESS.Magic.resist", { pool: game.i18n.localize(SINLESS.POOLS[pool]) }),
      pool, mode: "defense"
    });
    defaults.penalty = 0;
    // Targets in a void line resist spells more easily (p.167).
    if (bonus) {
      defaults.bonus += bonus;
      defaults.notes.push(game.i18n.format("SINLESS.LeyLine.note.voidResist", { n: bonus }));
    }
    return this._runTest(defaults);
  }
};
