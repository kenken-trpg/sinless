import {
  SKILLS, ETIQUETTES, WEAPON_CATEGORIES, ARMOR_LAYERS, ARMOR_TYPES, IMPLANT_KINDS, POWER_CATEGORIES, POOLS
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

export class PowerData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      category: new StringField({ required: true, initial: "spell", choices: () => POWER_CATEGORIES }),
      school: str(),
      force: int(0),
      drain: str(),
      resistance: str(),
      focus: int(0),
      fetish: int(0)
    };
  }
}

/** A learned ritual is its own Resolve-linked skill (p.69). */
export class RitualData extends SinlessItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rank: int(0),
      pool: new StringField({ required: true, initial: "resolve", choices: () => POOLS })
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
