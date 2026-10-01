#!/usr/bin/env node
// Sets the app version everywhere it is stored. Usage: node scripts/bump-version.mjs 0.3.0
// tauri.conf.json reads it from package.json ("version": "../package.json").
import { readFileSync, writeFileSync } from "node:fs";
import { SEMVER } from "./lib/versions.mjs";

const version = process.argv[2];
if (!SEMVER.test(version ?? "")) { console.error("usage: node scripts/bump-version.mjs <semver>"); process.exit(1); }

const editJson = (path, edit) => { const value = JSON.parse(readFileSync(path, "utf8")); edit(value); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };
editJson("package.json", (pkg) => { pkg.version = version; });
editJson("package-lock.json", (lock) => { lock.version = version; if (lock.packages?.[""]) lock.packages[""].version = version; });
const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
writeFileSync("src-tauri/Cargo.toml", cargoToml.replace(/(\[package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`));
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
writeFileSync("src-tauri/Cargo.lock", cargoLock.replace(/(\[\[package\]\]\nname = "meld-desktop"\nversion = ")[^"]+(")/, `$1${version}$2`));
console.log(`version set to ${version}`);
