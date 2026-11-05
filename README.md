# Sinless for Foundry VTT (unofficial)

An unofficial, fan-made game system for playing **Sinless** on Foundry Virtual Tabletop.
It is not affiliated with or endorsed by the publisher. You need the rulebook to play;
this system contains no rules text.

日本語版の説明は [README.ja.md](README.ja.md) を参照してください。

## Features

- Character and NPC actors with the official sheet layout: six attributes, four dice pools
  (Brawn / Finesse / Focus / Resolve) computed with Sinless rounding, physical and stun
  condition tracks with the death spiral, etiquettes, Kismet pool, Zoetic Potential.
- Test dialog that handles limits (skill + gear), bonus and penalty dice (penalties remove
  bonus dice first), group-skill defaulting (−2), untrained tests (4 successes = 1),
  rerolls of 1s / 1s and 2s, Kismet dice and pool spending during conflict.
- Chat card with successes, Argle Bargle Foofaraw detection and a button to add Kismet dice
  after the roll.
- Initiative = Reaction + successes on the full Focus pool; NPCs use a static number.
  Pools refresh automatically every combat round.
- World settings for run difficulty (Veteran / Professional / Prime), operational heat,
  base condition boxes and wound penalties.
- Item types: weapon, armor, gear, implant, spell/power, ritual, knowledge skill, asset.
- Localization from day one: English and Japanese.

## Development

No build step is required — Foundry loads the ES modules directly.

```sh
# link into your Foundry data folder
ln -s "$PWD" "<FoundryData>/Data/systems/sinless"

npm test             # rule unit tests + i18n check
npm run check:i18n   # locale parity, placeholders, missing keys
npm run lint:syntax  # parse-check every module and JSON file
npm run build        # dist/sinless.zip
```

### Adding text

Never hard-code display strings. Add the key to `lang/en.json` and `lang/ja.json`
(`npm run check:i18n` fails if a locale is missing a key or placeholders differ).
To add a language, drop `lang/<code>.json` and register it in `system.json`.

### Layout

| Path | Purpose |
| --- | --- |
| `module/helpers/rules.mjs` | Pure rule logic (no Foundry globals), unit-tested |
| `module/config.mjs` | Skills, pools, etiquettes etc. as i18n keys |
| `module/data/` | TypeDataModels for actors and items |
| `module/documents/` | Actor (tests) and Combatant (initiative) |
| `module/sheets/`, `templates/` | ApplicationV2 sheets and Handlebars templates |
| `module/dice/` | Rolling and chat cards |
