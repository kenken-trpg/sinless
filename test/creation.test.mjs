import { test } from "node:test";
import assert from "node:assert/strict";
import { creationReport, creationSpending } from "../module/helpers/creation.mjs";

const base = {
  priorities: { heritage: "E", magic: "D", attributes: "A", skills: "B", resources: "C" },
  attributes: { str: 10, bod: 10, rea: 10, int: 7, wil: 8, cha: 4 },
  attributeMax: { str: 20, bod: 20, rea: 20, int: 20, wil: 20, cha: 20 },
  skills: { firearms: 6, athletics: 4 },
  rituals: [],
  knowledge: [4, 2],
  etiquettes: { street: 4, criminal: 2 },
  int: 7, cha: 4,
  heritage: "human", talent: "hedge",
  spent: 100000
};
const budget = (r, key) => r.budgets.find(b => b.key === key);

test("a legal build passes (p.44)", () => {
  const r = creationReport(base);
  // Attributes: 9+9+9+6+7+3 = 43 of 46.
  assert.equal(budget(r, "attributes").spent, 43);
  assert.equal(budget(r, "attributes").budget, 46);
  assert.equal(budget(r, "skills").spent, 10);
  assert.equal(budget(r, "skills").budget, 36);
  assert.equal(budget(r, "knowledge").budget, 14);
  assert.equal(budget(r, "etiquettes").budget, 8);
  assert.equal(budget(r, "resources").budget, 250000);
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
});

test("attribute costs rise above 10 and 15 (p.45)", () => {
  const r = creationReport({ ...base, attributes: { ...base.attributes, str: 16 } });
  // str 16 = 9 + 5×2 + 3 = 22 instead of 9.
  assert.equal(budget(r, "attributes").spent, 43 - 9 + 22);
  assert.ok(r.issues.some(i => i.code === "overBudget" && i.data.key === "attributes"));
});

test("uplifted dog reduces the attribute points (p.48)", () => {
  const r = creationReport({ ...base, attributeAdjust: -1 });
  assert.equal(budget(r, "attributes").budget, 45);
});

test("priority levels are unique and complete", () => {
  const r = creationReport({ ...base, priorities: { ...base.priorities, skills: "A", resources: "" } });
  assert.deepEqual(r.issues.map(i => i.code).sort(), ["priorityDuplicate", "priorityMissing"]);
});

test("heritage and magic need high enough priorities (p.44)", () => {
  const r = creationReport({ ...base, heritage: "green", talent: "archmage" });
  const codes = r.issues.map(i => i.code);
  assert.ok(codes.includes("heritagePriority"));
  assert.ok(codes.includes("talentPriority"));
  const ok = creationReport({ ...base, heritage: "synthetic", priorities: { ...base.priorities, heritage: "D", magic: "E" } });
  assert.ok(!ok.issues.some(i => i.code === "heritagePriority"));
});

test("skills cap at 6, martial arts costs 2 per rank, rituals count (pp.46, 67, 69)", () => {
  const r = creationReport({ ...base, skills: { firearms: 7, martialArts: 3 }, rituals: [2] });
  assert.equal(budget(r, "skills").spent, 7 + 6 + 2);
  assert.ok(r.issues.some(i => i.code === "skillHigh" && i.data.key === "firearms"));
});

test("knowledge and etiquette points follow INT and CHA (p.45)", () => {
  const r = creationReport({ ...base, etiquettes: { street: 6, criminal: 3 } });
  assert.ok(r.issues.some(i => i.code === "overBudget" && i.data.key === "etiquettes" && i.data.over === 1));
});

test("spending adds gear, non-free assets and prepaid lifestyle (p.46)", () => {
  const spent = creationSpending([
    { type: "weapon", cost: 1000, quantity: 2 },
    { type: "implant", cost: 5000 },
    { type: "asset", hireCost: 3000, free: true },
    { type: "asset", hireCost: 4000, free: false }
  ], "middle", 3);
  assert.equal(spent, 2000 + 5000 + 4000 + 2400);
});
