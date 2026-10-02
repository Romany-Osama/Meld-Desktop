import { invoke } from "@tauri-apps/api/core";
import { Dispatch, SetStateAction } from "react";
import { AudioQuality } from "../../lib/audioQuality";
import { errorMessage } from "../../lib/util";
import { PlaybackCachePanel } from "../../PlaybackCachePanel";
import { SessionStatus, SpotifyProfile, SpotifySessionStatus } from "../../types";
import { UpdatePanel } from "../../UpdatePanel";
import { lyricProviderSettingKeys } from "../lyrics/providers";

export type SettingsScreenProps = {
  audioQuality: AudioQuality;
  connectGoogle: () => Promise<void>;
  connectSpotify: () => Promise<void>;
  loadSearchHistory: () => Promise<void>;
  logoutGoogle: () => void;
  logoutSpotify: () => Promise<void>;
  lyricsProviderOrder: string[];
  moveLyricsProvider: (provider: string, direction: -1 | 1) => Promise<void>;
  sessionStatus: SessionStatus;
  setAudioQualitySetting: (value: AudioQuality) => Promise<void>;
  setNotice: Dispatch<SetStateAction<string>>;
  setSetting: (key: string, value: boolean) => Promise<void>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsPage: Dispatch<
    SetStateAction<"main" | "appearance" | "content" | "player" | "privacy" | "storage" | "integrations" | "about">
  >;
  settings: Record<string, boolean>;
  settingsLoading: boolean;
  settingsOpen: boolean;
  settingsPage: "main" | "appearance" | "content" | "player" | "privacy" | "storage" | "integrations" | "about";
  spotifyProfile: SpotifyProfile | null;
  spotifyStatus: SpotifySessionStatus;
};

export function SettingsScreen({
  audioQuality,
  connectGoogle,
  connectSpotify,
  loadSearchHistory,
  logoutGoogle,
  logoutSpotify,
  lyricsProviderOrder,
  moveLyricsProvider,
  sessionStatus,
  setAudioQualitySetting,
  setNotice,
  setSetting,
  setSettingsOpen,
  setSettingsPage,
  settings,
  settingsLoading,
  settingsOpen,
  settingsPage,
  spotifyProfile,
  spotifyStatus,
}: SettingsScreenProps) {
  return (
    <>
      {settingsOpen && (
        <div className="detail-overlay settings-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel settings-panel">
            <button
              className="close-button"
              title={settingsPage === "main" ? "Close" : "Back to settings"}
              aria-label={settingsPage === "main" ? "Close" : "Back to settings"}
              onClick={() => (settingsPage === "main" ? setSettingsOpen(false) : setSettingsPage("main"))}
            >
              {settingsPage === "main" ? "×" : "‹"}
            </button>
            <p className="eyebrow">Meld Desktop</p>
            <h2>
              {settingsPage === "main"
                ? "Settings"
                : settingsPage === "player"
                  ? "Player and audio"
                  : settingsPage === "content"
                    ? "Content"
                    : settingsPage === "privacy"
                      ? "Privacy"
                      : settingsPage === "storage"
                        ? "Storage and data"
                        : settingsPage === "integrations"
                          ? "Integrations"
                          : settingsPage === "appearance"
                            ? "Appearance"
                            : "About"}
            </h2>
            {!settingsLoading && settingsPage === "main" && (
              <div className="settings-hub">
                <button className="settings-nav-card" onClick={() => setSettingsPage("appearance")}>
                  <strong>Appearance</strong>
                  <small>Theme and player presentation</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("player")}>
                  <strong>Player and audio</strong>
                  <small>Queue, automix, and playback behavior</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("content")}>
                  <strong>Content</strong>
                  <small>Library sync, explicit content, and lyrics providers</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("privacy")}>
                  <strong>Privacy</strong>
                  <small>Listen/search history controls</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("storage")}>
                  <strong>Storage and data</strong>
                  <small>Local library and offline data</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("integrations")}>
                  <strong>Integrations</strong>
                  <small>Google and Spotify accounts</small>
                </button>
                <button className="settings-nav-card" onClick={() => setSettingsPage("about")}>
                  <strong>About</strong>
                  <small>Version and project information</small>
                </button>
              </div>
            )}
            {settingsPage === "appearance" && (
              <div className="settings-group">
                <h3>Appearance</h3>
                <p className="muted-copy">
                  Meld’s source appearance screen contains Android-specific theme, palette, and density controls.
                  Desktop keeps one native dark shell here until those controls have a real Windows renderer
                  implementation; no inert switches are shown.
                </p>
              </div>
            )}
            {settingsPage === "storage" && (
              <div className="settings-group">
                <h3>Storage and data</h3>
                <p className="muted-copy">
                  Offline downloads and the SQLite library are managed by their real download, playlist, logout, and
                  clear-data actions. Desktop playback cache is separate and appears in the Cached playlist; its size
                  limit is below.
                </p>
                <div className="storage-actions">
                  <button
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        const path = await invoke<string>("backup_create");
                        setNotice(`Meld Desktop backup created at ${path}.`);
                      } catch (error) {
                        if (!String(error).toLowerCase().includes("cancelled"))
                          setNotice(`Backup could not be created: ${errorMessage(error)}`);
                      }
                    }}
                  >
                    Create backup
                  </button>
                  <button
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        const path = await invoke<string>("backup_restore");
                        setNotice(`Backup restored from ${path}. Restart Meld Desktop to reload the restored library.`);
                      } catch (error) {
                        if (!String(error).toLowerCase().includes("cancelled"))
                          setNotice(`Backup could not be restored: ${errorMessage(error)}`);
                      }
                    }}
                  >
                    Restore backup
                  </button>
                </div>
                <p className="muted-copy">
                  Backups contain the Desktop SQLite library and non-sensitive settings only. Downloaded/player-cache
                  media files and imported external media are not embedded. Google/YouTube Music and Spotify sessions
                  are excluded and must be connected again after restore.
                </p>
              </div>
            )}
            {settingsPage === "storage" && <PlaybackCachePanel onNotice={setNotice} />}
            {settingsPage === "about" && (
              <div className="settings-group">
                <h3>About Meld Desktop</h3>
                <p className="muted-copy">
                  Native Tauri desktop adaptation of the live Meld/Metrolist source contracts. Source-dependent features
                  remain tracked in the audit rather than being presented as complete.
                </p>
              </div>
            )}
            {settingsPage === "about" && <UpdatePanel />}
            {settingsLoading ? (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading saved settings…</p>
              </div>
            ) : (
              <>
                {settingsPage === "content" && (
                  <div className="settings-group">
                    <h3>Content</h3>
                    <label className="setting-row">
                      <span>
                        <strong>Hide explicit content</strong>
                        <small>Hide items whose live metadata marks them explicit.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.hideExplicit}
                        onChange={(event) => void setSetting("hideExplicit", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Hide video songs</strong>
                        <small>Hide songs whose live source metadata marks them as video-only.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.hideVideoSongs}
                        onChange={(event) => void setSetting("hideVideoSongs", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable Better Lyrics</strong>
                        <small>Use the source TTML lyrics provider first when enabled.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enableBetterLyrics !== false}
                        onChange={(event) => void setSetting("enableBetterLyrics", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable Paxsenix</strong>
                        <small>Use the source Apple Music lyrics fallback after Better Lyrics when enabled.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enablePaxsenix !== false}
                        onChange={(event) => void setSetting("enablePaxsenix", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable LRCLIB</strong>
                        <small>Use the source LRCLIB matching fallback when enabled.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enableLrclib !== false}
                        onChange={(event) => void setSetting("enableLrclib", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable KuGou</strong>
                        <small>Use the source KuGou LRC fallback after LRCLIB when enabled.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enableKugou !== false}
                        onChange={(event) => void setSetting("enableKugou", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable LyricsPlus</strong>
                        <small>Use the source LyricsPlus mirror fallback after KuGou when enabled.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enableLyricsPlus === true}
                        onChange={(event) => void setSetting("enableLyricsPlus", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Enable Musixmatch</strong>
                        <small>Use the source opt-in Musixmatch guest-token fallback when available.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.enableMusixmatch === true}
                        onChange={(event) => void setSetting("enableMusixmatch", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Sync YouTube Music library</strong>
                        <small>
                          When enabled, Liked Songs, Library, and Uploaded filters use the authenticated source sync
                          path.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        disabled={!sessionStatus.authenticated}
                        checked={settings.ytmSync !== false}
                        onChange={(event) => void setSetting("ytmSync", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Use login for browse</strong>
                        <small>
                          Use the connected YouTube Music session for Home, search, details, playlists, and related
                          browse requests, matching Meld’s Account setting.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        disabled={!sessionStatus.authenticated}
                        checked={settings.useLoginForBrowse !== false}
                        onChange={(event) => void setSetting("useLoginForBrowse", event.target.checked)}
                      />
                    </label>
                  </div>
                )}
                {settingsPage === "privacy" && (
                  <div className="settings-group">
                    <h3>Privacy</h3>
                    <label className="setting-row">
                      <span>
                        <strong>Pause listen history</strong>
                        <small>Do not add locally played items to Meld’s listening history.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.pauseListenHistory === true}
                        onChange={(event) => void setSetting("pauseListenHistory", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Pause search history</strong>
                        <small>Do not save submitted searches to Meld’s recent-search list.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.pauseSearchHistory === true}
                        onChange={(event) => void setSetting("pauseSearchHistory", event.target.checked)}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      onClick={async () => {
                        try {
                          await invoke("search_history_clear");
                          await loadSearchHistory();
                          setNotice("Meld search history cleared.");
                        } catch (error) {
                          setNotice(`Search history could not be cleared: ${errorMessage(error)}`);
                        }
                      }}
                    >
                      Clear search history
                    </button>
                  </div>
                )}
                {settingsPage === "content" && (
                  <div className="settings-group">
                    <h3>Lyrics provider order</h3>
                    <p className="muted-copy">
                      Enabled providers are tried in this order. Disabled providers remain after them, matching Meld’s
                      provider registry.
                    </p>
                    <div className="lyrics-provider-order">
                      {lyricsProviderOrder.map((provider, index) => {
                        const enabled =
                          provider === "YouTube" ||
                          provider === "YouTubeSubtitle" ||
                          settings[lyricProviderSettingKeys[provider] ?? ""] === true;
                        return (
                          <div
                            className={enabled ? "provider-order-row" : "provider-order-row disabled"}
                            key={provider}
                          >
                            <span>
                              <strong>{provider === "YouTubeSubtitle" ? "YouTube Subtitle" : provider}</strong>
                              <small>{enabled ? `Priority ${index + 1}` : "Disabled"}</small>
                            </span>
                            {enabled && (
                              <span className="provider-order-buttons">
                                <button
                                  className="secondary-button"
                                  disabled={index === 0}
                                  onClick={() => void moveLyricsProvider(provider, -1)}
                                  title={`Move ${provider} up`}
                                >
                                  ↑
                                </button>
                                <button
                                  className="secondary-button"
                                  disabled={index === lyricsProviderOrder.length - 1}
                                  onClick={() => void moveLyricsProvider(provider, 1)}
                                  title={`Move ${provider} down`}
                                >
                                  ↓
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {settingsPage === "player" && (
                  <div className="settings-group">
                    <h3>Player and queue</h3>
                    <label className="setting-row">
                      <span>
                        <strong>Audio quality</strong>
                        <small>
                          Auto currently uses the highest direct original format on Desktop because native Windows
                          metered-network detection is not wired; High selects the highest direct original format, while
                          Low selects the lowest. Streams that need YouTube's signature step are handled locally when no
                          direct stream is available.
                        </small>
                      </span>
                      <select
                        value={audioQuality}
                        onChange={(event) => void setAudioQualitySetting(event.target.value as AudioQuality)}
                      >
                        <option value="auto">Auto</option>
                        <option value="high">High</option>
                        <option value="low">Low</option>
                      </select>
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Varispeed</strong>
                        <small>When enabled, playback speed follows pitch like Meld’s varispeed mode.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.varispeed === true}
                        onChange={(event) => void setSetting("varispeed", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Incremental seek skip</strong>
                        <small>
                          Repeated double-clicks on the player artwork increase the 5-second seek step, matching Meld.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.seekExtraSeconds === true}
                        onChange={(event) => void setSetting("seekExtraSeconds", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Pause on mute</strong>
                        <small>Pause playback when volume reaches zero and resume when volume is raised again.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.pauseOnMute === true}
                        onChange={(event) => void setSetting("pauseOnMute", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Persistent queue</strong>
                        <small>Restore the current Meld queue after restarting the desktop app.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.persistentQueue === true}
                        onChange={(event) => void setSetting("persistentQueue", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Load more automatically</strong>
                        <small>Use Meld’s queue continuation and automix loading when available.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoLoadMore !== false}
                        onChange={(event) => void setSetting("autoLoadMore", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Similar content / automix</strong>
                        <small>Fetch related source songs when the current queue ends.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.similarContent !== false}
                        onChange={(event) => void setSetting("similarContent", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Disable load more on Repeat all</strong>
                        <small>Keep Repeat all from appending automix content, matching Meld’s source option.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.disableLoadMoreWhenRepeatAll === true}
                        onChange={(event) => void setSetting("disableLoadMoreWhenRepeatAll", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Auto-download on like</strong>
                        <small>When enabled, liking a remote song starts Meld’s native offline cache download.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoDownloadOnLike === true}
                        onChange={(event) => void setSetting("autoDownloadOnLike", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Skip failed song automatically</strong>
                        <small>Move to the next queue item when native playback reports an error.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.autoSkipNextOnError === true}
                        onChange={(event) => void setSetting("autoSkipNextOnError", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Remember shuffle and repeat</strong>
                        <small>Persist the source shuffle/repeat preferences across launches.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.rememberShuffleAndRepeat !== false}
                        onChange={(event) => void setSetting("rememberShuffleAndRepeat", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Shuffle playlist first</strong>
                        <small>Source queue preference for starting playlist playback in shuffled order.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.shufflePlaylistFirst === true}
                        onChange={(event) => void setSetting("shufflePlaylistFirst", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Prevent duplicate queue tracks</strong>
                        <small>Do not add another copy of an item already present in the queue.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.preventDuplicateTracksInQueue === true}
                        onChange={(event) => void setSetting("preventDuplicateTracksInQueue", event.target.checked)}
                      />
                    </label>
                  </div>
                )}
                {settingsPage === "appearance" && (
                  <div className="settings-group">
                    <h3>Auto playlists</h3>
                    <label className="setting-row">
                      <span>
                        <strong>Show Liked Songs playlist</strong>
                        <small>Show Meld’s single liked-songs playlist in My Playlists.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.show_liked_playlist !== false}
                        onChange={(event) => void setSetting("show_liked_playlist", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Show Cached playlist</strong>
                        <small>
                          Show songs cached during playback. This is separate from Meld’s explicit Downloaded playlist.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.show_cached_playlist !== false}
                        onChange={(event) => void setSetting("show_cached_playlist", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Show Downloaded playlist</strong>
                        <small>Show songs downloaded for offline listening.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.show_downloaded_playlist !== false}
                        onChange={(event) => void setSetting("show_downloaded_playlist", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Show Uploaded playlist</strong>
                        <small>Show the YouTube Music uploaded-songs playlist after account sync.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.show_uploaded_playlist !== false}
                        onChange={(event) => void setSetting("show_uploaded_playlist", event.target.checked)}
                      />
                    </label>
                    <label className="setting-row">
                      <span>
                        <strong>Show Top Songs playlist</strong>
                        <small>Show the source-style most-played playlist built from Meld listening history.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.show_top_playlist !== false}
                        onChange={(event) => void setSetting("show_top_playlist", event.target.checked)}
                      />
                    </label>
                  </div>
                )}
                {settingsPage === "integrations" && (
                  <div className="settings-group">
                    <h3>Accounts</h3>
                    <div className="setting-status">
                      <strong>Google / YouTube Music</strong>
                      <span>
                        {sessionStatus.authenticated
                          ? `Connected${sessionStatus.accountEmail ? ` as ${sessionStatus.accountEmail}` : ""}. Authenticated library actions can use the saved session.`
                          : "Connect inside Meld Desktop to sync liked songs, account playlists, and library actions."}
                      </span>
                      {sessionStatus.authenticated ? (
                        <button className="secondary-button" onClick={() => void logoutGoogle()}>
                          Disconnect account
                        </button>
                      ) : (
                        <button className="secondary-button" onClick={() => void connectGoogle()}>
                          Connect Google
                        </button>
                      )}
                    </div>
                    <div className="setting-status">
                      <strong>Spotify</strong>
                      <span>
                        {spotifyStatus.authenticated
                          ? `Connected${spotifyProfile?.displayName ? ` as ${spotifyProfile.displayName}` : ""}. Spotify profileAttributes validated with the live GraphQL operation.`
                          : "Connect inside Meld Desktop; the token is validated before the session is saved."}
                      </span>
                      {spotifyStatus.authenticated ? (
                        <button className="secondary-button" onClick={() => void logoutSpotify()}>
                          Disconnect Spotify
                        </button>
                      ) : (
                        <button className="secondary-button" onClick={() => void connectSpotify()}>
                          Connect Spotify
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
