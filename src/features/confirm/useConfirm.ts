import { useCallback, useRef, useState } from "react";
import type { ConfirmRequest } from "../../app/destructive";

/** The confirmation dialog of the destructive-action policy (U4-012), as a promise. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    // A second request answers the first one with "no"; only one question is shown at a time.
    resolver.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  return { confirmRequest: request, confirm, answerConfirm: answer };
}
