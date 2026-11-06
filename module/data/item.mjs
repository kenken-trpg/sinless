import {
  SKILLS, ETIQUETTES, WEAPON_CATEGORIES, ARMOR_LAYERS, ARMOR_TYPES, DECK_CORES, SOFTWARE_ACTIONS, SOFTWARE_IO, IMPLANT_KINDS, POWER_CATEGORIES, POOLS
} from "../config.mjs";

const { NumberField, StringField, BooleanField, HTMLField } = foundry.data.fields;

const int = (initial = 0, opts = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, min: 0, initial, ...opts });
const num = (initial = 0, opts = {}) =>
  new NumberField({ required: true, nullable: false, min: 0, initial, ...opts });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });
const skillChoices = () => Object.fromEntries(Object.keys(SKILLS).map(k => [k, `SINLESS.Skill.${k}`]));

class SinlessItemBase extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SINLESS.Item"];

  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true }),
      source: str()
    };
  }
}

/** Physical items: weight, carried state and metal/electronics (Zoetic Potential). */
class PhysicalItemData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      quantity: int(1),
      weight: num(0),
      cost: int(0),
      carried: new BooleanField({ initial: true }),
      metal: new BooleanField({ initial: true }),
      concealability: str(),
      hardening: int(2)
    };
  }
}

export class WeaponData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ required: true, initial: "firearm", choices: () => WEAPON_CATEGORIES }),
      skill: new StringField({ required: true, initial: "firearms", choices: skillChoices }),
      accuracy: int(0, { min: undefined }),
      // Bestiary attack dice (p.195): NPCs roll this many dice instead of skill + pool.
      attackDice: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
      damage: str("0"),
      penetration: int(0),
      armorType: new StringField({ required: true, initial: "auto", choices: () => ARMOR_TYPES }),
      stun: new BooleanField({ initial: false }),
      blast: new BooleanField({ initial: false }),
      reach: int(0),
      modes: str(),
      rangeClose: str(),
      rangeMax: str(),
      ammo: str(),
      alert: str()
    };
  }
}

export class ArmorData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      layer: new StringField({ required: true, initial: "outer", choices: () => ARMOR_LAYERS }),
      ballistic: int(0),
      impact: int(0),
      equipped: new BooleanField({ initial: true })
    };
  }
}

export class GearData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rating: int(0),
      limitBonus: int(0, { min: undefined })
    };
  }
}

export class ImplantData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: new StringField({ required: true, initial: "cyber", choices: () => IMPLANT_KINDS }),
      rating: int(0),
      zoeticCost: num(0, { step: 0.01 }),
      bodyIndex: num(0, { step: 0.01 }),
      cost: int(0),
      effect: str()
    };
  }
}

/**
 * Spells, amplifications, infusions and spirits (ch.9).
 * Formulas (drain, damage) may use "Force", e.g. "3 + (Force/2)".
 */
export class PowerData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ required: true, initial: "spell", choices: () => POWER_CATEGORIES }),
      school: str(),
      // Spells: force learned (max castable). Spirits: the spirit's force.
      force: int(1),
      drain: str(),
      resistPool: new StringField({ required: true, blank: true, initial: "", choices: () => ({ "": "—", ...POOLS }) }),
      resistOptional: new BooleanField({ initial: false }),
      damage: str(),
      damageTrack: new StringField({ required: true, initial: "physical", choices: () => ({ physical: "SINLESS.Condition.physical", stun: "SINLESS.Condition.stun" }) }),
      area: new BooleanField({ initial: false }),
      duration: str(),
      price: int(0),
      focus: int(0),
      fetish: int(0),
      spiritBag: int(0),
      zoeticCost: num(0, { step: 0.01 }),
      effect: str()
    };
  }

  /** v0.7: the free-text "resistance" field became a pool choice. */
  static migrateData(source) {
    if (typeof source.resistance === "string" && source.resistPool === undefined) {
      const match = source.resistance.toLowerCase().match(/brawn|finesse|focus|resolve/);
      source.resistPool = match ? match[0] : "";
      if (/optional/i.test(source.resistance)) source.resistOptional = true;
    }
    return super.migrateData(source);
  }
}

/** A learned ritual is its own Resolve-linked skill (p.69). */
export class RitualData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rank: int(0),
      pool: new StringField({ required: true, initial: "resolve", choices: () => POOLS }),
      // Rituals list a fixed drain, e.g. "Drain (8)" (p.179).
      drain: str()
    };
  }
}

export class KnowledgeData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rank: int(1)
    };
  }
}

export class AssetData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      etiquette: new StringField({ required: true, initial: "street", choices: () => ETIQUETTES }),
      hireCost: int(0),
      upkeep: int(0),
      free: new BooleanField({ initial: true }),
      operation: str(),
      sector: str()
    };
  }
}

/** Cyberdeck (pp.129-131). Hardening comes from the physical item fields. */
export class DeckData extends PhysicalItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      mcp: int(1),
      threads: int(1),
      core: new NumberField({ required: true, nullable: false, integer: true, initial: 0, choices: () => DECK_CORES }),
      mods: int(0),
      io: int(1),
      equipped: new BooleanField({ initial: true }),
      nerveRig: new BooleanField({ initial: true }),
      cohesion: int(0)
    };
  }

  /** Cohesion track length equals the MCP rating (p.130). */
  get cohesionMax() {
    return this.mcp;
  }
}

/** Decking software (pp.133-138). */
export class SoftwareData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rating: int(1),
      skill: new StringField({ required: true, initial: "hacking", choices: skillChoices }),
      action: new StringField({ required: true, initial: "complex", choices: () => SOFTWARE_ACTIONS }),
      io: new StringField({ required: true, initial: "no", choices: () => SOFTWARE_IO }),
      base: new BooleanField({ initial: false }),
      requiresNan: new BooleanField({ initial: false }),
      attack: new BooleanField({ initial: false }),
      alert: int(0),
      alertPerSuccess: int(0),
      alertNote: str(),
      // Shadow Protocols: while running in the I/O, alert increases drop by the rating (p.136).
      reducesAlert: new BooleanField({ initial: false }),
      costPerRating: int(0),
      loaded: new BooleanField({ initial: true }),
      running: new BooleanField({ initial: false }),
      effect: str()
    };
  }

  get cost() {
    return this.costPerRating * Math.max(1, this.rating);
  }
}

/** Vehicle control rig (p.142). */
export class VcrData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      bonusDice: int(2),
      hardeningBonus: int(0),
      links: int(1),
      core: new NumberField({ required: true, nullable: false, integer: true, initial: 1, choices: () => DECK_CORES }),
      mods: int(1),
      zoeticCost: num(0, { step: 0.01 }),
      cost: int(0),
      equipped: new BooleanField({ initial: true }),
      nerveRig: new BooleanField({ initial: true })
    };
  }
}
