// Security regression guards for tauri.conf.json and capabilities (TR-C3, S5-013, S5-037).
export const ALLOWED_ASSET_SCOPE = [
  "$DATA/Meld Desktop/downloads/**",
  "$DATA/Meld Desktop/player-cache/**",
  "$DATA/Meld Desktop/artwork/**",
];

export function parseCsp(csp) {
  const directives = {};
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name.toLowerCase()] = values;
  }
  return directives;
}

/** Returns a list of problems; empty means the config is acceptable. */
export function checkSecurityConfig(tauriConf, capabilities = []) {
  const problems = [];
  const security = tauriConf?.app?.security ?? {};
  const csp = security.csp;
  if (csp === null || csp === undefined || (typeof csp === "string" && csp.trim() === "")) {
    problems.push("app.security.csp must be a real policy, never null/empty");
  } else {
    const directives = parseCsp(typeof csp === "string" ? csp : Object.entries(csp).map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(" ") : value}`).join("; "));
    for (const required of ["default-src", "script-src", "object-src"]) if (!directives[required]) problems.push(`CSP is missing ${required}`);
    for (const [name, values] of Object.entries(directives)) {
      if (name === "script-src" || name === "default-src") {
        for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "http:", "https:"]) if (values.includes(bad)) problems.push(`CSP ${name} must not allow ${bad}`);
      }
    }
    if (directives["object-src"] && directives["object-src"].join(" ") !== "'none'") problems.push("CSP object-src must be 'none'");
  }
  if (security.dangerousDisableAssetCspModification) problems.push("dangerousDisableAssetCspModification must not be set");
  if (security.freezePrototype === false && security.freezePrototype !== undefined) { /* default; allowed */ }
  const scope = security.assetProtocol?.scope;
  const scopeList = Array.isArray(scope) ? scope : scope?.allow ?? [];
  if (security.assetProtocol?.enable) {
    for (const entry of scopeList) if (!ALLOWED_ASSET_SCOPE.includes(entry)) problems.push(`asset protocol scope entry "${entry}" is broader than the Meld data folders`);
  }
  for (const capability of capabilities) {
    if (capability.remote) problems.push(`capability "${capability.identifier}" grants IPC to remote URLs`);
    for (const permission of capability.permissions ?? []) {
      const id = typeof permission === "string" ? permission : permission.identifier;
      if (/^(fs|shell):allow-(execute|spawn|write|remove)|^shell:/.test(id ?? "")) problems.push(`capability "${capability.identifier}" grants dangerous permission ${id}`);
    }
  }
  return problems;
}

/** Packaging policy (S5-070, D-006): NSIS + portable only, no MSI, WebView2 bootstrapper embedded. */
export function checkBundleConfig(tauriConf) {
  const problems = [];
  const bundle = tauriConf?.bundle ?? {};
  const targets = Array.isArray(bundle.targets) ? bundle.targets : [bundle.targets];
  if (targets.length !== 1 || targets[0] !== "nsis") problems.push(`bundle.targets must be ["nsis"] (portable ZIP is built separately; no MSI), got ${JSON.stringify(bundle.targets)}`);
  const mode = bundle.windows?.webviewInstallMode?.type;
  if (mode !== "embedBootstrapper") problems.push(`bundle.windows.webviewInstallMode.type must be "embedBootstrapper", got ${JSON.stringify(mode)}`);
  return problems;
}

/** Release binaries are published as GitHub Release assets only, never committed (TR-M12). */
export function checkTrackedFiles(paths) {
  return paths
    .filter((path) => /^release\//.test(path) || /\.(exe|msi|msix|zip|7z|nupkg)$/i.test(path))
    .map((path) => `release binary must not be committed: ${path}`);
}
