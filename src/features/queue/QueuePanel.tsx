import { Dispatch, SetStateAction } from "react";
import { mediaSrc } from "../../lib/media";
import { YtItem, PlayerPayload } from "../../types";
import { withOccurrences } from "../../lib/identity";

export type QueuePanelProps = {
  clearQueue: () => void;
  moveQueueItem: (from: number, to: number) => void;
  player: { item: YtItem; payload: PlayerPayload; session: number } | null;
  playQueueIndex: (index: number) => Promise<void>;
  queueIndex: number;
  queueItems: YtItem[];
  queueOpen: boolean;
  removeQueueItem: (index: number) => void;
  setQueueOpen: Dispatch<SetStateAction<boolean>>;
};

export function QueuePanel({
  clearQueue,
  moveQueueItem,
  player,
  playQueueIndex,
  queueIndex,
  queueItems,
  queueOpen,
  removeQueueItem,
  setQueueOpen,
}: QueuePanelProps) {
  return (
    <>
      {queueOpen && player && (
        <div
          className="detail-overlay queue-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setQueueOpen(false)}
        >
          <div className="queue-panel" onClick={(event) => event.stopPropagation()}>
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setQueueOpen(false)}>
              ×
            </button>
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Queue</p>
                <h2>{queueItems.length > 0 ? `${queueItems.length} songs` : "Queue"}</h2>
              </div>
              {queueItems.length > 0 && (
                <button className="secondary-button" onClick={clearQueue}>
                  Clear queue
                </button>
              )}
            </div>
            <div className="queue-list">
              {queueItems.length === 0 ? (
                <div className="state-panel">
                  <p>No songs are queued.</p>
                </div>
              ) : (
                withOccurrences(queueItems, "queue").map(({ item, key, index }) => (
                  <div key={key} className={index === queueIndex ? "queue-item active" : "queue-item"}>
                    <button
                      className="queue-item-play"
                      onClick={() => {
                        setQueueOpen(false);
                        void playQueueIndex(index);
                      }}
                    >
                      <span>{index + 1}</span>
                      {mediaSrc(item.thumbnail) && <img src={mediaSrc(item.thumbnail) as string} alt="" />}
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                    </button>
                    <span className="queue-item-actions">
                      <button
                        className="queue-item-action"
                        disabled={index === 0}
                        onClick={() => moveQueueItem(index, index - 1)}
                        title="Move up"
                        aria-label={`Move ${item.title} up`}
                      >
                        ↑
                      </button>
                      <button
                        className="queue-item-action"
                        disabled={index === queueItems.length - 1}
                        onClick={() => moveQueueItem(index, index + 1)}
                        title="Move down"
                        aria-label={`Move ${item.title} down`}
                      >
                        ↓
                      </button>
                      <button
                        className="queue-item-action"
                        onClick={() => removeQueueItem(index)}
                        title="Remove from queue"
                        aria-label={`Remove ${item.title} from queue`}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
