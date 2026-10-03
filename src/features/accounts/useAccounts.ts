import { call } from "../../lib/ipc";
import { listenEvent } from "../../lib/events";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/util";
import { SessionStatus, SpotifySessionStatus, SpotifyProfile } from "../../types";
import type { SetNotice } from "../../app/notifications";

export type AccountsDeps = {
  setNotice: SetNotice;
};

export function useAccounts({ setNotice }: AccountsDeps) {
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ authenticated: false });
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifySessionStatus>({ authenticated: false });
  const [spotifyProfile, setSpotifyProfile] = useState<SpotifyProfile | null>(null);

  const loadSessionStatus = async (refreshGoogleProfile = false) => {
    try {
      const current = await call("session_status");
      setSessionStatus(current);
      if (refreshGoogleProfile && current.authenticated) {
        try {
          const refreshed = await call("account_refresh_profile");
          setSessionStatus(refreshed);
        } catch {
          // Keep the last locally saved profile when offline or when the upstream request fails.
        }
      }
    } catch (error) {
      setNotice(`Account status could not be read: ${errorMessage(error)}`, "error");
    }
  };

  const loadSpotifyStatus = async () => {
    try {
      setSpotifyStatus(await call("spotify_session_status"));
    } catch (error) {
      setNotice(`Spotify status could not be read: ${errorMessage(error)}`, "error");
    }
  };

  const connectGoogle = async () => {
    try {
      await call("open_google_login");
      setNotice(
        "Google sign-in opened in Meld Desktop. Finish sign-in there; Meld will validate the session before saving it.",
      );
    } catch (error) {
      setNotice(`Google sign-in could not open: ${errorMessage(error)}`, "error");
    }
  };

  const connectSpotify = async () => {
    try {
      await call("open_spotify_login");
      setNotice("Spotify sign-in opened in Meld Desktop. The session is saved only after token validation.");
    } catch (error) {
      setNotice(`Spotify sign-in could not open: ${errorMessage(error)}`, "error");
    }
  };

  const logoutSpotify = async () => {
    try {
      await call("spotify_logout");
      setSpotifyStatus({ authenticated: false });
      setSpotifyProfile(null);
      setNotice("Spotify account disconnected.");
    } catch (error) {
      setNotice(`Spotify logout failed: ${errorMessage(error)}`, "error");
    }
  };

  const logoutGoogle = () => {
    setLogoutDialogOpen(true);
  };

  // Account sign-in results arrive as events from the sign-in windows.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenEvent("account-status", (payload) => {
      setSessionStatus(payload);
      setNotice("Google / YouTube Music account connected and validated.");
    }).then((stop) => {
      unlisten = stop;
    });
    let stopSpotify: (() => void) | undefined;
    void listenEvent("spotify-status", (payload) => {
      setSpotifyStatus(payload);
      setNotice("Spotify account connected and token validated.");
    }).then((stop) => {
      stopSpotify = stop;
    });
    let stopAccountError: (() => void) | undefined;
    void listenEvent("account-status-error", (payload) => {
      setNotice(`Google account validation failed: ${errorMessage(payload)}`, "error");
    }).then((stop) => {
      stopAccountError = stop;
    });
    let stopSpotifyError: (() => void) | undefined;
    void listenEvent("spotify-status-error", (payload) => {
      setNotice(`Spotify account validation failed: ${errorMessage(payload)}`, "error");
    }).then((stop) => {
      stopSpotifyError = stop;
    });
    return () => {
      unlisten?.();
      stopSpotify?.();
      stopAccountError?.();
      stopSpotifyError?.();
    };
  }, [setNotice]);
  return {
    logoutDialogOpen,
    setLogoutDialogOpen,
    sessionStatus,
    setSessionStatus,
    spotifyStatus,
    setSpotifyStatus,
    spotifyProfile,
    setSpotifyProfile,
    loadSessionStatus,
    loadSpotifyStatus,
    connectGoogle,
    connectSpotify,
    logoutSpotify,
    logoutGoogle,
  };
}
