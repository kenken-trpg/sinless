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
- Attack cards remember the targeted tokens. Each defender opens a damage dialog to roll
  dodge and soak from it. The dialog applies armor: ballistic armor against penetration
  (stun or physical), impact armor minus armor piercing, energy weapons stripping armor, and
  explosives. Damage then goes on the condition tracks, with stun → physical → overflow.
- NPCs can use bestiary defenses (critter rules): fixed dodge / soak / resist dice that never
  spend a pool. Leave a field empty to defend from the pool like a player character.
  NPC weapons can list fixed attack dice in the same way.
- Character creation panel (new characters start in creation mode). It has priority selectors
  (A–E) and live budgets for attribute points (with the 10/15 cost steps), skill points
  (Martial Arts ×2, rituals included), knowledge (2×INT), etiquette (2×CHA) and zuzus (gear,
  hired assets, prepaid lifestyle). It also checks rules (each priority used once,
  heritage/magic priority, skills ≤ 6) and has Ghost Rating and seed money rolls.
- Active Effects on actors and items. Item effects apply while armor is equipped and gear is
  carried; implant effects always apply. Useful keys: `system.attributes.str.value`,
  `system.pools.brawn.bonus`, `system.condition.physical.bonus`, `system.armorBonus.ballistic`,
  `system.skills.firearms.rank`, `system.initiativeBonus`, `system.zoetic.bonus`.
  Attribute fields keep showing the base value. Other fields that an effect sets are locked.
- Initiative = Reaction + successes on the full Focus pool; NPCs use a static number.
  Pools refresh automatically every combat round.
- World settings for run difficulty (Veteran / Professional / Prime), operational heat,
  base condition boxes and wound penalties.
- Item types: weapon, armor, gear, implant, spell/power, ritual, knowledge skill, asset, resource,
  cyberdeck, software, vehicle control rig.
- Magic (ch.9):
  - Spells are cast with Sorcery + focus from Resolve, at a chosen force up to the force
    learned. The dialog previews the drain and whether it is lethal (force above the Zoetic
    Potential).
  - Spell cards carry the damage (e.g. `1+Force` + net successes, armor ignored). Targets
    resist with the spell's pool from the defend dialog.
  - The caster resists drain from the card: Channeling + fetish, then soak if the drain is
    stun. At least one stun box is always marked.
  - Spirits are summoned with Conjuring + focus against force less the spirit bag. The card
    shows the services bound. Invoking a spirit applies drain equal to its force.
  - Amplifications cost Zoetic Potential (half for amps). Rituals can list a fixed drain.
- Drones and vehicles (ch.8), as their own actor type:
  - Body, weapon weight, movement, handling, hardening, armor, inertia, and the physical and
    integrity tracks. Body is also the soak dice.
  - Drop a character on the sheet to make them the rigger. The rigger rolls maneuver,
    overdrive, ram and mounted weapon tests with Drive/Fly or Gunnery, using handling or
    accuracy as the limit.
  - Penalties: control method (manual −4, VCR −2, hot-seat 0), vehicle damage and inertia.
  - Hot-seated riggers add VCR bonus dice. They dodge for the vehicle and take its damage as
    stun, less VCR hardening.
  - Vehicles are immune to weapons whose penetration is below their armor.
  - Ram cards compute both damages and clear inertia.
- Decking (ch.7), from a Grid tab:
  - The equipped cyberdeck shows MCP dice, threads, core, I/O, nerve rig and a cohesion track.
  - Software tests use skill + software rating as the limit and Focus + MCP dice as the pool.
    MCP dice are spent first and refresh each round.
  - Penalties are applied automatically: intrusion difficulty (world setting) and a missing
    nerve rig.
  - Device hacks, brute force and stealth NAN hacks. Cards compute influence gained (with the
    40 m range penalty) and alert raised (less Shadow Protocols). Buttons apply the influence
    (roller) and raise the world alert level (GM).
- Brand actor for sector play: five statistics, brand traits, market cap / upkeep / bank,
  sector heat effects, sector action tests (with heat and Competence), end-of-turn banking,
  resources with damage / influence tracks, members and asset tests rolled by the best member.
- Localization from day one: English and Japanese.

## Development

No build step is required — Foundry loads the ES modules directly.

```sh
# link into your Foundry data folder
ln -s "$PWD" "<FoundryData>/Data/systems/sinless"

npm test             # rule unit tests + i18n check
npm run check:i18n   # locale parity, placeholders, missing keys
npm run lint:syntax  # parse-check every module and JSON file
npm run check        # all three
npm run build        # dist/sinless.zip
```

GitHub Actions runs these checks and the build on every push to `main` and on pull
requests (`.github/workflows/ci.yml`).

### Releasing

```sh
npm run bump -- 0.9.0                 # system.json + package.json
$EDITOR release-notes/v0.9.0.md       # first line "## Title / タイトル" names the release
git commit -am "Release v0.9.0" && git push
git tag v0.9.0 && git push origin v0.9.0
```

Pushing the tag runs `.github/workflows/release.yml`: it re-runs the checks, builds,
verifies that the tag matches both manifests, and publishes `sinless.zip` and
`system.json` as the GitHub release. To check a release locally without publishing:
`npm run build && DRY_RUN=1 node tools/release.mjs v0.9.0`.

Once the package is listed on foundryvtt.com, put its *Package Release Token* in the
`FOUNDRY_RELEASE_TOKEN` repository secret (`gh secret set FOUNDRY_RELEASE_TOKEN`). The
release workflow then announces each version to the listing through the Package Release
API (`tools/foundry-release.mjs`). Without the secret, that step is skipped.

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
