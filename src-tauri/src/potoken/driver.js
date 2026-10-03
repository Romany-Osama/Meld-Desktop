/* global window */
// Meld Desktop PoToken driver (PLAY-010, D-048). Runs inside the hidden, IPC-less `potoken` webview
// (about:blank, incognito). Rust evaluates Google's BotGuard interpreter first, then calls these
// functions with JSON-encoded arguments and polls `poll(id)` until a job finishes. Nothing here
// touches the network: Rust fetches the challenge and the integrity token itself.
// Protocol follows LuanRT/BgUtils (MIT).
(() => {
  if (window.__meldPo) return;
  const jobs = Object.create(null);
  const state = { signals: null, mint: null };
  const toBytes = (text) => {
    const plain = String(text).replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");
    return Uint8Array.from(atob(plain), (char) => char.charCodeAt(0));
  };
  const toWebSafe = (bytes) => {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
  };
  const withTimeout = (promise, ms, what) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(what + " timed out")), ms))]);
  const start = (id, work) => {
    jobs[id] = { state: "pending" };
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          jobs[id] = { state: "ok", value };
        },
        (error) => {
          jobs[id] = { state: "err", error: String((error && error.message) || error).slice(0, 200) };
        },
      );
    return "started";
  };
  window.__meldPo = {
    poll(id) {
      const job = jobs[id];
      if (!job) return JSON.stringify({ state: "err", error: "unknown job" });
      if (job.state !== "pending") delete jobs[id];
      return JSON.stringify(job);
    },
    snapshot(id, program, globalName) {
      return start(id, async () => {
        const vm = window[globalName];
        if (!vm || typeof vm.a !== "function") throw new Error("BotGuard VM unavailable");
        let resolveFunctions;
        const functions = new Promise((resolve) => {
          resolveFunctions = resolve;
        });
        vm.a(
          program,
          (asyncSnapshot) => resolveFunctions(asyncSnapshot),
          true,
          undefined,
          () => {},
          [[], []],
        );
        const asyncSnapshot = await withTimeout(functions, 10000, "BotGuard load");
        const signals = [];
        const response = await withTimeout(
          new Promise((resolve) => asyncSnapshot(resolve, [undefined, undefined, signals, undefined])),
          10000,
          "BotGuard snapshot",
        );
        if (typeof response !== "string" || !response) throw new Error("empty BotGuard response");
        state.signals = signals;
        state.mint = null;
        return response;
      });
    },
    minter(id, integrityToken) {
      return start(id, async () => {
        const getMinter = state.signals && state.signals[0];
        if (typeof getMinter !== "function") throw new Error("minter factory missing");
        const mint = await withTimeout(Promise.resolve(getMinter(toBytes(integrityToken))), 10000, "minter");
        if (typeof mint !== "function") throw new Error("minter is not a function");
        state.mint = mint;
        return "ready";
      });
    },
    mint(id, identifiers) {
      return start(id, async () => {
        if (typeof state.mint !== "function") throw new Error("no minter");
        const tokens = [];
        for (const identifier of identifiers) {
          const bytes = await withTimeout(
            Promise.resolve(state.mint(new TextEncoder().encode(identifier))),
            5000,
            "mint",
          );
          if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("mint returned no bytes");
          tokens.push(toWebSafe(bytes));
        }
        return tokens;
      });
    },
  };
})();
("driver-ready");
