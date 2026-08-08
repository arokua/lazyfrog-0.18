/**
 * MAIN world script — must run at document_start (via chrome.scripting.registerContentScripts).
 * Reddit Devvit checks event.isTrusted in JS; we wrap listeners and pass trusted proxies
 * only to callbacks. dispatchEvent itself must receive a real Event object.
 */
(function lazyfrogPageWorld() {
  if (window.__lazyfrogPageWorld) return;
  window.__lazyfrogPageWorld = true;

  document.addEventListener("lazyfrog:set-debug-fetch", (event) => {
    window.__lazyfrogDebugFetch = !!event.detail?.enabled;
  });

  function makeTrustedEvent(event) {
    if (!event || event.__lazyfrogTrustedProxy) return event;
    return new Proxy(event, {
      get(target, prop) {
        if (prop === "isTrusted") return true;
        if (prop === "__lazyfrogTrustedProxy") return true;
        let value;
        try {
          // Native Event getters throw if their `this` is the Proxy. Read them
          // against the real Event object instead.
          value = Reflect.get(target, prop, target);
        } catch {
          value = target[prop];
        }
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      }
    });
  }

  const INTERACTIVE_EVENTS = /* @__PURE__ */ new Set([
    "click",
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend"
  ]);
  const PASSIVE_BY_DEFAULT_EVENTS = /* @__PURE__ */ new Set([
    "wheel",
    "mousewheel",
    "touchmove"
  ]);

  function normalizeAddEventListenerOptions(type, options) {
    if (!PASSIVE_BY_DEFAULT_EVENTS.has(type)) {
      return options;
    }
    if (options === true) {
      return { capture: true, passive: true };
    }
    if (options === false || options == null) {
      return { passive: true };
    }
    if (typeof options === "object") {
      if (options.passive === false) {
        return options;
      }
      return { ...options, passive: options.passive ?? true };
    }
    return { passive: true };
  }

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const normalizedOptions = normalizeAddEventListenerOptions(type, options);
    if (!listener || typeof listener !== "function" || !INTERACTIVE_EVENTS.has(type)) {
      return nativeAddEventListener.call(this, type, listener, normalizedOptions);
    }
    const wrapped = function(event) {
      if (event && event.isTrusted === false) {
        return listener.call(this, makeTrustedEvent(event));
      }
      return listener.call(this, event);
    };
    wrapped.__lazyfrogOriginal = listener;
    return nativeAddEventListener.call(this, type, wrapped, normalizedOptions);
  };

  const alwaysTrusted = () => true;
  for (const C of [Event, PointerEvent, MouseEvent, TouchEvent, KeyboardEvent, InputEvent]) {
    if (!C?.prototype) continue;
    try {
      Object.defineProperty(C.prototype, "isTrusted", {
        configurable: true,
        enumerable: true,
        get: alwaysTrusted
      });
    } catch {
      /* ignore */
    }
  }

  function findMarkedElement(root = document) {
    const direct = root.querySelector?.("[data-lf-target]");
    if (direct) return direct;
    const all = root.querySelectorAll?.("*") || [];
    for (const el of all) {
      if (el.shadowRoot) {
        const found = findMarkedElement(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function dispatchOnElement(el, type, opts) {
    let event;
    if (type.startsWith("pointer") && typeof PointerEvent !== "undefined") {
      event = new PointerEvent(type, {
        ...opts,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      });
    } else {
      event = new MouseEvent(type, opts);
    }
    el.dispatchEvent(event);
  }

  function clickElement(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      view: window
    };
    dispatchOnElement(el, "pointerdown", opts);
    dispatchOnElement(el, "mousedown", opts);
    dispatchOnElement(el, "pointerup", opts);
    dispatchOnElement(el, "mouseup", opts);
    dispatchOnElement(el, "click", opts);
    try {
      el.click();
    } catch {
      /* ignore */
    }
    return true;
  }

  function clickAtPoint(x, y) {
    const marked = findMarkedElement();
    if (marked) {
      marked.removeAttribute("data-lf-target");
      return clickElement(marked);
    }
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    return clickElement(el);
  }

  window.__lazyfrogClickElement = clickElement;
  window.__lazyfrogClickAt = clickAtPoint;
  window.__lazyfrogMakeTrustedEvent = makeTrustedEvent;

  const alwaysVisible = () => "visible";
  const alwaysFalse = () => false;
  const alwaysFocused = () => true;

  try {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: alwaysVisible
    });
    Object.defineProperty(document, "hidden", { configurable: true, get: alwaysFalse });
    Object.defineProperty(document, "webkitHidden", { configurable: true, get: alwaysFalse });
    if (typeof Document !== "undefined" && Document.prototype) {
      Object.defineProperty(Document.prototype, "visibilityState", {
        configurable: true,
        get: alwaysVisible
      });
      Object.defineProperty(Document.prototype, "hidden", {
        configurable: true,
        get: alwaysFalse
      });
      Object.defineProperty(Document.prototype, "hasFocus", {
        configurable: true,
        value: alwaysFocused
      });
    }
    Object.defineProperty(document, "hasFocus", {
      configurable: true,
      value: alwaysFocused
    });
  } catch {
    /* ignore */
  }

  const blockEvent = (event) => {
    event.stopImmediatePropagation();
  };
  const capturePassive = { capture: true, passive: true };
  window.addEventListener("blur", blockEvent, capturePassive);
  document.addEventListener("blur", blockEvent, capturePassive);
  window.addEventListener("pagehide", blockEvent, capturePassive);
  document.addEventListener("visibilitychange", blockEvent, capturePassive);

  // Do NOT dispatch visibilitychange — Reddit closes the game modal on it.
  const pulseFocus = () => {
    try {
      window.dispatchEvent(new Event("focus"));
    } catch {
      /* ignore */
    }
  };
  pulseFocus();
  setInterval(pulseFocus, 15e3);

  try {
    window.onblur = null;
    window.onfocus = null;
    document.onvisibilitychange = null;
  } catch {
    /* ignore */
  }

  const gameActivity = {
    phase: "unknown",
    lastLogAt: 0,
    previewStatus: null,
    lastPreviewLogAt: 0
  };

  function serializeConsoleArg(arg) {
    if (arg == null) return String(arg);
    if (typeof arg === "string") return arg;
    if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  function serializeConsoleArgs(args) {
    try {
      return Array.from(args).map(serializeConsoleArg).join(" ");
    } catch {
      return "";
    }
  }

  function notifyGameActivity() {
    try {
      document.dispatchEvent(
        new CustomEvent("lazyfrog:game-activity", {
          detail: {
            phase: gameActivity.phase,
            lastLogAt: gameActivity.lastLogAt,
            previewStatus: gameActivity.previewStatus,
            lastPreviewLogAt: gameActivity.lastPreviewLogAt
          }
        })
      );
    } catch {
      /* ignore */
    }
  }

  function inspectConsoleLine(text) {
    if (!text) return;
    const now = Date.now();
    gameActivity.lastLogAt = now;

    const previewMatch = text.match(/\[Preview\]\s*Mission status:\s*(\w+)/i);
    if (previewMatch) {
      gameActivity.previewStatus = previewMatch[1].toLowerCase();
      gameActivity.lastPreviewLogAt = now;
      notifyGameActivity();
      return;
    }

    const lowered = text.toLowerCase();
    if (
      /mission cleared|visit the inn|victory|play next|mission complete/.test(lowered)
    ) {
      gameActivity.phase = "victory";
      notifyGameActivity();
      return;
    }
    if (/defeat|game over|out of lives|mission failed|you died/.test(lowered)) {
      gameActivity.phase = "defeat";
      notifyGameActivity();
      return;
    }
    if (/error|critical|abort|life lost/.test(lowered) && /mission|encounter|combat|life/.test(lowered)) {
      gameActivity.phase = "failure";
      notifyGameActivity();
      return;
    }
    if (
      /phaser|encounter|combat|damage|skill|matter-js|rest api action|devvit-message/.test(lowered)
    ) {
      if (gameActivity.phase !== "victory" && gameActivity.phase !== "defeat" && gameActivity.phase !== "failure") {
        gameActivity.phase = "playing";
      }
      notifyGameActivity();
    }
  }

  const nativeConsole = {};
  let inspectingConsole = false;
  ["log", "info", "warn", "debug", "error"].forEach((method) => {
    const native = console[method];
    if (typeof native !== "function") return;
    nativeConsole[method] = native.bind(console);
  });
  ["log", "info"].forEach((method) => {
    const native = nativeConsole[method];
    if (!native) return;
    console[method] = function(...args) {
      if (inspectingConsole) {
        return native(...args);
      }
      inspectingConsole = true;
      try {
        inspectConsoleLine(serializeConsoleArgs(args));
      } catch {
        /* ignore */
      } finally {
        inspectingConsole = false;
      }
      return native(...args);
    };
  });

  const rafLoop = () => {
    window.__lazyfrogKeepAliveTick = Date.now();
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

})();
