import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_VERSIONS } from "./events";

const root = join(__dirname, "..");
const doc = readFileSync(join(root, "..", "docs", "events.md"), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("event contract (S5-010)", () => {
  it("documents every event with the same version", () => {
    for (const [name, version] of Object.entries(EVENT_VERSIONS))
      expect(doc, `docs/events.md row for ${name}`).toContain(`| \`${name}\` | ${version} |`);
    const documented = [...doc.matchAll(/^\| `([a-z-]+)` \| (\d+) \|/gm)].map((match) => match[1]);
    expect(documented.sort()).toEqual(Object.keys(EVENT_VERSIONS).sort());
  });

  it("listens to events only through listenEvent", () => {
    for (const file of sources(root)) {
      if (file.endsWith(join("lib", "events.ts"))) continue;
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from "@tauri-apps\/api\/event"/);
    }
  });
});
