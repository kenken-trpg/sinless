#!/usr/bin/env node
// Announce a release to the Foundry VTT package listing (Package Release API).
//   FOUNDRY_RELEASE_TOKEN=fvttp_... node tools/foundry-release.mjs v0.9.0
// Skips (exit 0) when no token is configured. FOUNDRY_DRY_RUN=1 asks the API to
// validate the request without publishing. The token is a secret: keep it in the
// FOUNDRY_RELEASE_TOKEN repository secret, never in the repository.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://api.foundryvtt.com/_api/packages/release_version/";
const REPO = "https://github.com/kenken-trpg/sinless";

/**
 * Request body for the Package Release API. The manifest must point at this
 * exact version, not at the "latest" manifest.
 */
export function releasePayload(manifest, tag, dryRun = false) {
  const body = {
    id: manifest.id,
    release: {
      version: manifest.version,
      manifest: `${REPO}/releases/download/${tag}/system.json`,
      notes: `${REPO}/releases/tag/${tag}`,
      compatibility: {
        minimum: String(manifest.compatibility?.minimum ?? ""),
        verified: String(manifest.compatibility?.verified ?? ""),
        maximum: String(manifest.compatibility?.maximum ?? "")
      }
    }
  };
  if (dryRun) body["dry-run"] = true;
  return body;
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  const token = process.env.FOUNDRY_RELEASE_TOKEN;
  if (!token) {
    console.log("foundry-release: FOUNDRY_RELEASE_TOKEN is not set, skipping the Foundry package listing.");
    return;
  }
  const manifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
  if (tag !== `v${manifest.version}`) throw new Error(`tag ${tag} does not match system.json ${manifest.version}`);
  const body = releasePayload(manifest, tag, !!process.env.FOUNDRY_DRY_RUN);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  console.log(`foundry-release: HTTP ${response.status} ${text}`);
  if (!response.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(`foundry-release: ${err.message}`); process.exit(1); });
}
