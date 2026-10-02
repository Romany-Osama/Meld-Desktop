// U4-005: Back closes the topmost modal, then nested screens, then navigates.
import { describe, expect, it } from "vitest";
import { LAYER_KIND, LAYERS, LayerState, openLayers, topmostLayer } from "./layers";

const none = Object.fromEntries(LAYERS.map((layer) => [layer, false])) as LayerState;
const open = (...layers: (keyof LayerState)[]): LayerState => ({
  ...none,
  ...Object.fromEntries(layers.map((layer) => [layer, true])),
});

describe("layers", () => {
  it("returns null when only the page is shown", () => {
    expect(topmostLayer(none)).toBeNull();
    expect(openLayers(none)).toEqual([]);
  });

  it("closes dialogs before the surface that opened them", () => {
    expect(topmostLayer(open("settings", "logoutDialog"))).toBe("logoutDialog");
    expect(topmostLayer(open("menu", "detail"))).toBe("menu");
    expect(topmostLayer(open("expandedPlayer", "sleepTimer"))).toBe("sleepTimer");
    expect(topmostLayer(open("lyrics", "expandedPlayer", "detail"))).toBe("lyrics");
  });

  it("unwinds a full stack one layer at a time in a fixed order", () => {
    let state = open("detail", "expandedPlayer", "queue", "menu", "editItem");
    const closed: string[] = [];
    for (let top = topmostLayer(state); top; top = topmostLayer(state)) {
      closed.push(top);
      state = { ...state, [top]: false };
    }
    expect(closed).toEqual(["editItem", "menu", "queue", "expandedPlayer", "detail"]);
  });

  it("orders kinds from dialogs down to nested screens", () => {
    const rank = { dialog: 0, menu: 1, page: 2, panel: 3, screen: 4 };
    const ranks = LAYERS.map((layer) => rank[LAYER_KIND[layer]]);
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });
});
