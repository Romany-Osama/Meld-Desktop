#!/usr/bin/env node
// TR-L9: lint/format scripts, CI steps and line-ending rules are present; tracked text files use LF.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkTooling, crlfIndexEntries } from "./lib/tooling.mjs";

const problems = checkTooling({
  packageJson: JSON.parse(readFileSync("package.json", "utf8")),
  ciYml: readFileSync(".github/workflows/ci.yml", "utf8"),
  gitattributes: readFileSync(".gitattributes", "utf8"),
});
// `git ls-files --eol` reports the index (committed) line endings, independent of the checkout's autocrlf.
const crlf = crlfIndexEntries(execFileSync("git", ["ls-files", "--eol"], { encoding: "utf8" }));
for (const path of crlf) problems.push(`${path} is committed with CRLF line endings`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`tooling: ${problem}`);
  process.exit(1);
}
console.log("tooling: OK");
