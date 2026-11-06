import {
  ATTRIBUTES, POOLS, SKILLS, ETIQUETTES, HERITAGES, MAGIC_TALENTS, LIFESTYLES, DEFENSES
} from "../config.mjs";
import {
  computePools, conditionTrackSize, woundPenalty, kismetPoolSize
} from "../helpers/rules.mjs";
import { PRIORITY_CATEGORIES, PRIORITY_LEVELS } from "../helpers/creation.mjs";

const { NumberField, StringField, SchemaField, BooleanField, HTMLField } = foundry.data.fields;

const int = (initial = 0, opts = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, min: 0, initial, ...opts });

const keys = obj => Object.keys(obj);

function skillsField() {
  return new SchemaField(Object.fromEntries(keys(SKILLS).map(k => [k, new SchemaField({
    rank: int(0),
    spec: new StringField({ required: true, blank: true, initial: "" })
  })])));
}

function etiquettesField() {
  return new SchemaField(Object.fromEntries(keys(ETIQUETTES).map(k => [k, new SchemaField({
    rank: int(0)
  })])));
}

/** Shared fields and derived data for every acting entity. */
class SinlessActorBase extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SINLESS.Actor"];

  static defineSchema() {
    return {
      skills: skillsField(),
      etiquettes: etiquettesField(),
      // `bonus` fields are targets for Active Effects (implants, spells ...).
      pools: new SchemaField(Object.fromEntries(keys(POOLS).map(k => [k, new SchemaField({
        spent: int(0),
        bonus: int(0, { min: undefined })
      })]))),
      condition: new SchemaField({
        physical: new SchemaField({ value: int(0), bonus: int(0, { min: undefined }) }),
        stun: new SchemaField({ value: int(0), bonus: int(0, { min: undefined }) }),
        overflow: int(0)
      }),
      armorBonus: new SchemaField({
        ballistic: int(0, { min: undefined }),
        impact: int(0, { min: undefined })
      }),
      penalty: int(0),
      notes: new HTMLField({ required: true, blank: true })
    };
  }

  /** Whether this actor rolls as the Agonarch (always TN 4+). */
  get isAgonarch() {
    return false;
  }

  /** Pool maxima before modifiers; implemented by subclasses. */
  _basePoolMax() {
    return { brawn: 0, finesse: 0, focus: 0, resolve: 0 };
  }

  /** Condition track base sizes; implemented by subclasses. */
  _conditionMax() {
    return { physical: 6, stun: 6 };
  }

  prepareDerivedData() {
    const base = this._basePoolMax();
    for (const [key, pool] of Object.entries(this.pools)) {
      pool.max = Math.max(0, (base[key] ?? 0) + pool.bonus);
      pool.value = Math.max(0, pool.max - pool.spent);
    }

    const max = this._conditionMax();
    this.condition.physical.max = Math.max(0, max.physical + this.condition.physical.bonus);
    this.condition.stun.max = Math.max(0, max.stun + this.condition.stun.bonus);
    const woundsOn = game.settings?.get("sinless", "woundPenalties") ?? true;
    this.condition.penalty = woundsOn
      ? woundPenalty(this.condition.physical.value, this.condition.stun.value)
      : 0;
    this.totalPenalty = this.condition.penalty + this.penalty;

    this._prepareArmor();
  }

  /** Stacked armor (p.92): highest value vs penetration, total value reduces damage. */
  _prepareArmor() {
    const armor = { ballistic: { total: 0, highest: 0 }, impact: { total: 0, highest: 0 } };
    for (const item of this.parent.items) {
      if (item.type !== "armor" || !item.system.equipped) continue;
      for (const kind of ["ballistic", "impact"]) {
        const v = item.system[kind];
        armor[kind].total += v;
        armor[kind].highest = Math.max(armor[kind].highest, v);
      }
    }
    for (const kind of ["ballistic", "impact"]) {
      armor[kind].total += this.armorBonus[kind];
      armor[kind].highest = Math.max(armor[kind].highest, this.armorBonus[kind]);
    }
    this.armor = armor;
  }
}

export class CharacterData extends SinlessActorBase {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SINLESS.Character"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      attributes: new SchemaField(Object.fromEntries(keys(ATTRIBUTES).map(k => [k, new SchemaField({
        value: int(1),
        max: int(20)
      })]))),
      charismaPool: new StringField({
        required: true, blank: true, initial: "", choices: () => ({ "": "—", ...POOLS })
      }),
      heritage: new StringField({ required: true, initial: "human", choices: () => labels(HERITAGES) }),
      talent: new StringField({ required: true, initial: "hedge", choices: () => MAGIC_TALENTS }),
      lifestyle: new StringField({ required: true, initial: "low", choices: () => LIFESTYLES }),
      lifestyleMonths: int(1),
      ghost: int(0),
      brand: new StringField({ required: true, blank: true, initial: "" }),
      zuzu: int(0),
      kismet: new SchemaField({
        earned: int(0),
        unspent: int(0),
        spent: int(0),
        poolBonus: int(0)
      }),
      zoetic: new SchemaField({
        bonus: new NumberField({ required: true, nullable: false, initial: 0 })
      }),
      initiativeBonus: int(0, { min: undefined }),
      movement: int(0),
      // Decking (ch.7): MCP dice spent this round and NAN influence radius in meters.
      grid: new SchemaField({
        mcpSpent: int(0),
        influence: int(0)
      }),
      // Character creation helper (pp.44-46).
      creation: new SchemaField({
        active: new BooleanField({ initial: false }),
        priorities: new SchemaField(Object.fromEntries(PRIORITY_CATEGORIES.map(k => [k, new StringField({
          required: true, blank: true, initial: "", choices: () => ({ "": "—", ...Object.fromEntries(PRIORITY_LEVELS.map(l => [l, l])) })
        })]))),
        attributeAdjust: int(0, { min: undefined })
      }),
      biography: new HTMLField({ required: true, blank: true })
    };
  }

  _basePoolMax() {
    const values = Object.fromEntries(Object.entries(this.attributes).map(([k, a]) => [k, a.value]));
    return computePools(values, this.charismaPool || null);
  }

  _conditionMax() {
    const base = game.settings?.get("sinless", "baseConditionBoxes") ?? 6;
    return {
      physical: conditionTrackSize(base, this.attributes.bod.value),
      stun: conditionTrackSize(base, this.attributes.wil.value)
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();

    const poolMax = kismetPoolSize(this.kismet.earned, this.kismet.poolBonus);
    this.kismet.pool = { max: poolMax, value: Math.max(0, poolMax - this.kismet.spent) };

    this._prepareZoetic();
    this._prepareDeck();
    this.carryCapacity = this.attributes.str.value;
    this.carried = this.parent.items.reduce(
      (sum, i) => sum + (i.system.carried ? (i.system.weight ?? 0) * (i.system.quantity ?? 1) : 0), 0
    );
    this.encumbrance = Math.max(0, Math.floor(this.carried - this.carryCapacity));
    this.totalPenalty += this.encumbrance;
  }

  /** Equipped deck and its MCP dice, usable only for decking tests (p.130). */
  _prepareDeck() {
    const deck = this.parent.items.find(i => i.type === "deck" && i.system.equipped) ?? null;
    const max = deck?.system.mcp ?? 0;
    this.grid.deckId = deck?.id ?? null;
    this.grid.mcp = { max, value: Math.max(0, max - this.grid.mcpSpent) };
  }

  /** Zoetic Potential (pp.34, 37, 45). */
  _prepareZoetic() {
    const base = HERITAGES[this.heritage]?.zoetic ?? 6;
    let implantLoss = 0;
    let gearLoss = 0;
    for (const item of this.parent.items) {
      if (item.type === "implant") implantLoss += item.system.zoeticCost;
      else if (item.system.carried && item.system.metal) gearLoss += 1;
    }
    const raw = base + this.zoetic.bonus - implantLoss;
    this.zoetic.base = base;
    this.zoetic.raw = Math.round(raw * 100) / 100;
    this.zoetic.implantLoss = Math.round(implantLoss * 100) / 100;
    this.zoetic.gearLoss = gearLoss;
    this.zoetic.value = Math.max(0, Math.floor(raw) - gearLoss);
  }
}

export class NpcData extends SinlessActorBase {
  static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "SINLESS.Npc"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      poolMax: new SchemaField(Object.fromEntries(keys(POOLS).map(k => [k, int(6)]))),
      conditionMax: new SchemaField({ physical: int(6), stun: int(6) }),
      initiative: int(10),
      strength: int(3),
      // Bestiary defenses (p.195): a fixed number of dice that never depletes a pool.
      // Empty means the opponent defends from its pools like a player character.
      defenses: new SchemaField(Object.fromEntries(keys(DEFENSES).map(k => [k, new NumberField({
        required: true, nullable: true, integer: true, min: 0, initial: null
      })]))),
      agonarch: new BooleanField({ initial: true })
    };
  }

  get isAgonarch() {
    return this.agonarch;
  }

  _basePoolMax() {
    return { ...this.poolMax };
  }

  _conditionMax() {
    return { ...this.conditionMax };
  }

  /** Fixed dice for a defense, or null to roll from the pool. */
  fixedDefense(key) {
    const value = this.defenses?.[key];
    return Number.isInteger(value) ? value : null;
  }
}

function labels(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.label]));
}
