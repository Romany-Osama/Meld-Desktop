import { convertFileSrc } from "@tauri-apps/api/core";

/** URL the <audio>/<img> element can load: remote and asset URLs as they are, local paths via the asset protocol. */
export function mediaSrc(value?: string | null) {
  if (!value) return null;
  return /^(?:https?:|data:|asset:|blob:)/i.test(value) ? value : convertFileSrc(value);
}
