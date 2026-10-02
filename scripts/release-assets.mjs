#!/usr/bin/env node
// Release asset generation. Subcommands (run from the repo root):
//   notes <version> <out>                       release notes from CHANGELOG.md
//   check-tag <tag>                             tag == v<package.json version>
//   metadata <out-dir>                          sbom.cdx.json + THIRD-PARTY-NOTICES.txt (Windows target)
//   latest <version> <base-url> <setup> <setup.sig> <portable> <portable.sig> <notes> <out>
//   sums <out> <file>...                        SHA256SUMS.txt
//   touches-pipeline <file-list>                "true"/"false": does a PR's changed-file list need the dry run
//   dry-run-verdict                             gate result from CHANGES, PIPELINE, BUILD, SMOKE env values
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  changelogSection,
  checkTag,
  cycloneDx,
  dryRunVerdict,
  latestJson,
  sha256SumsLine,
  thirdPartyNotices,
  touchesReleasePipeline,
} from "./lib/release.mjs";

const [command, ...args] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const LICENSE_FILE = /^(LICEN[CS]E|COPYING|NOTICE|UNLICENSE)([-._].*)?$/i;
const licenseTexts = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => LICENSE_FILE.test(name))
        .sort()
        .map((name) => `--- ${name} ---\n${readFileSync(join(dir, name), "utf8")}`)
    : [];

function rustCrates() {
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--locked",
        "--format-version",
        "1",
        "--filter-platform",
        "x86_64-pc-windows-msvc",
        "--manifest-path",
        "src-tauri/Cargo.toml",
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    ),
  );
  const used = new Set(metadata.resolve.nodes.map((node) => node.id));
  return metadata.packages
    .filter((crate) => used.has(crate.id) && crate.source)
    .map((crate) => ({
      ecosystem: "cargo",
      name: crate.name,
      version: crate.version,
      license: crate.license,
      repository: crate.repository,
      licenseTexts: licenseTexts(dirname(crate.manifest_path)),
    }));
}

function npmRuntimePackages() {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  return Object.entries(lock.packages)
    .filter(([path, info]) => path.startsWith("node_modules/") && !info.dev && !info.optional)
    .map(([path, info]) => ({
      ecosystem: "npm",
      name: path.slice(path.lastIndexOf("node_modules/") + 13),
      version: info.version,
      license: info.license,
      repository: undefined,
      licenseTexts: licenseTexts(path),
    }));
}

function vendoredPackages() {
  const list = JSON.parse(readFileSync("src-tauri/vendor/vendored.json", "utf8"));
  return list.map((pkg) => ({
    ...pkg,
    licenseTexts: pkg.licenseFiles.map(
      (file) => `--- ${file} ---\n${readFileSync(join("src-tauri/vendor", file), "utf8")}`,
    ),
  }));
}

switch (command) {
  case "touches-pipeline": {
    const files = readFileSync(args[0], "utf8").split(/\r?\n/).filter(Boolean);
    console.log(String(touchesReleasePipeline(files)));
    break;
  }
  case "dry-run-verdict": {
    const env = process.env;
    const verdict = dryRunVerdict({
      changes: env.CHANGES,
      pipelineTouched: env.PIPELINE === "true",
      build: env.BUILD,
      smoke: env.SMOKE,
    });
    console.log(`release dry run: ${verdict.reason}`);
    if (!verdict.ok) process.exit(1);
    break;
  }
  case "notes": {
    writeFileSync(args[1], `${changelogSection(readFileSync("CHANGELOG.md", "utf8"), args[0])}\n`);
    break;
  }
  case "check-tag": {
    const problems = checkTag(args[0], pkg.version);
    if (problems.length) {
      console.error(problems.join("\n"));
      process.exit(1);
    }
    console.log(`tag ${args[0]} matches package.json`);
    break;
  }
  case "metadata": {
    const crates = rustCrates();
    const npmPackages = npmRuntimePackages();
    const vendored = vendoredPackages();
    writeFileSync(
      join(args[0], "sbom.cdx.json"),
      `${JSON.stringify(cycloneDx({ appName: "Meld Desktop", appVersion: pkg.version, crates, npmPackages, vendored, timestamp: new Date().toISOString() }), null, 2)}\n`,
    );
    writeFileSync(
      join(args[0], "THIRD-PARTY-NOTICES.txt"),
      thirdPartyNotices({ appName: "Meld Desktop", packages: [...crates, ...npmPackages, ...vendored] }),
    );
    console.log(`metadata: ${crates.length} crates, ${npmPackages.length} npm packages, ${vendored.length} vendored`);
    break;
  }
  case "latest": {
    const [version, baseUrl, setup, setupSig, portable, portableSig, notesFile, out] = args;
    const manifest = latestJson({
      version,
      notes: readFileSync(notesFile, "utf8").trim(),
      pubDate: new Date().toISOString(),
      setupUrl: `${baseUrl}/${encodeURIComponent(basename(setup))}`,
      setupSignature: readFileSync(setupSig, "utf8"),
      portableUrl: `${baseUrl}/${encodeURIComponent(basename(portable))}`,
      portableSignature: readFileSync(portableSig, "utf8"),
    });
    writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
    break;
  }
  case "sums": {
    const [out, ...files] = args;
    writeFileSync(out, `${files.map((file) => sha256SumsLine(basename(file), readFileSync(file))).join("\n")}\n`);
    break;
  }
  default:
    console.error("usage: release-assets.mjs notes|check-tag|metadata|latest|sums …");
    process.exit(1);
}
