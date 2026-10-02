#!/usr/bin/env node
// Source-level UI invariants that must hold until component tests cover them (Phase 1, M1.4).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkAppComposition,
  checkCapabilities,
  checkDestructivePolicy,
  checkErrorBoundaries,
  checkEs2020Lib,
  checkOccurrenceKeys,
  checkFeatureModules,
  checkScreenSplit,
  checkServerState,
} from "./lib/ui-structure.mjs";
import { checkLogoutClearsWebview, checkUiInvariants, readUiSource } from "./lib/ui-invariants.mjs";

const problems = [
  ...checkScreenSplit((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkFeatureModules((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkServerState((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkCapabilities((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkDestructivePolicy((path) => (existsSync(path) ? readFileSync(path, "utf8") : null), readUiSource()),
  ...checkErrorBoundaries((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkOccurrenceKeys(readUiSource()),
  ...checkEs2020Lib(
    readdirSync("src", { recursive: true })
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => readFileSync(join("src", name), "utf8"))
      .join("\n"),
  ),
  ...checkAppComposition((path) => (existsSync(path) ? readFileSync(path, "utf8") : null)),
  ...checkUiInvariants(readUiSource()),
  ...checkLogoutClearsWebview(readFileSync("src-tauri/src/lib.rs", "utf8")),
];
if (problems.length > 0) {
  for (const problem of problems) console.error(`ui invariants: ${problem}`);
  process.exit(1);
}
console.log("ui invariants: OK");
