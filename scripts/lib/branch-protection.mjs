// R6-075 / TR-H9: the status checks main requires before a merge, and the branch-protection body that enforces them.
export const GITHUB_ACTIONS_APP_ID = 15368;
export const REQUIRED_STATUS_CHECKS = [
  { context: "Lint and format", workflow: "ci.yml" }, // check:* invariants, ESLint, Prettier, cargo fmt
  { context: "Dependency audit", workflow: "ci.yml" }, // npm audit --omit=dev, cargo audit
  { context: "Windows build and tests", workflow: "ci.yml" }, // tsc, Vitest, script tests, clippy, cargo test, tauri build
  { context: "Release dry run", workflow: "release.yml" }, // release build + Windows smoke when the pipeline changes
];

/** Body for PUT /repos/{owner}/{repo}/branches/main/protection. Admins are held to the same checks. */
export function desiredProtection() {
  return {
    required_status_checks: {
      strict: true,
      checks: REQUIRED_STATUS_CHECKS.map(({ context }) => ({ context, app_id: GITHUB_ACTIONS_APP_ID })),
    },
    enforce_admins: true,
    // A review requirement needs a second maintainer (S5-097); a solo maintainer cannot approve their own PRs.
    required_pull_request_reviews: null,
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  };
}

/** Differences between the live protection (GET …/protection) and desiredProtection(). */
export function checkProtection(actual) {
  const problems = [];
  const checks = actual?.required_status_checks;
  if (!checks) return ["main has no required status checks"];
  if (!checks.strict) problems.push("required checks must be strict (branch up to date before merging)");
  const present = new Map((checks.checks ?? []).map((check) => [check.context, check.app_id]));
  for (const { context } of REQUIRED_STATUS_CHECKS) {
    if (!present.has(context)) problems.push(`missing required check "${context}"`);
    else if (present.get(context) !== GITHUB_ACTIONS_APP_ID)
      problems.push(`"${context}" must come from GitHub Actions`);
  }
  if (!actual.enforce_admins?.enabled) problems.push("admins must not bypass the required checks");
  if (actual.allow_force_pushes?.enabled) problems.push("force pushes to main must be blocked");
  if (actual.allow_deletions?.enabled) problems.push("deleting main must be blocked");
  return problems;
}

/**
 * Jobs of a GitHub Actions workflow as { id, name, if } from its text (top-level `jobs:` block, 2-space job keys,
 * 4-space job properties). Enough for our own workflows; not a general YAML parser.
 */
export function workflowJobs(yml) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((line) => line === "jobs:");
  if (start < 0) return [];
  const jobs = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const job = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (job) jobs.push({ id: job[1], name: job[1], if: null });
    const prop = line.match(/^ {4}(name|if):\s*(.+?)\s*$/);
    if (prop && jobs.length) jobs.at(-1)[prop[1]] = prop[2].replace(/^["']|["']$/g, "");
  }
  return jobs;
}

/** True when the workflow's `on:` block has a pull_request trigger without path or branch filters. */
export function runsOnEveryPullRequest(yml) {
  const on = yml.match(/^on:\n((?: .*\n|\n)*)/m)?.[1] ?? "";
  const pr = on.match(/^ {2}pull_request:(.*)\n((?: {4}.*\n)*)/m);
  if (!pr) return false;
  return !/(paths|paths-ignore|branches|branches-ignore):/.test(pr[1] + pr[2]);
}

/** Each required check must be a job that reports on every pull request, or it would block merges forever. */
export function checkRequiredChecksReport(workflows) {
  const problems = [];
  for (const { context, workflow } of REQUIRED_STATUS_CHECKS) {
    const yml = workflows[workflow];
    if (yml === undefined) {
      problems.push(`${workflow} not found for "${context}"`);
      continue;
    }
    if (!runsOnEveryPullRequest(yml)) problems.push(`${workflow} must run on every pull request ("${context}")`);
    const job = workflowJobs(yml).find((candidate) => candidate.name === context);
    if (!job) problems.push(`${workflow} has no job named "${context}"`);
    else if (job.if && !job.if.startsWith("always()")) problems.push(`"${context}" is conditional (${job.if})`);
  }
  return problems;
}
