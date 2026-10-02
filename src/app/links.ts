// U4-007: one parser for every link Meld understands. Hosts are matched exactly and IDs against their alphabet, so a
// look-alike host or a crafted ID never reaches a command.
import { isValidRoute, parseRoutePath, Route } from "./routes";

export type SpotifyLinkType = "track" | "album" | "artist" | "playlist";

export type LinkTarget =
  /** A page Meld can show. */
  | { kind: "route"; route: Route }
  /** A YouTube video or YouTube Music song, played directly. */
  | { kind: "video"; videoId: string }
  /** A Spotify item that has no Meld page (tracks, albums, artists). */
  | { kind: "spotify"; type: Exclude<SpotifyLinkType, "playlist">; id: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_ID = /^[A-Za-z0-9_-]{2,200}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);

const video = (id: string | null | undefined): LinkTarget | null =>
  id && VIDEO_ID.test(id) ? { kind: "video", videoId: id } : null;

const route = (value: Route): LinkTarget | null => (isValidRoute(value) ? { kind: "route", route: value } : null);

/** A YouTube Music browse ID as the page it opens. */
function browseRoute(browseId: string): LinkTarget | null {
  if (!YT_ID.test(browseId)) return null;
  if (browseId.startsWith("MPREb_")) return route({ name: "album", browseId });
  if (browseId.startsWith("MPSP")) return route({ name: "podcast", browseId });
  if (browseId.startsWith("VL")) return route({ name: "playlist", playlistId: browseId.slice(2) });
  if (browseId.startsWith("UC")) return route({ name: "artist", browseId });
  return route({ name: "browse", browseId });
}

function parseYouTube(url: URL): LinkTarget | null {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return video(url.pathname.split("/")[1]);
  if (!YOUTUBE_HOSTS.has(host)) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  // A watch link inside a playlist plays the video.
  if (first === "watch") return video(url.searchParams.get("v"));
  if ((first === "shorts" || first === "embed" || first === "live") && second) return video(second);
  if (first === "playlist") {
    const list = url.searchParams.get("list");
    return list && YT_ID.test(list) ? route({ name: "playlist", playlistId: list }) : null;
  }
  if (first === "browse" && second) return browseRoute(second);
  if (first === "channel" && second?.startsWith("UC")) return route({ name: "artist", browseId: second });
  if (first === "search") {
    const query = url.searchParams.get("q") ?? url.searchParams.get("search_query");
    return query ? route({ name: "search", query }) : null;
  }
  return null;
}

function spotifyTarget(type: string, id: string): LinkTarget | null {
  if (!SPOTIFY_ID.test(id)) return null;
  if (type === "playlist") return route({ name: "spotify-playlist", playlistId: id });
  if (type === "track" || type === "album" || type === "artist") return { kind: "spotify", type, id };
  return null;
}

function parseSpotify(url: URL): LinkTarget | null {
  if (!SPOTIFY_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  if (parts[0] === "collection" && parts[1] === "tracks") return route({ name: "spotify-liked" });
  return parts.length === 2 ? spotifyTarget(parts[0], parts[1]) : null;
}

/** `meld://album/MPREb_x`, `meld:/search?q=x`, `meld://song/<videoId>`. */
function parseMeld(rest: string): LinkTarget | null {
  const path = "/" + rest.replace(/^\/+/, "");
  const song = path.match(/^\/song\/([^/?#]+)$/);
  if (song) return video(song[1]);
  const parsed = parseRoutePath(path);
  return parsed ? { kind: "route", route: parsed } : null;
}

/** Parses a pasted or opened link; returns null for plain text and for anything Meld does not open. */
export function parseLink(input: string): LinkTarget | null {
  const text = input.trim();
  if (!text || text.length > 2000 || /\s/.test(text)) return null;
  const meld = text.match(/^meld:(.*)$/i);
  if (meld) return parseMeld(meld[1]);
  const spotifyUri = text.match(/^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/i);
  if (spotifyUri) return spotifyTarget(spotifyUri[1].toLowerCase(), spotifyUri[2]);
  if (text.startsWith("/")) {
    const parsed = parseRoutePath(text);
    return parsed ? { kind: "route", route: parsed } : null;
  }
  // Links are often pasted without a scheme ("youtu.be/…", "music.youtube.com/…").
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return null;
  return parseYouTube(url) ?? parseSpotify(url);
}
