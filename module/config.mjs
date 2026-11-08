/**
 * Static configuration for the Sinless system. Every user-facing label is an
 * i18n key; never put display text here.
 */

export const SYSTEM_ID = "sinless";

const L = key => `SINLESS.${key}`;

export const ATTRIBUTES = Object.freeze({
  str: L("Attribute.str"),
  bod: L("Attribute.bod"),
  rea: L("Attribute.rea"),
  int: L("Attribute.int"),
  wil: L("Attribute.wil"),
  cha: L("Attribute.cha")
});

export const POOLS = Object.freeze({
  brawn: L("Pool.brawn"),
  finesse: L("Pool.finesse"),
  focus: L("Pool.focus"),
  resolve: L("Pool.resolve")
});

export const SKILL_GROUPS = Object.freeze({
  close: L("SkillGroup.close"),
  ranged: L("SkillGroup.ranged"),
  vehicle: L("SkillGroup.vehicle"),
  hacking: L("SkillGroup.hacking"),
  engineering: L("SkillGroup.engineering")
});

/**
 * Active skills (pp.66-69). `trainedOnly` marks skills with an asterisk:
 * they cannot be rolled untrained from the pool.
 */
export const SKILLS = Object.freeze({
  // Brawn
  meleeWeapons: { pool: "brawn", group: "close" },
  unarmedCombat: { pool: "brawn", group: "close" },
  martialArts: { pool: "brawn", trainedOnly: true },
  cyberCombat: { pool: "brawn", group: "close", trainedOnly: true },
  throwingWeapons: { pool: "brawn", group: "close" },
  athletics: { pool: "brawn" },
  // Finesse
  firearms: { pool: "finesse", group: "ranged" },
  gunnery: { pool: "finesse", group: "ranged" },
  heavyWeapons: { pool: "finesse", group: "ranged" },
  energyWeapons: { pool: "finesse", group: "ranged" },
  archery: { pool: "finesse" },
  articulatedManeuvers: { pool: "finesse" },
  // Focus
  shadow: { pool: "focus" },
  drive: { pool: "focus", group: "vehicle", trainedOnly: true },
  fly: { pool: "focus", group: "vehicle", trainedOnly: true },
  observation: { pool: "focus" },
  biotech: { pool: "focus", trainedOnly: true },
  reconnaissance: { pool: "focus" },
  locksmithing: { pool: "focus", group: "hacking", trainedOnly: true },
  hacking: { pool: "focus", group: "hacking", trainedOnly: true },
  electronicWarfare: { pool: "focus", group: "hacking", trainedOnly: true },
  programming: { pool: "focus", trainedOnly: true },
  engMechanical: { pool: "focus", group: "engineering", trainedOnly: true },
  engIndustrial: { pool: "focus", group: "engineering", trainedOnly: true },
  engAeronautics: { pool: "focus", group: "engineering", trainedOnly: true },
  engArmory: { pool: "focus", group: "engineering", trainedOnly: true },
  engElectronics: { pool: "focus", group: "engineering", trainedOnly: true },
  engNautical: { pool: "focus", group: "engineering", trainedOnly: true },
  artificing: { pool: "focus", trainedOnly: true },
  negotiation: { pool: "focus" },
  // Resolve
  channeling: { pool: "resolve", trainedOnly: true },
  sorcery: { pool: "resolve", trainedOnly: true },
  astralSenses: { pool: "resolve" },
  survival: { pool: "resolve", trainedOnly: true },
  conjuring: { pool: "resolve", trainedOnly: true },
  leadership: { pool: "resolve" },
  subterfuge: { pool: "resolve" },
  coercion: { pool: "resolve" },
  fascination: { pool: "resolve" }
});

export const ETIQUETTES = Object.freeze({
  corporate: L("Etiquette.corporate"),
  street: L("Etiquette.street"),
  civic: L("Etiquette.civic"),
  aristocratic: L("Etiquette.aristocratic"),
  military: L("Etiquette.military"),
  criminal: L("Etiquette.criminal"),
  wasteland: L("Etiquette.wasteland")
});

/** Heritages and their base Zoetic Potential (p.34). */
export const HERITAGES = Object.freeze({
  human: { label: L("Heritage.human"), zoetic: 6 },
  green: { label: L("Heritage.green"), zoetic: 6 },
  blighted: { label: L("Heritage.blighted"), zoetic: 6 },
  uplifted: { label: L("Heritage.uplifted"), zoetic: 5 },
  synthetic: { label: L("Heritage.synthetic"), zoetic: 1 }
});

export const MAGIC_TALENTS = Object.freeze({
  hedge: L("Talent.hedge"),
  mage: L("Talent.mage"),
  archmage: L("Talent.archmage"),
  amp: L("Talent.amp"),
  speaker: L("Talent.speaker")
});

export const LIFESTYLES = Object.freeze({
  squatter: L("Lifestyle.squatter"),
  low: L("Lifestyle.low"),
  middle: L("Lifestyle.middle"),
  high: L("Lifestyle.high"),
  wealthy: L("Lifestyle.wealthy")
});

/** Run difficulty and its default player target number (p.28). */
export const DIFFICULTIES = Object.freeze({
  veteran: { label: L("Difficulty.veteran"), tn: 4 },
  professional: { label: L("Difficulty.professional"), tn: 5 },
  prime: { label: L("Difficulty.prime"), tn: 6 }
});

/** The Agonarch always rolls against 4+ (p.27). */
export const AGONARCH_TN = 4;

export const HEAT_LEVELS = Object.freeze({
  0: L("Heat.0"),
  1: L("Heat.1"),
  2: L("Heat.2"),
  3: L("Heat.3"),
  4: L("Heat.4")
});

export const WEAPON_CATEGORIES = Object.freeze({
  melee: L("WeaponCategory.melee"),
  unarmed: L("WeaponCategory.unarmed"),
  thrown: L("WeaponCategory.thrown"),
  projectile: L("WeaponCategory.projectile"),
  firearm: L("WeaponCategory.firearm"),
  energy: L("WeaponCategory.energy"),
  heavy: L("WeaponCategory.heavy"),
  vehicle: L("WeaponCategory.vehicle")
});

/** Firing modes and their bonus dice (p.92). */
export const FIRING_MODES = Object.freeze({
  none: { label: L("FiringMode.none"), bonus: 0 },
  single: { label: L("FiringMode.single"), bonus: 0 },
  doubleTap: { label: L("FiringMode.doubleTap"), bonus: 1 },
  burst: { label: L("FiringMode.burst"), bonus: 3 },
  fullAuto: { label: L("FiringMode.fullAuto"), bonus: 20 }
});

/** Ranged combat modifiers (p.90). */
export const LIGHT_LEVELS = Object.freeze({
  bright: L("Light.bright"),
  normal: L("Light.normal"),
  dim: L("Light.dim"),
  dark: L("Light.dark")
});

export const COVER_LEVELS = Object.freeze({
  none: L("Cover.none"),
  low: L("Cover.low"),
  high: L("Cover.high"),
  total: L("Cover.total")
});

export const ARMOR_LAYERS = Object.freeze({
  internal: L("ArmorLayer.internal"),
  under: L("ArmorLayer.under"),
  outer: L("ArmorLayer.outer")
});

/** Which armor stops a weapon (p.92); "auto" follows the weapon category. */
export const ARMOR_TYPES = Object.freeze({
  auto: L("ArmorType.auto"),
  ballistic: L("Armor.ballistic"),
  impact: L("Armor.impact")
});

/** Condition track chosen when applying damage. */
export const DAMAGE_TRACKS = Object.freeze({
  auto: L("ArmorType.auto"),
  physical: L("Condition.physical"),
  stun: L("Condition.stun")
});

/* ---------------- The Grid (ch.7) ---------------- */

/** Intrusion difficulty of the site (p.129). */
export const INTRUSION_LEVELS = Object.freeze({
  open: L("Intrusion.open"),
  secure: L("Intrusion.secure"),
  red: L("Intrusion.red"),
  black: L("Intrusion.black")
});

/** Deck cores: extra exploit actions for loaded software (p.131). */
export const DECK_CORES = Object.freeze({
  0: L("DeckCore.0"), 1: L("DeckCore.1"), 2: L("DeckCore.2"), 3: L("DeckCore.3"), 4: L("DeckCore.4")
});

export const SOFTWARE_ACTIONS = Object.freeze({
  simple: L("SoftwareAction.simple"),
  complex: L("SoftwareAction.complex")
});

export const SOFTWARE_IO = Object.freeze({
  no: L("SoftwareIO.no"),
  yes: L("SoftwareIO.yes"),
  optional: L("SoftwareIO.optional")
});

/* ---------------- Rigging (ch.8) ---------------- */

export const VEHICLE_KINDS = Object.freeze({
  drone: L("VehicleKind.drone"),
  vehicle: L("VehicleKind.vehicle")
});

/** Drone frames (p.144); street vehicles use "none". */
export const VEHICLE_FRAMES = Object.freeze({
  none: L("VehicleFrame.none"),
  micro: L("VehicleFrame.micro"),
  mini: L("VehicleFrame.mini"),
  small: L("VehicleFrame.small"),
  medium: L("VehicleFrame.medium"),
  large: L("VehicleFrame.large")
});

/** Ground vehicles use Drive, flying ones Fly (p.143). */
export const VEHICLE_MOBILITY = Object.freeze({
  ground: { label: L("Mobility.ground"), skill: "drive" },
  air: { label: L("Mobility.air"), skill: "fly" }
});

export const CONTROL_MODES = Object.freeze({
  manual: L("ControlMode.manual"),
  vcr: L("ControlMode.vcr"),
  hotseat: L("ControlMode.hotseat")
});

export const IMPLANT_KINDS = Object.freeze({
  cyber: L("ImplantKind.cyber"),
  bio: L("ImplantKind.bio")
});

export const POWER_CATEGORIES = Object.freeze({
  spell: L("PowerCategory.spell"),
  amplification: L("PowerCategory.amplification"),
  infusion: L("PowerCategory.infusion"),
  spirit: L("PowerCategory.spirit")
});

export const REROLL_OPTIONS = Object.freeze({
  0: L("Reroll.none"),
  1: L("Reroll.ones"),
  2: L("Reroll.onesTwos")
});

export const TEST_MODES = Object.freeze({
  skill: L("TestMode.skill"),
  default: L("TestMode.default"),
  untrained: L("TestMode.untrained"),
  defense: L("TestMode.defense"),
  rank: L("TestMode.rank")
});

export const DEFENSES = Object.freeze({
  dodge: { pool: "finesse", label: L("Defense.dodge") },
  soak: { pool: "brawn", label: L("Defense.soak") },
  resist: { pool: "resolve", label: L("Defense.resist") }
});


/* ---------------- Brand (pp.47, 218-224) ---------------- */

export const BRAND_STATS = Object.freeze({
  muscle: L("BrandStat.muscle"),
  magic: L("BrandStat.magic"),
  media: L("BrandStat.media"),
  espionage: L("BrandStat.espionage"),
  grid: L("BrandStat.grid")
});

/** Brand image traits: stat bonuses plus flags for special effects. */
export const BRAND_TRAITS = Object.freeze({
  analytical: { stats: { espionage: 1, grid: 1 } },
  arcane: { stats: { magic: 2 } },
  athletic: { stats: { muscle: 1, media: 1 } },
  avantGarde: { stats: { grid: 1, media: 1 } },
  competence: { stats: {}, autoSuccess: 1 },
  dangerous: { stats: { muscle: 2 } },
  experienced: { stats: { media: 1, espionage: 1 } },
  inspirational: { stats: { media: 2 } },
  luxury: { stats: { media: 1 }, marketTags: { service: 1, vice: 1, housing: 1 } },
  lethal: { stats: { muscle: 1, espionage: 1 } },
  mercenary: { stats: {}, assetUpkeep: -1, extraHires: 1 },
  modern: { stats: { magic: 1, media: 1 } },
  nefarious: { stats: { espionage: 2 } },
  obscure: { stats: { magic: 1, espionage: 1 } },
  ruggedness: { stats: { muscle: 1 } },
  secure: { stats: { grid: 1 } },
  sincerity: { stats: { media: 1 }, totalUpkeep: -2 },
  sophistication: { stats: { grid: 1 }, marketTags: { production: 2 } },
  technical: { stats: { grid: 2 } }
});

export const RESOURCE_TAGS = Object.freeze({
  service: L("ResourceTag.service"),
  business: L("ResourceTag.business"),
  science: L("ResourceTag.science"),
  vice: L("ResourceTag.vice"),
  housing: L("ResourceTag.housing"),
  production: L("ResourceTag.production")
});

/** Resource class -> condition boxes (p.224). */
export const RESOURCE_CLASSES = Object.freeze({ A: 36, B: 18, C: 9, D: 3, E: 1 });

export const SECTOR_HEAT = Object.freeze({
  0: L("SectorHeat.0"),
  1: L("SectorHeat.1"),
  2: L("SectorHeat.2"),
  3: L("SectorHeat.3"),
  4: L("SectorHeat.4")
});

/** Brand sector actions that need a test (pp.222-223). `heat` raises sector heat. */
export const BRAND_ACTIONS = Object.freeze({
  mediaCampaign: { stat: "media" },
  racketeering: { stat: "muscle", heat: 1 },
  covertInfluence: { stat: "espionage" },
  hakAttack: { stat: "grid" },
  ensorcellment: { stat: "magic" },
  repair: { stat: "muscle" },
  doCrime: { stat: "muscle", heat: 1 },
  reinforceGhost: { stat: "grid" },
  demolish: { stat: "muscle" },
  itemCracking: { stat: "grid" },
  persuadertron: { stat: "media" },
  ragebait: { stat: "media" }
});

export const SINLESS = {
  ATTRIBUTES, POOLS, SKILLS, SKILL_GROUPS, ETIQUETTES, HERITAGES, MAGIC_TALENTS,
  LIFESTYLES, DIFFICULTIES, AGONARCH_TN, HEAT_LEVELS, WEAPON_CATEGORIES, FIRING_MODES, LIGHT_LEVELS, COVER_LEVELS,
  ARMOR_LAYERS, ARMOR_TYPES, DAMAGE_TRACKS, INTRUSION_LEVELS, DECK_CORES, SOFTWARE_ACTIONS, SOFTWARE_IO,
  VEHICLE_KINDS, VEHICLE_FRAMES, VEHICLE_MOBILITY, CONTROL_MODES,
  IMPLANT_KINDS, POWER_CATEGORIES, REROLL_OPTIONS, TEST_MODES, DEFENSES,
  BRAND_STATS, BRAND_TRAITS, RESOURCE_TAGS, RESOURCE_CLASSES, SECTOR_HEAT, BRAND_ACTIONS
};

/** i18n key for a skill label. */
export const skillLabel = key => `SINLESS.Skill.${key}`;

/** Yes/No labels for DialogV2.confirm. Foundry's own "Yes"/"No" stay English without a core translation module. */
export const CONFIRM_BUTTONS = Object.freeze({
  yes: Object.freeze({ label: "SINLESS.Dialog.yes" }),
  no: Object.freeze({ label: "SINLESS.Dialog.no" })
});
