#!/usr/bin/env node
// Source-level UI invariants that must hold until component tests cover them (Phase 1, M1.4).
import { readFileSync } from "node:fs";
import { checkLogoutClearsWebview, checkUiInvariants } from "./lib/ui-invariants.mjs";

const problems = [...checkUiInvariants(readFileSync("src/App.tsx", "utf8")), ...checkLogoutClearsWebview(readFileSync("src-tauri/src/lib.rs", "utf8"))];
if (problems.length > 0) {
  for (const problem of problems) console.error(`ui invariants: ${problem}`);
  process.exit(1);
}
console.log("ui invariants: OK");
