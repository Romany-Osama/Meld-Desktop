#!/usr/bin/env node
// Source-level UI invariants that must hold until component tests cover them (Phase 1, M1.4).
import { existsSync, readFileSync } from "node:fs";
import { checkScreenSplit } from "./lib/ui-structure.mjs";
import { checkLogoutClearsWebview, checkUiInvariants, readUiSource } from "./lib/ui-invariants.mjs";

const problems = [
  ...checkScreenSplit((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkUiInvariants(readUiSource()),
  ...checkLogoutClearsWebview(readFileSync("src-tauri/src/lib.rs", "utf8")),
];
if (problems.length > 0) {
  for (const problem of problems) console.error(`ui invariants: ${problem}`);
  process.exit(1);
}
console.log("ui invariants: OK");
