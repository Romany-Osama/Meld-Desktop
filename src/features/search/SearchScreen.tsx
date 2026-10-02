import { Dispatch, SetStateAction } from "react";
import { InlineLikeButton } from "../../components/InlineLikeButton";
import { ItemCard } from "../../components/ItemCard";
import { AudioQuality } from "../../lib/audioQuality";
import { YtItem, LoadState, SearchPage } from "../../types";

export type SearchScreenProps = {
  audioQuality: AudioQuality;
  closeSelection: () => void;
  hideItem: (item: YtItem) => boolean;
  loadSearchMore: () => Promise<void>;
  openItem: (item: YtItem, sourceQueue?: YtItem[], sourceIndex?: number) => Promise<void>;
  openLyrics: (item: YtItem) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  search: LoadState<SearchPage>;
  searchMoreLoading: boolean;
  selectedItems: YtItem[];
  selectionMode: boolean;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  settings: Record<string, boolean>;
  submittedQuery: string;
  toggleSelectedItem: (item: YtItem) => void;
};

export function SearchScreen({
  audioQuality,
  closeSelection,
  hideItem,
  loadSearchMore,
  openItem,
  openLyrics,
  openMenu,
  search,
  searchMoreLoading,
  selectedItems,
  selectionMode,
  setSelectionMode,
  settings,
  submittedQuery,
  toggleSelectedItem,
}: SearchScreenProps) {
  return (
    <>
      {
        <div className="search-page">
          <div className="search-intro">
            <p className="eyebrow">Online search</p>
            <h2>{submittedQuery ? `Results for “${submittedQuery}”` : "Search YouTube Music"}</h2>
            <p>Results remain typed as Meld YTItems: songs, albums, playlists, artists, podcasts and episodes.</p>
            <button
              className="secondary-button"
              onClick={() => (selectionMode ? closeSelection() : setSelectionMode(true))}
            >
              {selectionMode ? `Done${selectedItems.length > 0 ? ` · ${selectedItems.length}` : ""}` : "Select"}
            </button>
          </div>
          {search.status === "idle" && (
            <div className="state-panel">
              <p>Enter a query above to search.</p>
            </div>
          )}
          {search.status === "loading" && (
            <div className="state-panel">
              <div className="spinner" />
              <p>Searching YouTube Music…</p>
            </div>
          )}
          {search.status === "error" && (
            <div className="state-panel error">
              <h2>Search unavailable</h2>
              <p>{search.error}</p>
            </div>
          )}
          {search.status === "ready" && (
            <div className="result-list">
              {search.data.items
                .filter((item) => !hideItem(item))
                .map((item) => (
                  <div className="result-row" key={`${item.kind}-${item.id}`}>
                    {selectionMode && (
                      <input
                        className="selection-checkbox"
                        type="checkbox"
                        checked={selectedItems.some((value) => value.id === item.id)}
                        onChange={() => toggleSelectedItem(item)}
                        aria-label={`Select ${item.title}`}
                      />
                    )}
                    <ItemCard item={item} onOpen={openItem} />
                    {item.kind === "song" && (
                      <InlineLikeButton
                        item={item}
                        autoDownloadOnLike={settings.autoDownloadOnLike === true}
                        audioQuality={audioQuality}
                      />
                    )}
                    <div className="row-actions">
                      <button className="row-action" onClick={() => void openItem(item)}>
                        {item.kind === "song" ? "Play in Meld" : "Open"}
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
          {search.data.continuation && (
            <button
              className="primary-button playlist-more"
              disabled={searchMoreLoading}
              onClick={() => void loadSearchMore()}
            >
              {searchMoreLoading ? "Loading more results…" : "Load more results"}
            </button>
          )}
        </div>
      }
    </>
  );
}
