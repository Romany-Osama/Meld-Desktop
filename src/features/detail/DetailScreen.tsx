import { Dispatch, SetStateAction } from "react";
import { InlineLikeButton } from "../../components/InlineLikeButton";
import { AudioQuality } from "../../lib/audioQuality";
import { mediaSrc } from "../../lib/media";
import { LoadState, DetailPage, YtItem } from "../../types";

export type DetailScreenProps = {
  audioQuality: AudioQuality;
  detail: LoadState<DetailPage> | null;
  detailArtistSubscribed: boolean;
  detailMoreLoading: boolean;
  detailRefreshing: boolean;
  loadDetailMore: () => Promise<void>;
  openDetailItem: (item: YtItem) => Promise<void>;
  openMenu: (item: YtItem) => Promise<void>;
  refreshPodcastDetail: () => Promise<void>;
  setDetail: Dispatch<SetStateAction<LoadState<DetailPage> | null>>;
  settings: Record<string, boolean>;
  toggleDetailArtistSubscription: () => Promise<void>;
};

export function DetailScreen({
  audioQuality,
  detail,
  detailArtistSubscribed,
  detailMoreLoading,
  detailRefreshing,
  loadDetailMore,
  openDetailItem,
  openMenu,
  refreshPodcastDetail,
  setDetail,
  settings,
  toggleDetailArtistSubscription,
}: DetailScreenProps) {
  return (
    <>
      {detail && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel">
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setDetail(null)}>
              ×
            </button>
            {detail.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading {detail.data.kind}…</p>
              </div>
            )}
            {detail.status === "error" && (
              <div className="state-panel error">
                <h2>{detail.data.kind} unavailable</h2>
                <p>{detail.error}</p>
              </div>
            )}
            {detail.status === "ready" && (
              <>
                <div className="playlist-header">
                  {mediaSrc(detail.data.thumbnail) && <img src={mediaSrc(detail.data.thumbnail) as string} alt="" />}
                  <div>
                    <p className="eyebrow">{detail.data.kind}</p>
                    <h2>{detail.data.title || "Untitled"}</h2>
                    <p>{detail.data.subtitle}</p>
                  </div>
                  <div className="detail-header-actions">
                    {detail.data.kind === "artist" && (
                      <button
                        className={detailArtistSubscribed ? "secondary-button active-control" : "secondary-button"}
                        onClick={() => void toggleDetailArtistSubscription()}
                      >
                        {detailArtistSubscribed ? "Following" : "Follow"}
                      </button>
                    )}
                    {detail.data.kind === "podcast" && (
                      <button
                        className="secondary-button"
                        onClick={() => void refreshPodcastDetail()}
                        disabled={detailRefreshing}
                      >
                        {detailRefreshing ? "Refreshing…" : "Refresh"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="playlist-songs">
                  {detail.data.items.length === 0 ? (
                    <div className="state-panel">
                      <p>This browse response contained no typed items.</p>
                    </div>
                  ) : (
                    detail.data.items.map((item, itemIndex) => (
                      <div className="song-row-wrap" key={`${item.kind}-${item.id}-${itemIndex}`}>
                        <button className="song-row" onClick={() => void openDetailItem(item)}>
                          {mediaSrc(item.thumbnail) && <img src={mediaSrc(item.thumbnail) as string} alt="" />}
                          <span className="song-copy">
                            <strong>{item.title}</strong>
                            <small>{item.subtitle}</small>
                          </span>
                          <span className="song-kind">{item.kind}</span>
                        </button>
                        {item.kind === "song" && (
                          <InlineLikeButton
                            item={item}
                            autoDownloadOnLike={settings.autoDownloadOnLike === true}
                            audioQuality={audioQuality}
                          />
                        )}
                        <button
                          className="song-row-menu"
                          onClick={() => void openMenu(item)}
                          title={`More options for ${item.title}`}
                          aria-label={`More options for ${item.title}`}
                        >
                          ⋮
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {detail.data.continuation && (
                  <button
                    className="primary-button playlist-more"
                    disabled={detailMoreLoading}
                    onClick={() => void loadDetailMore()}
                  >
                    {detailMoreLoading ? "Loading more…" : "Load more"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
