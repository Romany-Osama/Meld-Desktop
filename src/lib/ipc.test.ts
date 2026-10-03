import { describe, expect, it } from "vitest";
import bindings from "../ipc/bindings.ts?raw";

// Every non-test source file under src/, keyed by its path relative to this file.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const generated = "../ipc/bindings.ts";

describe("typed command calls (S5-011)", () => {
  it("calls app commands only through call/invokeCancellable", () => {
    const allowed = ["./ipc.ts", "./cancellable.ts", generated];
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, text] of Object.entries(sources)) {
      if (allowed.includes(file)) continue;
      // Plugin commands (`plugin:taskbar|…`) are not Meld commands and have no bindings.
      expect(text, file).not.toMatch(/\binvoke(?:<[^>]*>)?\(\s*["'`](?!plugin:)/);
    }
  });

  it("every command name used in a string exists in the generated CommandMap", () => {
    const names = new Set([...bindings.matchAll(/^ {2}([a-z_]+): \{ args:/gm)].map((match) => match[1]));
    expect(names.size).toBeGreaterThan(100);
    for (const [file, text] of Object.entries(sources)) {
      if (file === generated) continue;
      for (const match of text.matchAll(/\b(?:call|invokeCancellable)\(\s*"([a-z_]+)"/g))
        expect(names.has(match[1]), `${file}: ${match[1]}`).toBe(true);
    }
  });
});
