import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { checkVersions, cargoPackageVersion, cargoLockVersion, readRepo } from "../lib/versions.mjs";
import {
  checkSecurityConfig,
  checkBundleConfig,
  checkTrackedFiles,
  ALLOWED_ASSET_SCOPE,
} from "../lib/security-config.mjs";
import {
  checkUiInvariants,
  checkLogoutClearsWebview,
  readUiSource,
  registeredCommands,
  RESTORED_UI_COMMANDS,
} from "../lib/ui-invariants.mjs";
import { checkTooling, crlfIndexEntries } from "../lib/tooling.mjs";
import {
  checkCapabilities,
  checkDestructivePolicy,
  checkErrorBoundaries,
  checkFeatureModules,
  checkScreenSplit,
  checkServerState,
  FEATURE_MODULES,
  ROUTE_SCREENS,
  SERVER_STATE_HOOKS,
} from "../lib/ui-structure.mjs";

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
  assert.equal(
    checkVersions({ ...goodRepo(), tauriConf: { version: "0.2.0" } }).length,
    1,
    "tauri.conf.json must read package.json",
  );
  assert.equal(checkVersions({ ...goodRepo(), cargoToml: '[package]\nversion = "0.1.0"\n' }).length, 1);
  assert.equal(
    checkVersions({ ...goodRepo(), cargoLock: '[[package]]\nname = "meld-desktop"\nversion = "0.1.8"\n' }).length,
    1,
  );
  assert.equal(checkVersions({ ...goodRepo(), packageLock: { version: "0.1.8" } }).length, 1);
});

test("versions: Cargo.toml dependency versions are not mistaken for the package version", () => {
  assert.equal(
    cargoPackageVersion('[dependencies]\nversion = "9.9.9"\n[package]\nname = "x"\nversion = "1.2.3"\n'),
    "1.2.3",
  );
  assert.equal(
    cargoLockVersion(
      '[[package]]\nname = "other"\nversion = "1.0.0"\n\n[[package]]\nname = "meld-desktop"\nversion = "0.2.0"\n',
      "meld-desktop",
    ),
    "0.2.0",
  );
});

test("versions: the real repository is consistent", () => {
  assert.deepEqual(checkVersions(readRepo(".")), []);
});

const conf = (security) => ({ app: { security } });
const goodSecurity = {
  csp: "default-src 'self'; script-src 'self'; object-src 'none'",
  assetProtocol: { enable: true, scope: [...ALLOWED_ASSET_SCOPE] },
};

test("security: v0.1.8 config (csp null, broad scope) is rejected (TR-C3)", () => {
  const problems = checkSecurityConfig(
    conf({ csp: null, assetProtocol: { enable: true, scope: ["$HOME/**", "$APPDATA/**", "$MUSIC/**"] } }),
  );
  assert.ok(problems.some((problem) => problem.includes("csp")));
  assert.equal(problems.filter((problem) => problem.includes("asset protocol scope")).length, 3);
});

test("security: unsafe script sources and remote IPC are rejected", () => {
  assert.ok(
    checkSecurityConfig(
      conf({ ...goodSecurity, csp: "default-src 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'" }),
    ).length > 0,
  );
  assert.ok(
    checkSecurityConfig(conf(goodSecurity), [{ identifier: "x", remote: { urls: ["https://*"] }, permissions: [] }])
      .length > 0,
  );
  assert.ok(
    checkSecurityConfig(conf(goodSecurity), [{ identifier: "x", permissions: ["shell:allow-execute"] }]).length > 0,
  );
  assert.deepEqual(
    checkSecurityConfig(conf(goodSecurity), [
      { identifier: "default", permissions: ["core:default", "taskbar:default"] },
    ]),
    [],
  );
});

test("security: the real tauri.conf.json passes", () => {
  const real = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  assert.deepEqual(
    checkSecurityConfig(real, [JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"))]),
    [],
  );
});

test("ui: duplicate Audio quality control is detected (TR-M3)", () => {
  const ok = `<strong>Audio quality</strong>${RESTORED_UI_COMMANDS.map((command) => `"${command}"`).join(" ")}`;
  assert.deepEqual(checkUiInvariants(ok), []);
  assert.equal(checkUiInvariants(ok + "<strong>Audio quality</strong>").length, 1);
  assert.equal(
    checkUiInvariants(ok.replace('"history_record_playtime"', "")).length,
    1,
    "TR-M4: playtime must stay wired",
  );
});

test("ui: the real UI source passes and every restored command is registered (TR-H1)", () => {
  assert.deepEqual(checkUiInvariants(readUiSource()), []);
  const registered = registeredCommands(readFileSync("src-tauri/src/lib.rs", "utf8"));
  for (const command of RESTORED_UI_COMMANDS) assert.ok(registered.includes(command), `${command} must be registered`);
  for (const retired of [
    "account_save_session",
    "clear_guest_session",
    "spotify_search_tracks",
    "ytm_podcast_episodes",
  ])
    assert.ok(!registered.includes(retired), `${retired} is retired (DECISIONS D-004)`);
});

test("ui: every registered command is invoked by the UI or documented as backend-only", () => {
  const app = readdirSync("src", { recursive: true })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => readFileSync(`src/${name}`, "utf8"))
    .join("\n");
  const registered = registeredCommands(readFileSync("src-tauri/src/lib.rs", "utf8"));
  const unused = registered.filter((command) => !app.includes(`"${command}"`) && !app.includes(`'${command}'`));
  assert.deepEqual(unused, [], `registered but never invoked: ${unused.join(", ")}`);
});

test('bundle: main\'s targets "all" without bootstrapper is rejected; NSIS + embedded bootstrapper passes (S5-070)', () => {
  assert.equal(checkBundleConfig({ bundle: { targets: "all" } }).length, 2);
  assert.equal(
    checkBundleConfig({
      bundle: { targets: ["nsis", "msi"], windows: { webviewInstallMode: { type: "embedBootstrapper" } } },
    }).length,
    1,
  );
  assert.deepEqual(
    checkBundleConfig({
      bundle: { targets: ["nsis"], windows: { webviewInstallMode: { type: "embedBootstrapper", silent: true } } },
    }),
    [],
  );
  assert.deepEqual(checkBundleConfig(JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))), []);
});

test("tracked files: committed release binaries are rejected (TR-M12)", () => {
  assert.equal(
    checkTrackedFiles(["release/meld-desktop-0.1.8-portable.zip", "release/notes.md", "src/App.tsx", "dist/x.EXE"])
      .length,
    3,
  );
  assert.deepEqual(
    checkTrackedFiles(["src-tauri/icons/icon.ico", "src-tauri/icons/taskbar/play.ico", "README.md"]),
    [],
  );
});

test("logout: both sign-out commands clear WebView data (TR-H6)", () => {
  const ok =
    "\n#[tauri::command]\nfn account_logout(app: AppHandle) -> R {\n    db();\n    let _ = window.clear_all_browsing_data();\n}\n\n#[tauri::command]\nfn spotify_logout(app: AppHandle) -> R {\n    let _ = window.clear_all_browsing_data();\n}\n";
  assert.deepEqual(checkLogoutClearsWebview(ok), []);
  const v018 = ok.replace("    let _ = window.clear_all_browsing_data();\n}\n\n", "}\n\n");
  assert.deepEqual(checkLogoutClearsWebview(v018), ["account_logout no longer clears WebView browsing data"]);
  assert.deepEqual(checkLogoutClearsWebview(readFileSync("src-tauri/src/lib.rs", "utf8")), []);
});

test("security: asset scope points at the real data folder, not Tauri's identifier folder", () => {
  // database_path() is %APPDATA%\Meld Desktop, which Tauri calls $DATA. $APPDATA would be
  // %APPDATA%\com.romany-osama.meld-desktop and blocked every cached/downloaded song in 0.2.0.
  assert.ok(ALLOWED_ASSET_SCOPE.every((entry) => entry.startsWith("$DATA/Meld Desktop/")));
  const legacy = checkSecurityConfig(
    conf({ ...goodSecurity, assetProtocol: { enable: true, scope: ["$APPDATA/Meld Desktop/player-cache/**"] } }),
  );
  assert.ok(legacy.some((problem) => problem.includes("asset protocol scope")));
});

test("tooling: lint, format and line-ending rules are configured and run in CI (TR-L9)", () => {
  const good = {
    packageJson: { scripts: { lint: "eslint . --max-warnings 0", "format:check": "prettier --check ." } },
    ciYml: "run: npm run lint\nrun: npm run format:check\nrun: cargo fmt --all -- --check\n",
    gitattributes: "* text=auto eol=lf\n*.ps1   text eol=crlf\n",
  };
  assert.deepEqual(checkTooling(good), []);
  assert.equal(checkTooling({ ...good, packageJson: { scripts: { lint: "eslint ." } } }).length, 1);
  assert.equal(checkTooling({ ...good, ciYml: "run: npm run lint\nrun: cargo fmt --all -- --check\n" }).length, 1);
  assert.equal(checkTooling({ ...good, gitattributes: "* text=auto\n" }).length, 2);
});

test("tooling: the real repository passes the tooling check", () => {
  assert.deepEqual(
    checkTooling({
      packageJson: JSON.parse(readFileSync("package.json", "utf8")),
      ciYml: readFileSync(".github/workflows/ci.yml", "utf8"),
      gitattributes: readFileSync(".gitattributes", "utf8"),
    }),
    [],
  );
});

test("tooling: CRLF or mixed committed files are reported, PowerShell scripts are exempt (TR-L9)", () => {
  const eol = [
    "i/lf    w/lf    attr/text=auto eol=lf \tsrc/App.tsx",
    "i/crlf  w/crlf  attr/text=auto eol=lf \tsrc/bad.ts",
    "i/mixed w/mixed attr/text=auto eol=lf \tdocs/mixed.md",
    "i/crlf  w/crlf  attr/text eol=crlf    \tscripts/smoke/windows-smoke.ps1",
    "i/-text w/-text attr/-text            \tsrc-tauri/icons/icon.png",
  ].join("\n");
  assert.deepEqual(crlfIndexEntries(eol), ["src/bad.ts", "docs/mixed.md"]);
});

test("ui: every route-level screen is its own module rendered by App.tsx (U4-001)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkScreenSplit(read), []);
  const missing = (path) => (path === ROUTE_SCREENS.Queue ? null : read(path));
  assert.deepEqual(checkScreenSplit(missing), [`Queue: ${ROUTE_SCREENS.Queue} is missing`]);
  const inlined = (path) => (path === "src/App.tsx" ? read(path).replace("<SettingsScreen", "<div") : read(path));
  assert.deepEqual(checkScreenSplit(inlined), ["App.tsx no longer renders <SettingsScreen>"]);
});

test("ui: feature state lives in feature hooks that App.tsx composes (U4-002)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkFeatureModules(read), []);
  const missing = (path) => (path === FEATURE_MODULES.downloads.path ? null : read(path));
  assert.deepEqual(checkFeatureModules(missing), [`downloads: ${FEATURE_MODULES.downloads.path} is missing`]);
  const redeclared = (path) =>
    path === "src/App.tsx"
      ? read(path).replace("function App() {", "function App() {\n  const [queueItems, setQueueItems] = useState([]);")
      : read(path);
  assert.deepEqual(checkFeatureModules(redeclared), ["App.tsx declares queueItems, which useQueue owns"]);
});

test("ui: server state lives in data hooks, not in App.tsx (U4-008)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkServerState(read), []);
  const missing = (path) => (path === SERVER_STATE_HOOKS.detail.path ? null : read(path));
  assert.deepEqual(checkServerState(missing), [`detail: ${SERVER_STATE_HOOKS.detail.path} is missing`]);
  const fetching = (path) =>
    path === "src/App.tsx"
      ? read(path).replace("function App() {", 'function App() {\n  void invoke<HomePage>("ytm_home");')
      : read(path);
  assert.deepEqual(checkServerState(fetching), ["App.tsx fetches ytm_home; server state belongs in a data hook"]);
  const stateful = (path) =>
    path === "src/App.tsx"
      ? read(path).replace("function App() {", "function App() {\n  const [detail, setDetail] = useState(null);")
      : read(path);
  assert.deepEqual(checkServerState(stateful), ["App.tsx keeps detail in useState; it is server state"]);
});

test("ui: the item menu comes from the capability model (U4-011)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkCapabilities(read), []);
  const scattered = (path) =>
    path === "src/App.tsx"
      ? read(path).replace("function App() {", 'function App() {\n  const x = () => performMenuAction("radio", item);')
      : read(path);
  assert.deepEqual(checkCapabilities(scattered), ["App.tsx calls performMenuAction with a literal action"]);
  const missing = (path) => (path === "src/app/capabilities.ts" ? null : read(path));
  assert.deepEqual(checkCapabilities(missing), ["src/app/capabilities.ts is missing"]);
});

test("ui: removals follow one destructive-action policy (U4-012, U4-013)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkDestructivePolicy(read, readUiSource()), []);
  assert.deepEqual(checkDestructivePolicy(read, 'if (window.confirm("Delete?")) remove();'), [
    "window.confirm is used; ask through the destructive policy",
  ]);
  const direct = (path) =>
    path === "src/App.tsx"
      ? read(path)
          .replace('if (action === "remove_history") {', 'if (action === "remove_history") {\n      return;')
          .replace(/(if \(action === "remove_history"\) \{[\s\S]*?)destructive\(/, "$1runNow(")
      : read(path);
  assert.deepEqual(checkDestructivePolicy(direct, ""), ["remove_history does not go through destructive()"]);
  const missing = (path) => (path === "src/app/destructive.ts" ? null : read(path));
  assert.deepEqual(checkDestructivePolicy(missing, ""), ["src/app/destructive.ts is missing"]);
});

test("ui: pages, overlays and player controls have their own error boundary (U4-014)", () => {
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  assert.deepEqual(checkErrorBoundaries(read), []);
  const unwrapped = (path) =>
    path === "src/App.tsx" ? read(path).replace(/<ErrorBoundary[^\n]*\n\s*(<DetailScreen\n)/, "$1") : read(path);
  assert.deepEqual(checkErrorBoundaries(unwrapped), ["DetailScreen is not inside an <ErrorBoundary>"]);
  const audioInBar = (path) =>
    path === "src/features/player/PlayerBar.tsx" ? read(path) + "\n// <audio ref={audioRef} />" : read(path);
  assert.deepEqual(checkErrorBoundaries(audioInBar), [
    "PlayerBar.tsx renders <audio>; keep it in PlayerAudio outside the boundary",
  ]);
});
