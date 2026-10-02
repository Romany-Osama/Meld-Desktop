import { Dispatch, SetStateAction } from "react";
import { ItemCard } from "../../components/ItemCard";
import { YtItem, LoadState, StatsPayload } from "../../types";

export type StatsScreenProps = {
  loadStats: (period?: "all" | "day" | "week" | "month" | "year") => Promise<void>;
  openItem: (item: YtItem, sourceQueue?: YtItem[], sourceIndex?: number) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  setRecapOpen: Dispatch<SetStateAction<boolean>>;
  setStatsPeriod: Dispatch<SetStateAction<"all" | "day" | "week" | "month" | "year">>;
  stats: LoadState<StatsPayload>;
  statsPeriod: "all" | "day" | "week" | "month" | "year";
  statsQueueItems: YtItem[];
};

export function StatsScreen({
  loadStats,
  openItem,
  openMenu,
  setRecapOpen,
  setStatsPeriod,
  stats,
  statsPeriod,
  statsQueueItems,
}: StatsScreenProps) {
  return (
    <>
      {
        <div className="stats-page">
          <div className="search-intro">
            <p className="eyebrow">Listening statistics</p>
            <h2>Stats</h2>
            <p>Most-played songs and listening time from Meld playback history on this device.</p>
            <div className="history-tabs" role="tablist" aria-label="Stats period">
              {(["all", "day", "week", "month", "year"] as const).map((period) => (
                <button
                  key={period}
                  role="tab"
                  aria-selected={statsPeriod === period}
                  className={statsPeriod === period ? "library-tab active" : "library-tab"}
                  onClick={() => setStatsPeriod(period)}
                >
                  {period === "all"
                    ? "All time"
                    : period === "day"
                      ? "24 hours"
                      : period[0].toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
            <button
              className="secondary-button"
              onClick={() => setRecapOpen(true)}
              disabled={stats.status !== "ready" || stats.data.totalPlays === 0}
            >
              Local recap
            </button>
          </div>
          {stats.status === "loading" && (
            <div className="state-panel">
              <div className="spinner" />
              <p>Loading listening statistics…</p>
            </div>
          )}
          {stats.status === "error" && (
            <div className="state-panel error">
              <h2>Stats unavailable</h2>
              <p>{stats.error}</p>
              <button className="primary-button" onClick={() => void loadStats()}>
                Retry
              </button>
            </div>
          )}
          {stats.status === "ready" && (
            <>
              <div className="stats-summary-grid">
                <div className="stats-summary-card">
                  <strong>{stats.data.totalPlays}</strong>
                  <span>Plays</span>
                </div>
                <div className="stats-summary-card">
                  <strong>{stats.data.totalMinutes}</strong>
                  <span>Minutes listened</span>
                </div>
                <div className="stats-summary-card">
                  <strong>{stats.data.uniqueSongs}</strong>
                  <span>Unique songs</span>
                </div>
              </div>
              {(stats.data.artists.length > 0 || stats.data.albums.length > 0) && (
                <div className="stats-breakdown-grid">
                  {stats.data.artists.length > 0 && (
                    <section className="stats-breakdown">
                      <h3>Top artists</h3>
                      {stats.data.artists.slice(0, 10).map((artist, index) => (
                        <button
                          className="stats-breakdown-row"
                          key={`artist-${artist.id}`}
                          onClick={() =>
                            void openItem({
                              id: artist.id,
                              kind: "artist",
                              title: artist.title,
                              subtitle: artist.subtitle,
                              thumbnail: artist.thumbnail,
                              artists: [],
                              browseId: artist.id,
                            })
                          }
                        >
                          <span>{index + 1}</span>
                          <strong>{artist.title}</strong>
                          <small>{artist.plays} plays</small>
                        </button>
                      ))}
                    </section>
                  )}
                  {stats.data.albums.length > 0 && (
                    <section className="stats-breakdown">
                      <h3>Top albums</h3>
                      {stats.data.albums.slice(0, 10).map((album, index) => (
                        <button
                          className="stats-breakdown-row"
                          key={`album-${album.id}`}
                          onClick={() =>
                            void openItem({
                              id: album.id,
                              kind: "album",
                              title: album.title,
                              subtitle: album.subtitle,
                              thumbnail: album.thumbnail,
                              artists: [],
                              browseId: album.id,
                            })
                          }
                        >
                          <span>{index + 1}</span>
                          <strong>{album.title}</strong>
                          <small>{album.plays} plays</small>
                        </button>
                      ))}
                    </section>
                  )}
                </div>
              )}
              {stats.data.rows.length === 0 ? (
                <div className="state-panel">
                  <h2>No listening history yet</h2>
                  <p>Play a song from Home or Search and its statistics will appear here.</p>
                </div>
              ) : (
                <div className="result-list stats-list">
                  {stats.data.rows.map((row, index) => (
                    <div className="result-row stats-row" key={`${row.item.id}-${index}`}>
                      <span className="stats-rank">{index + 1}</span>
                      <ItemCard item={row.item} onOpen={(value) => openItem(value, statsQueueItems, index)} />
                      <span
                        className="stats-metrics"
                        title="New plays use measured playback time; older history rows may use track-duration estimates."
                      >
                        {row.plays} play{row.plays === 1 ? "" : "s"} · {row.minutes} min listened
                      </span>
                      <div className="row-actions">
                        <button className="row-action" onClick={() => void openItem(row.item, statsQueueItems, index)}>
                          Play in Meld
                        </button>
                        <button
                          className="row-action menu-trigger"
                          onClick={() => void openMenu(row.item)}
                          title={`More options for ${row.item.title}`}
                          aria-label={`More options for ${row.item.title}`}
                        >
                          ⋮
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      }
    </>
  );
}
