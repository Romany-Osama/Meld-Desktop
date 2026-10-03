#!/usr/bin/env node
// S5-001: prints, checks (--check) or rewrites (--write) docs/ipc-commands.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readRustSource, registeredCommands } from "./lib/ui-invariants.mjs";
import {
  callersOf,
  checkCapabilityGrants,
  checkCommandModules,
  checkIpcInventory,
  externalWindowLabels,
  ownersOf,
  renderBuildRs,
  renderInventory,
  renderPermissionSet,
} from "./lib/ipc-inventory.mjs";

export const INVENTORY_DOC = "docs/ipc-commands.md";

export function frontendFiles(root = "src") {
  const files = {};
  for (const name of readdirSync(root, { recursive: true }))
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name.replace(/\\/g, "/") !== "ipc/bindings.ts")
      files[name.replace(/\\/g, "/")] = readFileSync(join(root, name), "utf8");
  return files;
}

const read = (path) => (existsSync(path) ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : null);

/** Generated files and what they must contain. */
export function generatedFiles(registered, files) {
  const generated = {
    [INVENTORY_DOC]: renderInventory(registered, files) + "\n",
    "src-tauri/build.rs": renderBuildRs(registered),
  };
  for (const owner of ownersOf(registered))
    generated[`src-tauri/permissions/${owner}.toml`] = renderPermissionSet(owner, registered);
  return generated;
}

export function inventoryState() {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const registered = registeredCommands(lib);
  const files = frontendFiles();
  const generated = generatedFiles(registered, files);
  const problems = [...checkIpcInventory(registered), ...checkCommandModules(lib)];
  // S5-002: a command nothing calls is attack surface only; unregister it or gate it behind a debug feature.
  for (const command of registered)
    if (callersOf(command, files).length === 0)
      problems.push(`${command} has no frontend caller; unregister it or gate it behind a debug feature (S5-002)`);
  for (const [path, content] of Object.entries(generated))
    if (read(path) !== content) problems.push(`${path} is out of date; run node scripts/ipc-inventory.mjs --write`);
  const loginWindows = externalWindowLabels(readRustSource());
  if (loginWindows.length < 2) problems.push(`expected the Google and Spotify login windows, found ${loginWindows}`);
  const capabilities = readdirSync("src-tauri/capabilities")
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(`src-tauri/capabilities/${name}`, "utf8")));
  problems.push(...checkCapabilityGrants(capabilities, registered, loginWindows));
  return { generated, problems };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/ipc-inventory.mjs")) {
  const { generated, problems } = inventoryState();
  if (process.argv.includes("--write")) {
    for (const [path, content] of Object.entries(generated)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      console.log(`wrote ${path}`);
    }
  } else if (process.argv.includes("--check")) {
    for (const problem of problems) console.error(`ipc inventory: ${problem}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else process.stdout.write(generated[INVENTORY_DOC]);
}
