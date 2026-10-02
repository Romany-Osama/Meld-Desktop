// @vitest-environment jsdom
// U4-002: App.tsx composes the feature hooks in an order that works at runtime (no use-before-declaration),
// and the start-up loads still go out.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Minimal answers for the commands App sends while starting up; anything else answers null.
const responses: Record<string, unknown> = {
  settings_get: [],
  session_status: { authenticated: false },
  spotify_session_status: { authenticated: false },
  ytm_home: {
    sections: [
      {
        title: "Albums for you",
        items: [
          {
            id: "MPREb_test",
            kind: "album",
            title: "Test Album",
            subtitle: "Artist",
            artists: [],
            browseId: "MPREb_test",
          },
        ],
      },
    ],
  },
  ytm_detail: { kind: "album", title: "Test Album", subtitle: "Artist", items: [], browseId: "MPREb_test" },
  ytm_playlist: {
    playlist: { id: "OLAK5uy_test", kind: "playlist", title: "Test Playlist", subtitle: "", artists: [] },
    songs: [],
  },
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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

it("navigates with route-based back and forward history (U4-004)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const click = async (element: HTMLElement) => act(async () => void fireEvent.click(element));
  const back = screen.getByRole("button", { name: "Back" });
  const forward = screen.getByRole("button", { name: "Forward" });
  expect(route()).toBe("/home");
  expect(back).toHaveProperty("disabled", true);
  await click(screen.getByRole("button", { name: /Library/ }));
  expect(route()).toBe("/library/mix");
  await click(screen.getByRole("button", { name: /History/ }));
  expect(route()).toBe("/history/local");
  await click(back);
  expect(route()).toBe("/library/mix");
  await click(back);
  expect(route()).toBe("/home");
  expect(back).toHaveProperty("disabled", true);
  await click(forward);
  expect(route()).toBe("/library/mix");
  await click(forward);
  expect(route()).toBe("/history/local");
  expect(forward).toHaveProperty("disabled", true);
});

it("returns to a detail page that was open when the user navigated away (U4-004)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const click = async (element: HTMLElement) => act(async () => void fireEvent.click(element));
  await click(screen.getByTitle("Open album"));
  expect(route()).toBe("/album/MPREb_test");
  await click(screen.getByRole("button", { name: /History/ }));
  expect(route()).toBe("/history/local");
  invoke.mockClear();
  await click(screen.getByRole("button", { name: "Back" }));
  expect(route()).toBe("/album/MPREb_test");
  expect(invoke).toHaveBeenCalledWith("ytm_detail", { kind: "album", browseId: "MPREb_test" });
  // The album was opened from Home, so Home is the selected destination again.
  expect(screen.getByRole("button", { name: /Home/, current: "page" })).toBeTruthy();
});

it("closes the topmost layer before navigating back (U4-005)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const click = async (element: HTMLElement) => act(async () => void fireEvent.click(element));
  await click(screen.getByRole("button", { name: /Library/ }));
  await click(screen.getByRole("button", { name: /Home/ }));
  await click(screen.getByTitle("Open album"));
  expect(route()).toBe("/album/MPREb_test");
  // Escape closes the album page, not the history entry behind it.
  await act(async () => void fireEvent.keyDown(window, { key: "Escape" }));
  expect(route()).toBe("/home");
  await click(screen.getByTitle("Open album"));
  await click(screen.getByRole("button", { name: "Back" }));
  expect(route()).toBe("/home");
  // With no layer left, Back steps through the history.
  await click(screen.getByRole("button", { name: "Back" }));
  expect(route()).toBe("/library/mix");
});

it("restores the last safe page after a restart (U4-006)", async () => {
  const { default: App } = await import("./App");
  localStorage.clear();
  const first = await act(async () => render(<App />));
  await act(async () => void fireEvent.click(screen.getByTitle("Open album")));
  expect(JSON.parse(localStorage.getItem("meld:lastRoute") ?? "null")).toEqual({
    path: "/album/MPREb_test",
    tab: "home",
  });
  first.unmount();
  invoke.mockClear();
  const { container } = await act(async () => render(<App />));
  expect(container.querySelector("main")?.getAttribute("data-route")).toBe("/album/MPREb_test");
  expect(invoke).toHaveBeenCalledWith("ytm_detail", { kind: "album", browseId: "MPREb_test" });
  // Settings is never restored; the page under it is.
  localStorage.setItem("meld:lastRoute", JSON.stringify({ path: "/settings/integrations", tab: "home" }));
  cleanup();
  const again = await act(async () => render(<App />));
  expect(again.container.querySelector("main")?.getAttribute("data-route")).toBe("/home");
  localStorage.clear();
});

it("opens pasted YouTube Music links as pages (U4-007)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const input = container.querySelector<HTMLInputElement>(".search-form input")!;
  const search = async (text: string) =>
    act(async () => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest("form")!);
    });
  await search("https://music.youtube.com/browse/MPREb_test");
  expect(route()).toBe("/album/MPREb_test");
  expect(invoke).toHaveBeenCalledWith("ytm_detail", { kind: "album", browseId: "MPREb_test" });
  await search("music.youtube.com/playlist?list=OLAK5uy_test");
  expect(route()).toBe("/playlist/OLAK5uy_test");
  expect(invoke).toHaveBeenCalledWith("ytm_playlist", { playlistId: "OLAK5uy_test" });
  // A link opens its page without a search page in between: Back closes the playlist screen (D-028), then returns to
  // the album the link was pasted on.
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Back" })));
  expect(route()).toBe("/home");
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Back" })));
  expect(route()).toBe("/album/MPREb_test");
});
