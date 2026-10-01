import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkVersions, cargoPackageVersion, cargoLockVersion, readRepo } from "../lib/versions.mjs";
import { checkSecurityConfig, checkBundleConfig, checkTrackedFiles, ALLOWED_ASSET_SCOPE } from "../lib/security-config.mjs";
import { checkUiInvariants, registeredCommands, RESTORED_UI_COMMANDS } from "../lib/ui-invariants.mjs";

const goodRepo = () => ({
  packageJson: { version: "0.2.0" },
  packageLock: { version: "0.2.0", packages: { "": { version: "0.2.0" } } },
  cargoToml: '[package]\nname = "meld-desktop"\nversion = "0.2.0"\n\n[dependencies]\nfoo = { version = "1" }\n',
  cargoLock: '[[package]]\nname = "meld-desktop"\nversion = "0.2.0"\n',
  tauriConf: { version: "../package.json" },
});

test("versions: consistent repo passes, with and without a matching tag", () => {
  assert.deepEqual(checkVersions(goodRepo()), []);
  assert.deepEqual(checkVersions({ ...goodRepo(), tag: "refs/tags/v0.2.0" }), []);
});

test("versions: each divergent source is reported (PLAY-091)", () => {
  assert.equal(checkVersions({ ...goodRepo(), tag: "v0.1.8" }).length, 1);
  assert.equal(checkVersions({ ...goodRepo(), tauriConf: { version: "0.2.0" } }).length, 1, "tauri.conf.json must read package.json");
  assert.equal(checkVersions({ ...goodRepo(), cargoToml: '[package]\nversion = "0.1.0"\n' }).length, 1);
  assert.equal(checkVersions({ ...goodRepo(), cargoLock: '[[package]]\nname = "meld-desktop"\nversion = "0.1.8"\n' }).length, 1);
  assert.equal(checkVersions({ ...goodRepo(), packageLock: { version: "0.1.8" } }).length, 1);
});

test("versions: Cargo.toml dependency versions are not mistaken for the package version", () => {
  assert.equal(cargoPackageVersion('[dependencies]\nversion = "9.9.9"\n[package]\nname = "x"\nversion = "1.2.3"\n'), "1.2.3");
  assert.equal(cargoLockVersion('[[package]]\nname = "other"\nversion = "1.0.0"\n\n[[package]]\nname = "meld-desktop"\nversion = "0.2.0"\n', "meld-desktop"), "0.2.0");
});

test("versions: the real repository is consistent", () => {
  assert.deepEqual(checkVersions(readRepo(".")), []);
});

const conf = (security) => ({ app: { security } });
const goodSecurity = { csp: "default-src 'self'; script-src 'self'; object-src 'none'", assetProtocol: { enable: true, scope: [...ALLOWED_ASSET_SCOPE] } };

test("security: v0.1.8 config (csp null, broad scope) is rejected (TR-C3)", () => {
  const problems = checkSecurityConfig(conf({ csp: null, assetProtocol: { enable: true, scope: ["$HOME/**", "$APPDATA/**", "$MUSIC/**"] } }));
  assert.ok(problems.some((problem) => problem.includes("csp")));
  assert.equal(problems.filter((problem) => problem.includes("asset protocol scope")).length, 3);
});

test("security: unsafe script sources and remote IPC are rejected", () => {
  assert.ok(checkSecurityConfig(conf({ ...goodSecurity, csp: "default-src 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'" })).length > 0);
  assert.ok(checkSecurityConfig(conf(goodSecurity), [{ identifier: "x", remote: { urls: ["https://*"] }, permissions: [] }]).length > 0);
  assert.ok(checkSecurityConfig(conf(goodSecurity), [{ identifier: "x", permissions: ["shell:allow-execute"] }]).length > 0);
  assert.deepEqual(checkSecurityConfig(conf(goodSecurity), [{ identifier: "default", permissions: ["core:default", "taskbar:default"] }]), []);
});

test("security: the real tauri.conf.json passes", () => {
  const real = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  assert.deepEqual(checkSecurityConfig(real, [JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"))]), []);
});

test("ui: duplicate Audio quality control is detected (TR-M3)", () => {
  const ok = `<strong>Audio quality</strong>${RESTORED_UI_COMMANDS.map((command) => `"${command}"`).join(" ")}`;
  assert.deepEqual(checkUiInvariants(ok), []);
  assert.equal(checkUiInvariants(ok + "<strong>Audio quality</strong>").length, 1);
  assert.equal(checkUiInvariants(ok.replace('"history_record_playtime"', "")).length, 1, "TR-M4: playtime must stay wired");
});

test("ui: the real App.tsx passes and every restored command is registered (TR-H1)", () => {
  assert.deepEqual(checkUiInvariants(readFileSync("src/App.tsx", "utf8")), []);
  const registered = registeredCommands(readFileSync("src-tauri/src/lib.rs", "utf8"));
  for (const command of RESTORED_UI_COMMANDS) assert.ok(registered.includes(command), `${command} must be registered`);
  for (const retired of ["account_save_session", "clear_guest_session", "spotify_search_tracks", "ytm_podcast_episodes"]) assert.ok(!registered.includes(retired), `${retired} is retired (DECISIONS D-004)`);
});

test("ui: every registered command is invoked by the UI or documented as backend-only", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const registered = registeredCommands(readFileSync("src-tauri/src/lib.rs", "utf8"));
  const unused = registered.filter((command) => !app.includes(`"${command}"`) && !app.includes(`'${command}'`));
  assert.deepEqual(unused, [], `registered but never invoked: ${unused.join(", ")}`);
});

test("bundle: main's targets \"all\" without bootstrapper is rejected; NSIS + embedded bootstrapper passes (S5-070)", () => {
  assert.equal(checkBundleConfig({ bundle: { targets: "all" } }).length, 2);
  assert.equal(checkBundleConfig({ bundle: { targets: ["nsis", "msi"], windows: { webviewInstallMode: { type: "embedBootstrapper" } } } }).length, 1);
  assert.deepEqual(checkBundleConfig({ bundle: { targets: ["nsis"], windows: { webviewInstallMode: { type: "embedBootstrapper", silent: true } } } }), []);
  assert.deepEqual(checkBundleConfig(JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))), []);
});

test("tracked files: committed release binaries are rejected (TR-M12)", () => {
  assert.equal(checkTrackedFiles(["release/meld-desktop-0.1.8-portable.zip", "release/notes.md", "src/App.tsx", "dist/x.EXE"]).length, 3);
  assert.deepEqual(checkTrackedFiles(["src-tauri/icons/icon.ico", "src-tauri/icons/taskbar/play.ico", "README.md"]), []);
});
