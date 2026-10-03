import { describe, expect, it } from "vitest";
import doc from "../../docs/events.md?raw";
import { EVENT_VERSIONS } from "./events";

// Every non-test source file under src/, keyed by its path relative to this file.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("event contract (S5-010)", () => {
  it("documents every event with the same version", () => {
    for (const [name, version] of Object.entries(EVENT_VERSIONS))
      expect(doc, `docs/events.md row for ${name}`).toContain(`| \`${name}\` | ${version} |`);
    const documented = [...doc.matchAll(/^\| `([a-z-]+)` \| (\d+) \|/gm)].map((match) => match[1]);
    expect(documented.sort()).toEqual(Object.keys(EVENT_VERSIONS).sort());
  });

  it("listens to events only through listenEvent", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, text] of Object.entries(sources)) {
      // The generated bindings import the event module for tauri-specta helpers Meld does not use.
      if (file === "./events.ts" || file === "../ipc/bindings.ts") continue;
      expect(text, file).not.toMatch(/from "@tauri-apps\/api\/event"/);
    }
  });
});
