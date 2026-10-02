import { invoke } from "@tauri-apps/api/core";

export type UpdateSummary = {
  version: string;
  currentVersion: string;
  notes?: string | null;
  date?: string | null;
  portable: boolean;
};
export type UpdateProgress = { downloaded: number; total?: number | null };

export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LAST_UPDATE_CHECK_KEY = "meld.lastUpdateCheck";

/** Automatic checks run at most once per interval; a missing or unreadable timestamp means "check now". */
export function shouldCheckForUpdates(
  lastCheck: string | null,
  now: number,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
): boolean {
  if (!lastCheck) return true;
  const last = Number(lastCheck);
  if (!Number.isFinite(last) || last > now) return true;
  return now - last >= intervalMs;
}

export function formatProgress(progress: UpdateProgress | null): string {
  if (!progress) return "";
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  if (progress.total && progress.total > 0)
    return `${Math.min(100, Math.round((progress.downloaded / progress.total) * 100))}% (${mb(progress.downloaded)} of ${mb(progress.total)} MB)`;
  return `${mb(progress.downloaded)} MB`;
}

export const checkForUpdate = () => invoke<UpdateSummary | null>("app_update_check");
export const installUpdate = () => invoke<void>("app_update_install");
export const openReleasesPage = () => invoke<void>("app_open_releases_page");
