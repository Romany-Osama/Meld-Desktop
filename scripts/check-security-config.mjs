#!/usr/bin/env node
// CI guard: CSP not null, asset scope limited to Meld folders, no remote IPC (S5-013, S5-037, TR-C3),
// NSIS-only bundle with embedded WebView2 bootstrapper (S5-070) and no committed release binaries (TR-M12).
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { checkBundleConfig, checkSecurityConfig, checkTrackedFiles } from "./lib/security-config.mjs";

const tauriConf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const capabilities = readdirSync("src-tauri/capabilities")
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(`src-tauri/capabilities/${name}`, "utf8")));
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [
  ...checkSecurityConfig(tauriConf, capabilities),
  ...checkBundleConfig(tauriConf),
  ...checkTrackedFiles(tracked),
];
if (problems.length > 0) {
  for (const problem of problems) console.error(`security config: ${problem}`);
  process.exit(1);
}
console.log(`security config: OK (${capabilities.length} capability file(s) checked)`);
