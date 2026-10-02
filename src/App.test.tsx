// @vitest-environment jsdom
// U4-002: App.tsx composes the feature hooks in an order that works at runtime (no use-before-declaration),
// and the start-up loads still go out.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Minimal answers for the commands App sends while starting up; anything else answers null.
const responses: Record<string, unknown> = {
  settings_get: [],
  session_status: { authenticated: false },
  spotify_session_status: { authenticated: false },
  ytm_home: { sections: [] },
  speed_dial_items: [],
  search_history_items: [],
  history_items: [],
  library_playlists: [],
};
const invoke = vi.fn(async (command: string, _args?: unknown): Promise<unknown> => responses[command] ?? null);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0-test" }));

afterEach(cleanup);

it("mounts, renders the shell and starts the initial loads", async () => {
  const { default: App } = await import("./App");
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  await act(async () => {
    render(<App />);
  });
  window.removeEventListener("error", onError);
  expect(errors).toEqual([]);
  expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
  const commands = new Set(invoke.mock.calls.map(([command]) => command));
  for (const command of ["settings_get", "session_status", "spotify_session_status", "ytm_home", "speed_dial_items"])
    expect(commands).toContain(command);
});
