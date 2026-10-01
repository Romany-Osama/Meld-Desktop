#!/usr/bin/env node
// Fails when package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json disagree, or when a release
// tag (argument or GITHUB_REF on a tag build) does not match. Usage: node scripts/check-versions.mjs [vX.Y.Z]
import { checkVersions, readRepo } from "./lib/versions.mjs";

const ref = process.argv[2] ?? (process.env.GITHUB_REF?.startsWith("refs/tags/") ? process.env.GITHUB_REF : undefined);
const repo = readRepo();
const problems = checkVersions({ ...repo, tag: ref });
if (problems.length > 0) {
  for (const problem of problems) console.error(`version check: ${problem}`);
  process.exit(1);
}
console.log(`version check: ${repo.packageJson.version} is consistent${ref ? ` with ${ref}` : ""}`);
