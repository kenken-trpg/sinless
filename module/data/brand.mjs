import { BRAND_STATS, BRAND_TRAITS, RESOURCE_TAGS, RESOURCE_CLASSES } from "../config.mjs";
import {
  brandStats, brandFinances, sectorActionCount, traitSlots, resourceBoxes, resourceFunctions, resourceMarket
} from "../helpers/brand.mjs";

const { NumberField, StringField, SchemaField, ArrayField, BooleanField, HTMLField, SetField } = foundry.data.fields;
const int = (initial = 0, opts = {}) =>
  new NumberField({ required: true, nullable: false, integer: true, min: 0, initial, ...opts });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });
const statsField = initial => new SchemaField(
  Object.fromEntries(Object.keys(BRAND_STATS).map(k => [k, int(initial)]))
);

/** The group's brand (pp.47, 221-224). */
export class BrandData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SINLESS.Brand"];

  static defineSchema() {
    return {
      kind: str(),
      base: statsField(1),
      traits: new SetField(new StringField({ choices: () => Object.keys(BRAND_TRAITS) })),
      bank: int(0, { min: undefined }),
      marketAdjust: int(0, { min: undefined }),
      actionsUsed: int(0),
      sectorTurn: int(1),
      followers: int(0),
      sector: new SchemaField({
        name: str(),
        heat: int(0, { max: 4 }),
        crackdownMonths: int(0)
      }),
      members: new ArrayField(new StringField({ required: true, blank: false })),
      notes: new HTMLField({ required: true, blank: true })
    };
  }

  get isAgonarch() {
    return false;
  }

  prepareDerivedData() {
    const traits = [...this.traits];
    const items = this.parent.items;
    const resources = items.filter(i => i.type === "resource").map(i => i.system);
    const assets = items.filter(i => i.type === "asset").map(i => i.system);

    const bonuses = resources.filter(r => resourceFunctions(r)).map(r => r.brandBonus);
    this.stats = brandStats(this.base, traits, bonuses);

    this.finance = brandFinances({
      resources, assets, traits, heat: this.sector.heat, adjust: this.marketAdjust
    });
    this.actionsAvailable = sectorActionCount(this.finance.marketCap);
    this.actionsLeft = Math.max(0, this.actionsAvailable - this.actionsUsed);
    this.traitSlots = traitSlots(this.finance.marketCap);
    this.traitsOver = traits.length > this.traitSlots;
    this.crackdown = this.sector.heat >= 4;
  }
}

/** A sector resource the brand fights over or controls (pp.219-224, 245-248). */
export class ResourceData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SINLESS.Item", "SINLESS.Resource"];

  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true }),
      source: str(),
      resourceType: str(),
      tags: new SetField(new StringField({ choices: () => Object.keys(RESOURCE_TAGS) })),
      class: new StringField({ required: true, initial: "D", choices: () => Object.fromEntries(Object.keys(RESOURCE_CLASSES).map(k => [k, k])) }),
      market: int(0),
      marketBonus: int(0, { min: undefined }),
      upkeep: int(0),
      controlled: new BooleanField({ initial: true }),
      damage: int(0),
      influence: int(0),
      demolished: int(0),
      brandBonus: statsField(0),
      effect: str()
    };
  }

  prepareDerivedData() {
    this.boxes = resourceBoxes(this.class);
    this.functions = resourceFunctions(this);
    this.influenceComplete = this.influence >= this.boxes;
    const brand = this.parent.actor?.type === "brand" ? this.parent.actor.system : null;
    this.effectiveMarket = resourceMarket(this, {
      heat: brand?.sector.heat ?? 1, traits: brand ? [...brand.traits] : []
    });
  }
}
