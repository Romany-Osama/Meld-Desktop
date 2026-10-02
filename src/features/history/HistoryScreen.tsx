import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction } from "react";
import { InlineLikeButton } from "../../components/InlineLikeButton";
import { ItemCard } from "../../components/ItemCard";
import { AudioQuality } from "../../lib/audioQuality";
import { YtItem, LoadState, RemoteHistoryPage, SessionStatus } from "../../types";
import type { Destructive } from "../../app/destructive";

export type HistoryScreenProps = {
  audioQuality: AudioQuality;
  closeSelection: () => void;
  hideItem: (item: YtItem) => boolean;
  history: LoadState<YtItem[]>;
  historyQuery: string;
  historySource: "local" | "remote";
  loadHistory: () => Promise<void>;
  loadRemoteHistory: () => Promise<void>;
  openItem: (item: YtItem, sourceQueue?: YtItem[], sourceIndex?: number) => Promise<void>;
  openLyrics: (item: YtItem) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  remoteHistory: LoadState<RemoteHistoryPage>;
  selectedItems: YtItem[];
  selectionMode: boolean;
  sessionStatus: SessionStatus;
  setHistoryQuery: Dispatch<SetStateAction<string>>;
  setHistorySource: Dispatch<SetStateAction<"local" | "remote">>;
  destructive: Destructive;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  settings: Record<string, boolean>;
  toggleSelectedItem: (item: YtItem) => void;
  visibleLocalHistory: YtItem[];
};

export function HistoryScreen({
  audioQuality,
  closeSelection,
  hideItem,
  history,
  historyQuery,
  historySource,
  loadHistory,
  loadRemoteHistory,
  openItem,
  openLyrics,
  openMenu,
  remoteHistory,
  selectedItems,
  selectionMode,
  sessionStatus,
  setHistoryQuery,
  setHistorySource,
  destructive,
  setSelectionMode,
  settings,
  toggleSelectedItem,
  visibleLocalHistory,
}: HistoryScreenProps) {
  return (
    <>
      {
        <div className="history-page">
          <div className="search-intro">
            <p className="eyebrow">Playback history</p>
            <h2>History</h2>
            <p>
              {historySource === "remote"
                ? "Your YouTube Music history, grouped the same way as Meld."
                : "Tracks opened in Meld are kept locally on this device."}
            </p>
            <div className="history-toolbar">
              <div className="history-tabs" role="tablist" aria-label="History source">
                <button
                  role="tab"
                  aria-selected={historySource === "local"}
                  className={historySource === "local" ? "library-tab active" : "library-tab"}
                  onClick={() => setHistorySource("local")}
                >
                  Local
                </button>
                {sessionStatus.authenticated && (
                  <button
                    role="tab"
                    aria-selected={historySource === "remote"}
                    className={historySource === "remote" ? "library-tab active" : "library-tab"}
                    onClick={() => setHistorySource("remote")}
                  >
                    Remote
                  </button>
                )}
              </div>
              <label className="history-search">
                <span>Filter</span>
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Search history"
                  aria-label="Search history"
                />
              </label>
              {historySource === "local" && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    void destructive({
                      severity: "permanent",
                      key: "history-clear",
                      confirm: {
                        title: "Clear local history?",
                        message: "Every song in Meld's playback history is removed. Stats lose these plays too.",
                        confirmLabel: "Clear history",
                      },
                      commit: () => invoke("history_clear"),
                      refresh: loadHistory,
                      success: "Meld playback history cleared.",
                      failure: "History could not be cleared",
                    })
                  }
                >
                  Clear local history
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => (selectionMode ? closeSelection() : setSelectionMode(true))}
              >
                {selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}
              </button>
            </div>
          </div>
          {historySource === "local" && history.status === "loading" && (
            <div className="state-panel">
              <div className="spinner" />
              <p>Loading local history…</p>
            </div>
          )}
          {historySource === "local" && history.status === "error" && (
            <div className="state-panel error">
              <h2>History unavailable</h2>
              <p>{history.error}</p>
              <button className="primary-button" onClick={() => void loadHistory()}>
                Retry
              </button>
            </div>
          )}
          {historySource === "local" && history.status === "ready" && history.data.length === 0 && (
            <div className="state-panel">
              <h2>No local history yet</h2>
              <p>Play a song from Home or Search and it will appear here.</p>
            </div>
          )}
          {historySource === "local" && history.status === "ready" && history.data.length > 0 && (
            <div className="result-list">
              {visibleLocalHistory.map((item, index) => (
                <div className="result-row" key={`${item.id}-${index}`}>
                  {selectionMode && (
                    <input
                      className="selection-checkbox"
                      type="checkbox"
                      checked={selectedItems.some((value) => value.id === item.id)}
                      onChange={() => toggleSelectedItem(item)}
                      aria-label={`Select ${item.title}`}
                    />
                  )}
                  <ItemCard item={item} onOpen={(value) => openItem(value, visibleLocalHistory, index)} />
                  {item.kind === "song" && (
                    <InlineLikeButton
                      item={item}
                      autoDownloadOnLike={settings.autoDownloadOnLike === true}
                      audioQuality={audioQuality}
                    />
                  )}
                  <div className="row-actions">
                    <button className="row-action" onClick={() => void openItem(item, visibleLocalHistory, index)}>
                      Play in Meld
                    </button>
                    {item.kind === "song" && (
                      <button className="row-action" onClick={() => void openLyrics(item)}>
                        Lyrics
                      </button>
                    )}
                    <button
                      className="row-action menu-trigger"
                      onClick={() => void openMenu(item)}
                      title={`More options for ${item.title}`}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {historySource === "remote" && remoteHistory.status === "loading" && (
            <div className="state-panel">
              <div className="spinner" />
              <p>Loading YouTube Music history…</p>
            </div>
          )}
          {historySource === "remote" && remoteHistory.status === "error" && (
            <div className="state-panel error">
              <h2>Remote history unavailable</h2>
              <p>{remoteHistory.error}</p>
              <button className="primary-button" onClick={() => void loadRemoteHistory()}>
                Retry
              </button>
            </div>
          )}
          {historySource === "remote" &&
            remoteHistory.status === "ready" &&
            remoteHistory.data.sections.length === 0 && (
              <div className="state-panel">
                <h2>No remote history</h2>
                <p>YouTube Music returned no history sections for this account.</p>
              </div>
            )}
          {historySource === "remote" &&
            remoteHistory.status === "ready" &&
            remoteHistory.data.sections.map((section) => {
              const queryText = historyQuery.trim().toLowerCase();
              const songs = section.songs.filter(
                (item) =>
                  !hideItem(item) && (!queryText || `${item.title} ${item.subtitle}`.toLowerCase().includes(queryText)),
              );
              return songs.length === 0 ? null : (
                <section className="history-section" key={section.title}>
                  <div className="section-heading">
                    <h3>{section.title}</h3>
                  </div>
                  <div className="result-list">
                    {songs.map((item, index) => (
                      <div className="result-row" key={`${section.title}-${item.id}-${index}`}>
                        {selectionMode && (
                          <input
                            className="selection-checkbox"
                            type="checkbox"
                            checked={selectedItems.some((value) => value.id === item.id)}
                            onChange={() => toggleSelectedItem(item)}
                            aria-label={`Select ${item.title}`}
                          />
                        )}
                        <ItemCard item={item} onOpen={(value) => openItem(value, songs, index)} />
                        {item.kind === "song" && (
                          <InlineLikeButton
                            item={item}
                            autoDownloadOnLike={settings.autoDownloadOnLike === true}
                            audioQuality={audioQuality}
                          />
                        )}
                        <div className="row-actions">
                          <button className="row-action" onClick={() => void openItem(item, songs, index)}>
                            Play in Meld
                          </button>
                          {item.kind === "song" && (
                            <button className="row-action" onClick={() => void openLyrics(item)}>
                              Lyrics
                            </button>
                          )}
                          <button
                            className="row-action menu-trigger"
                            onClick={() => void openMenu(item)}
                            title={`More options for ${item.title}`}
                          >
                            ⋮
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>
      }
    </>
  );
}
