// Assertions for the feature scripts that batch.mjs runs. The scripts in ../original only print
// what they see; these checks read that output and fail the batch when a value that the fixtures
// fix (or a relation between values) changes. Dice results are random, so only values that do not
// depend on them are checked, plus relations such as "damage taken = drain − channelled successes".
// Card and dialog text is localized, so text is only searched for numbers.

/** First JSON value starting at or after index i in s; returns [value, endIndex] or null. */
function jsonAt(s, i) {
  const start = s.slice(i).search(/[[{]/);
  if (start < 0) return null;
  const from = i + start;
  let depth = 0, inString = false;
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (inString) { if (c === "\\") j++; else if (c === "\"") inString = false; continue; }
    if (c === "\"") inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      if (--depth === 0) {
        try { return [JSON.parse(s.slice(from, j + 1)), j + 1]; } catch { return jsonAt(s, from + 1); }
      }
    }
  }
  return null;
}

class Output {
  constructor(lines) { this.lines = lines; }
  /** The rest of the first line that starts with the label. */
  text(label) {
    const line = this.lines.find(l => l === label || l.startsWith(label + " "));
    if (line === undefined) throw new Error(`no output line "${label}"`);
    return line.slice(label.length).trim();
  }
  /** Every JSON value on the labelled line, in order. */
  jsons(label) {
    const s = this.text(label), out = [];
    for (let r = jsonAt(s, 0); r; r = jsonAt(s, r[1])) out.push(r[0]);
    return out;
  }
  json(label) { const [v] = this.jsons(label); if (v === undefined) throw new Error(`no JSON on "${label}"`); return v; }
  last(label) { const v = this.jsons(label).at(-1); if (v === undefined) throw new Error(`no JSON on "${label}"`); return v; }
  /** Total dice from a test dialog preview ("… = N dice"). */
  dice(label) { const m = this.text(label).match(/=\s*(\d+)/); if (!m) throw new Error(`no dice total on "${label}"`); return Number(m[1]); }
  /** First integer after the label (optionally after a marker). */
  num(label, after = "") {
    const s = this.text(label), i = after ? s.indexOf(after) : 0;
    const m = i < 0 ? null : s.slice(i + after.length).match(/-?\d+/);
    if (!m) throw new Error(`no number on "${label}"${after ? ` after "${after}"` : ""}`);
    return Number(m[0]);
  }
  match(re) { const line = this.lines.find(l => re.test(l)); if (!line) throw new Error(`no output line matching ${re}`); return line.match(re); }
}

const CHECKS = {
  shoot: (o, t) => {
    t.eq("setup", o.json("setup"), { str: 12, cap: 2, penalty: 0 });
    const s1 = o.json("shot1"), s2 = o.json("shot2"), s3 = o.json("shot3");
    t.eq("burst: dice", [s1.card.plan.total, s1.card.plan.bonusDice], [10, 3]);
    t.eq("burst: spec, defend button, primed", [s1.spec, s1.card.defend, s1.state.primed, s1.state.recoil], [true, true, true, 0]);
    t.eq("dual wield + extra target: dice", s2.card.plan.total, 3);
    t.eq("second shot gains recoil", [s2.card.recoil.gained, s2.state.recoil], [1, 1]);
    t.eq("third shot: dice, recoil, not jammed", [s3.card.plan.total, s3.state.recoil, s3.card.recoil.jammed], [7, 1, false]);
    const st = o.json("after stabilize");
    t.eq("stabilize clears recoil", [st.recoil, st.recoilPrimed], [0, false]);
    t.ok("skill test: specialization unchecked", o.text("skill preview").endsWith("spec checked: false"));
    t.eq("skill test: dice, off-spec note", [o.json("skill card").plan.total, o.json("skill card").notes.length], [3, 1]);
    t.eq("npc weapon", o.json("npc weapon"), { name: "SMOKE Pistol", attackDice: 8 });
    t.eq("npc in darkness: 8 − 4 dice", o.dice("npc preview"), 4);
    t.ok("npc: no recoil section", o.text("npc preview").endsWith("recoil shown: false"));
  },
  cond: (o, t) => {
    const s = o.json("setup");
    t.eq("setup", [s.max, s.penalty, s.tests], [10, 4, [{ track: "physical", needed: 5 }]]);
    t.eq("overload dialog: brawn − penalty", o.dice("overload dialog"), s.brawn - s.penalty);
    t.eq("failed overload: unconscious, bleeding out in 3", o.last("after apply"), { statuses: ["unconscious", "bleeding"], bleedOut: 3 });
    const c = o.json("combat");
    t.eq("new round counts bleed-out down", [c.before, c.after], [3, 2]);
    t.ok("guard gets a whispered overload prompt", c.prompt && c.whisper === 1, c);
    t.eq("guard prompt threshold", o.num("guard dialog title", "threshold"), 2);
    const d = o.json("death");
    t.ok("bleed-out reaches death", d.statuses.includes("dead") && d.defeated && d.bleedOut === null, d);
    t.eq("damage past the whole track kills", o.json("killed").statuses, ["dead"]);
    t.eq("permanent injury threshold", o.num("injury dialog", "threshold"), 5);
    const [before, after] = o.jsons("attr max before");
    const sum = a => Object.values(a).reduce((x, y) => x + y, 0);
    t.eq("organ damage lowers one attribute maximum by 1", sum(before) - sum(after), 1);
  },
  adv: (o, t) => {
    const a = o.json("after award");
    t.eq("award 14 on top of 8", [a.earned, a.unspent, a.hist], [22, 14, 1]);
    t.ok("firearms 4 → 5 costs 4", o.json("options").some(x => x.startsWith("skill:firearms=") && x.endsWith("4 → 5 (4)")));
    const b = o.json("after buy");
    t.eq("buy firearms", [b.unspent, b.firearms, b.hist], [10, 5, 2]);
    t.eq("first boon choices", o.json("boon1 choices"), ["windfall", "asset", "mastery(disabled)"]);
    t.eq("first boon", o.json("after boon1").boons, 1);
    t.eq("second boon choices", o.json("boon2 choices").length, 6);
    const b2 = o.json("after boon2");
    t.eq("resilience boon", [b2.boons, b2.res.finesse], [2, 1]);
    const plan = o.jsons("after test")[1];
    t.eq("resilience adds a kismet die", [plan.kismetDice, plan.total], [1, 9]);
    const u = o.json("after undo");
    t.eq("undo the resilience boon", [u.boons, u.res.finesse, u.hist], [1, 0, 3]);
  },
  op: (o, t) => {
    const pre = o.json("pre");
    t.eq("operation tool and brand", [pre.tool, pre.brand], [true, "SMOKE Black Adder"]);
    t.eq("typed responses saved", o.json("responses"), [{ label: "Routine patrol", threshold: 10 }, { label: "Deploy dog drones", threshold: 25 }]);
    t.eq("alert 26 triggers one GM response card", o.json("alert 26 msgs").length, 1);
    const [, from, to] = o.match(/^alert (\d+) -> (\d+)/).map(Number);
    t.ok("shadow test raises alert by 0–2", from === 26 && to - from >= 0 && to - from <= 2, { from, to });
    t.eq("alert 51 sets heat 2", o.num("alert 51", "] heat"), 2);
    const htr = o.num("heat 4", "] htr");
    t.ok("heat 4 schedules HTR in 2d6 rounds", htr >= 2 && htr <= 12, htr);
    t.eq("heat 4 posts two cards", o.json("heat 4").length, 2);
    t.eq("fallout card", o.json("fallout").length, 1);
    const after = o.json("after");
    t.eq("ending resets alert, heat and HTR", [after.alert, after.heat, after.op.htr], [0, 0, null]);
    t.eq("fallout adds sector heat +2", after.brandHeat, pre.brandHeat + 2);
  },
  life: (o, t) => {
    t.eq("sector turn pays lifestyles", o.json("after turn"), [["SMOKE D Ben", 0, 1000], ["SMOKE C Rookie", 0, 500], ["SMOKE Member", 0, 0]]);
    t.ok("pay from the sheet", /800/.test(o.text("pay:")) && /200/.test(o.text("pay:")));
    t.eq("buy 2 months: months, zuzu", o.last("buy:"), [2, 400]);
  },
  chase: (o, t) => {
    const s = o.json("started");
    t.eq("start: two paths of 6, two pursuers", [s.active, s.counts, s.enemies], [true, [6, 6], ["Chase Pursuer:close", "SMOKE V Roto:close(fly)"]]);
    const f = o.json("after 2 flips");
    t.eq("two flips: turn 3, path A drew 2", [f.turn, f.counts], [3, [4, 6]]);
    t.eq("five chase actions on the vehicle sheet", o.json("chase buttons").length, 5);
    t.eq("switch threshold", o.num("switch threshold"), 2);
    t.eq("switch makes path B primary", o.json("after switch").primary, 1);
    t.eq("ground pursuer falls out, flyer stays", o.json("after fall back").enemies, ["Chase Pursuer:out", "SMOKE V Roto:close(fly)"]);
    t.eq("wrecking the last pursuer ends the chase", o.json("wreck roto").ended, "evaded");
  },
  digital: (o, t) => {
    t.eq("setup", o.json("setup"), { benHardening: 4, hot: true, beeEntity: true, beeTrack: "0/6", sensor: 2 });
    t.eq("de-rez crashes the BEE", o.last("derez result:"), { cohesion: "6/6", hardening: 3, defeated: true });
    t.eq("acid burn strips hardening", o.json("after acid").hardening, 0);
    const ben = o.json("ben after sting");
    t.ok("sting deals physical damage to the hot-seated decker", ben.physical.value > 0 && ben.stun.value === 0, ben);
    const inf = o.num("after shrink");
    // 2 m per success on 4 dice, so 0 successes (influence stays 10) is a valid roll.
    t.ok("shrink: influence 10 m − 2 m per success", inf >= 2 && inf <= 10 && (10 - inf) % 2 === 0, inf);
    t.eq("electric strike: BEE stays crashed", o.json("after strike").defeated, true);
    t.eq("sensor dodge doubled (2 × 2)", o.dice("bullet vs sensor: armor"), 4);
    t.ok("npc decker brute-force card", o.text("npc hack card:").includes("SMOKE NPC Decker"));
  },
  magic: (o, t) => {
    t.eq("setup: zoetic and old spell resistance", o.json("setup"), { z0: 5.5, zArch: 4.5, zAmp: 5, zoeticValue: 0, oldResist: "resolve", oldOptional: true });
    const c = o.json("cast card");
    t.eq("powerbolt at force 4", [c.spell.force, c.spell.drain, c.spell.lethal, c.spell.resistPool, c.dmg], [4, 5, true, "brawn", 4]);
    t.ok("drain dialog: 5, lethal, soak disabled", o.num("drain dialog:") === 5 && /lethal: true \| soak disabled: true/.test(o.text("drain dialog:")));
    const field = o.num("channel:", "field:");
    const d = o.json("after drain");
    t.eq("damage taken = drain − channelled successes", [d.applied, d.phys], [true, Math.max(0, 5 - field)]);
    t.ok("spirit invocation drain is lethal", o.num("invoke drain:") === 3 && /lethal: true/.test(o.text("invoke drain:")));
  },
  magic9: (o, t) => {
    t.eq("ley line", o.json("setup").ley, { kind: "on", force: 2 });
    t.eq("hold: 4 + 6 bonus dice", o.dice("hold dialog:"), 10);
    const [fx] = o.json("guard effects");
    // Successes needed to shake it off depend on the caster's roll; the dialog preview shows the same number.
    const needed = o.num("sustain preview:");
    t.eq("sustained spell on the guard", fx && { name: fx.name, ...fx.s }, { name: "SMOKE M Hold", needed, accumulated: 0, pool: "resolve", force: 4, caster: "SMOKE D Ben" });
    t.ok("needs at least 1 success to shake off", needed >= 1, needed);
    t.eq("resist dialog: resolve pool", o.dice("resist dialog:"), 6);
    const r = o.jsons("after resist")[0];
    t.ok("resisting accumulates or ends the spell", r.length === 0 || (r[0].s.needed === needed && r[0].s.accumulated < needed), r);
    t.eq("summon: 4 + 8 bonus dice", o.dice("summon dialog:"), 12);
    const sp = o.json("spirit token");
    t.ok("spirit token placed with force 3", sp.name.startsWith("SMOKE Spark Spirit") && sp.force === 3 && [1, -1].includes(sp.disp), sp);
    t.eq("spirit dodge vs physical: 2 + force 3", o.dice("spirit dodge vs physical:"), 5);
  }
};

/** Run the checks for one script over its output lines. */
export function checkOutput(name, lines) {
  const checks = CHECKS[name];
  if (!checks) return { passed: [], failed: [{ name: "checks", error: `no checks for ${name}` }] };
  const passed = [], failed = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const t = {
    eq: (label, actual, expected) => (same(actual, expected) ? passed.push(label) : failed.push({ name: label, actual, expected })),
    ok: (label, cond, actual) => (cond ? passed.push(label) : failed.push({ name: label, actual }))
  };
  // A missing output line throws and stops this script's remaining checks; it is recorded as a failure.
  try { checks(new Output(lines), t); } catch (e) { failed.push({ name: "output", error: e.message }); }
  return { passed, failed };
}

export const CHECKED_SCRIPTS = Object.keys(CHECKS);
