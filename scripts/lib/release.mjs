// Release helpers (plan §7.3): changelog notes, updater manifest, checksums, SBOM and third-party notices.
import { createHash } from "node:crypto";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Body of the `## [X.Y.Z]` section of CHANGELOG.md, without the heading. Throws if missing. */
export function changelogSection(markdown, version) {
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\][^\\n]*\\n`, "m");
  const match = heading.exec(markdown);
  if (!match) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  const rest = markdown.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** Tag must be exactly v<package.json version>. */
export function checkTag(tag, version) {
  return tag === `v${version}` ? [] : [`tag ${tag} does not match package.json version ${version} (expected v${version})`];
}

/** Tauri v2 updater manifest; `portable` is Meld's own extra entry for the portable ZIP. */
export function latestJson({ version, notes, pubDate, setupUrl, setupSignature, portableUrl, portableSignature }) {
  for (const [name, value] of Object.entries({ version, setupUrl, setupSignature, portableUrl, portableSignature })) {
    if (!value || typeof value !== "string" || !value.trim()) throw new Error(`latest.json: ${name} is required`);
  }
  for (const url of [setupUrl, portableUrl]) if (!url.startsWith("https://")) throw new Error(`latest.json: ${url} must be https`);
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: { "windows-x86_64": { signature: setupSignature.trim(), url: setupUrl } },
    portable: { signature: portableSignature.trim(), url: portableUrl },
  };
}

export function sha256SumsLine(name, bytes) {
  return `${createHash("sha256").update(bytes).digest("hex")}  ${name}`;
}

/** Normalizes old cargo "MIT/Apache-2.0" license syntax to SPDX. */
export function spdx(license) {
  if (!license) return "NOASSERTION";
  return license.split("/").map((part) => part.trim()).join(" OR ");
}

const purlCargo = (name, version) => `pkg:cargo/${name}@${version}`;
const purlNpm = (name, version) => `pkg:npm/${name.startsWith("@") ? `%40${name.slice(1)}` : name}@${version}`;

/** Minimal CycloneDX 1.5 SBOM for the shipped Rust crates and npm runtime packages. */
export function cycloneDx({ appName, appVersion, crates, npmPackages, vendored = [], timestamp }) {
  const component = (type, name, version, license, purl) => ({ type, name, version, purl, "bom-ref": purl, licenses: [{ expression: spdx(license) }] });
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: { timestamp, component: { type: "application", name: appName, version: appVersion, licenses: [{ expression: "GPL-3.0-only" }] } },
    components: [
      ...crates.map((crate) => component("library", crate.name, crate.version, crate.license, purlCargo(crate.name, crate.version))),
      ...npmPackages.map((pkg) => component("library", pkg.name, pkg.version, pkg.license, purlNpm(pkg.name, pkg.version))),
      // Sources copied into the repository (src-tauri/vendor/vendored.json), identified by their upstream repository.
      ...vendored.map((pkg) => component("library", pkg.name, pkg.version, pkg.license, `pkg:generic/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}?vcs_url=${encodeURIComponent(`git+${pkg.repository}`)}`)),
    ],
  };
}

/** Plain-text notices: one block per package with its license expression and license texts. */
export function thirdPartyNotices({ appName, packages }) {
  const lines = [`${appName} includes the following third-party software.`, "Each package is listed with its license; full license texts follow when the package ships them.", ""];
  for (const pkg of [...packages].sort((a, b) => `${a.ecosystem}:${a.name}`.localeCompare(`${b.ecosystem}:${b.name}`))) {
    lines.push("=".repeat(78), `${pkg.name} ${pkg.version} (${pkg.ecosystem}) — ${spdx(pkg.license)}`, pkg.repository ? `Source: ${pkg.repository}` : "", "");
    for (const text of pkg.licenseTexts ?? []) lines.push(text.trim(), "");
  }
  return `${lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n")}\n`;
}
