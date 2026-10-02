// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderErrors } from "../app/renderErrors";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => cleanup());

let broken = true;
function Fragile({ label }: { label: string }) {
  if (broken) throw new Error(`cannot render ${label}`);
  return <p>{label} works</p>;
}

it("shows a fallback for its own region only and recovers on Try again (U4-014)", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  broken = true;
  const onClose = vi.fn();
  render(
    <>
      <p>Shell</p>
      <ErrorBoundary name="This page" variant="panel" onClose={onClose}>
        <Fragile label="album" />
      </ErrorBoundary>
    </>,
  );
  expect(screen.getByText("Shell")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("This page could not be shown.");
  expect(screen.getByText("cannot render album")).toBeTruthy();
  expect(renderErrors[renderErrors.length - 1]).toMatchObject({ region: "This page", message: "cannot render album" });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  broken = false;
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })));
  expect(screen.getByText("album works")).toBeTruthy();
});

it("renders again when its reset key changes", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  broken = true;
  const view = (key: string) => (
    <ErrorBoundary name="This page" resetKey={key}>
      <Fragile label={key} />
    </ErrorBoundary>
  );
  const { rerender } = render(view("/album/a"));
  expect(screen.getByRole("alert")).toBeTruthy();
  broken = false;
  rerender(view("/album/b"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("/album/b works")).toBeTruthy();
});
