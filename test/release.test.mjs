import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { releasePayload } from "../tools/foundry-release.mjs";

test("Foundry release payload points at the version-specific manifest", () => {
  const manifest = { id: "sinless", version: "0.9.0", compatibility: { minimum: "13", verified: "14" } };
  const body = releasePayload(manifest, "v0.9.0");
  assert.deepEqual(body, {
    id: "sinless",
    release: {
      version: "0.9.0",
      manifest: "https://github.com/kenken-trpg/sinless/releases/download/v0.9.0/system.json",
      notes: "https://github.com/kenken-trpg/sinless/releases/tag/v0.9.0",
      compatibility: { minimum: "13", verified: "14", maximum: "" }
    }
  });
  assert.equal(releasePayload(manifest, "v0.9.0", true)["dry-run"], true);
});

test("system.json carries the listing metadata", () => {
  const m = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));
  for (const key of ["id", "title", "description", "version", "url", "manifest", "download", "license", "bugs", "readme", "changelog"]) {
    assert.ok(m[key], `missing ${key}`);
  }
  assert.match(m.manifest, /releases\/latest\/download\/system\.json$/);
});
