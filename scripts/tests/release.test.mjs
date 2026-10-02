import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changelogSection, checkTag, cycloneDx, latestJson, sha256SumsLine, spdx, thirdPartyNotices } from "../lib/release.mjs";

const changelog = "# Changelog\n\n## [Unreleased]\n\n## [0.2.0] — Security\n\nBody line.\n\n### Fixed\n- thing\n\n## [0.1.8] — Old\n\nOld body.\n";

test("release notes come from the matching CHANGELOG section only", () => {
  assert.equal(changelogSection(changelog, "0.2.0"), "Body line.\n\n### Fixed\n- thing");
  assert.equal(changelogSection(changelog, "0.1.8"), "Old body.");
  assert.throws(() => changelogSection(changelog, "0.3.0"), /no "## \[0.3.0\]"/);
  assert.throws(() => changelogSection(changelog, "0.2"), /no/);
  assert.ok(changelogSection(readFileSync("CHANGELOG.md", "utf8"), JSON.parse(readFileSync("package.json", "utf8")).version).length > 50, "current version must have release notes");
});

test("release tag must equal v<package.json version>", () => {
  assert.deepEqual(checkTag("v0.2.0", "0.2.0"), []);
  assert.equal(checkTag("v0.2.1", "0.2.0").length, 1);
  assert.equal(checkTag("0.2.0", "0.2.0").length, 1);
});

test("latest.json has the Tauri updater shape and rejects missing signatures or http URLs", () => {
  const input = { version: "0.2.0", notes: "n", pubDate: "2026-10-02T00:00:00.000Z", setupUrl: "https://x/setup.exe", setupSignature: "SIG\n", portableUrl: "https://x/p.zip", portableSignature: "PSIG" };
  const manifest = latestJson(input);
  assert.deepEqual(manifest.platforms["windows-x86_64"], { signature: "SIG", url: "https://x/setup.exe" });
  assert.equal(manifest.pub_date, input.pubDate);
  assert.deepEqual(manifest.portable, { signature: "PSIG", url: "https://x/p.zip" });
  assert.throws(() => latestJson({ ...input, setupSignature: "" }), /setupSignature/);
  assert.throws(() => latestJson({ ...input, setupUrl: "http://x/setup.exe" }), /https/);
});

test("checksums use the sha256sum format", () => {
  assert.equal(sha256SumsLine("a.txt", Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a.txt");
});

test("SBOM and notices list every package with an SPDX license", () => {
  assert.equal(spdx("MIT/Apache-2.0"), "MIT OR Apache-2.0");
  assert.equal(spdx(undefined), "NOASSERTION");
  const sbom = cycloneDx({ appName: "Meld Desktop", appVersion: "0.2.0", crates: [{ name: "serde", version: "1.0.0", license: "MIT OR Apache-2.0" }], npmPackages: [{ name: "@tauri-apps/api", version: "2.12.1", license: "Apache-2.0 OR MIT" }], timestamp: "t" });
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.deepEqual(sbom.components.map((component) => component.purl), ["pkg:cargo/serde@1.0.0", "pkg:npm/%40tauri-apps/api@2.12.1"]);
  const notices = thirdPartyNotices({ appName: "Meld Desktop", packages: [{ ecosystem: "cargo", name: "zz", version: "1", license: "MIT", licenseTexts: ["--- LICENSE ---\nMIT text"] }, { ecosystem: "cargo", name: "aa", version: "2", license: "Apache-2.0" }] });
  assert.ok(notices.indexOf("aa 2") < notices.indexOf("zz 1"));
  assert.match(notices, /MIT text/);
});

test("vendored solver sources are declared with SPDX licenses and existing files", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const list = JSON.parse(readFileSync("src-tauri/vendor/vendored.json", "utf8"));
  assert.deepEqual(list.map((pkg) => pkg.name).sort(), ["astring", "meriyah", "yt-dlp-ejs"]);
  for (const pkg of list) {
    assert.match(pkg.license, /^(Unlicense|ISC|MIT)$/);
    for (const file of [...pkg.files, ...pkg.licenseFiles]) assert.ok(existsSync(`src-tauri/vendor/${file}`), file);
  }
  const bom = cycloneDx({ appName: "A", appVersion: "1", crates: [], npmPackages: [], vendored: list, timestamp: "t" });
  assert.ok(bom.components.some((c) => c.name === "meriyah" && c.purl.startsWith("pkg:generic/meriyah@6.1.4")));
});
