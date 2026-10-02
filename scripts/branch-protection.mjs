#!/usr/bin/env node
// Check (default) or apply (--apply) the required status checks on main. Needs an admin token in GH_TOKEN.
//   GH_TOKEN=… node scripts/branch-protection.mjs [--apply] [owner/repo]
import { checkProtection, desiredProtection } from "./lib/branch-protection.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const repo = args.find((arg) => !arg.startsWith("--")) ?? "Romany-Osama/Meld-Desktop";
const token = process.env.GH_TOKEN;
if (!token) {
  console.error("branch protection: set GH_TOKEN to a token with admin rights on the repository");
  process.exit(2);
}
const url = `https://api.github.com/repos/${repo}/branches/main/protection`;
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };

if (apply) {
  const response = await fetch(url, { method: "PUT", headers, body: JSON.stringify(desiredProtection()) });
  if (!response.ok) {
    console.error(`branch protection: PUT failed with HTTP ${response.status}`);
    process.exit(1);
  }
}
const response = await fetch(url, { headers });
if (!response.ok) {
  console.error(`branch protection: GET failed with HTTP ${response.status}`);
  process.exit(1);
}
const problems = checkProtection(await response.json());
for (const problem of problems) console.error(`branch protection: ${problem}`);
if (problems.length > 0) process.exit(1);
console.log(`branch protection: OK (${repo} main)`);
