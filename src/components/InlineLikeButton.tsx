import { useEffect, useState } from "react";
import { call } from "../lib/ipc";
import type { AudioQuality } from "../lib/audioQuality";
import type { YtItem } from "../types";

export function InlineLikeButton({
  item,
  autoDownloadOnLike = false,
  audioQuality = "auto",
}: {
  item: YtItem;
  autoDownloadOnLike?: boolean;
  audioQuality?: AudioQuality;
}) {
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void call("library_item_state", { id: item.id })
      .then((state) => {
        if (active) setLiked(state.liked);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [item.id]);

  const toggle = async () => {
    if ((!item.videoId && !item.localPath) || busy) return;
    setBusy(true);
    try {
      const nextLiked = !liked;
      await call("library_toggle_liked", { item, liked: nextLiked });
      setLiked(nextLiked);
      if (autoDownloadOnLike && nextLiked && item.videoId)
        void call("download_start", { item, audioQuality }).catch(() => undefined);
      if (item.videoId) {
        try {
          const session = await call("session_status");
          if (session.authenticated) await call("ytm_toggle_like", { videoId: item.videoId, liked: nextLiked, item });
        } catch {
          // Meld keeps the local favorite when the optional signed-in sync is unavailable.
        }
      }
    } catch {
      // The parent menu/notice owns the detailed error surface; this button stays unchanged on failure.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className={liked ? "inline-like liked" : "inline-like"}
      disabled={(!item.videoId && !item.localPath) || busy}
      onClick={() => void toggle()}
      title={liked ? "Remove from Meld Liked Songs" : "Add to Meld Liked Songs"}
      aria-label={liked ? `Unlike ${item.title}` : `Like ${item.title}`}
    >
      {liked ? "♥" : "♡"}
    </button>
  );
}
