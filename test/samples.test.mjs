import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const samples = new URL('../samples/actors/', import.meta.url);
// Foundry 14's legacy token migration derives depth from width and height.
// JSON.parse alone accepts incomplete token data that importFromJSON rejects.
test('sample actors supply finite token dimensions for Foundry import migration', () => {
  const files = readdirSync(samples).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 6);
  for (const file of files) {
    const actor = JSON.parse(readFileSync(new URL(file, samples), 'utf8'));
    const token = actor.prototypeToken;
    assert.ok(Number.isFinite(token.width) && token.width > 0, `${file}: width`);
    assert.ok(Number.isFinite(token.height) && token.height > 0, `${file}: height`);
    assert.ok(Number.isFinite(token.depth) && token.depth > 0, `${file}: depth`);
    assert.ok(Number.isFinite(Math.min(token.width, token.height)), `${file}: migrated depth`);
  }
});

test('sample deck supports its loaded programs without setup issues', async () => {
  const {deckStatus} = await import('../module/helpers/grid.mjs');
  const actor = JSON.parse(readFileSync(new URL('03-decker-character.json', samples), 'utf8'));
  const deck = actor.items.find(i => i.type === 'deck' && i.system.equipped).system;
  const software = actor.items.filter(i => i.type === 'software').map(i => i.system);
  assert.deepEqual(deckStatus(deck, software).issues, []);
});

test('sample brand asset has a trained member available after linking the sample PCs', () => {
  const brand = JSON.parse(readFileSync(new URL('06-test-brand.json', samples), 'utf8'));
  const member = JSON.parse(readFileSync(new URL('01-combat-character.json', samples), 'utf8'));
  for (const asset of brand.items.filter(i => i.type === 'asset')) {
    assert.ok(member.system.etiquettes[asset.system.etiquette]?.rank > 0);
  }
});
