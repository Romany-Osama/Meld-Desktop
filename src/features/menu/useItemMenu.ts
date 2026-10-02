import { call } from "../../lib/ipc";
import { useState, useEffect } from "react";
import { parseLink } from "../../app/links";
import { errorMessage } from "../../lib/util";
import { YtItem, SpotifyTrackMatch, LoadState, LibraryItemState } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type ItemMenuDeps = {
  setNotice: SetNotice;
};

export function useItemMenu({ setNotice }: ItemMenuDeps) {
  const [artistPickerItem, setArtistPickerItem] = useState<YtItem | null>(null);
  const [editItem, setEditItem] = useState<YtItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [infoItem, setInfoItem] = useState<YtItem | null>(null);
  const [menuItem, setMenuItem] = useState<YtItem | null>(null);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [speedDialogOpen, setSpeedDialogOpen] = useState(false);
  const [menuSpotifyMatch, setMenuSpotifyMatch] = useState<SpotifyTrackMatch | null>(null);
  const [youtubeMatchItem, setYoutubeMatchItem] = useState<{ item: YtItem; match: SpotifyTrackMatch } | null>(null);
  const [youtubeMatchUrl, setYoutubeMatchUrl] = useState("");
  const [youtubeMatchPreview, setYoutubeMatchPreview] = useState<LoadState<YtItem | null> | null>(null);

  const [menuState, setMenuState] = useState<LibraryItemState>({
    liked: false,
    youtubeLiked: false,
    inLibrary: false,
    uploaded: false,
    pinned: false,
  });

  const [playerItemState, setPlayerItemState] = useState<LibraryItemState | null>(null);

  useEffect(() => {
    const parsed = parseLink(youtubeMatchUrl);
    if (!youtubeMatchItem || parsed?.kind !== "video") {
      setYoutubeMatchPreview(null);
      return;
    }
    let activeRequest = true;
    setYoutubeMatchPreview({ status: "loading", data: null });
    void call("ytm_refetch", { videoId: parsed.videoId })
      .then((item) => {
        if (!activeRequest) return;
        setYoutubeMatchPreview(
          item ? { status: "ready", data: item } : { status: "error", data: null, error: "Video not found" },
        );
      })
      .catch((error) => {
        if (activeRequest) setYoutubeMatchPreview({ status: "error", data: null, error: errorMessage(error) });
      });
    return () => {
      activeRequest = false;
    };
  }, [youtubeMatchItem?.item.id, youtubeMatchUrl]);

  const confirmYoutubeVersion = async () => {
    const match = youtubeMatchItem?.match;
    const preview = youtubeMatchPreview?.status === "ready" ? youtubeMatchPreview.data : null;
    if (!match || !preview?.videoId) return;
    try {
      const artist = preview.artists.map((value) => value.name).join(", ") || preview.subtitle || "";
      await call("spotify_override_youtube", {
        spotifyId: match.id,
        youtubeId: preview.videoId,
        title: preview.title,
        artist,
      });
      setYoutubeMatchItem(null);
      setYoutubeMatchPreview(null);
      setNotice(`Changed the YouTube version for “${match.name}”.`);
    } catch (error) {
      setNotice(`YouTube version change failed: ${errorMessage(error)}`, "error");
    }
  };

  return {
    artistPickerItem,
    setArtistPickerItem,
    editItem,
    setEditItem,
    editTitle,
    setEditTitle,
    editArtist,
    setEditArtist,
    infoItem,
    setInfoItem,
    menuItem,
    setMenuItem,
    playerMenuOpen,
    setPlayerMenuOpen,
    speedDialogOpen,
    setSpeedDialogOpen,
    menuSpotifyMatch,
    setMenuSpotifyMatch,
    youtubeMatchItem,
    setYoutubeMatchItem,
    youtubeMatchUrl,
    setYoutubeMatchUrl,
    youtubeMatchPreview,
    setYoutubeMatchPreview,
    menuState,
    setMenuState,
    playerItemState,
    setPlayerItemState,
    confirmYoutubeVersion,
  };
}
