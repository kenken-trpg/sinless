import { SYSTEM_ID, SINLESS } from "./module/config.mjs";
import { registerSettings } from "./module/settings.mjs";
import { registerOperation, OperationApp } from "./module/apps/operation.mjs";
import { registerChase, ChaseApp } from "./module/apps/chase.mjs";
import { registerHelp, HelpApp } from "./module/apps/help.mjs";
import { registerKeyboard } from "./module/apps/keyboard.mjs";
import { CharacterData, NpcData } from "./module/data/actor.mjs";
import { BrandData, ResourceData } from "./module/data/brand.mjs";
import {
  WeaponData, ArmorData, GearData, ImplantData, PowerData, RitualData, KnowledgeData, AssetData,
  DeckData, SoftwareData, VcrData
} from "./module/data/item.mjs";
import { VehicleData } from "./module/data/vehicle.mjs";
import { SinlessActor } from "./module/documents/actor.mjs";
import { SinlessActiveEffect } from "./module/documents/active-effect.mjs";
import { SinlessCombatant, registerCombatHooks } from "./module/documents/combat.mjs";
import { CharacterSheet, NpcSheet } from "./module/sheets/actor-sheet.mjs";
import { BrandSheet } from "./module/sheets/brand-sheet.mjs";
import { VehicleSheet } from "./module/sheets/vehicle-sheet.mjs";
import { SinlessItemSheet } from "./module/sheets/item-sheet.mjs";
import { onRenderChatMessage } from "./module/dice/test-roll.mjs";
import * as rules from "./module/helpers/rules.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing Sinless`);

  CONFIG.SINLESS = SINLESS;
  game.sinless = { rules, config: SINLESS, operation: OperationApp, chase: ChaseApp, help: HelpApp };

  CONFIG.Actor.documentClass = SinlessActor;
  CONFIG.ActiveEffect.documentClass = SinlessActiveEffect;
  CONFIG.Combatant.documentClass = SinlessCombatant;
  Object.assign(CONFIG.Actor.dataModels, { character: CharacterData, npc: NpcData, brand: BrandData, vehicle: VehicleData });
  Object.assign(CONFIG.Item.dataModels, {
    weapon: WeaponData,
    armor: ArmorData,
    gear: GearData,
    implant: ImplantData,
    power: PowerData,
    ritual: RitualData,
    knowledge: KnowledgeData,
    asset: AssetData,
    resource: ResourceData,
    deck: DeckData,
    software: SoftwareData,
    vcr: VcrData
  });

  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["condition.physical", "condition.stun"], value: ["ghost"] },
    npc: { bar: ["condition.physical", "condition.stun"], value: ["initiative"] },
    brand: { bar: [], value: ["bank"] },
    vehicle: { bar: ["condition.physical", "condition.stun"], value: ["inertia"] }
  };

  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, CharacterSheet, {
    types: ["character"], makeDefault: true, label: "SINLESS.Sheet.character"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NpcSheet, {
    types: ["npc"], makeDefault: true, label: "SINLESS.Sheet.npc"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BrandSheet, {
    types: ["brand"], makeDefault: true, label: "SINLESS.Sheet.brand"
  });
  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleSheet, {
    types: ["vehicle"], makeDefault: true, label: "SINLESS.Sheet.vehicle"
  });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SinlessItemSheet, {
    makeDefault: true, label: "SINLESS.Sheet.item"
  });

  registerSettings();
  registerCombatHooks();
  registerOperation();
  registerChase();
  registerHelp();
  registerKeyboard();
  registerHandlebarsHelpers();

  foundry.applications.handlebars.loadTemplates([
    `systems/${SYSTEM_ID}/templates/actor/partials/item-list.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/partials/condition-track.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/partials/effect-list.hbs`,
    `systems/${SYSTEM_ID}/templates/actor/partials/creation-panel.hbs`
  ]);
});

Hooks.on("renderChatMessageHTML", onRenderChatMessage);

function registerHandlebarsHelpers() {
  Handlebars.registerHelper("sinlessTimes", (n, block) => {
    let out = "";
    for (let i = 0; i < n; i++) out += block.fn(i);
    return out;
  });
  Handlebars.registerHelper("sinlessSigned", n => (n > 0 ? `+${n}` : `${n}`));
}
