import { useState } from "react";
import { useStartupUpdateCheck } from "../../UpdatePanel";

export function useNotice() {
  const [notice, setNotice] = useState("");

  useStartupUpdateCheck((update) =>
    setNotice(
      update.portable
        ? `Meld Desktop ${update.version} is available. Settings → About has the download page.`
        : `Meld Desktop ${update.version} is available. Install it from Settings → About.`,
    ),
  );

  return { notice, setNotice };
}
