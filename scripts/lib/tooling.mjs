// TR-L9 / R6-075: lint, format and line-ending rules must stay configured and enforced in CI.
export const REQUIRED_NPM_SCRIPTS = { lint: "eslint", "format:check": "prettier --check" };
export const REQUIRED_CI_STEPS = ["npm run lint", "npm run format:check", "cargo fmt --all -- --check"];
export const REQUIRED_GITATTRIBUTES = ["* text=auto eol=lf", "*.ps1 text eol=crlf"];

export function checkTooling({ packageJson, ciYml, gitattributes }) {
  const problems = [];
  for (const [name, command] of Object.entries(REQUIRED_NPM_SCRIPTS)) {
    const script = packageJson.scripts?.[name];
    if (!script?.includes(command)) problems.push(`package.json script "${name}" must run ${command}`);
  }
  for (const step of REQUIRED_CI_STEPS) if (!ciYml.includes(step)) problems.push(`ci.yml must run "${step}"`);
  const rules = gitattributes.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, " "));
  for (const rule of REQUIRED_GITATTRIBUTES) if (!rules.includes(rule)) problems.push(`.gitattributes must contain "${rule}"`);
  return problems;
}

/** Paths that `git ls-files --eol` reports as committed with CRLF or mixed endings (.ps1 is CRLF by rule). */
export function crlfIndexEntries(lsFilesEol) {
  return lsFilesEol
    .split("\n")
    .filter((line) => line.startsWith("i/crlf") || line.startsWith("i/mixed"))
    .map((line) => line.split("\t").pop())
    .filter((path) => !path.endsWith(".ps1"));
}
