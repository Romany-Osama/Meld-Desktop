#!/usr/bin/env node
// S5-001: prints, checks (--check) or rewrites (--write) docs/ipc-commands.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { registeredCommands } from "./lib/ui-invariants.mjs";
import { callersOf, checkCommandModules, checkIpcInventory, renderInventory } from "./lib/ipc-inventory.mjs";

export const INVENTORY_DOC = "docs/ipc-commands.md";

export function frontendFiles(root = "src") {
  const files = {};
  for (const name of readdirSync(root, { recursive: true }))
    if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      files[name.replace(/\\/g, "/")] = readFileSync(join(root, name), "utf8");
  return files;
}

export function inventoryState() {
  const lib = readFileSync("src-tauri/src/lib.rs", "utf8");
  const registered = registeredCommands(lib);
  const files = frontendFiles();
  const doc = renderInventory(registered, files) + "\n";
  const problems = [...checkIpcInventory(registered), ...checkCommandModules(lib)];
  // S5-002: a command nothing calls is attack surface only; unregister it or gate it behind a debug feature.
  for (const command of registered)
    if (callersOf(command, files).length === 0)
      problems.push(`${command} has no frontend caller; unregister it or gate it behind a debug feature (S5-002)`);
  const current = existsSync(INVENTORY_DOC) ? readFileSync(INVENTORY_DOC, "utf8").replace(/\r\n/g, "\n") : null;
  if (current !== doc) problems.push(`${INVENTORY_DOC} is out of date; run node scripts/ipc-inventory.mjs --write`);
  return { doc, problems };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/ipc-inventory.mjs")) {
  const { doc, problems } = inventoryState();
  if (process.argv.includes("--write")) {
    writeFileSync(INVENTORY_DOC, doc);
    console.log(`wrote ${INVENTORY_DOC}`);
  } else if (process.argv.includes("--check")) {
    for (const problem of problems) console.error(`ipc inventory: ${problem}`);
    process.exit(problems.length > 0 ? 1 : 0);
  } else process.stdout.write(doc);
}
