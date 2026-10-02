import { ItemCard } from "../../components/ItemCard";
import { Section } from "../../components/Section";
import { YtItem, LoadState, HomePage } from "../../types";

export type HomeScreenProps = {
  hideItem: (item: YtItem) => boolean;
  home: LoadState<HomePage>;
  homeMoreLoading: boolean;
  loadHome: () => Promise<void>;
  loadHomeMore: () => Promise<void>;
  openItem: (item: YtItem, sourceQueue?: YtItem[], sourceIndex?: number) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  speedDial: YtItem[];
};

export function HomeScreen({
  hideItem,
  home,
  homeMoreLoading,
  loadHome,
  loadHomeMore,
  openItem,
  openMenu,
  speedDial,
}: HomeScreenProps) {
  return (
    <>
      {home.status === "loading" && (
        <div className="boot-screen">
          <div className="brand-mark">M</div>
          <h2>Loading Meld</h2>
          <p>Connecting to YouTube Music…</p>
          <div className="spinner" />
        </div>
      )}
      {home.status !== "loading" && (
        <>
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Discover</p>
                <h2>Explore YouTube Music</h2>
                <p>Open the live source discovery pages without leaving Meld Desktop.</p>
              </div>
            </div>
            <div className="library-filter-chips" role="navigation" aria-label="Discover">
              <button
                className="library-tab"
                onClick={() =>
                  void openItem({
                    id: "FEmusic_explore",
                    kind: "browse",
                    title: "Explore",
                    subtitle: "YouTube Music discovery",
                    artists: [],
                    browseId: "FEmusic_explore",
                  })
                }
              >
                Explore
              </button>
              <button
                className="library-tab"
                onClick={() =>
                  void openItem({
                    id: "FEmusic_charts",
                    kind: "browse",
                    title: "Charts",
                    subtitle: "YouTube Music charts",
                    artists: [],
                    browseId: "FEmusic_charts",
                    params: "ggMGCgQIgAQ%3D",
                  })
                }
              >
                Charts
              </button>
              <button
                className="library-tab"
                onClick={() =>
                  void openItem({
                    id: "FEmusic_moods_and_genres",
                    kind: "browse",
                    title: "Moods & genres",
                    subtitle: "YouTube Music moods and genres",
                    artists: [],
                    browseId: "FEmusic_moods_and_genres",
                  })
                }
              >
                Moods & genres
              </button>
              <button
                className="library-tab"
                onClick={() =>
                  void openItem({
                    id: "FEmusic_new_releases_albums",
                    kind: "browse",
                    title: "New releases",
                    subtitle: "YouTube Music new releases",
                    artists: [],
                    browseId: "FEmusic_new_releases_albums",
                  })
                }
              >
                New releases
              </button>
            </div>
          </section>
          {speedDial.length > 0 && (
            <section className="content-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Pinned</p>
                  <h2>Speed Dial</h2>
                </div>
              </div>
              <div className="card-row">
                {speedDial.map((item) => (
                  <ItemCard
                    key={`speed-${item.kind}-${item.id}`}
                    item={item}
                    onOpen={openItem}
                    onMenu={(value) => void openMenu(value)}
                  />
                ))}
              </div>
            </section>
          )}
          {home.status === "error" && (
            <div className="state-panel error">
              <h2>Home unavailable</h2>
              <p>{home.error}</p>
              <button className="primary-button" onClick={() => void loadHome()}>
                Retry
              </button>
            </div>
          )}
          {home.status === "ready" && home.data.sections.length === 0 && (
            <div className="state-panel">
              <h2>No Home sections</h2>
              <p>YouTube Music returned no typed sections for the current anonymous session.</p>
              <button className="primary-button" onClick={() => void loadHome()}>
                Retry
              </button>
            </div>
          )}
          {home.status === "ready" &&
            home.data.sections.map((section) => (
              <Section
                key={section.title}
                section={section}
                onOpen={openItem}
                shouldHide={hideItem}
                onMenu={(item) => void openMenu(item)}
              />
            ))}
          {home.status === "ready" && home.data.continuation && (
            <button className="primary-button home-more" disabled={homeMoreLoading} onClick={() => void loadHomeMore()}>
              {homeMoreLoading ? "Loading more Home…" : "Load more Home"}
            </button>
          )}
        </>
      )}
    </>
  );
}
