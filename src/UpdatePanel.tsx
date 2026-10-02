import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { checkForUpdate, formatProgress, installUpdate, LAST_UPDATE_CHECK_KEY, openReleasesPage, shouldCheckForUpdates, type UpdateProgress, type UpdateSummary } from "./lib/updates";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Settings → About: current version, manual update check and explicit install (plan §7.6). */
export function UpdatePanel() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState("");
  const [update, setUpdate] = useState<UpdateSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => { void getVersion().then(setVersion).catch(() => setVersion("")); }, []);
  useEffect(() => {
    let stop: (() => void) | undefined;
    void listen<UpdateProgress>("app-update-progress", (event) => setProgress(event.payload)).then((unlisten) => { stop = unlisten; });
    return () => stop?.();
  }, []);

  const check = async () => {
    setBusy(true); setStatus("Checking for updates…");
    try {
      const found = await checkForUpdate();
      localStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));
      setUpdate(found);
      setStatus(found ? `Meld Desktop ${found.version} is available.` : "Meld Desktop is up to date.");
    } catch (error) { setStatus(`Could not check for updates: ${message(error)}`); }
    finally { setBusy(false); }
  };

  const install = async () => {
    setBusy(true); setProgress(null); setStatus("Downloading the update…");
    try { await installUpdate(); setStatus("Installing — Meld Desktop will restart."); }
    catch (error) { setStatus(`The update could not be installed: ${message(error)}. Your current version is unchanged.`); setBusy(false); }
  };

  return <div className="settings-group"><h3>Updates</h3>
    <p className="muted-copy">{version ? `You are using Meld Desktop ${version}.` : "Meld Desktop"} Updates are downloaded from GitHub Releases and their signature is verified before anything is installed. Your library is backed up first.</p>
    {status && <p className="muted-copy" role="status">{status}{progress ? ` ${formatProgress(progress)}` : ""}</p>}
    {update?.notes && <p className="muted-copy">{update.notes}</p>}
    <div className="storage-actions">
      <button className="secondary-button" disabled={busy} onClick={() => void check()}>Check for updates</button>
      {update && !update.portable && <button className="secondary-button" disabled={busy} onClick={() => void install()}>Install {update.version} and restart</button>}
      {update?.portable && <button className="secondary-button" onClick={() => void openReleasesPage().catch((error) => setStatus(message(error)))}>Open download page</button>}
    </div>
    {update && !update.portable && <p className="muted-copy">Installing closes Meld Desktop, so playback stops until it restarts.</p>}
    {update?.portable && <p className="muted-copy">This is the portable version. Download the new ZIP and replace the files in this folder; your library is kept.</p>}
  </div>;
}

/** Quiet automatic check, at most once a day, a while after startup. Only shows a notice. */
export function useStartupUpdateCheck(onUpdate: (summary: UpdateSummary) => void, delayMs = 15000) {
  useEffect(() => {
    if (!shouldCheckForUpdates(localStorage.getItem(LAST_UPDATE_CHECK_KEY), Date.now())) return;
    const timer = window.setTimeout(() => {
      void checkForUpdate().then((found) => {
        localStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));
        if (found) onUpdate(found);
      }).catch(() => { /* offline or GitHub unavailable: try again next start */ });
    }, delayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
