// U4-001: route-level screens render on their own, outside App.tsx.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { YtItem } from "../types";
import { HomeScreen } from "./home/HomeScreen";
import { QueuePanel } from "./queue/QueuePanel";

const song = (id: string, title: string): YtItem => ({
  id,
  kind: "song",
  title,
  subtitle: "Artist",
  artists: [{ name: "Artist" }],
  videoId: id,
  thumbnail: "https://i.ytimg.com/vi/x/default.jpg",
});
const noop = () => undefined;
const asyncNoop = async () => undefined;

describe("HomeScreen", () => {
  const props = {
    hideItem: () => false,
    homeMoreLoading: false,
    loadHome: asyncNoop,
    loadHomeMore: asyncNoop,
    openItem: asyncNoop,
    openMenu: asyncNoop,
    speedDial: [],
  };

  it("shows the boot screen while Home loads", () => {
    const html = renderToStaticMarkup(<HomeScreen {...props} home={{ status: "loading", data: { sections: [] } }} />);
    expect(html).toContain("Loading Meld");
  });

  it("renders Home sections and their items", () => {
    const html = renderToStaticMarkup(
      <HomeScreen
        {...props}
        home={{ status: "ready", data: { sections: [{ title: "Quick picks", items: [song("a", "First song")] }] } }}
      />,
    );
    expect(html).toContain("Quick picks");
    expect(html).toContain("First song");
    expect(html).not.toContain("Loading Meld");
  });
});

describe("QueuePanel", () => {
  const items = [song("a", "First song"), song("b", "Second song")];
  const props = {
    clearQueue: noop,
    moveQueueItem: noop,
    playQueueIndex: asyncNoop,
    queueIndex: 0,
    queueItems: items,
    removeQueueItem: noop,
    setQueueOpen: noop,
    player: {
      item: items[0],
      payload: {
        videoId: "a",
        streamUrl: "https://example.invalid/a",
        mimeType: "audio/webm",
        bitrate: 0,
        expiresInSeconds: 0,
      },
      session: 1,
    },
  };

  it("lists every queued song when open", () => {
    const html = renderToStaticMarkup(<QueuePanel {...props} queueOpen />);
    expect(html).toContain("2 songs");
    expect(html).toContain("First song");
    expect(html).toContain("Second song");
  });

  it("renders nothing when closed or when nothing plays", () => {
    expect(renderToStaticMarkup(<QueuePanel {...props} queueOpen={false} />)).toBe("");
    expect(renderToStaticMarkup(<QueuePanel {...props} queueOpen player={null} />)).toBe("");
  });
});
