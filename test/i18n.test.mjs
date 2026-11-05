import { test } from "node:test";
import assert from "node:assert/strict";
import { checkI18n } from "../tools/check-i18n.mjs";

test("locales are complete and every used key exists", async () => {
  assert.deepEqual(await checkI18n(), []);
});
