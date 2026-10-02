import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const bindings = readFileSync(join(root, "ipc", "bindings.ts"), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("typed command calls (S5-011)", () => {
  it("calls app commands only through call/invokeCancellable", () => {
    const allowed = [join("lib", "ipc.ts"), join("lib", "cancellable.ts"), join("ipc", "bindings.ts")];
    for (const file of sources(root)) {
      if (allowed.some((suffix) => file.endsWith(suffix))) continue;
      const text = readFileSync(file, "utf8");
      // Plugin commands (`plugin:taskbar|…`) are not Meld commands and have no bindings.
      expect(text, file).not.toMatch(/\binvoke(?:<[^>]*>)?\(\s*["'`](?!plugin:)/);
    }
  });

  it("every command name used in a string exists in the generated CommandMap", () => {
    const names = new Set([...bindings.matchAll(/^ {2}([a-z_]+): \{ args:/gm)].map((match) => match[1]));
    expect(names.size).toBeGreaterThan(100);
    for (const file of sources(root)) {
      if (file.endsWith(join("ipc", "bindings.ts"))) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\b(?:call|invokeCancellable)\(\s*"([a-z_]+)"/g))
        expect(names.has(match[1]), `${file}: ${match[1]}`).toBe(true);
    }
  });
});
