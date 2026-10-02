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
  library_mix_songs: [],
  library_albums: [],
  library_artists: [],
  library_item_state: { liked: false, youtubeLiked: false, inLibrary: false, uploaded: false, pinned: false },
};
// Per-test answers that take precedence over `responses` (for example a deferred, slow answer).
const overrides: Record<string, (args: unknown) => Promise<unknown>> = {};
const invoke = vi.fn(async (command: string, args?: unknown): Promise<unknown> =>
  overrides[command] ? overrides[command](args) : (responses[command] ?? null),
);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
  convertFileSrc: (path: string) => path,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => undefined }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0-test" }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const command of Object.keys(overrides)) delete overrides[command];
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const album = (browseId: string, title: string) => ({ kind: "album", title, subtitle: "Artist", items: [], browseId });

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
  // The page comes back from the cache as it was left, without fetching it again (U4-010).
  expect(invoke).not.toHaveBeenCalledWith("ytm_detail", expect.anything());
  expect(screen.getAllByText("Test Album").length).toBeGreaterThan(0);
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

it("never lets a slow page replace the page opened after it (U4-009)", async () => {
  const { default: App } = await import("./App");
  const slowA = deferred<unknown>();
  overrides.ytm_detail = (args) => {
    const { browseId } = args as { browseId: string };
    return browseId === "MPREb_A" ? slowA.promise : Promise.resolve(album("MPREb_B", "Second Album"));
  };
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const input = container.querySelector<HTMLInputElement>(".search-form input")!;
  const paste = async (text: string) =>
    act(async () => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest("form")!);
    });
  await paste("https://music.youtube.com/browse/MPREb_A");
  expect(route()).toBe("/album/MPREb_A");
  await paste("https://music.youtube.com/browse/MPREb_B");
  expect(route()).toBe("/album/MPREb_B");
  expect(screen.getAllByText("Second Album").length).toBeGreaterThan(0);
  await act(async () => slowA.resolve(album("MPREb_A", "First Album")));
  expect(route()).toBe("/album/MPREb_B");
  expect(screen.queryByText("First Album")).toBeNull();
  expect(screen.getAllByText("Second Album").length).toBeGreaterThan(0);
});

it("drops search results that arrive after a newer search (U4-009)", async () => {
  const { default: App } = await import("./App");
  const slow = deferred<unknown>();
  const song = (id: string, title: string) => ({ id, kind: "song", title, subtitle: "", artists: [], videoId: id });
  overrides.ytm_search = (args) =>
    (args as { query: string }).query === "first"
      ? slow.promise
      : Promise.resolve({ items: [song("vid_second", "Second result")], continuation: null });
  const { container } = await act(async () => render(<App />));
  const input = container.querySelector<HTMLInputElement>(".search-form input")!;
  const searchFor = async (text: string) =>
    act(async () => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.submit(input.closest("form")!);
    });
  await searchFor("first");
  await searchFor("second");
  expect(screen.getAllByText("Second result").length).toBeGreaterThan(0);
  await act(async () => slow.resolve({ items: [song("vid_first", "First result")], continuation: null }));
  expect(container.querySelector("main")?.getAttribute("data-route")).toBe("/search?q=second");
  expect(screen.queryByText("First result")).toBeNull();
  expect(screen.getAllByText("Second result").length).toBeGreaterThan(0);
});

it("shows search results as they were left when going back (U4-010)", async () => {
  const { default: App } = await import("./App");
  overrides.ytm_search = async () => ({
    items: [{ id: "vid_lofi", kind: "song", title: "Lofi result", subtitle: "", artists: [], videoId: "vid_lofi" }],
    continuation: null,
  });
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const input = container.querySelector<HTMLInputElement>(".search-form input")!;
  await act(async () => {
    fireEvent.change(input, { target: { value: "lofi" } });
    fireEvent.submit(input.closest("form")!);
  });
  expect(route()).toBe("/search?q=lofi");
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Library/ })));
  invoke.mockClear();
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Back" })));
  expect(route()).toBe("/search?q=lofi");
  expect(screen.getAllByText("Lofi result").length).toBeGreaterThan(0);
  expect(invoke).not.toHaveBeenCalledWith("ytm_search", expect.anything());
});

it("returns to the library with the filter it was left with (U4-010)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const click = async (element: HTMLElement) => act(async () => void fireEvent.click(element));
  const librarySearch = () => screen.getByPlaceholderText<HTMLInputElement>("Search your library");
  await click(screen.getByRole("button", { name: /Library/ }));
  await act(async () => void fireEvent.change(librarySearch(), { target: { value: "lofi" } }));
  await click(screen.getByRole("button", { name: /History/ }));
  await click(screen.getByRole("button", { name: /Library/ }));
  // A later visit changes the filter …
  await act(async () => void fireEvent.change(librarySearch(), { target: { value: "" } }));
  await click(screen.getByRole("button", { name: "Back" }));
  expect(route()).toBe("/history/local");
  await click(screen.getByRole("button", { name: "Back" }));
  // … but Back returns to the first visit as it was left.
  expect(route()).toBe("/library/mix");
  expect(librarySearch().value).toBe("lofi");
});

it("returns to the scroll position inside an album page (U4-010)", async () => {
  const { default: App } = await import("./App");
  const { container } = await act(async () => render(<App />));
  const route = () => container.querySelector("main")?.getAttribute("data-route");
  const click = async (element: HTMLElement) => act(async () => void fireEvent.click(element));
  await click(screen.getByTitle("Open album"));
  const panel = container.querySelector<HTMLElement>("[data-screen-scroll]")!;
  panel.scrollTop = 420;
  await click(screen.getByRole("button", { name: /History/ }));
  expect(container.querySelector("[data-screen-scroll]")).toBeNull();
  await click(screen.getByRole("button", { name: "Back" }));
  expect(route()).toBe("/album/MPREb_test");
  expect(container.querySelector<HTMLElement>("[data-screen-scroll]")?.scrollTop).toBe(420);
});

it("builds the item menu from the capability model (U4-011)", async () => {
  const { default: App } = await import("./App");
  await act(async () => render(<App />));
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "More options for Test Album" })));
  const menu = screen.getByRole("dialog");
  const labels = [...menu.querySelectorAll(".menu-option")].map((button) => button.textContent);
  // An album has no track actions; the model offers pinning and queueing only.
  expect(labels).toEqual(["Pin to Speed Dial", "Add to queue"]);
  invoke.mockClear();
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Pin to Speed Dial" })));
  expect(invoke).toHaveBeenCalledWith("speed_dial_toggle", expect.objectContaining({ pinned: true }));
});
