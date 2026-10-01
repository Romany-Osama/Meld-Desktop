// Version truth helpers (S5-071, PLAY-091). package.json is the single source of the app version.
import { readFileSync } from "node:fs";

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function cargoPackageVersion(cargoToml) {
  const section = cargoToml.split(/^\[/m).find((part) => part.startsWith("package]"));
  const match = section?.match(/^version\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

export function cargoLockVersion(cargoLock, name) {
  const re = new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"`);
  const match = cargoLock.match(re);
  return match ? match[1] : null;
}

/** Returns a list of human-readable problems; empty means consistent. */
export function checkVersions({ packageJson, packageLock, cargoToml, cargoLock, tauriConf, tag }) {
  const problems = [];
  const version = packageJson.version;
  if (!SEMVER.test(version ?? "")) problems.push(`package.json version "${version}" is not SemVer`);
  if (tauriConf.version !== "../package.json") problems.push(`tauri.conf.json version must be "../package.json" (single source), found "${tauriConf.version}"`);
  if (packageLock && packageLock.version !== version) problems.push(`package-lock.json version ${packageLock.version} != ${version}`);
  if (packageLock?.packages?.[""] && packageLock.packages[""].version !== version) problems.push(`package-lock.json packages[""] version ${packageLock.packages[""].version} != ${version}`);
  const cargo = cargoPackageVersion(cargoToml);
  if (cargo !== version) problems.push(`src-tauri/Cargo.toml version ${cargo} != ${version}`);
  const lock = cargoLockVersion(cargoLock, "meld-desktop");
  if (lock !== version) problems.push(`src-tauri/Cargo.lock meld-desktop version ${lock} != ${version}`);
  if (tag) {
    const tagVersion = tag.replace(/^refs\/tags\//, "").replace(/^v/, "");
    if (tagVersion !== version) problems.push(`tag ${tag} does not match package.json version ${version}`);
  }
  return problems;
}

export function readRepo(root = ".") {
  const read = (path) => readFileSync(`${root}/${path}`, "utf8");
  return {
    packageJson: JSON.parse(read("package.json")),
    packageLock: JSON.parse(read("package-lock.json")),
    cargoToml: read("src-tauri/Cargo.toml"),
    cargoLock: read("src-tauri/Cargo.lock"),
    tauriConf: JSON.parse(read("src-tauri/tauri.conf.json")),
  };
}
