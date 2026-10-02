import { RefObject, Dispatch, SetStateAction } from "react";
import { NavKey, LoadState, LyricsPayload } from "../../types";

export type LyricsPanelProps = {
  activeLyricIndex: number;
  activeLyricRef: RefObject<HTMLButtonElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  backStack: NavKey[];
  changeLyricsProvider: (provider: string) => Promise<void>;
  forwardStack: NavKey[];
  goBack: () => void;
  hasTransientLayer: boolean;
  lyrics: LoadState<LyricsPayload> | null;
  lyricsContainerRef: RefObject<HTMLDivElement | null>;
  lyricsProviderLoading: boolean;
  lyricsProviderOrder: string[];
  lyricsProviderSelection: string;
  navigateForward: () => void;
  playerExpanded: boolean;
  setLyrics: Dispatch<SetStateAction<LoadState<LyricsPayload> | null>>;
  setLyricsAutoScrollEnabled: Dispatch<SetStateAction<boolean>>;
};

export function LyricsPanel({
  activeLyricIndex,
  activeLyricRef,
  audioRef,
  backStack,
  changeLyricsProvider,
  forwardStack,
  goBack,
  hasTransientLayer,
  lyrics,
  lyricsContainerRef,
  lyricsProviderLoading,
  lyricsProviderOrder,
  lyricsProviderSelection,
  navigateForward,
  playerExpanded,
  setLyrics,
  setLyricsAutoScrollEnabled,
}: LyricsPanelProps) {
  return (
    <>
      {!playerExpanded && lyrics && (
        <div className="detail-overlay" role="dialog" aria-modal="true">
          <div className="detail-panel lyrics-panel">
            <button className="close-button" title="Close" aria-label="Close" onClick={() => setLyrics(null)}>
              ×
            </button>
            {lyrics.status === "loading" && (
              <div className="state-panel">
                <div className="spinner" />
                <p>Loading lyrics from Meld providers…</p>
              </div>
            )}
            {lyrics.status === "error" && (
              <div className="state-panel error">
                <h2>Lyrics unavailable</h2>
                <p>{lyrics.error}</p>
              </div>
            )}
            {lyrics.status === "ready" && (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      {lyrics.data.provider}
                      {lyrics.data.synced ? " · Synced" : " · Plain"}
                    </p>
                    <h2>{lyrics.data.matchedTitle}</h2>
                    <p>{lyrics.data.matchedArtist}</p>
                    <label className="lyrics-provider-picker">
                      <span>Provider</span>
                      <select
                        value={lyricsProviderSelection}
                        onChange={(event) => void changeLyricsProvider(event.target.value)}
                        disabled={lyricsProviderLoading}
                        aria-label="Lyrics provider"
                      >
                        <option value="auto">Automatic · provider order</option>
                        {lyricsProviderOrder.map((provider) => (
                          <option key={provider} value={provider}>
                            {provider}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="lyrics-navigation">
                    <button
                      className="topbar-button icon-button"
                      onClick={goBack}
                      disabled={!hasTransientLayer && backStack.length === 0}
                      title="Back"
                      aria-label="Back"
                    >
                      ‹
                    </button>
                    <button
                      className="topbar-button icon-button"
                      onClick={navigateForward}
                      disabled={forwardStack.length === 0}
                      title="Forward"
                      aria-label="Forward"
                    >
                      ›
                    </button>
                  </div>
                </div>
                {lyrics.data.synced && lyrics.data.lines.length > 0 ? (
                  <div
                    ref={lyricsContainerRef}
                    className="lyrics-lines"
                    onWheel={() => setLyricsAutoScrollEnabled(false)}
                    onTouchMove={() => setLyricsAutoScrollEnabled(false)}
                    onPointerDown={() => setLyricsAutoScrollEnabled(false)}
                    onKeyDown={() => setLyricsAutoScrollEnabled(false)}
                  >
                    {lyrics.data.lines.map((line, index) => (
                      <button
                        ref={index === activeLyricIndex ? activeLyricRef : undefined}
                        key={`${line.timeMs}-${index}`}
                        className={index === activeLyricIndex ? "lyric-line active" : "lyric-line"}
                        onClick={() => {
                          setLyricsAutoScrollEnabled(true);
                          if (audioRef.current) audioRef.current.currentTime = line.timeMs / 1000;
                        }}
                      >
                        {line.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <pre className="lyrics-text">{lyrics.data.text}</pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
