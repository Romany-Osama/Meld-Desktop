import { ipcErrorMessage } from "./ipcError";
// Fisher–Yates. `array.sort(() => Math.random() - 0.5)` is biased and engine-dependent.
export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}
export function errorMessage(error: unknown) {
  return ipcErrorMessage(error);
}
export function noticeSummary(message: string) {
  if (message.length <= 180) return message;
  const requestDetails = message.indexOf(" for url ");
  if (requestDetails > 0) return `${message.slice(0, requestDetails)} · request details available on hover`;
  return `${message.slice(0, 177).trimEnd()}…`;
}
