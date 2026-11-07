// Fixtures for the feature scripts in ../original (shoot, cond, adv, op, life, chase, digital, magic, magic9).
// Originally these actors were left behind by earlier scripts (roll, damage, npcatk, creation, brand, rig).
// createFixtures builds the same state directly; removeFixtures restores the world to the snapshot it took.
const SETTINGS = ["intrusion", "alert", "heat", "operation", "chase"];

export async function createFixtures(page) {
  return page.evaluate(async settingKeys => {
    const snapshot = {
      actors: game.actors.map(a => a.id), items: game.items.map(i => i.id), scenes: game.scenes.map(s => s.id),
      combats: game.combats.map(c => c.id), messages: game.messages.map(m => m.id), activeScene: game.scenes.active?.id ?? null,
      settings: Object.fromEntries(settingKeys.map(k => [k, foundry.utils.deepClone(game.settings.get("sinless", k))]))
    };
    const clash = game.actors.filter(a => a.name.startsWith("SMOKE") || a.name === "Chase Pursuer").map(a => a.name)
      .concat(game.scenes.getName("SMOKE Scene") ? ["SMOKE Scene"] : []);
    if (clash.length) throw new Error(`Fixtures already exist: ${clash.join(", ")}`);

    // damage.mjs
    const ben = await Actor.create({ name: "SMOKE D Ben", type: "character", system: {
      attributes: { str: { value: 12 }, bod: { value: 8 }, rea: { value: 12 }, int: { value: 6 }, wil: { value: 6 }, cha: { value: 4 } },
      skills: { firearms: { rank: 6 }, meleeWeapons: { rank: 4 }, drive: { rank: 4 }, fly: { rank: 3 }, gunnery: { rank: 3 } } } });
    await ben.createEmbeddedDocuments("Item", [
      { name: "Assault Rifle", type: "weapon", system: { category: "firearm", skill: "firearms", accuracy: 2, damage: "6", penetration: 4 } },
      { name: "Axe", type: "weapon", system: { category: "melee", skill: "meleeWeapons", damage: "½ Str +5", penetration: 0 } },
      // rig.mjs
      { name: "Advanced VCR", type: "vcr", system: { bonusDice: 4, hardeningBonus: 1, links: 2, core: 2, mods: 2, zoeticCost: 0.5 } }
    ]);
    const guard = await Actor.create({ name: "SMOKE D Guard", type: "npc", system: { armorBonus: { ballistic: 4, impact: 1 }, conditionMax: { physical: 6, stun: 6 } } });
    // npcatk.mjs
    await guard.createEmbeddedDocuments("Item", [
      { name: "SMOKE Pistol", type: "weapon", system: { category: "firearm", skill: "firearms", damage: "2", penetration: 2, attackDice: 8 } },
      { name: "SMOKE Cudgel", type: "weapon", system: { category: "melee", skill: "meleeWeapons", damage: "8" } }
    ]);
    // creation.mjs (finished)
    const rookie = await Actor.create({ name: "SMOKE C Rookie", type: "character", system: {
      attributes: { str: { value: 10 }, bod: { value: 10 }, rea: { value: 12 }, int: { value: 7 }, wil: { value: 8 }, cha: { value: 4 } },
      skills: { firearms: { rank: 7 }, martialArts: { rank: 2 } }, etiquettes: { street: { rank: 6 }, criminal: { rank: 3 } },
      heritage: "green", talent: "hedge", lifestyle: "middle", lifestyleMonths: 3 } });
    await rookie.update({ "system.creation.active": false });
    // brand.mjs
    const member = await Actor.create({ name: "SMOKE Member", type: "character", system: { etiquettes: { street: { rank: 4 } } } });
    const brand = await Actor.create({ name: "SMOKE Black Adder", type: "brand", system: { base: { muscle: 2 }, sector: { name: "Docks", heat: 1 } } });
    await brand.update({ "system.traits": ["dangerous", "competence"] });
    await brand.createEmbeddedDocuments("Item", [
      { name: "Tattoo Parlor", type: "resource", system: { class: "D", market: 2, marketBonus: 1, upkeep: 1, tags: ["service", "business"] } },
      { name: "Condos", type: "resource", system: { class: "C", market: 5, upkeep: 3, tags: ["housing"], influence: 4 } },
      { name: "Street Fence", type: "asset", system: { etiquette: "street", upkeep: 2, free: false } }
    ]);
    await brand.addBrandMember(member);
    // rig.mjs
    const van = await Actor.create({ name: "SMOKE V Van", type: "vehicle", system: { kind: "vehicle", frame: "none", mobility: "ground", body: 12, handling: 2, movement: 20, inertia: 2, armorBonus: { ballistic: 4 } } });
    await van.setVehicleController(ben);
    await van.update({ "system.controlMode": "hotseat" });
    await van.createEmbeddedDocuments("Item", [{ name: "Minigun", type: "weapon", system: { category: "vehicle", skill: "gunnery", accuracy: 1, damage: "3", penetration: 3, weight: 3 } }]);
    const roto = await Actor.create({ name: "SMOKE V Roto", type: "vehicle", system: { kind: "drone", frame: "small", mobility: "air", body: 6, weaponWeight: 2, handling: 6, movement: 10 } });
    await roto.setVehicleController(ben);

    // roll.mjs / damage.mjs / grid.mjs: an active, viewed scene with Ben and the guard on it.
    const scene = await Scene.create({ name: "SMOKE Scene", active: true });
    await scene.activate();
    await scene.view();
    for (let i = 0; i < 100 && !(canvas.ready && canvas.scene?.id === scene.id); i++) await new Promise(r => setTimeout(r, 100));
    const place = async (a, x, y) => { const td = await a.getTokenDocument({ x, y }); return (await scene.createEmbeddedDocuments("Token", [td.toObject()]))[0]; };
    await place(ben, 300, 300);
    await place(guard, 500, 500);
    await new Promise(r => setTimeout(r, 1000));
    return {
      snapshot,
      summary: { system: game.system.version, canvas: canvas.ready && canvas.scene?.name, tokens: canvas.tokens.placeables.map(t => t.name),
        vehicles: ben.controlledVehicles.map(v => v.name), members: brand.system.members.length, rookieCreation: rookie.system.creation.active }
    };
  }, SETTINGS);
}

export async function removeFixtures(page, snapshot) {
  return page.evaluate(async s => {
    const keep = (ids, coll) => coll.filter(d => !ids.includes(d.id)).map(d => d.id);
    for (const c of game.combats.contents) if (!s.combats.includes(c.id)) await c.delete();
    if (s.activeScene && game.scenes.get(s.activeScene)) { await game.scenes.get(s.activeScene).activate(); await game.scenes.get(s.activeScene).view(); }
    await Scene.deleteDocuments(keep(s.scenes, game.scenes));
    await Actor.deleteDocuments(keep(s.actors, game.actors));
    await Item.deleteDocuments(keep(s.items, game.items));
    await ChatMessage.deleteDocuments(keep(s.messages, game.messages));
    for (const [k, v] of Object.entries(s.settings)) await game.settings.set("sinless", k, v);
    return { actors: game.actors.size, items: game.items.size, scenes: game.scenes.map(x => x.name), combats: game.combats.size, messages: game.messages.size };
  }, snapshot);
}
