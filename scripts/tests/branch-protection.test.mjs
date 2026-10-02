import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUIRED_STATUS_CHECKS,
  checkProtection,
  checkRequiredChecksReport,
  desiredProtection,
  runsOnEveryPullRequest,
  workflowJobs,
} from "../lib/branch-protection.mjs";

const workflows = () => ({
  "ci.yml": readFileSync(".github/workflows/ci.yml", "utf8"),
  "release.yml": readFileSync(".github/workflows/release.yml", "utf8"),
});

/** What GET …/protection returns after PUT desiredProtection(). */
const liveAfterApply = () => {
  const body = desiredProtection();
  return {
    required_status_checks: body.required_status_checks,
    enforce_admins: { enabled: body.enforce_admins },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
};

test("required checks cover lint, format, tests, clippy, fmt, audits and the release dry run (R6-075)", () => {
  assert.deepEqual(
    REQUIRED_STATUS_CHECKS.map(({ context }) => context),
    ["Lint and format", "Dependency audit", "Windows build and tests", "Release dry run"],
  );
  const ci = workflows()["ci.yml"];
  for (const step of [
    "npm ci",
    "npm run lint",
    "npm run format:check",
    "npm test",
    "npm run typecheck",
    "cargo fmt --all -- --check",
    "cargo clippy --all-targets --locked -- -D warnings",
    "cargo test --locked",
    "npm audit --omit=dev",
    "cargo audit",
    "npx tauri build --no-bundle",
  ])
    assert.ok(ci.includes(step), `ci.yml must run ${step}`);
});

test("every required check is reported on every pull request, so none can block merges forever", () => {
  assert.deepEqual(checkRequiredChecksReport(workflows()), []);
});

test("a path-filtered or conditional required check is rejected", () => {
  const filtered = workflows();
  filtered["release.yml"] = filtered["release.yml"].replace(
    "  pull_request:\n",
    "  pull_request:\n    paths:\n      - packaging/**\n",
  );
  assert.ok(checkRequiredChecksReport(filtered).some((problem) => problem.includes("every pull request")));

  const conditional = workflows();
  conditional["release.yml"] = conditional["release.yml"].replace(
    "if: always() && github.event_name != 'push'",
    "if: github.event_name == 'pull_request'",
  );
  assert.ok(checkRequiredChecksReport(conditional).some((problem) => problem.includes("conditional")));

  const renamed = workflows();
  renamed["ci.yml"] = renamed["ci.yml"].replace("name: Dependency audit", "name: Audit");
  assert.ok(checkRequiredChecksReport(renamed).some((problem) => problem.includes('no job named "Dependency audit"')));
});

test("workflow parsing finds job names and conditions; pull_request filters are detected", () => {
  const yml =
    'on:\n  pull_request:\n  push:\n    branches: [main]\njobs:\n  a:\n    name: "Job A"\n    if: x\n    steps:\n      - name: step\n  b:\n    runs-on: ubuntu-latest\n';
  assert.deepEqual(workflowJobs(yml), [
    { id: "a", name: "Job A", if: "x" },
    { id: "b", name: "b", if: null },
  ]);
  assert.equal(runsOnEveryPullRequest(yml), true);
  assert.equal(runsOnEveryPullRequest("on:\n  pull_request:\n    branches: [main]\njobs:\n"), false);
  assert.equal(runsOnEveryPullRequest("on:\n  push:\njobs:\n"), false);
});

test("the protection body requires every check from GitHub Actions, strict, admins included", () => {
  assert.deepEqual(checkProtection(liveAfterApply()), []);
  assert.equal(desiredProtection().required_pull_request_reviews, null, "solo maintainer until S5-097");
});

test("weakened protection is reported", () => {
  const missing = liveAfterApply();
  missing.required_status_checks = { strict: true, checks: [{ context: "Windows build and tests", app_id: 15368 }] };
  assert.equal(checkProtection(missing).length, 3);

  const spoofable = liveAfterApply();
  spoofable.required_status_checks.checks[0] = { context: "Lint and format", app_id: null };
  assert.ok(checkProtection(spoofable)[0].includes("GitHub Actions"));

  const loose = { ...liveAfterApply(), enforce_admins: { enabled: false }, allow_force_pushes: { enabled: true } };
  loose.required_status_checks = { ...loose.required_status_checks, strict: false };
  assert.equal(checkProtection(loose).length, 3);
  assert.deepEqual(checkProtection({}), ["main has no required status checks"]);
});
