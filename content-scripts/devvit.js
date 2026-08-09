var devvit = (function() {
  "use strict";
  function defineContentScript(definition2) {
    return definition2;
  }
  const definition = defineContentScript({
    matches: ["https://*.devvit.net/*"],
    runAt: "document_start",
    allFrames: true,
    // Run in all frames including iframes
    async main() {
    }
  });
  const browser$1 = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  const browser = browser$1;
  (function injectPageWorldScriptsEarly() {
    try {
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
      if (!runtime?.getURL) return;
      const inject = () => {
        if (document.__lazyfrogPageWorldInjected) return;
        document.__lazyfrogPageWorldInjected = true;
        const keepAlive = document.createElement("script");
        keepAlive.src = runtime.getURL("pageWorldKeepAlive.js");
        (document.documentElement || document.head || document).appendChild(keepAlive);
        try {
          const interceptor = document.createElement("script");
          interceptor.src = runtime.getURL("fetchInterceptor.js");
          (document.documentElement || document.head || document).appendChild(interceptor);
        } catch {
        }
      };
      if (document.documentElement) inject();
      else document.addEventListener("readystatechange", () => {
        if (document.documentElement) inject();
      }, { once: true });
    } catch {
    }
  })();
  (function listenForDebugFetchEventsInDevvit() {
    try {
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
      if (!runtime?.sendMessage) return;
      const setFlag = (enabled) => {
        try {
          document.dispatchEvent(new CustomEvent("lazyfrog:set-debug-fetch", {
            detail: { enabled: !!enabled }
          }));
        } catch {
        }
      };
      const refresh = () => {
        try {
          runtime.sendMessage({ type: "GET_AUTOMATION_CONFIG" }, (resp) => {
            const enabled = !!resp?.config?.debugFetch;
            setFlag(enabled);
          });
        } catch {
        }
      };
      refresh();
      try {
        const storage = globalThis.chrome?.storage || globalThis.browser?.storage;
        storage?.onChanged?.addListener?.((changes, area) => {
          if (area === "local" && changes.automationConfig) refresh();
        });
      } catch {
      }
      window.addEventListener("lazyfrog:fetch-debug", (event) => {
        try {
          const detail = event.detail || {};
          runtime.sendMessage({
            type: "DEVVIT_FETCH_DEBUG",
            payload: detail
          });
        } catch {
        }
      });
    } catch {
    }
  })();
  function print$1(method, ...args) {
    return;
  }
  const logger$1 = {
    debug: (...args) => print$1(console.debug, ...args),
    log: (...args) => print$1(console.log, ...args),
    warn: (...args) => print$1(console.warn, ...args),
    error: (...args) => print$1(console.error, ...args)
  };
  class WxtLocationChangeEvent extends Event {
    constructor(newUrl, oldUrl) {
      super(WxtLocationChangeEvent.EVENT_NAME, {});
      this.newUrl = newUrl;
      this.oldUrl = oldUrl;
    }
    static EVENT_NAME = getUniqueEventName("wxt:locationchange");
  }
  function getUniqueEventName(eventName) {
    return `${browser?.runtime?.id}:${"devvit"}:${eventName}`;
  }
  function createLocationWatcher(ctx) {
    let interval;
    let oldUrl;
    return {
      /**
       * Ensure the location watcher is actively looking for URL changes. If it's already watching,
       * this is a noop.
       */
      run() {
        if (interval != null) return;
        oldUrl = new URL(location.href);
        interval = ctx.setInterval(() => {
          let newUrl = new URL(location.href);
          if (newUrl.href !== oldUrl.href) {
            window.dispatchEvent(new WxtLocationChangeEvent(newUrl, oldUrl));
            oldUrl = newUrl;
          }
        }, 1e3);
      }
    };
  }
  class ContentScriptContext {
    constructor(contentScriptName, options) {
      this.contentScriptName = contentScriptName;
      this.options = options;
      this.abortController = new AbortController();
      if (this.isTopFrame) {
        this.listenForNewerScripts({ ignoreFirstEvent: true });
        this.stopOldScripts();
      } else {
        this.listenForNewerScripts();
      }
    }
    static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName(
      "wxt:content-script-started"
    );
    isTopFrame = window.self === window.top;
    abortController;
    locationWatcher = createLocationWatcher(this);
    receivedMessageIds = /* @__PURE__ */ new Set();
    get signal() {
      return this.abortController.signal;
    }
    abort(reason) {
      return this.abortController.abort(reason);
    }
    get isInvalid() {
      if (browser.runtime.id == null) {
        this.notifyInvalidated();
      }
      return this.signal.aborted;
    }
    get isValid() {
      return !this.isInvalid;
    }
    /**
     * Add a listener that is called when the content script's context is invalidated.
     *
     * @returns A function to remove the listener.
     *
     * @example
     * browser.runtime.onMessage.addListener(cb);
     * const removeInvalidatedListener = ctx.onInvalidated(() => {
     *   browser.runtime.onMessage.removeListener(cb);
     * })
     * // ...
     * removeInvalidatedListener();
     */
    onInvalidated(cb) {
      this.signal.addEventListener("abort", cb);
      return () => this.signal.removeEventListener("abort", cb);
    }
    /**
     * Return a promise that never resolves. Useful if you have an async function that shouldn't run
     * after the context is expired.
     *
     * @example
     * const getValueFromStorage = async () => {
     *   if (ctx.isInvalid) return ctx.block();
     *
     *   // ...
     * }
     */
    block() {
      return new Promise(() => {
      });
    }
    /**
     * Wrapper around `window.setInterval` that automatically clears the interval when invalidated.
     *
     * Intervals can be cleared by calling the normal `clearInterval` function.
     */
    setInterval(handler, timeout) {
      const id = setInterval(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearInterval(id));
      return id;
    }
    /**
     * Wrapper around `window.setTimeout` that automatically clears the interval when invalidated.
     *
     * Timeouts can be cleared by calling the normal `setTimeout` function.
     */
    setTimeout(handler, timeout) {
      const id = setTimeout(() => {
        if (this.isValid) handler();
      }, timeout);
      this.onInvalidated(() => clearTimeout(id));
      return id;
    }
    /**
     * Wrapper around `window.requestAnimationFrame` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelAnimationFrame` function.
     */
    requestAnimationFrame(callback) {
      const id = requestAnimationFrame((...args) => {
        if (this.isValid) callback(...args);
      });
      this.onInvalidated(() => cancelAnimationFrame(id));
      return id;
    }
    /**
     * Wrapper around `window.requestIdleCallback` that automatically cancels the request when
     * invalidated.
     *
     * Callbacks can be canceled by calling the normal `cancelIdleCallback` function.
     */
    requestIdleCallback(callback, options) {
      const id = requestIdleCallback((...args) => {
        if (!this.signal.aborted) callback(...args);
      }, options);
      this.onInvalidated(() => cancelIdleCallback(id));
      return id;
    }
    addEventListener(target, type, handler, options) {
      if (type === "wxt:locationchange") {
        if (this.isValid) this.locationWatcher.run();
      }
      target.addEventListener?.(
        type.startsWith("wxt:") ? getUniqueEventName(type) : type,
        handler,
        {
          ...options,
          signal: this.signal
        }
      );
    }
    /**
     * @internal
     * Abort the abort controller and execute all `onInvalidated` listeners.
     */
    notifyInvalidated() {
      this.abort("Content script context invalidated");
      logger$1.debug(
        `Content script "${this.contentScriptName}" context invalidated`
      );
    }
    stopOldScripts() {
      window.postMessage(
        {
          type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
          contentScriptName: this.contentScriptName,
          messageId: Math.random().toString(36).slice(2)
        },
        "*"
      );
    }
    verifyScriptStartedEvent(event) {
      const isScriptStartedEvent = event.data?.type === ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE;
      const isSameContentScript = event.data?.contentScriptName === this.contentScriptName;
      const isNotDuplicate = !this.receivedMessageIds.has(event.data?.messageId);
      return isScriptStartedEvent && isSameContentScript && isNotDuplicate;
    }
    listenForNewerScripts(options) {
      let isFirst = true;
      const cb = (event) => {
        if (this.verifyScriptStartedEvent(event)) {
          this.receivedMessageIds.add(event.data.messageId);
          const wasFirst = isFirst;
          isFirst = false;
          if (wasFirst && options?.ignoreFirstEvent) return;
          this.notifyInvalidated();
        }
      };
      addEventListener("message", cb);
      this.onInvalidated(() => removeEventListener("message", cb));
    }
  }
  function initPlugins() {
  }
  function print(method, ...args) {
    return;
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  const result = (async () => {
    try {
      initPlugins();
      const { main, ...options } = definition;
      const ctx = new ContentScriptContext("devvit", options);
      return await main(ctx);
    } catch (err) {
      logger.error(
        `The content script "${"devvit"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  const DEFAULT_MAX_STORED_LOGS = 5e3;
  const BATCH_WRITE_INTERVAL = 1e4;
  const BATCH_SIZE_THRESHOLD = 50;
  let extensionContextDead = false;
  function isExtensionAlive() {
    if (extensionContextDead) return false;
    try {
      if (!chrome.runtime?.id) {
        extensionContextDead = true;
        return false;
      }
      return true;
    } catch {
      extensionContextDead = true;
      return false;
    }
  }
  function markExtensionContextDead(reason) {
    extensionContextDead = true;
    _Logger.disableStorage();
    if (!window.__lazyfrogExtDeadWarned) {
      window.__lazyfrogExtDeadWarned = true;
      console.warn(
        "[LazyFrog] Extension was reloaded — refresh this Reddit/game tab to resume automation.",
        reason || ""
      );
    }
  }
  const _Logger = class _Logger {
    constructor(context, config, parentContext) {
      this.parentContext = parentContext;
      this.config = {
        context,
        remoteLogging: config?.remoteLogging ?? false,
        remoteUrl: config?.remoteUrl ?? "http://localhost:7856/log",
        consoleLogging: config?.consoleLogging ?? false,
        storeLogs: config?.storeLogs ?? false,
        maxStoredLogs: config?.maxStoredLogs ?? DEFAULT_MAX_STORED_LOGS
      };
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["automationConfig"], (result2) => {
          if (result2.automationConfig?.remoteLogging !== void 0) {
            this.config.remoteLogging = result2.automationConfig.remoteLogging;
          }
          if (result2.automationConfig?.consoleLogging !== void 0) {
            this.config.consoleLogging = result2.automationConfig.consoleLogging;
            syncLfDevvitConsoleLogging(result2.automationConfig.consoleLogging);
          }
          if (result2.automationConfig?.storeLogs !== void 0) {
            this.config.storeLogs = result2.automationConfig.storeLogs;
          }
          if (result2.automationConfig?.maxStoredLogs !== void 0) {
            this.config.maxStoredLogs = result2.automationConfig.maxStoredLogs;
          }
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === "local" && changes.automationConfig?.newValue) {
            const newConfig = changes.automationConfig.newValue;
            if (newConfig.remoteLogging !== void 0) {
              this.config.remoteLogging = newConfig.remoteLogging;
            }
            if (newConfig.consoleLogging !== void 0) {
              this.config.consoleLogging = newConfig.consoleLogging;
              syncLfDevvitConsoleLogging(newConfig.consoleLogging);
            }
            if (newConfig.storeLogs !== void 0) {
              this.config.storeLogs = newConfig.storeLogs;
            }
            if (newConfig.maxStoredLogs !== void 0) {
              this.config.maxStoredLogs = newConfig.maxStoredLogs;
            }
          }
        });
      }
    }
    /**
     * Hand the entry to the service worker, which owns the actual POST.
     *
     * A content script must not fetch the log server itself. This one runs in an
     * https://*.devvit.net iframe, and a cross-origin request from there to
     * http://localhost silently never arrived -- every DEVVIT and DEVVIT-GIAE
     * line was lost, while byte-identical Logger code in the service worker
     * logged fine all session. The worker holds the localhost host permission
     * and has no page CSP or private-network preflight to satisfy, so it is the
     * only context that can be relied on to reach the server. It also owns the
     * retry circuit breaker, so a dead server is backed off once rather than
     * once per frame.
     */
    async sendToRemote(entry) {
      if (!this.config.remoteLogging) return;
      try {
        chrome.runtime.sendMessage(
          { type: "REMOTE_LOG", entry, remoteUrl: this.config.remoteUrl },
          () => {
            // Touch lastError so a sleeping worker does not print "Unchecked
            // runtime.lastError". Never log from in here -- it would recurse.
            void chrome.runtime.lastError;
          }
        );
      } catch {
        // Extension context torn down by a reload/update. Nothing to do.
      }
    }
    static disableStorage() {
      _Logger.storageDisabled = true;
      _Logger.logBuffer = [];
      if (_Logger.flushTimer) {
        clearTimeout(_Logger.flushTimer);
        _Logger.flushTimer = null;
      }
      _Logger.isFlushScheduled = false;
    }
    /**
     * Flush buffered logs to chrome.storage
     * This is called periodically or when buffer reaches threshold
     */
    static async flushLogsToStorage() {
      if (_Logger.storageDisabled) return;
      if (!isExtensionAlive()) {
        _Logger.disableStorage();
        return;
      }
      if (typeof chrome === "undefined" || !chrome.storage) return;
      if (_Logger.logBuffer.length === 0) return;
      if (_Logger.flushTimer) {
        clearTimeout(_Logger.flushTimer);
        _Logger.flushTimer = null;
      }
      _Logger.isFlushScheduled = false;
      const logsToFlush = [..._Logger.logBuffer];
      _Logger.logBuffer = [];
      try {
        const result2 = await chrome.storage.local.get(["debugLogs", "automationConfig"]);
        const existingLogs = result2.debugLogs || [];
        const maxLogs = result2.automationConfig?.maxStoredLogs ?? DEFAULT_MAX_STORED_LOGS;
        const allLogs = [...existingLogs, ...logsToFlush];
        if (allLogs.length > maxLogs) {
          allLogs.splice(0, allLogs.length - maxLogs);
        }
        await chrome.storage.local.set({ debugLogs: allLogs });
      } catch (error) {
        const msg = String(error);
        if (msg.includes("Extension context invalidated") || !isExtensionAlive()) {
          markExtensionContextDead(msg);
          return;
        }
        _Logger.logBuffer.unshift(...logsToFlush);
      }
      if (_Logger.logBuffer.length > 0 && !_Logger.storageDisabled) {
        _Logger.scheduleFlush();
      }
    }
    /**
     * Schedule a flush to happen after the interval
     */
    static scheduleFlush() {
      if (_Logger.isFlushScheduled) return;
      _Logger.isFlushScheduled = true;
      _Logger.flushTimer = setTimeout(() => {
        _Logger.flushLogsToStorage();
      }, BATCH_WRITE_INTERVAL);
    }
    /**
     * Store log entry in buffer (will be flushed periodically)
     */
    storeLog(entry) {
      if (_Logger.storageDisabled || !this.config.storeLogs) return;
      if (!isExtensionAlive()) return;
      if (typeof chrome === "undefined" || !chrome.storage) return;
      try {
        _Logger.logBuffer.push(entry);
        if (_Logger.logBuffer.length >= BATCH_SIZE_THRESHOLD) {
          _Logger.flushLogsToStorage();
        } else {
          _Logger.scheduleFlush();
        }
      } catch (error) {
        console.error("[LF] Failed to buffer log:", error);
      }
    }
    /**
     * Format message with prefix
     */
    formatMessage(message) {
      const fullContext = this.parentContext ? `${this.parentContext}][${this.config.context}` : this.config.context;
      return `[LF][${fullContext}] ${message}`;
    }
    /**
     * Serialize data for logging
     */
    serializeData(data) {
      if (data === void 0) return void 0;
      try {
        return JSON.parse(JSON.stringify(data));
      } catch (error) {
        return String(data);
      }
    }
    /**
     * Core logging function
     */
    logInternal(level, ...args) {
      const message = args.map((arg) => {
        if (typeof arg === "string") return arg;
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch (error) {
            return "[Circular Reference]";
          }
        }
        return String(arg);
      }).join(" ");
      const fullContext = this.parentContext ? `${this.parentContext}][${this.config.context}` : this.config.context;
      const repeatDecision = _Logger.shouldLogRepeating(fullContext, level, message);
      if (!repeatDecision.log) {
        return;
      }
      const loggedMessage = repeatDecision.suffix ? `${message}${repeatDecision.suffix}` : message;
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        context: this.config.context,
        // log-server.js reads `source` (never `context`), so without this every
        // entry lands in the unattributed bucket and by-source/ is useless.
        source: fullContext,
        level,
        message: loggedMessage,
        data: args.length > 1 ? this.serializeData(args.slice(1)) : void 0
      };
      if (this.config.consoleLogging) {
        const consoleMethod = console[level] || console.log;
        consoleMethod(`[LF][${fullContext}]`, loggedMessage, ...(args.length > 1 ? args.slice(1) : []));
      }
      this.storeLog(entry);
      this.sendToRemote(entry);
    }
    /**
     * Public logging methods - support unlimited parameters like console.log()
     */
    log(...args) {
      this.logInternal("log", ...args);
    }
    info(...args) {
      this.logInternal("info", ...args);
    }
    warn(...args) {
      this.logInternal("warn", ...args);
    }
    error(...args) {
      this.logInternal("error", ...args);
    }
    debug(...args) {
      this.logInternal("debug", ...args);
    }
    /**
     * Update logger configuration
     */
    setConfig(config) {
      this.config = { ...this.config, ...config };
    }
    /**
     * Enable/disable remote logging
     */
    setRemoteLogging(enabled) {
      this.config.remoteLogging = enabled;
    }
    /**
     * Enable/disable console logging
     */
    setConsoleLogging(enabled) {
      this.config.consoleLogging = enabled;
    }
    /**
     * Create a nested logger with additional context
     */
    createNestedLogger(nestedContext) {
      const fullContext = this.parentContext ? `${this.parentContext}][${this.config.context}` : this.config.context;
      return new _Logger(
        nestedContext,
        {
          remoteLogging: this.config.remoteLogging,
          remoteUrl: this.config.remoteUrl,
          consoleLogging: this.config.consoleLogging
        },
        fullContext
      );
    }
    /**
     * Flush all buffered logs to storage immediately
     * Call this before extension unload to prevent log loss
     */
    static async flushLogs() {
      return _Logger.flushLogsToStorage();
    }
  };
  _Logger.logBuffer = [];
  _Logger.flushTimer = null;
  _Logger.isFlushScheduled = false;
  _Logger.storageDisabled = false;
  _Logger.repeatCounts = /* @__PURE__ */ new Map();
  _Logger.REPEAT_LOG_INTERVAL_MS = 3e4;
  _Logger.shouldLogRepeating = function(context, level, message) {
    if (level === "error" || level === "warn") {
      return { log: true, suffix: "" };
    }
    const key = `${context}::${message}`;
    const now = Date.now();
    const prev = _Logger.repeatCounts.get(key);
    if (!prev) {
      _Logger.repeatCounts.set(key, { count: 1, firstAt: now, lastLoggedAt: now });
      return { log: true, suffix: "" };
    }
    prev.count += 1;
    const ageSec = Math.floor((now - prev.firstAt) / 1e3);
    const hitBreakpoint = prev.count === 5 || prev.count === 10 || prev.count === 30 || prev.count === 60 || now - prev.lastLoggedAt >= _Logger.REPEAT_LOG_INTERVAL_MS;
    if (!hitBreakpoint) {
      return { log: false, suffix: "" };
    }
    prev.lastLoggedAt = now;
    return { log: true, suffix: ` (×${prev.count} over ${ageSec}s — further repeats suppressed until next breakpoint)` };
  };
  let Logger = _Logger;
  function createLogger(context, config, parentContext) {
    return new Logger(context, config, parentContext);
  }
  createLogger("POPUP");
  createLogger("SW");
  createLogger("REDDIT");
  const devvitLogger = createLogger("DEVVIT");
  const devvitGIAELogger = createLogger("DEVVIT-GIAE");
  class GameState {
    constructor() {
      this.livesRemaining = 3;
      this.currentEncounter = 0;
      this.totalEncounters = 0;
      this.postId = null;
      this.difficulty = null;
      this.missionMetadata = null;
      this.currentScreen = "unknown";
      this._storageLoadAttempted = false;
      this._lastKnownLives = 3;
      this._zeroLivesConfirmations = 0;
    }
    /**
     * Update state from DOM (called every tick)
     */
    updateFromDOM() {
      this.livesRemaining = this.readLivesFromDOM();
    }
    /**
     * Read lives from .lives-container in DOM
     */
    readLivesFromDOM() {
      const livesContainer = document.querySelector(".lives-container");
      if (!livesContainer) {
        return this._lastKnownLives ?? 3;
      }
      const filledHearts = livesContainer.querySelectorAll('img[src*="Heart_Full.png"]').length;
      if (filledHearts === 0 && (this._lastKnownLives ?? 3) > 0) {
        return this._lastKnownLives;
      }
      if (filledHearts > 0) {
        this._lastKnownLives = filledHearts;
      }
      return filledHearts > 0 ? filledHearts : this._lastKnownLives ?? 3;
    }
    /**
     * Set mission data from initialData message
     */
    setMissionData(metadata, postId) {
      this.postId = postId;
      this.missionMetadata = metadata;
      this.totalEncounters = metadata?.mission?.encounters?.length || 0;
      this.difficulty = metadata?.mission?.difficulty || null;
      this.currentEncounter = -1;
      devvitGIAELogger.log("[GameState] Mission data set from initialData", {
        postId,
        totalEncounters: this.totalEncounters,
        startingEncounter: this.currentEncounter,
        firstEncounterType: metadata?.mission?.encounters?.[0]?.type,
        note: "Starting at -1 (initial battle not in encounters array)",
        hasMetadata: !!metadata,
        hasMission: !!metadata?.mission,
        hasEncounters: !!metadata?.mission?.encounters,
        encountersLength: metadata?.mission?.encounters?.length || 0
      });
    }
    /**
     * Load mission metadata from storage as fallback
     * Called if initialData message doesn't have complete data
     */
    async loadMissionDataFromStorage(postId) {
      this._storageLoadAttempted = true;
      try {
        const { getMission: getMission2 } = await Promise.resolve().then(() => missions);
        const mission = await getMission2(postId);
        if (!mission?.encounters) {
          devvitGIAELogger.warn("[GameState] No encounters in storage for", postId);
          return false;
        }
        const storageMetadata = {
          mission: {
            encounters: mission.encounters,
            difficulty: mission.difficulty,
            environment: mission.environment,
            minLevel: mission.minLevel,
            maxLevel: mission.maxLevel,
            foodImage: mission.foodImage,
            foodName: mission.foodName,
            authorWeaponId: mission.authorWeaponId || "",
            chef: mission.chef || "",
            cart: mission.cart || "",
            rarity: mission.rarity
          },
          missionAuthorName: mission.missionAuthorName,
          missionTitle: mission.missionTitle,
          enemyTauntData: []
        };
        if (this.missionMetadata) {
          const initialDataEncounters = this.missionMetadata?.mission?.encounters?.length || 0;
          const storageEncounters = mission.encounters?.length || 0;
          const storageUnenriched = storageEncounters === 0 && (mission.difficulty || 0) === 0;
          if (initialDataEncounters !== storageEncounters) {
            if (storageUnenriched && initialDataEncounters > 0) {
              devvitGIAELogger.log("[GameState] Storage not enriched yet; using live initialData", {
                postId,
                initialDataEncounters
              });
            } else {
              devvitGIAELogger.warn("[GameState] Metadata mismatch!", {
                postId,
                initialDataEncounters,
                storageEncounters,
                initialDataDifficulty: this.missionMetadata?.mission?.difficulty,
                storageDifficulty: mission.difficulty
              });
            }
          } else {
            devvitGIAELogger.log("[GameState] Storage metadata matches initialData");
          }
        } else {
          devvitGIAELogger.log("[GameState] Using storage metadata as fallback", {
            postId,
            encountersLength: mission.encounters?.length || 0
          });
          this.missionMetadata = storageMetadata;
          this.totalEncounters = mission.encounters?.length || 0;
          this.difficulty = mission.difficulty || null;
        }
        return true;
      } catch (error) {
        devvitGIAELogger.error("[GameState] Failed to load from storage", { postId, error: String(error) });
        return false;
      }
    }
    /**
     * Get current encounter type from mission metadata
     *
     * Note: Returns null for initial battle (currentEncounter === -1)
     * since the initial battle is not in the encounters array
     */
    getCurrentEncounterType() {
      const encounters = this.missionMetadata?.mission?.encounters;
      devvitGIAELogger.log("[GameState] getCurrentEncounterType called:", {
        currentEncounter: this.currentEncounter,
        isInitialBattle: this.currentEncounter === -1,
        hasMetadata: !!this.missionMetadata,
        hasMission: !!this.missionMetadata?.mission,
        hasEncounters: !!encounters,
        encountersLength: encounters?.length || 0,
        encounterAtCurrentIndex: encounters?.[this.currentEncounter],
        encounterAtNextIndex: encounters?.[this.currentEncounter + 1],
        storageLoadAttempted: this._storageLoadAttempted
      });
      if (this.currentEncounter === -1) {
        return null;
      }
      if (!encounters && !this._storageLoadAttempted && this.postId) {
        devvitGIAELogger.warn(
          "[GameState] No encounter metadata! Suggest calling loadMissionDataFromStorage()"
        );
      }
      if (!encounters || this.currentEncounter >= encounters.length) {
        return null;
      }
      return encounters[this.currentEncounter]?.type || null;
    }
    /**
     * Update when encounter completes
     */
    onEncounterComplete(encounterIndex) {
      devvitGIAELogger.log("[GameState] Encounter complete", {
        previousEncounter: this.currentEncounter,
        newEncounter: encounterIndex,
        totalEncounters: this.totalEncounters
      });
      this.currentEncounter = encounterIndex;
    }
    /**
     * Get progress string for display
     */
    getProgress() {
      if (this.totalEncounters === 0) return "Starting";
      if (this.currentEncounter === -1) return "Pre-Game";
      return `${this.currentEncounter + 1}/${this.totalEncounters}`;
    }
    /**
     * Should we play safe? (low on lives)
     */
    shouldPlaySafe() {
      return this.livesRemaining <= 1;
    }
    /**
     * Is player still alive?
     */
    isAlive() {
      return this.livesRemaining > 0;
    }
  }
  class DecisionMaker {
    constructor(gameState, config) {
      this.gameState = gameState;
      this.config = config;
    }
    /**
     * Crossroads: Fight or Skip mini boss
     */
    decideCrossroads() {
      return this.config.crossroadsStrategy || "fight";
    }
    /**
     * Skill Bargain: Accept or Decline
     */
    decideSkillBargain(bargainText) {
      const isPositive = this.isPositiveBargain(bargainText);
      const strategy = this.config.skillBargainStrategy || "positive-only";
      if (strategy === "always") return "accept";
      if (strategy === "never") return "decline";
      return isPositive ? "accept" : "decline";
    }
    /**
     * Pick best ability from choices
     */
    pickAbility(abilities) {
      for (const preferred of this.config.abilityTierList || []) {
        if (abilities.includes(preferred)) {
          return preferred;
        }
      }
      return abilities[0];
    }
    /**
     * Pick best blessing stat from choices
     */
    pickBlessing(blessingStats) {
      for (const preferred of this.config.blessingStatPriority || []) {
        const match = blessingStats.find(
          (stat) => stat.toLowerCase().includes(preferred.toLowerCase())
        );
        if (match) {
          return match;
        }
      }
      return blessingStats[0];
    }
    /**
     * Pick creator bonus based on user preference
     */
    decideCreatorBonus(bonusOptions) {
      const preference = this.config.creatorBonusPreference || "coin";
      if (preference === "first") {
        return bonusOptions[0];
      }
      if (preference === "coin") {
        const coinOption = bonusOptions.find((opt) => {
          const text = opt.toLowerCase();
          return text.includes("coin") || text.includes("gold") || text.includes("earn rate");
        });
        if (coinOption) return coinOption;
      } else if (preference === "attack") {
        const attackOption = bonusOptions.find((opt) => {
          const text = opt.toLowerCase();
          return text.includes("attack") && !text.includes("earn rate");
        });
        if (attackOption) return attackOption;
      }
      return bonusOptions[0];
    }
    /**
     * Simple heuristic: more + than - means positive
     */
    isPositiveBargain(text) {
      const plusCount = (text.match(/\+/g) || []).length;
      const minusCount = (text.match(/-/g) || []).length;
      return plusCount > minusCount;
    }
  }
  function normalizePostId(id) {
    if (!id || typeof id !== "string") {
      return null;
    }
    if (id.startsWith("t3_")) {
      const postIdPart = id.slice(3);
      if (postIdPart && /^[a-z0-9]+$/i.test(postIdPart)) {
        return id;
      }
      return null;
    }
    if (/^[a-z0-9]+$/i.test(id)) {
      return `t3_${id}`;
    }
    return null;
  }
  function extractPostIdFromUrl(url) {
    try {
      const directT3 = url.match(/t3_[a-z0-9]+/i);
      if (directT3) {
        return normalizePostId(directT3[0]);
      }
      const contextMatch = url.match(/context=([^&#]+)/);
      if (contextMatch) {
        try {
          const contextJson = decodeURIComponent(contextMatch[1]);
          const context = JSON.parse(contextJson);
          if (context.postId) {
            console.log("[extractPostIdFromUrl] Extracted postId from context parameter", {
              postId: context.postId
            });
            return context.postId;
          }
        } catch (parseError) {
          console.warn("[extractPostIdFromUrl] Failed to parse context parameter", {
            error: String(parseError)
          });
          const postIdMatch = contextMatch[1].match(/%22postId%22%3A%22(t3_[^%]+)%22/);
          if (postIdMatch) {
            console.log("[extractPostIdFromUrl] Extracted postId from context string fallback", {
              postId: postIdMatch[1]
            });
            return postIdMatch[1];
          }
          const decoded = decodeURIComponent(contextMatch[1]);
          const t3Fallback = decoded.match(/t3_[a-z0-9]+/i);
          if (t3Fallback) {
            return normalizePostId(t3Fallback[0]);
          }
        }
      }
      const tokenMatch = url.match(/webbit_token=([^&#]+)/);
      if (tokenMatch) {
        try {
          const tokenParts = tokenMatch[1].split(".");
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            if (payload["devvit-post-id"]) {
              console.log("[extractPostIdFromUrl] Extracted postId from JWT token", {
                postId: payload["devvit-post-id"]
              });
              return payload["devvit-post-id"];
            }
          }
        } catch (tokenError) {
          console.warn("[extractPostIdFromUrl] Failed to parse JWT token", {
            error: String(tokenError)
          });
        }
      }
      const redditMatch = url.match(/\/comments\/([a-zA-Z0-9]+)/);
      if (redditMatch && redditMatch[1]) {
        return normalizePostId(redditMatch[1]);
      }
    } catch (error) {
      console.warn("[extractPostIdFromUrl] Failed to extract postId from URL", {
        error: String(error)
      });
    }
    return null;
  }
  const STORAGE_KEYS = {
    MISSIONS: "missions"
  };
  function isLegacyFormat(record) {
    return record && typeof record === "object" && "metadata" in record && record.metadata !== void 0;
  }
  function migrateLegacyRecord(legacy) {
    const mission = legacy.metadata?.mission;
    const record = {
      // Core identification
      postId: legacy.postId,
      timestamp: legacy.timestamp,
      permalink: legacy.permalink,
      // Mission metadata
      missionTitle: legacy.metadata?.missionTitle || legacy.missionTitle || `Mission ${legacy.postId.slice(3)}`,
      missionAuthorName: legacy.metadata?.missionAuthorName || "Unknown",
      // Mission data (from nested mission object or top-level fields)
      environment: mission?.environment || legacy.environment || "haunted_forest",
      encounters: mission?.encounters || [],
      minLevel: mission?.minLevel || legacy.minLevel || 1,
      maxLevel: mission?.maxLevel || legacy.maxLevel || 340,
      difficulty: mission?.difficulty || legacy.difficulty || 0,
      foodImage: mission?.foodImage || "",
      foodName: mission?.foodName || legacy.foodName || "",
      authorWeaponId: mission?.authorWeaponId || "",
      chef: mission?.chef || "",
      cart: mission?.cart || "",
      rarity: mission?.rarity || "common",
      type: mission?.type
    };
    return record;
  }
  function normalizeMissionRecord(record) {
    if (isLegacyFormat(record)) {
      return migrateLegacyRecord(record);
    }
    return record;
  }
  async function saveMission(mission) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error("Extension context invalidated"));
        return;
      }
      chrome.storage.local.get([STORAGE_KEYS.MISSIONS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const missions2 = result2[STORAGE_KEYS.MISSIONS] || {};
        missions2[mission.postId] = mission;
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: missions2 }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            safeSendMessage({
              type: "MISSIONS_UPDATED"
            });
            resolve();
          }
        });
      });
    });
  }
  async function getAllMissions() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEYS.MISSIONS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          const rawMissions = result2[STORAGE_KEYS.MISSIONS] || {};
          const migratedMissions = {};
          for (const postId in rawMissions) {
            migratedMissions[postId] = normalizeMissionRecord(rawMissions[postId]);
          }
          resolve(migratedMissions);
        }
      });
    });
  }
  async function getMission(postId) {
    const missions2 = await getAllMissions();
    return missions2[postId] || null;
  }
  const missions = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    getAllMissions,
    getMission,
    saveMission
  }, Symbol.toStringTag, { value: "Module" }));
  const DEFAULT_GIAE_CONFIG = {
    enabled: false,
    abilityTierList: ["IceKnifeOnTurnStart", "LightningOnCrit", "HealOnFirstTurn"],
    blessingStatPriority: ["Speed", "Attack", "Crit", "Health", "Defense", "Dodge"],
    // Speed first for faster gameplay
    autoAcceptSkillBargains: true,
    skillBargainStrategy: "positive-only",
    crossroadsStrategy: "fight",
    // Fight mini bosses by default
    creatorBonusPreference: "coin",
    // Default to coin earn rate bonus
    autoPlay: true,
    clickDelay: 1e3,
    debugVisuals: true
    // Show visual indicators for debugging
  };
  class GameInstanceAutomationEngine {
    constructor(config) {
      this.intervalId = null;
      this.isProcessing = false;
      this.ACTIVE_INTERVAL_MS = 1e3;
      this.MONITORING_INTERVAL_MS = 5e3;
      // "unknown" is the screen fallback whenever findAllButtons() comes back
      // empty, which a transient render gap also produces. Post-victory idle is
      // only believed once the unknown screen has held for this long.
      this.POST_VICTORY_UNKNOWN_GRACE_MS = 3e3;
      this.currentPostId = null;
      this.missionMetadata = null;
      this.innCompletionHandled = false;
      this.missionDoneNoClick = false;
      this.victoryFlow = null;
      this.lastAdvanceClickPoint = null;
      this.victoryCompletionReported = false;
      this._inProgressSinceMs = 0;
      this._unknownSinceMs = 0;
      this._hollowUiSinceMs = 0;
      this._hollowUiReloadedForPostId = null;
      this._hollowUiErrorReported = false;
      this._hollowUiNudgedReady = false;
      this._lastScreenLogAt = 0;
      this._lastLoggedScreen = "";
      this.telemetrySnapshot = null;
      this._tabBackgroundSinceMs = 0;
      this.config = {
        ...DEFAULT_GIAE_CONFIG,
        ...config,
        // Ensure arrays are properly set, falling back to defaults if not provided
        abilityTierList: Array.isArray(config.abilityTierList) ? config.abilityTierList : DEFAULT_GIAE_CONFIG.abilityTierList,
        blessingStatPriority: Array.isArray(config.blessingStatPriority) ? config.blessingStatPriority : DEFAULT_GIAE_CONFIG.blessingStatPriority
      };
      this.gameState = new GameState();
      this.decisionMaker = new DecisionMaker(this.gameState, this.config);
      this.setupMessageListener();
      devvitGIAELogger.log("Game automation engine initialized");
      this.startInterval(this.MONITORING_INTERVAL_MS);
      devvitGIAELogger.log("Screen detection interval started (monitoring mode)");
    }
    resetSessionForMissionSwitch(postId, reason = "mission_switch") {
      const previousPostId = normalizePostId(this.currentPostId || this.gameState.postId);
      const nextPostId = normalizePostId(postId);
      if (previousPostId && nextPostId && previousPostId === nextPostId) {
        return false;
      }
      devvitGIAELogger.log("Resetting automation session for mission switch", {
        reason,
        previousPostId,
        postId: nextPostId
      });
      if (nextPostId) {
        this.currentPostId = nextPostId;
        this.gameState.postId = nextPostId;
      }
      this.innCompletionHandled = false;
      this.missionDoneNoClick = false;
      this.victoryFlow = null;
      this.victoryCompletionReported = false;
      this._inProgressSinceMs = 0;
      this._unknownSinceMs = 0;
      this._hollowUiSinceMs = 0;
      this._hollowUiReloadedForPostId = null;
      this._hollowUiErrorReported = false;
      this._hollowUiNudgedReady = false;
      this.gameState._storageLoadAttempted = false;
      this.gameState.currentEncounter = -1;
      this.gameState.currentScreen = "unknown";
      if (nextPostId) {
        this.gameState.loadMissionDataFromStorage(nextPostId).catch((err) => {
          devvitGIAELogger.warn("[GIAE] Could not preload storage metadata after mission switch", {
            postId: nextPostId,
            error: String(err)
          });
        });
      }
      return true;
    }
    setupMessageListener() {
      window.addEventListener("message", (event) => {
        try {
          if (event.data?.type === "devvit-message" && event.data?.data?.message?.type === "initialData") {
            const data = event.data.data.message.data;
            this.resetSessionForMissionSwitch(data.postId, "initialData");
            this.gameState.setMissionData(data.missionMetadata, data.postId);
            this.currentPostId = data.postId;
            this.missionMetadata = data.missionMetadata;
            // Snapshot for telemetry while the encounters still exist: clearing a
            // mission rewrites it as compactCleared, which drops the array.
            this.captureTelemetrySnapshot(data.postId, data.missionMetadata);
            this.innCompletionHandled = false;
      this.missionDoneNoClick = false;
            this.victoryFlow = null;
            this.victoryCompletionReported = false;
            this._inProgressSinceMs = 0;
            this._unknownSinceMs = 0;
            this._hollowUiSinceMs = 0;
            this._hollowUiReloadedForPostId = null;
            this._hollowUiErrorReported = false;
            this._hollowUiNudgedReady = false;
            this.gameState.loadMissionDataFromStorage(data.postId).catch((err) => {
              devvitGIAELogger.error("[GIAE] Failed to load mission data from storage", err);
            });
            devvitGIAELogger.log("Mission started", {
              postId: data.postId,
              encounters: this.gameState.totalEncounters,
              difficulty: this.gameState.difficulty
            });
            notifyMissionMetadataCaptured(
              data.postId,
              {
                postId: data.postId,
                username: data.username,
                missionMetadata: data.missionMetadata
              },
              "initialData-giae"
            );
            this.reportGameState();
          }
          const innerMsg = event.data?.data?.message;
          const completionTypes = ["missionComplete", "mission_complete", "runComplete", "gameComplete"];
          if (innerMsg && completionTypes.includes(innerMsg.type)) {
            const data = innerMsg.data || innerMsg;
            const rawPostId = data?.postId || data?.missionId || innerMsg.postId;
            const postId = normalizePostId(rawPostId) || this.currentPostId;
            devvitGIAELogger.log("Mission complete message from game", {
              type: innerMsg.type,
              postId,
              data
            });
            if (postId) {
              this.currentPostId = postId;
              this.gameState.postId = postId;
            }
            this.reportMissionCompletion(innerMsg.type, !this.config.enabled);
          }
        } catch (error) {
          devvitGIAELogger.error("Message error", { error: String(error) });
        }
      });
    }
    /**
     * Helper to start/restart the detection interval with a specific timing
     */
    startInterval(intervalMs) {
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.intervalId = window.setInterval(() => {
        if (!this.isProcessing) {
          this.processGame();
        }
      }, intervalMs);
    }
    start() {
      this.config.enabled = true;
      devvitGIAELogger.log("Starting automation (switching to active mode)");
      this.startInterval(this.ACTIVE_INTERVAL_MS);
    }
    stop() {
      devvitGIAELogger.log("Stopping automation (switching to monitoring mode)");
      this.config.enabled = false;
      this.startInterval(this.MONITORING_INTERVAL_MS);
    }
    /**
     * Completely stops detection interval (use when leaving game)
     */
    stopDetection() {
      devvitGIAELogger.log("Stopping detection interval");
      this.config.enabled = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
    async queryTabActive() {
      return new Promise((resolve) => {
        safeSendMessage({ type: "GET_TAB_ACTIVE" }, (response) => {
          resolve(response?.active !== false);
        });
      });
    }
    async processGame() {
      if (!isExtensionAlive()) {
        markExtensionContextDead();
        return;
      }
      this.isProcessing = true;
      try {
        let postId = await this.resolvePostId();
        if (postId) {
          this.currentPostId = postId;
          this.gameState.postId = postId;
        }
        if (postId && !this.gameState.missionMetadata) {
          if (!this.gameState._storageLoadAttempted) {
            devvitGIAELogger.log("Loading mission metadata from storage (initialData not yet received)");
            await this.gameState.loadMissionDataFromStorage(postId);
          }
        }
        const buttons = this.findAllButtons();
        const screen = buttons.length > 0 ? this.detectScreen(buttons) : this.isVictoryEndOverlay([]) ? "victory_end" : "unknown";
        const now = Date.now();
        if (screen !== this._lastLoggedScreen || now - this._lastScreenLogAt > 3e4) {
          devvitGIAELogger.log("[processGame] Screen detected", { screen });
          this._lastLoggedScreen = screen;
          this._lastScreenLogAt = now;
        }
        const screenChanged = this.gameState.currentScreen !== screen;
        this.gameState.currentScreen = screen;
        if (screen === "unknown") {
          if (!this._unknownSinceMs) {
            this._unknownSinceMs = now;
          }
        } else {
          this._unknownSinceMs = 0;
        }
        if (this.shouldPauseGameClicking(screen)) {
          if (screenChanged) {
            this.reportGameState();
          }
          return;
        }
        if (screen === "inn") {
          if (this.config.enabled && !this.innCompletionHandled) {
            await this.reportMissionCompletion("inn-screen", false);
          }
          this.enterMissionDoneNoClick("inn-screen");
          if (screenChanged) {
            this.reportGameState();
          }
          return;
        }
        if (this.victoryCompletionReported && (screen === "start" || screen === "unknown" || screen === "in_progress")) {
          // "start" and "in_progress" are positive detections, so they are acted on
          // at once. "unknown" only means no buttons were found this tick, and
          // enterMissionDoneNoClick() is a latch that nothing but a new mission
          // clears -- so a single empty tick must not be allowed to strand the bot.
          if (screen === "unknown" && now - this._unknownSinceMs < this.POST_VICTORY_UNKNOWN_GRACE_MS) {
            if (screenChanged) {
              this.reportGameState();
            }
            return;
          }
          this.enterMissionDoneNoClick(`post-victory-${screen}`);
          if (screenChanged) {
            this.reportGameState();
          }
          return;
        }
        if (screenChanged) {
          this.reportGameState();
        } else if (screen === "in_progress" && now - (this._lastInProgressReportAt || 0) > 5e3) {
          this._lastInProgressReportAt = now;
          this.reportGameState();
        }
        this.gameState.updateFromDOM();
        const missionEndCue = this.detectMissionEndCue(buttons, screen);
        // Skip work only if there's nothing actionable AND no mission-end cue.
        // We must let the victory flow continue even when buttons are gone
        // (e.g. modal already closed and screen is "unknown").
        if (buttons.length === 0 && !this.victoryFlow && !missionEndCue) {
          if (now - (this._lastNoButtonsTraceAt || 0) > 5e3) {
            this._lastNoButtonsTraceAt = now;
            console.log("[LazyFrog:RunGate] DEVVIT_IDLE_TICK", {
              ts: now,
              screen,
              enabled: this.config.enabled,
              reason: "no-buttons-no-victory-cue"
            });
          }
          return;
        }
        if (!missionEndCue && !this.gameState.isAlive()) {
          this.gameState._zeroLivesConfirmations = (this.gameState._zeroLivesConfirmations || 0) + 1;
          if (this.gameState._zeroLivesConfirmations < 2) {
            devvitGIAELogger.warn("Lives read as 0 — waiting for confirmation (DOM may be stale when tab backgrounded)", {
              screen,
              lives: this.gameState.livesRemaining
            });
            return;
          }
          devvitGIAELogger.error("Out of lives", { screen, lives: this.gameState.livesRemaining });
          this.stop();
          safeSendMessage({
            type: "ERROR_OCCURRED",
            message: "Out of lives"
          });
          return;
        }
        this.gameState._zeroLivesConfirmations = 0;
        if (missionEndCue) {
          this.syncRunModeFromSession();
          const dryRun = !this.config.enabled;
          devvitGIAELogger.log("Victory end flow", {
            screen,
            step: this.victoryFlow?.step,
            mode: dryRun ? "DRY-RUN" : "ACTIVE"
          });
          await this.handleVictoryEndFlow(buttons, screen, dryRun);
          if (!dryRun) {
            await this.delay(this.config.clickDelay || 300);
          }
        } else {
          this._hollowUiSinceMs = 0;
          this._hollowUiNudgedReady = false;
          if (screen !== "unknown" && screen !== "in_progress") {
          this.syncRunModeFromSession();
          const encounterType = this.gameState.getCurrentEncounterType();
          const dryRun = !this.config.enabled;
          devvitGIAELogger.log("Screen", {
            screen,
            lives: this.gameState.livesRemaining,
            playSafe: this.gameState.shouldPlaySafe(),
            encounter: this.gameState.getProgress(),
            encounterType,
            mode: dryRun ? "DRY-RUN" : "ACTIVE"
          });
          await this.handleScreen(screen, buttons, dryRun);
          if (!dryRun) {
            await this.delay(this.config.clickDelay || 300);
          }
          } else if (now - (this._lastScreenHoldTraceAt || 0) > 5e3) {
          this._lastScreenHoldTraceAt = now;
          console.log("[LazyFrog:RunGate] DEVVIT_SCREEN_HOLD", {
            ts: now,
            screen,
            enabled: this.config.enabled,
            reason: "in_progress-or-unknown-no-action"
          });
          }
        }
      } catch (error) {
        devvitGIAELogger.error("Process error", { error: String(error) });
      } finally {
        this.isProcessing = false;
      }
    }
    isHollowGameUi(buttons, screen) {
      if (this.victoryFlow) {
        return false;
      }
      if (screen === "victory_end" || screen === "finish" || screen === "continue" || screen === "inn" || screen === "daily_treats") {
        return false;
      }
      const hasAdvance = !!(document.querySelector(".advance-button") || buttons.find((b) => String(b.className || "").includes("advance-button")));
      if (hasAdvance) {
        return false;
      }
      const skillCount = buttons.filter((b) => String(b.className || "").includes("skill-button")).length;
      if (skillCount > 1) {
        return false;
      }
      const hasStart = buttons.some((b) => {
        const cls = String(b.className || "");
        const text = b.textContent?.trim().toLowerCase() || "";
        return cls.includes("mc__btn-start") || cls.includes("btn-start") || text === "start" || text.includes("start mission");
      });
      if (hasStart) {
        return false;
      }
      if (document.querySelector(".ui-panel-header, .mission-end-footer, .end-mission-button")) {
        return false;
      }
      const hasGameChrome = !!(document.querySelector(".volume-icon-button, .lives-container, .navbar-tooltip"));
      if (!hasGameChrome) {
        return false;
      }
      return false;
    }
    async handleHollowGameUi(buttons, screen, dryRun) {
      devvitGIAELogger.warn("handleHollowGameUi called but auto-reload is disabled (use Skip if truly stuck)", {
        screen,
        postId: this.currentPostId || this.gameState.postId
      });
    }
    detectScreen(buttons) {
      const texts = buttons.map((b) => b.textContent?.trim().toLowerCase() || "");
      const classes = buttons.map((b) => b.className);
      if (this.findDailyTreatsClaim()) return "daily_treats";
      if (classes.some((c) => c.includes("skip-button"))) return "skip";
      if (this.isVictoryEndOverlay(buttons)) return "victory_end";
      if (document.querySelector(".mission-end-footer")) return "finish";
      const startBtn = document.querySelector(".mc__btn-start, .btn-start");
      if (startBtn && this.isElementClickable(startBtn)) {
        return "start";
      }
      const innBtn = document.querySelector(".mc__btn-inn");
      if (innBtn && this.isElementClickable(innBtn)) {
        return "inn";
      }
      const tooltip = document.querySelector(".navbar-tooltip");
      if (tooltip?.textContent?.includes("Find and play missions")) {
        return "inn";
      }
      if (texts.some((t) => t.includes("fight")) && texts.some((t) => t.includes("nope"))) {
        return "crossroads";
      }
      if (texts.includes("refuse") || texts.includes("accept") && texts.includes("decline")) {
        return "bargain";
      }
      if (classes.filter((c) => c.includes("skill-button")).length > 1) {
        const panelHeader = document.querySelector(".ui-panel-header");
        const headerText = panelHeader?.textContent?.toLowerCase() || "";
        const hasCreatorBonusButtons = buttons.some((b) => {
          const text = b.textContent?.toLowerCase() || "";
          return text.includes("creator bonus:");
        });
        if (headerText.includes("choose a bonus") || hasCreatorBonusButtons) {
          return "creatorBonus";
        }
        return "choice";
      }
      if (classes.some((c) => c.includes("advance-button"))) {
        return "battle";
      }
      if (texts.some((t) => t === "start" || t === "play" || t.includes("start mission") || t.includes("start run"))) {
        return "start";
      }
      if (texts.some((t) => t.includes("continue") && !t.includes("play next"))) return "continue";
      if (texts.some((t) => t.includes("play next"))) return "finish";
      if (classes.some((c) => c.includes("volume-icon-button"))) {
        return "in_progress";
      }
      return "unknown";
    }
    findClickableByText(patterns, root = document) {
      const candidates = root.querySelectorAll(
        'button, [role="button"], [class*="btn"], [class*="button"], [class*="continue"], [class*="next"], a, div[class*="skill"], div'
      );
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const text = el.textContent?.trim().toLowerCase() || "";
        if (text.length > 80) continue;
        if (patterns.some((pattern) => text.includes(pattern))) {
          return el;
        }
      }
      return null;
    }
    findRefuseButton(buttons) {
      const fromButtons = buttons.find((b) => {
        const text = b.textContent?.trim().toLowerCase() || "";
        return text === "refuse" || text === "decline" || text.includes("refuse");
      });
      return fromButtons || this.findClickableByText(["refuse", "decline"]);
    }
    findGameCloseButton() {
      const selectors = [
        '[class*="close-button"]',
        '[class*="btn-close"]',
        '[class*="close-btn"]',
        'button[aria-label*="close" i]'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return el;
        }
      }
      return this.findClickableByText(["×", "✕", "x"]);
    }
    requestCloseGameDialog() {
      safeSendMessage({ type: "REQUEST_CLOSE_GAME_DIALOG" });
    }
    /**
     * Game uses image-buttons (img alt + src) more often than text labels, so
     * each finder layers four strategies, ordered by reliability:
     *   1) documented CSS class (most stable selector per docs/Reverse engineering notes.md)
     *   2) documented image src (button_continue.png / button_playnext.png)
     *   3) buttons-array text match
     *   4) findClickableByText fallback
     */
    elementContainsImage(element, imgSrcSubstring, altMatch) {
      if (!element) return false;
      try {
        if (element.tagName === "IMG") {
          const src = element.getAttribute("src") || "";
          const alt = (element.getAttribute("alt") || "").toLowerCase();
          if (imgSrcSubstring && src.includes(imgSrcSubstring)) return true;
          if (altMatch && alt.includes(altMatch)) return true;
        }
        const imgs = element.querySelectorAll?.("img") || [];
        for (const img of imgs) {
          const src = img.getAttribute("src") || "";
          const alt = (img.getAttribute("alt") || "").toLowerCase();
          if (imgSrcSubstring && src.includes(imgSrcSubstring)) return true;
          if (altMatch && alt.includes(altMatch)) return true;
        }
      } catch {
      }
      return false;
    }
    getVisibleEndMissionButtons() {
      const buttons = [];
      try {
        const footer = document.querySelector(".mission-end-footer") || document;
        footer.querySelectorAll(".end-mission-button").forEach((el) => {
          if (this.isElementClickable(el)) {
            buttons.push(el);
          }
        });
      } catch {
      }
      return buttons;
    }
    isDiscoverMoreButton(element) {
      if (!element) return false;
      const text = element.textContent?.trim().toLowerCase() || "";
      if (text.includes("discover")) return true;
      if (this.elementContainsImage(element, "button_discover", "discover")) return true;
      if (this.isPlayNextButton(element)) return false;
      return false;
    }
    isPlayNextButton(element) {
      if (!element) return false;
      const text = element.textContent?.trim().toLowerCase() || "";
      if (text.includes("play next")) return true;
      if (text.includes("visit the inn") || text.includes("visit inn")) return true;
      if (this.elementContainsImage(element, "button_playnext.png", "play next")) return true;
      return false;
    }
    pickRightmostButton(buttons) {
      if (!buttons.length) return null;
      return buttons.reduce((rightmost, btn) => {
        const r = btn.getBoundingClientRect();
        const rr = rightmost.getBoundingClientRect();
        return r.left > rr.left ? btn : rightmost;
      });
    }
    /**
     * Victory footer often has Discover (left) and Play Next (right), both
     * using .end-mission-button. Prefer the play-next image/text, else the
     * rightmost non-discover button in the same footer row.
     */
    findPlayNextInMissionEndFooter() {
      const endButtons = this.getVisibleEndMissionButtons();
      if (!endButtons.length) return null;
      for (const btn of endButtons) {
        if (this.isPlayNextButton(btn)) return btn;
      }
      const nonDiscover = endButtons.filter((btn) => !this.isDiscoverMoreButton(btn));
      if (nonDiscover.length === 1) return nonDiscover[0];
      if (nonDiscover.length > 1) return this.pickRightmostButton(nonDiscover);
      if (endButtons.length >= 2) {
        const sorted = [...endButtons].sort(
          (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
        );
        return sorted[sorted.length - 1];
      }
      if (endButtons.length === 1 && this.isDiscoverMoreButton(endButtons[0])) {
        return null;
      }
      return endButtons[0];
    }
    isElementClickable(element) {
      if (!element) return false;
      try {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      } catch {
        return false;
      }
    }
    findContinueButton(buttons) {
      try {
        const direct = document.querySelector(".continue-button, .continue-button-container .continue-button");
        if (direct && this.isElementClickable(direct)) return direct;
      } catch {
      }
      try {
        const imgCandidate = document.querySelector('img[src*="button_continue.png"], img[alt="Continue" i]');
        if (imgCandidate) {
          const clickable = imgCandidate.closest('button, [role="button"], [class*="button"], [class*="btn"]') || imgCandidate.parentElement;
          if (clickable && this.isElementClickable(clickable)) return clickable;
        }
      } catch {
      }
      const fromButtons = buttons.find((b) => {
        if (!this.isElementClickable(b)) return false;
        const text = b.textContent?.trim().toLowerCase() || "";
        const cls = (b.className || "").toString().toLowerCase();
        if (text.includes("play next")) return false;
        if (cls.includes("continue")) return true;
        if (text.includes("continue")) return true;
        if (this.elementContainsImage(b, "button_continue.png", "continue")) return true;
        return false;
      });
      return fromButtons || this.findClickableByText(["continue"]);
    }
    resolveBestClickElement(element) {
      if (!element) return element;
      if (this.isDiscoverMoreButton(element)) {
        const playNext = this.findPlayNextInMissionEndFooter();
        if (playNext && playNext !== element) return playNext;
      }
      try {
        const playImg = element.querySelector?.('img[src*="button_playnext"], img[alt*="Play Next" i]');
        if (playImg && this.isElementClickable(playImg)) {
          return playImg.closest(".end-mission-button, button, [role='button']") || playImg;
        }
        const nestedPlayImg = element.querySelector?.('img[src*="button_playnext"]');
        if (nestedPlayImg) {
          const clickable =
            nestedPlayImg.closest(".end-mission-button, button, [role='button']") || nestedPlayImg;
          if (clickable && this.isElementClickable(clickable)) return clickable;
        }
      } catch {
      }
      return element;
    }
    findPlayNextButton(buttons) {
      try {
        const footerPlayNext = this.findPlayNextInMissionEndFooter();
        if (footerPlayNext) return footerPlayNext;
      } catch {
      }
      try {
        const imgCandidate = document.querySelector('img[src*="button_playnext.png"], img[alt="Play Next" i]');
        if (imgCandidate) {
          const clickable =
            imgCandidate.closest('button, [role="button"], [class*="button"], [class*="btn"], .end-mission-button') ||
            imgCandidate.parentElement;
          if (clickable && this.isElementClickable(clickable) && !this.isDiscoverMoreButton(clickable)) {
            return this.resolveBestClickElement(clickable);
          }
        }
      } catch {
      }
      const fromButtons = buttons.find((b) => {
        if (!this.isElementClickable(b)) return false;
        if (this.isDiscoverMoreButton(b)) return false;
        const text = b.textContent?.trim().toLowerCase() || "";
        if (text.includes("play next")) return true;
        if (this.elementContainsImage(b, "button_playnext.png", "play next")) return true;
        return false;
      });
      const byText = this.findClickableByText(["play next", "play next ➔", "play next →"]);
      const candidate = fromButtons || (byText && !this.isDiscoverMoreButton(byText) ? byText : null);
      return candidate ? this.resolveBestClickElement(candidate) : null;
    }
    /**
     * Returns the visible Play Next element (image or button) when present,
     * regardless of whether it's clickable. This is the game's
     * server-confirmed "mission cleared" signal per
     * docs/# Reverse engineering notes.md.
     */
    findPlayNextIndicator() {
      try {
        const footerPlayNext = this.findPlayNextInMissionEndFooter();
        if (footerPlayNext) return footerPlayNext;
      } catch {
      }
      try {
        const img = document.querySelector('img[src*="button_playnext.png"], img[alt*="Play Next" i]');
        if (img && this.isElementClickable(img)) return img;
      } catch {
      }
      try {
        const byText = this.findClickableByText(["play next", "visit the inn", "visit inn"]);
        if (byText) return byText;
      } catch {
      }
      return null;
    }
    findVisitInnButton(buttons) {
      const fromButtons = buttons.find((b) => {
        if (!this.isElementClickable(b)) return false;
        const text = b.textContent?.trim().toLowerCase() || "";
        return text.includes("visit the inn") || text.includes("visit inn") || text === "inn" || text.includes("return to inn") || text.includes("back to inn");
      });
      return fromButtons || this.findClickableByText([
        "visit the inn",
        "visit inn",
        "return to inn",
        "back to inn"
      ]);
    }
    /**
     * Detect the Daily Treats login-rewards modal and return its Claim
     * button. The modal markup is documented in
     * docs/# Reverse engineering notes.md.
     */
    findDailyTreatsClaim() {
      try {
        const modal = document.querySelector(".modal.shown, .modal[class*='shown']");
        if (!modal || !this.isElementClickable(modal)) return null;
        const heading = modal.querySelector(".login-day-menu-header-styled-text, .login-menu-header");
        const headingText = (heading?.textContent || "").toUpperCase();
        if (!headingText.includes("DAILY TREATS")) return null;
        const claimByImg = modal.querySelector('img[src*="Button_Claim"]');
        if (claimByImg) {
          const clickable = claimByImg.closest('button, [role="button"], [class*="button"], [class*="btn"], .default-image-container') || claimByImg.parentElement;
          if (clickable && this.isElementClickable(clickable)) return clickable;
          if (this.isElementClickable(claimByImg)) return claimByImg;
        }
        const claimByText = this.findClickableByText(["claim"], modal);
        if (claimByText) return claimByText;
      } catch {
      }
      return null;
    }
    /**
     * Detect the end-of-mission overlay. We prefer concrete element/image
     * matches (most reliable) and only fall back to body innerText scanning
     * for cases where the game uses a non-standard layout. Body innerText
     * scanning is risky because it can match strings from hidden/persistent
     * UI, so we require BOTH a victory keyword AND a rewards keyword for
     * the text-only path.
     */
    isVictoryEndOverlay(buttons) {
      try {
        if (document.querySelector(".mission-end-footer")) return true;
        if (document.querySelector(".end-mission-button")) return true;
        if (document.querySelector('img[src*="button_playnext.png"]')) return true;
        if (document.querySelector('img[src*="button_continue.png"]')) {
          if (this.victoryFlow) return true;
          const gs = this.gameState;
          const total = gs?.totalEncounters ?? 0;
          const current = gs?.currentEncounter ?? 0;
          if (total > 0 && current >= total - 1) return true;
          if (document.querySelector('[class*="victory"], [class*="crown"], [class*="reward"]')) return true;
        }
      } catch {
      }
      try {
        const texts = buttons.map((b) => b.textContent?.trim().toLowerCase() || "");
        if (texts.some((t) => t.includes("play next"))) return true;
        if (texts.some((t) => t.includes("visit the inn") || t.includes("visit inn"))) return true;
        for (const b of buttons) {
          if (this.elementContainsImage(b, "button_playnext.png", "play next")) return true;
        }
      } catch {
      }
      try {
        const body = (document.body?.innerText || "").toLowerCase();
        const hasVictory = body.includes("victory") || body.includes("mission complete") || body.includes("you found");
        const hasRewards = body.includes("flavor essences") || body.includes("mission rewards");
        if (hasVictory && hasRewards) return true;
      } catch {
      }
      return false;
    }
    detectMissionEndCue(buttons, screen) {
      if (this.victoryFlow) return true;
      // After abandoning a victory flow without server confirmation, sit
      // out for a while so we don't immediately retry the same broken
      // sequence. User can press Skip Mission to break out manually.
      if (this.victoryFlowGiveUpAt && Date.now() - this.victoryFlowGiveUpAt < 60e3) {
        return false;
      }
      if (screen === "victory_end" || screen === "finish" || screen === "continue") {
        return true;
      }
      if (screen === "inn") {
        const atRealInn = !!document.querySelector(".navbar-tooltip")?.textContent?.includes(
          "Find and play missions"
        );
        if (atRealInn) return true;
        return false;
      }
      if (this.isVictoryEndOverlay(buttons)) return true;
      // Disabled: treating in_progress (volume button only) as victory caused
      // premature MISSION_COMPLETED → dialog close → life loss, especially when
      // the tab is backgrounded and encounter UI fails to render.
      this._inProgressSinceMs = 0;
      // NOTE: We deliberately do NOT trigger MISSION_COMPLETED purely from
      // screen=unknown anymore. Doing so closes the tab before Reddit has
      // server-confirmed the win, which Reddit counts as an abort and
      // deducts a life. Server confirmation now comes from reddit.js
      // (PostRenderContent fetch data + cleared-banner observer).
      this._unknownSinceMs = 0;
      return false;
    }
    rememberClickPoint(flow, element) {
      const rect = element.getBoundingClientRect();
      flow.lastClick = {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      };
    }
    async clickAtPoint(x, y, description, dryRun) {
      if (dryRun) {
        devvitGIAELogger.log(`[DRY-RUN] Would click at point: ${description}`, { x, y });
        return;
      }
      let target = document.elementFromPoint(x, y);
      if (target) {
        const resolved = this.resolveBestClickElement(target);
        if (resolved && resolved !== target) {
          target = resolved;
        }
        devvitGIAELogger.log(`[ACTIVE] Clicking at point: ${description}`, {
          x,
          y,
          tag: target.tagName,
          className: target.className
        });
        this.performTrustedClick(target);
        return;
      }
      devvitGIAELogger.warn(`[ACTIVE] No element at point for ${description}, using coordinate bridge`, {
        x,
        y
      });
      this.performTrustedClickAt(x, y);
    }
    async clickVictoryAdvanceButton(buttons, description, dryRun, flow) {
      const wantsPlayNext = /play next|visit inn/i.test(description);
      const playNextBtn = wantsPlayNext
        ? this.findPlayNextButton(buttons) || this.findVisitInnButton(buttons)
        : null;
      const continueBtn = wantsPlayNext ? null : this.findContinueButton(buttons);
      const target = this.resolveBestClickElement(playNextBtn || continueBtn);
      if (target) {
        try {
          const rect = target.getBoundingClientRect();
          const point = {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2)
          };
          if (description.includes("continue")) {
            flow.continueClickPoint = point;
          } else {
            flow.playNextClickPoint = point;
          }
        } catch {
        }
        this.clickButton(target, description, dryRun);
        return true;
      }
      return false;
    }
    /**
     * Victory-end protocol (human-like full click-through):
     *   1) Click Continue on rewards screen.
     *   2) Wait for Play Next / Visit Inn to become visible.
     *   3) Click Play Next / Visit Inn once.
     *   4) Wait a short settle delay so the game can register the click.
     *   5) Report completion so reddit tab can close/navigate.
     */
    async handleVictoryEndFlow(buttons, screen, dryRun = false) {
      const SETTLE_BEFORE_CONTINUE_MS = 800;
      const WAIT_FOR_PLAY_NEXT_MS = 30e3;
      const WAIT_BEFORE_PLAY_NEXT_CLICK_MS = 600;
      const WAIT_AFTER_PLAY_NEXT_CLICK_MS = 1500;
      const VICTORY_FORCE_ADVANCE_MS = 3e3;
      const CONTINUE_RETRY_INTERVAL_MS = 2500;
      const now = Date.now();
      const continueBtn = this.findContinueButton(buttons);
      const playNextBtn = this.findPlayNextButton(buttons) || this.findVisitInnButton(buttons);
      const playNextIndicator = this.findPlayNextIndicator();
      const dailyTreats = this.findDailyTreatsClaim();
      if (dailyTreats) {
        this.clickButton(dailyTreats, "victory-flow: dismiss daily treats", dryRun);
        return;
      }
      if (!this.victoryFlow) {
        const playNextReady = !!(playNextIndicator || playNextBtn);
        const needsContinueFirst = !!continueBtn && !playNextReady;
        this.victoryFlow = {
          step: playNextReady && !needsContinueFirst ? "wait_before_play_next_click" : "settle",
          detectedAt: now,
          continueClickedAt: 0,
          continueClickAttempts: 0,
          lastContinueAttemptAt: 0,
          playNextVisibleAt: playNextIndicator ? now : 0,
          playNextClickedAt: 0,
          continueClickPoint: null
        };
        this.victoryCompletionReported = false;
        devvitGIAELogger.log("Victory flow started (full click-through)", {
          detectedAt: now,
          screen,
          startStep: this.victoryFlow.step,
          hasContinueNow: !!continueBtn,
          hasPlayNextNow: !!playNextIndicator,
          dryRun
        });
      }
      const flow = this.victoryFlow;
      if ((playNextIndicator || playNextBtn) && !flow.playNextVisibleAt) {
        flow.playNextVisibleAt = now;
      }
      if (flow.playNextClickedAt && now - flow.playNextClickedAt >= VICTORY_FORCE_ADVANCE_MS) {
        if (!this.victoryCompletionReported) {
          const reported = await this.reportMissionCompletion("victory-end-force-advance", dryRun);
          this.victoryCompletionReported = true;
          devvitGIAELogger.log("Victory flow: force-advanced after play-next settle timeout", {
            waitedMs: now - flow.playNextClickedAt,
            dryRun,
            reported
          });
        }
        this.victoryFlow = null;
        return;
      }
      switch (flow.step) {
        case "settle": {
          if (now - flow.detectedAt < SETTLE_BEFORE_CONTINUE_MS) {
            return;
          }
          flow.step = "click_continue";
          break;
        }
        case "click_continue": {
          if (playNextIndicator || playNextBtn) {
            flow.step = "wait_before_play_next_click";
            break;
          }
          const target = continueBtn;
          if (target) {
            try {
              const rect = target.getBoundingClientRect();
              flow.continueClickPoint = {
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2)
              };
            } catch {
            }
            this.clickButton(target, "victory-flow: continue (rewards screen)", dryRun);
            flow.continueClickedAt = now;
            flow.continueClickAttempts = (flow.continueClickAttempts || 0) + 1;
            flow.lastContinueAttemptAt = now;
            devvitGIAELogger.log("Victory flow: clicked Continue button", {
              attempt: flow.continueClickAttempts,
              dryRun
            });
            flow.step = "await_play_next";
          } else if (this.lastAdvanceClickPoint) {
            flow.continueClickPoint = {
              x: this.lastAdvanceClickPoint.x,
              y: this.lastAdvanceClickPoint.y
            };
            await this.clickAtPoint(
              this.lastAdvanceClickPoint.x,
              this.lastAdvanceClickPoint.y,
              "victory-flow: continue (last-advance position fallback)",
              dryRun
            );
            flow.continueClickedAt = now;
            flow.continueClickAttempts = (flow.continueClickAttempts || 0) + 1;
            flow.lastContinueAttemptAt = now;
            devvitGIAELogger.log("Victory flow: no Continue element found, clicked last-advance position as fallback", {
              attempt: flow.continueClickAttempts,
              point: this.lastAdvanceClickPoint,
              dryRun
            });
            flow.step = "await_play_next";
          } else {
            devvitGIAELogger.warn("Victory flow: no Continue button & no fallback position available", { dryRun });
            flow.step = "await_play_next";
          }
          break;
        }
        case "await_play_next": {
          if (playNextIndicator || playNextBtn) {
            flow.playNextVisibleAt = flow.playNextVisibleAt || now;
            flow.step = "wait_before_play_next_click";
            break;
          }
          const elapsedSinceClick = flow.continueClickedAt ? now - flow.continueClickedAt : 0;
          if (continueBtn && flow.continueClickedAt && now - (flow.lastContinueAttemptAt || 0) >= CONTINUE_RETRY_INTERVAL_MS && flow.continueClickAttempts < 4) {
            this.clickButton(continueBtn, "victory-flow: continue (retry — Play Next not visible yet)", dryRun);
            flow.continueClickAttempts += 1;
            flow.lastContinueAttemptAt = now;
            devvitGIAELogger.log("Victory flow: retrying Continue click (Play Next still not visible)", {
              attempt: flow.continueClickAttempts,
              elapsedSinceFirstClick: elapsedSinceClick,
              dryRun
            });
            return;
          }
          if (flow.continueClickedAt && elapsedSinceClick >= WAIT_FOR_PLAY_NEXT_MS) {
            devvitGIAELogger.warn(
              "Victory flow: Play Next never appeared within timeout — abandoning flow without reporting completion to avoid life loss. Use Skip Mission if stuck.",
              {
                attempts: flow.continueClickAttempts,
                waitedMs: elapsedSinceClick,
                dryRun
              }
            );
            this.victoryFlow = null;
            this.victoryFlowGiveUpAt = Date.now();
          }
          return;
        }
        case "wait_before_play_next_click": {
          const visibleAt = flow.playNextVisibleAt || now;
          if (now - visibleAt < WAIT_BEFORE_PLAY_NEXT_CLICK_MS) {
            return;
          }
          flow.step = "click_play_next";
          break;
        }
        case "click_play_next": {
          if (flow.playNextClickedAt) {
            flow.step = "wait_after_play_next_click";
            return;
          }
          flow.playNextClickAttempts = (flow.playNextClickAttempts || 0) + 1;
          let clicked = await this.clickVictoryAdvanceButton(
            buttons,
            "victory-flow: play next / visit inn (DOM)",
            dryRun,
            flow
          );
          if (!clicked) {
            const footerPlayNext = this.findPlayNextInMissionEndFooter();
            if (footerPlayNext) {
              this.clickButton(footerPlayNext, "victory-flow: play next (footer sibling)", dryRun);
              clicked = true;
            }
          }
          if (!clicked && flow.continueClickPoint?.x) {
            await this.clickAtPoint(
              flow.continueClickPoint.x + 140,
              flow.continueClickPoint.y,
              "victory-flow: play next (right-offset fallback)",
              dryRun
            );
            clicked = true;
          }
          if (!clicked && flow.playNextClickPoint?.x && flow.playNextClickPoint?.y) {
            await this.clickAtPoint(
              flow.playNextClickPoint.x,
              flow.playNextClickPoint.y,
              "victory-flow: play next (saved DOM point)",
              dryRun
            );
            clicked = true;
          }
          if (!clicked) {
            devvitGIAELogger.warn("Victory flow: could not find Play Next target", {
              attempt: flow.playNextClickAttempts,
              dryRun
            });
            flow.step = "await_play_next";
            return;
          }
          flow.playNextClickedAt = now;
          flow.step = "wait_after_play_next_click";
          devvitGIAELogger.log("Victory flow: clicked Play Next / Visit Inn", {
            attempt: flow.playNextClickAttempts,
            dryRun
          });
          break;
        }
        case "wait_after_play_next_click": {
          if (now - flow.playNextClickedAt < WAIT_AFTER_PLAY_NEXT_CLICK_MS) {
            return;
          }
          flow.step = "complete";
          break;
        }
        case "complete": {
          const waitedAfterClick = flow.playNextClickedAt ? now - flow.playNextClickedAt : 0;
          if (
            this.isVictoryEndOverlay(buttons) &&
            !flow.playNextClickedAt &&
            waitedAfterClick < VICTORY_FORCE_ADVANCE_MS
          ) {
            flow.step = "click_play_next";
            return;
          }
          if (!this.victoryCompletionReported) {
            const reported = await this.reportMissionCompletion("play-next-clicked", dryRun);
            this.victoryCompletionReported = true;
            this.enterMissionDoneNoClick("victory-flow-complete");
            devvitGIAELogger.log("Victory flow complete (clicked through Continue + Play Next)", {
              continueAttempts: flow.continueClickAttempts,
              playNextAttempts: flow.playNextClickAttempts,
              dryRun,
              reported
            });
          }
          this.victoryFlow = null;
          break;
        }
        default: {
          devvitGIAELogger.warn("Victory flow: unknown step, resetting", { step: flow.step });
          this.victoryFlow = null;
        }
      }
    }
    findStartButton(buttons) {
      const hasInn = buttons.some((b) => (b.className || "").includes("mc__btn-inn"));
      if (hasInn) return void 0;
      return buttons.find((b) => {
        const cls = b.className || "";
        if (cls.includes("mc__btn-start") || cls.includes("btn-start")) return true;
        const text = b.textContent?.trim().toLowerCase() || "";
        return text === "start" || text === "play" || text.includes("start mission") || text.includes("start run");
      });
    }
    /**
     * Helper to click a button or log dry-run action
     */
    clickButton(button, description, dryRun) {
      if (!button) return;
      const target = this.resolveBestClickElement(button);
      if (this.config.debugVisuals) {
        target.style.outline = "3px solid #ff000052";
      }
      if (dryRun) {
        devvitGIAELogger.log(`[DRY-RUN] Would click: ${description}`, {
          buttonText: target.textContent?.trim()?.substring(0, 40),
          buttonClass: target.className
        });
        return;
      }
      devvitGIAELogger.log(`[ACTIVE] Clicking: ${description}`, {
        buttonClass: target.className,
        buttonText: target.textContent?.trim()?.substring(0, 40)
      });
      this.performTrustedClick(target);
      try {
        target.click();
      } catch {
      }
    }
    performTrustedClickAt(x, y) {
      if (!isExtensionAlive()) return;
      safeSendMessage({ type: "PAGE_WORLD_CLICK", x, y }, (response) => {
        if (response?.success) {
          devvitGIAELogger.log("[click] Page-world click OK", { x, y });
        } else {
          devvitGIAELogger.warn("[click] Page-world click failed", {
            x,
            y,
            error: response?.error
          });
        }
      });
    }
    performTrustedClick(element) {
      try {
        document.querySelectorAll("[data-lf-target]").forEach((el) => {
          el.removeAttribute("data-lf-target");
        });
        element.setAttribute("data-lf-target", "1");
      } catch {
      }
      const rect = element.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      this.performTrustedClickAt(x, y);
    }
    async handleScreen(screen, buttons, dryRun = false) {
      let actionTaken = false;
      switch (screen) {
        case "daily_treats": {
          const claim = this.findDailyTreatsClaim();
          if (claim) {
            this.clickButton(claim, "daily treats claim", dryRun);
            actionTaken = true;
          }
          break;
        }
        case "skip": {
          const skipBtn = buttons.find((b) => b.classList.contains("skip-button"));
          if (skipBtn) {
            this.clickButton(skipBtn, "skip button", dryRun);
            actionTaken = true;
          }
          break;
        }
        case "battle": {
          const advanceBtn = buttons.find((b) => b.classList.contains("advance-button"));
          if (advanceBtn) {
            const rect = advanceBtn.getBoundingClientRect();
            this.lastAdvanceClickPoint = {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2)
            };
            this.clickButton(advanceBtn, "advance button", dryRun);
            actionTaken = true;
          }
          break;
        }
        case "start": {
          const startBtn = this.findStartButton(buttons);
          if (startBtn) {
            this.clickButton(startBtn, "start button (.mc__btn-start)", dryRun);
            actionTaken = true;
          }
          break;
        }
        case "crossroads": {
          const choice = this.decisionMaker.decideCrossroads();
          devvitGIAELogger.log("Crossroads decision", { choice, dryRun });
          if (choice === "fight") {
            const fightBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("fight"));
            if (fightBtn) {
              this.clickButton(fightBtn, "fight button (crossroads)", dryRun);
              actionTaken = true;
            }
          } else {
            const skipBtn = buttons.find((b) => b.textContent?.toLowerCase().includes("nope"));
            if (skipBtn) {
              this.clickButton(skipBtn, "nope button (crossroads)", dryRun);
              actionTaken = true;
            }
          }
          break;
        }
        case "bargain": {
          const bargainText = document.body.textContent || "";
          const choice = this.decisionMaker.decideSkillBargain(bargainText);
          devvitGIAELogger.log("Bargain decision", {
            choice,
            bargainText: bargainText.substring(0, 200),
            dryRun
          });
          const skillButtons = buttons.filter((b) => b.classList.contains("skill-button"));
          devvitGIAELogger.log("Bargain buttons found", {
            count: skillButtons.length,
            buttons: skillButtons.map((b) => b.textContent?.trim())
          });
          if (choice === "accept") {
            const acceptBtn = skillButtons.find((b) => {
              const text = b.textContent?.trim().toLowerCase() || "";
              return text !== "refuse" && text !== "decline";
            });
            if (acceptBtn) {
              if (!dryRun) {
                devvitGIAELogger.log("Clicking accept button", { text: acceptBtn.textContent?.trim() });
              }
              this.clickButton(acceptBtn, "accept button (bargain)", dryRun);
              actionTaken = true;
            }
          } else {
            const declineBtn = skillButtons.find((b) => {
              const text = b.textContent?.trim().toLowerCase() || "";
              return text === "refuse" || text === "decline";
            });
            if (declineBtn) {
              if (!dryRun)
                devvitGIAELogger.log("Clicking decline button", { text: declineBtn.textContent?.trim() });
              this.clickButton(declineBtn, "decline button (bargain)", dryRun);
              actionTaken = true;
            } else if (skillButtons.length > 0) {
              const fallbackBtn = skillButtons[skillButtons.length - 1];
              if (!dryRun) {
                devvitGIAELogger.log("No decline button, clicking last skill button as fallback", {
                  text: fallbackBtn.textContent?.trim()
                });
              }
              this.clickButton(fallbackBtn, "last skill button (bargain fallback)", dryRun);
              actionTaken = true;
            }
          }
          break;
        }
        case "choice": {
          const skillButtons = buttons.filter((b) => b.classList.contains("skill-button"));
          const panelHeader = document.querySelector(".ui-panel-header");
          const headerText = panelHeader?.textContent?.toLowerCase() || "";
          const blessingStats = skillButtons.map((b) => {
            const text = b.textContent?.trim() || "";
            const match = text.match(/Increase (\w+) by \d+%/);
            return match ? match[1] : null;
          }).filter((stat) => !!stat);
          let buttonClicked = false;
          if (blessingStats.length > 0 || headerText.includes("blessing") || headerText.includes("boon")) {
            devvitGIAELogger.log("Blessing detected (DOM)", { headerText, blessingStats, dryRun });
            if (blessingStats.length > 0) {
              this.recordDiscoveredBlessingStats(blessingStats);
              const chosen = this.decisionMaker.pickBlessing(blessingStats);
              devvitGIAELogger.log("Blessing choice", { chosen, available: blessingStats, dryRun });
              const btn = skillButtons.find(
                (b) => b.textContent?.toLowerCase().includes(chosen.toLowerCase())
              );
              if (btn) {
                this.clickButton(btn, `blessing: ${chosen}`, dryRun);
                buttonClicked = true;
              }
            }
          } else {
            devvitGIAELogger.log("Ability choice detected (DOM)", { headerText, dryRun });
            const abilities = skillButtons.map((b) => b.textContent?.trim() || "");
            if (abilities.length > 0) {
              this.recordDiscoveredAbilities(abilities);
              const chosen = this.decisionMaker.pickAbility(abilities);
              devvitGIAELogger.log("Ability choice", { chosen, available: abilities, dryRun });
              const btn = buttons.find((b) => b.textContent?.includes(chosen));
              if (btn) {
                this.clickButton(btn, `ability: ${chosen}`, dryRun);
                buttonClicked = true;
              }
            }
          }
          if (!buttonClicked && skillButtons.length > 0) {
            if (!dryRun) {
              devvitGIAELogger.log("No specific choice made, picking first button as fallback", {
                firstButtonText: skillButtons[0].textContent?.trim()
              });
            }
            this.clickButton(skillButtons[0], "first skill button (choice fallback)", dryRun);
            buttonClicked = true;
          }
          actionTaken = buttonClicked;
          break;
        }
        case "creatorBonus": {
          const skillButtons = buttons.filter((b) => b.classList.contains("skill-button"));
          const bonusOptions = skillButtons.map((b) => b.textContent?.trim() || "");
          const chosen = this.decisionMaker.decideCreatorBonus(bonusOptions);
          devvitGIAELogger.log("Creator bonus decision", {
            chosen,
            available: bonusOptions,
            preference: this.config.creatorBonusPreference,
            dryRun
          });
          const btn = skillButtons.find((b) => b.textContent?.includes(chosen));
          if (btn) {
            this.clickButton(btn, `creator bonus: ${chosen}`, dryRun);
            actionTaken = true;
          }
          break;
        }
        case "continue":
        case "finish": {
          const playNext = this.findPlayNextButton(buttons);
          const btn = playNext || this.findContinueButton(buttons);
          if (btn) {
            this.clickButton(btn, playNext ? "play next button" : "continue/finish button", dryRun);
            actionTaken = true;
          }
          break;
        }
        case "inn": {
          this.enterMissionDoneNoClick("handleScreen-inn");
          const atRealInn = !!document.querySelector(".navbar-tooltip")?.textContent?.includes(
            "Find and play missions"
          );
          if (atRealInn && !this.innCompletionHandled) {
            await this.reportMissionCompletion("inn-screen", dryRun);
          }
          actionTaken = true;
          break;
        }
      }
      if (!actionTaken && buttons.length > 0) {
        if (this.shouldPauseGameClicking(screen)) {
          return;
        }
        if (!dryRun) {
          devvitGIAELogger.warn("No action taken for screen, clicking first available button as fallback", {
            screen,
            buttonCount: buttons.length,
            firstButton: {
              text: buttons[0].textContent?.trim(),
              classes: buttons[0].className
            }
          });
        }
        this.clickButton(buttons[0], "first available button (global fallback)", dryRun);
      }
    }
    findAllButtons() {
      const selectors = [
        ".advance-button",
        ".skill-button",
        ".skip-button",
        ".mc__btn-inn",
        ".mc__btn-start",
        '[class*="btn-start"]',
        ".end-mission-button",
        '[class*="btn-continue"]',
        '[class*="continue"]',
        '[class*="play-next"]',
        '[class*="mc__btn"]',
        "button",
        '[role="button"]'
      ];
      const buttons = [];
      const seen = /* @__PURE__ */ new Set();
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            buttons.push(el);
          }
        });
      }
      const footer = document.querySelector(".mission-end-footer, .ui-panel, .ui-modal");
      if (footer) {
        footer.querySelectorAll('button, [role="button"], [class*="btn"]').forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            buttons.push(el);
          }
        });
      }
      return buttons;
    }
    isOnVictoryAdvanceUi(screen = this.gameState.currentScreen) {
      if (this.victoryFlow) return true;
      if (screen === "victory_end" || screen === "finish" || screen === "continue") {
        return true;
      }
      try {
        return !!document.querySelector(".mission-end-footer, .end-mission-button");
      } catch {
        return false;
      }
    }
    /**
     * Screens that can only exist part-way through a mission that is still being
     * played. None of them can be reached once the mission is over, so any
     * "stop clicking" state that survives into one of them is provably stale.
     */
    isMidMissionActionableUi(screen) {
      return screen === "battle" || screen === "choice" || screen === "crossroads" || screen === "bargain";
    }
    /**
     * The clicker is deliberately independent of the mission queue: its whole job
     * is to press whatever the game is showing this frame. The queue's job is to
     * navigate between missions, and it owns exactly one lever over the clicker --
     * missionDoneNoClick, which is per-mission and cleared by the next mission's
     * initialData.
     *
     * The bot's presentation state (navigating/completing/waitingForDialogClose)
     * is deliberately NOT consulted. It is a mirror of background state delivered
     * over storage events, so it lags -- and it lagged in the one direction that
     * matters: a frame that renders its Start button before the mirror leaves
     * "navigating" would never get clicked, and the queue would then time the
     * mission out and skip it. Gating clicks on it bought nothing either, because
     * a frame that genuinely has nothing to click reports screen "unknown" and
     * takes no action regardless.
     */
    shouldPauseGameClicking(screen = this.gameState.currentScreen) {
      if (this.isOnVictoryAdvanceUi(screen)) {
        return false;
      }
      if (this.missionDoneNoClick) {
        // A mid-mission screen cannot follow mission completion, so the latch is
        // measuring a mission that has already been replaced -- most likely the
        // next mission loaded into this frame without an initialData message to
        // reset us. Self-heal rather than sit out the whole mission.
        if (this.isMidMissionActionableUi(screen)) {
          this.missionDoneNoClick = false;
          devvitGIAELogger.warn("Clearing stale mission-done latch — mid-mission UI is live", {
            presentationState: lazyfrogBotPresentationState,
            screen
          });
          return false;
        }
        return true;
      }
      return false;
    }
    syncRunModeFromSession() {
      if (this.shouldPauseGameClicking()) {
        return;
      }
      if (botSessionActive && autoPlayEnabled && !this.config.enabled) {
        devvitGIAELogger.log("Auto-enabling ACTIVE mode (bot session is running)");
        this.start();
      }
    }
    enterMissionDoneNoClick(reason) {
      if (this.missionDoneNoClick) return;
      this.missionDoneNoClick = true;
      this.victoryFlow = null;
      devvitGIAELogger.log("Mission done — all game clicking stopped", { reason });
      if (this.config.enabled) {
        this.stop();
      }
    }
    async resolvePostId() {
      let id = normalizePostId(this.currentPostId || this.gameState.postId);
      if (id) return id;
      if (window.__capturedInitialData?.postId) {
        id = normalizePostId(window.__capturedInitialData.postId);
        if (id) return id;
      }
      id = normalizePostId(extractPostIdFromUrl(window.location.href));
      if (id) return id;
      const fromStorage = await new Promise((resolve) => {
        chrome.storage.local.get(["lazyfrogCurrentMissionId"], (result2) => {
          resolve(normalizePostId(result2.lazyfrogCurrentMissionId));
        });
      });
      if (fromStorage) return fromStorage;
      const fromBackground = await new Promise((resolve) => {
        safeSendMessage({ type: "GET_CURRENT_MISSION_ID" }, (response) => {
          resolve(normalizePostId(response?.postId));
        });
      });
      if (fromBackground) return fromBackground;
      // Retry once after a short settle: Reddit/background may lag while the
      // iframe is transitioning between end screens.
      await this.delay(150);
      const retryStorage = await new Promise((resolve) => {
        chrome.storage.local.get(["lazyfrogCurrentMissionId"], (result2) => {
          resolve(normalizePostId(result2.lazyfrogCurrentMissionId));
        });
      });
      if (retryStorage) return retryStorage;
      return new Promise((resolve) => {
        safeSendMessage({ type: "GET_CURRENT_MISSION_ID" }, (response) => {
          resolve(normalizePostId(response?.postId));
        });
      });
    }
    /**
     * Record the encounter mix and the moment play began, for the telemetry row
     * assembled in the background on completion. Only the live initialData
     * payload carries `encounters` -- the stored mission record never does -- so
     * this is the one opportunity to measure the mission's combat load.
     */
    captureTelemetrySnapshot(postId, missionMetadata) {
      const telemetry = globalThis.LazyFrogMissionTelemetry;
      if (!telemetry) {
        this.telemetrySnapshot = null;
        return;
      }
      try {
        this.telemetrySnapshot = telemetry.buildMissionSnapshot({
          postId,
          missionMetadata,
          playStartedMs: Date.now()
        });
      } catch (err) {
        this.telemetrySnapshot = null;
        devvitGIAELogger.warn("[Telemetry] Could not snapshot mission", { error: String(err) });
      }
    }
    async reportMissionCompletion(source, dryRun = false) {
      if (this.innCompletionHandled && source === "inn-screen") {
        return false;
      }
      const postId = await this.resolvePostId();
      if (postId) {
        this.currentPostId = postId;
        this.gameState.postId = postId;
      }
      if (dryRun) {
        devvitGIAELogger.log("[DRY-RUN] Would report MISSION_COMPLETED", { postId, source });
        return true;
      }
      if (source === "inn-screen") {
        this.innCompletionHandled = true;
      }
      if (!postId) {
        devvitGIAELogger.warn("Reporting MISSION_COMPLETED without postId fallback", {
          source,
          url: window.location.href
        });
      } else {
        devvitGIAELogger.log("Reporting MISSION_COMPLETED", { postId, source });
      }
      safeSendMessage({
        type: "MISSION_COMPLETED",
        postId,
        source: postId ? source : `${source}:no-postid-fallback`,
        telemetrySnapshot: this.telemetrySnapshot || null
      });
      return true;
    }
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // Public API
    updateConfig(config) {
      this.config = { ...this.config, ...config };
    }
    getState() {
      return this.config.enabled ? "running" : "stopped";
    }
    getGameState() {
      return {
        enabled: this.config.enabled,
        screen: this.gameState.currentScreen,
        lives: this.gameState.livesRemaining,
        progress: this.gameState.getProgress(),
        postId: this.gameState.postId,
        encounterCurrent: this.gameState.currentEncounter,
        encounterTotal: this.gameState.totalEncounters,
        playSafe: this.gameState.shouldPlaySafe(),
        difficulty: this.gameState.difficulty
      };
    }
    // Report game state to background service worker
    reportGameState() {
      try {
        safeSendMessage({
          type: "GAME_STATE_UPDATE",
          gameState: this.getGameState()
        });
      } catch (error) {
        devvitGIAELogger.error("Failed to report game state", { error: String(error) });
      }
    }
    // Save mission to database
    async saveMissionToDatabase(postId, username, metadata) {
      try {
        const mission = metadata.mission;
        if (!mission) return;
        const existingMission = await getMission(postId);
        const permalink = postId.startsWith("t3_") ? `https://www.reddit.com/r/SwordAndSupperGame/comments/${postId.slice(3)}/` : "";
        const record = {
          // saveMission overwrites the stored record wholesale, so fields this
          // path knows nothing about have to be carried forward explicitly.
          // Losing postedAt/createdUtc here previously made the mission look
          // undated, which the archive and queue-age rules both depend on.
          ...(existingMission?.postedAt !== void 0 ? { postedAt: existingMission.postedAt } : {}),
          ...(existingMission?.createdUtc !== void 0 ? { createdUtc: existingMission.createdUtc } : {}),
          ...(existingMission?.flairText !== void 0 ? { flairText: existingMission.flairText } : {}),
          ...(existingMission?.missionKind !== void 0 ? { missionKind: existingMission.missionKind } : {}),
          postId,
          timestamp: existingMission?.timestamp || Date.now(),
          permalink,
          missionTitle: metadata.missionTitle || mission.foodName || "Unknown",
          missionAuthorName: metadata.missionAuthorName || "Unknown",
          environment: mission.environment,
          encounters: mission.encounters || [],
          minLevel: mission.minLevel,
          maxLevel: mission.maxLevel,
          difficulty: mission.difficulty,
          foodImage: mission.foodImage,
          foodName: mission.foodName,
          authorWeaponId: mission.authorWeaponId,
          chef: mission.chef,
          cart: mission.cart,
          rarity: mission.rarity,
          type: mission.type
        };
        await saveMission(record);
        if (existingMission) {
          devvitGIAELogger.log("Mission data enriched", {
            postId,
            difficulty: record.difficulty,
            environment: record.environment
          });
        } else {
          devvitGIAELogger.log("🆕 NEW MISSION discovered", {
            postId,
            difficulty: record.difficulty,
            foodName: mission.foodName
          });
        }
      } catch (error) {
        devvitGIAELogger.error("Failed to save mission", { error: String(error) });
      }
    }
    /**
     * Record discovered abilities to storage for user reference
     */
    recordDiscoveredAbilities(abilityNames) {
      try {
        chrome.storage.local.get(["discoveredAbilities"], (result2) => {
          const existing = new Set(result2.discoveredAbilities || []);
          let added = false;
          for (const name of abilityNames) {
            if (!existing.has(name)) {
              existing.add(name);
              added = true;
            }
          }
          if (added) {
            chrome.storage.local.set({ discoveredAbilities: Array.from(existing) });
            devvitGIAELogger.log("Discovered new abilities", {
              newAbilities: abilityNames.filter((n) => !result2.discoveredAbilities?.includes(n)),
              total: existing.size
            });
          }
        });
      } catch (error) {
        devvitGIAELogger.error("Failed to record discovered abilities", { error: String(error) });
      }
    }
    /**
     * Record discovered blessing stats to storage for user reference
     */
    recordDiscoveredBlessingStats(statNames) {
      try {
        chrome.storage.local.get(["discoveredBlessingStats"], (result2) => {
          const existing = new Set(result2.discoveredBlessingStats || []);
          let added = false;
          for (const name of statNames) {
            if (!existing.has(name)) {
              existing.add(name);
              added = true;
            }
          }
          if (added) {
            chrome.storage.local.set({ discoveredBlessingStats: Array.from(existing) });
            devvitGIAELogger.log("Discovered new blessing stats", {
              newStats: statNames.filter((n) => !result2.discoveredBlessingStats?.includes(n)),
              total: existing.size
            });
          }
        });
      } catch (error) {
        devvitGIAELogger.error("Failed to record discovered blessing stats", { error: String(error) });
      }
    }
  }
  devvitLogger.log("Devvit content script loaded", {
    version: "0.16.1",
    buildTime: "2025-11-06T08:16:56.850Z",
    url: window.location.href,
    loadTime: (/* @__PURE__ */ new Date()).toISOString()
  });
  let gameAutomation = null;
  let botSessionActive = false;
  let autoPlayEnabled = true;
  let lazyfrogBotPresentationState = "idle";
  function refreshLazyfrogBotPresentationState(stored) {
    lazyfrogBotPresentationState = stored?.lazyfrogBotPresentationState || "idle";
  }
  function isDevvitBotSessionActive(stored) {
    return !!stored?.activeBotSession;
  }
  function refreshBotSessionFlags(callback) {
    chrome.storage.local.get(
      ["activeBotSession", "automationConfig", "lazyfrogBotPresentationState"],
      (result2) => {
        botSessionActive = isDevvitBotSessionActive(result2);
        autoPlayEnabled = result2.automationConfig?.autoPlay !== false;
        refreshLazyfrogBotPresentationState(result2);
        if (typeof callback === "function") callback();
      }
    );
  }
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.activeBotSession || changes.lazyfrogBotPresentationState) {
      const sessionWas = changes.activeBotSession?.oldValue;
      const sessionNow = changes.activeBotSession?.newValue;
      const presWas = changes.lazyfrogBotPresentationState?.oldValue;
      const presNow = changes.lazyfrogBotPresentationState?.newValue;
      refreshBotSessionFlags(() => {
        lfDevvitTrace("DEVVIT_STORAGE_SYNC", {
          reason: "storage-onChanged",
          sessionWas,
          sessionNow,
          presWas,
          presNow,
          botSessionActive,
          autoPlayEnabled,
          enabled: gameAutomation?.config?.enabled ?? null
        });
        if (botSessionActive && autoPlayEnabled) {
          ensureAutomationEnabled("activeBotSession-true");
        } else if (changes.activeBotSession?.newValue === false) {
          toggleAutomation(false, "activeBotSession-removed");
          stopTabKeepAliveIfIdle();
        } else if (!botSessionActive && !autoPlayEnabled) {
          toggleAutomation(false, "session-inactive-and-autoplay-off");
          stopTabKeepAliveIfIdle();
        }
      });
    }
    if (changes.automationConfig?.newValue) {
      autoPlayEnabled = changes.automationConfig.newValue.autoPlay !== false;
      lfDevvitTrace("DEVVIT_CONFIG_SYNC", { autoPlayEnabled });
      if (botSessionActive && autoPlayEnabled) {
        ensureAutomationEnabled("autoPlay enabled in settings");
      } else if (!autoPlayEnabled && gameAutomation) {
        toggleAutomation(false, "autoplay-disabled-in-settings");
      }
    }
  });
  refreshBotSessionFlags(() => {
    if (botSessionActive && autoPlayEnabled) {
      startTabKeepAlive();
    }
  });
  function notifyMissionMetadataCaptured(postId, initPayload, source) {
    const normalized = normalizePostId(postId);
    const mission = initPayload?.missionMetadata?.mission;
    if (!normalized || !mission) return;
    const data = {
      title: initPayload.missionMetadata?.missionTitle,
      authorName: initPayload.missionMetadata?.missionAuthorName || initPayload.username,
      environment: mission.environment,
      encounters: mission.encounters,
      minLevel: mission.minLevel,
      maxLevel: mission.maxLevel,
      difficulty: mission.difficulty,
      foodName: mission.foodName,
      foodImage: mission.foodImage,
      authorWeaponId: mission.authorWeaponId,
      chef: mission.chef,
      cart: mission.cart,
      rarity: mission.rarity
    };
    if (!data.difficulty || !data.environment || !data.encounters?.length) return;
    safeSendMessage({
      type: "MISSION_METADATA_CAPTURED",
      postId: normalized,
      source,
      data,
      init: initPayload
    });
  }
  window.addEventListener("message", (event) => {
    try {
      if (event.data?.type === "devvit-message") {
        const messageType = event.data?.data?.message?.type;
        devvitLogger.log("📨 devvit-message received", {
          messageType,
          origin: event.origin,
          data: event.data?.data?.message?.data || null,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (messageType === "initialData") {
          const initPayload = event.data.data.message.data;
          const postId = initPayload?.postId;
          devvitLogger.log(`✅ initialData for ${postId} captured!`, event.data?.data);
          window.__capturedInitialData = initPayload;
          notifyMissionMetadataCaptured(postId, initPayload, "initialData-message");
        }
      }
    } catch (error) {
      devvitLogger.error("Error in early message listener", { error: String(error) });
    }
  });
  devvitLogger.log("Early message listener installed");
  function safeSendMessage(message, callback) {
    if (!isExtensionAlive()) {
      markExtensionContextDead("sendMessage");
      return;
    }
    try {
      const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
      if (!runtime?.sendMessage) {
        const errorMsg2 = "Browser runtime messaging API unavailable";
        devvitLogger.error("[ExtensionContext] Runtime error", { error: errorMsg2 });
        return;
      }
      runtime.sendMessage(message, (response) => {
        if (runtime.lastError) {
          const errorMsg = String(runtime.lastError.message || runtime.lastError);
          if (errorMsg.includes("Extension context invalidated")) {
            markExtensionContextDead(errorMsg);
          } else {
            devvitLogger.error("[ExtensionContext] Runtime error", { error: errorMsg });
          }
          return;
        }
        if (typeof callback === "function") {
          callback(response);
        }
      });
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("Extension context invalidated")) {
        markExtensionContextDead(errorMsg);
      } else {
        devvitLogger.error("[ExtensionContext] Runtime error", { error: errorMsg });
      }
    }
  }
  function initializeAutomation() {
    if (gameAutomation) {
      devvitLogger.warn("Automation already initialized");
      return;
    }
    devvitLogger.log("Initializing game instance automation engine");
    chrome.storage.local.get(["automationConfig"], async (result2) => {
      const config = result2.automationConfig || {};
      const giaeConfig = {
        enabled: false,
        // Will be enabled when user clicks button
        abilityTierList: config.abilityTierList || DEFAULT_GIAE_CONFIG.abilityTierList,
        blessingStatPriority: config.blessingStatPriority || DEFAULT_GIAE_CONFIG.blessingStatPriority,
        autoAcceptSkillBargains: config.autoAcceptSkillBargains !== void 0 ? config.autoAcceptSkillBargains : DEFAULT_GIAE_CONFIG.autoAcceptSkillBargains,
        skillBargainStrategy: config.skillBargainStrategy || DEFAULT_GIAE_CONFIG.skillBargainStrategy,
        crossroadsStrategy: config.crossroadsStrategy || DEFAULT_GIAE_CONFIG.crossroadsStrategy,
        autoPlay: config.autoPlay !== false,
        clickDelay: 300,
        debugVisuals: config.debugVisuals !== void 0 ? config.debugVisuals : DEFAULT_GIAE_CONFIG.debugVisuals
      };
      gameAutomation = new GameInstanceAutomationEngine(giaeConfig);
      devvitLogger.log("Game instance automation engine initialized", { config: giaeConfig });
      const capturedData = window.__capturedInitialData;
      if (capturedData) {
        devvitLogger.log("Processing previously captured initialData", {
          postId: capturedData.postId,
          username: capturedData.username
        });
        const missionMetadata = capturedData.missionMetadata;
        const postId = capturedData.postId;
        const username = capturedData.username;
        if (missionMetadata && postId && gameAutomation) {
          await gameAutomation.saveMissionToDatabase(postId, username, missionMetadata);
          gameAutomation.currentPostId = postId;
          gameAutomation.missionMetadata = missionMetadata;
          gameAutomation.gameState.setMissionData(missionMetadata, postId);
          gameAutomation.gameState.loadMissionDataFromStorage(postId).catch((err) => {
            devvitLogger.error("Failed to load mission data from storage", err);
          });
          devvitLogger.debug("Set mission data from captured initialData", {
            postId,
            encounters: gameAutomation.gameState.totalEncounters
          });
        }
        delete window.__capturedInitialData;
      }
      safeSendMessage({
        type: "AUTOMATION_READY",
        config: giaeConfig
      });
      chrome.storage.local.get(
        ["activeBotSession", "automationConfig", "lazyfrogBotPresentationState"],
        (session) => {
          botSessionActive = isDevvitBotSessionActive(session);
          autoPlayEnabled = session.automationConfig?.autoPlay !== false;
          refreshLazyfrogBotPresentationState(session);
          if (botSessionActive && autoPlayEnabled) {
            ensureAutomationEnabled("bot session on init");
          } else if (gameAutomation) {
            toggleAutomation(false, "init-no-active-session");
          }
        }
      );
      if (pendingStartMessage) {
        devvitLogger.log("Processing queued START_MISSION_AUTOMATION message");
        chrome.storage.local.get(["automationConfig"], (result22) => {
          if (result22.automationConfig) {
            updateAutomationConfig(result22.automationConfig);
          }
          ensureAutomationEnabled("queued START_MISSION_AUTOMATION");
        });
        pendingStartMessage = null;
      }
    });
  }
  let lfDevvitConsoleLoggingEnabled = false;
  function syncLfDevvitConsoleLogging(enabled) {
    lfDevvitConsoleLoggingEnabled = enabled === true;
  }
  function lfDevvitTrace(tag, detail = {}) {
    if (!lfDevvitConsoleLoggingEnabled) return;
    console.log(`[LazyFrog:RunGate] ${tag}`, {
      ts: Date.now(),
      enabled: gameAutomation?.config?.enabled ?? null,
      botSessionActive,
      autoPlayEnabled,
      screen: gameAutomation?.gameState?.currentScreen ?? null,
      ...detail
    });
  }
  function ensureAutomationEnabled(reason) {
    if (!botSessionActive) {
      lfDevvitTrace("DEVVIT_ENABLE_SKIP", { reason, block: "no-active-session" });
      return;
    }
    if (!autoPlayEnabled) {
      lfDevvitTrace("DEVVIT_ENABLE_SKIP", { reason, block: "autoplay-disabled" });
      return;
    }
    if (!gameAutomation) {
      lfDevvitTrace("DEVVIT_ENABLE_SKIP", { reason, block: "no-automation" });
      return;
    }
    if (!gameAutomation.config.enabled) {
      devvitLogger.log("Enabling automation", { reason });
      lfDevvitTrace("DEVVIT_ENABLE", { reason });
      gameAutomation.start();
    }
    startTabKeepAlive();
  }
  function abortVictoryFlowState() {
    if (!gameAutomation) return;
    gameAutomation.victoryFlow = null;
    gameAutomation.victoryFlowGiveUpAt = 0;
    gameAutomation.victoryCompletionReported = false;
    gameAutomation.innCompletionHandled = false;
    // Without this the latch survives a stop/start cycle: start() re-enables the
    // config and restarts the interval, but every processGame() tick still bails
    // out of shouldPauseGameClicking(), so the bot reads ACTIVE and does nothing.
    gameAutomation.missionDoneNoClick = false;
  }
  function toggleAutomation(enabled, reason = "unspecified") {
    const alreadyEnabled = !!gameAutomation?.config?.enabled;
    if (enabled === alreadyEnabled) {
      lfDevvitTrace("DEVVIT_TOGGLE_SKIP", { reason, alreadyEnabled, note: "already in target state" });
      return;
    }
    devvitLogger.log("toggleAutomation called", { enabled, reason });
    lfDevvitTrace(enabled ? "DEVVIT_TOGGLE_ON" : "DEVVIT_TOGGLE_OFF", { reason, botSessionActive, autoPlayEnabled });
    if (!gameAutomation) {
      devvitLogger.error("Automation not initialized");
      lfDevvitTrace("DEVVIT_TOGGLE_SKIP", { block: "no-automation", reason });
      return;
    }
    if (enabled) {
      gameAutomation.start();
      devvitLogger.log("Automation started (ACTIVE mode — real clicks)");
    } else {
      abortVictoryFlowState();
      gameAutomation.stop();
      devvitLogger.log("Automation stopped (DRY-RUN monitoring only)");
      stopTabKeepAliveIfIdle();
    }
    devvitLogger.log("Automation state", { state: gameAutomation.getState() });
  }
  function updateAutomationConfig(config) {
    if (!gameAutomation) {
      devvitLogger.error("Automation not initialized");
      return;
    }
    const giaeConfig = {
      abilityTierList: config.abilityTierList,
      blessingStatPriority: config.blessingStatPriority,
      autoAcceptSkillBargains: config.autoAcceptSkillBargains,
      skillBargainStrategy: config.skillBargainStrategy,
      crossroadsStrategy: config.crossroadsStrategy,
      autoPlay: config.autoPlay,
      debugVisuals: config.debugVisuals
    };
    gameAutomation.updateConfig(giaeConfig);
    chrome.storage.local.set({ automationConfig: config });
  }
  let pendingStartMessage = null;
  let keepAlivePort = null;
  let keepAlivePingTimer = null;
  let keepAliveRafId = null;
  function shouldRunTabKeepAlive() {
    return botSessionActive || !!gameAutomation?.config?.enabled;
  }
  function installPageWorldKeepAlive() {
    if (window.__lazyfrogPageInjectRequested) return;
    window.__lazyfrogPageInjectRequested = true;
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("pageWorldKeepAlive.js");
      script.onload = () => script.remove();
      script.onerror = () => {
        window.__lazyfrogPageInjectRequested = false;
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      window.__lazyfrogPageInjectRequested = false;
      devvitLogger.warn("Page-world keep-alive script tag failed", { error: String(error) });
    }
    safeSendMessage({ type: "ENSURE_PAGE_KEEPALIVE" });
  }
  function startTabKeepAlive() {
    installFocusSpoof();
    installPageWorldKeepAlive();
    if (!keepAlivePort) {
      try {
        keepAlivePort = chrome.runtime.connect({ name: "lazyfrog-keepalive" });
        keepAlivePort.onDisconnect.addListener(() => {
          keepAlivePort = null;
          if (shouldRunTabKeepAlive()) {
            setTimeout(startTabKeepAlive, 2e3);
          }
        });
      } catch (error) {
        devvitLogger.warn("Keep-alive port failed", { error: String(error) });
      }
    }
    if (!keepAlivePingTimer) {
      keepAlivePingTimer = setInterval(() => {
        try {
          keepAlivePort?.postMessage({ type: "ping", t: Date.now() });
        } catch {
        }
      }, 2e4);
    }
    if (!keepAliveRafId) {
      const loop = () => {
        keepAliveRafId = requestAnimationFrame(loop);
      };
      keepAliveRafId = requestAnimationFrame(loop);
    }
  }
  function stopTabKeepAliveIfIdle() {
    if (shouldRunTabKeepAlive()) return;
    if (keepAlivePingTimer) {
      clearInterval(keepAlivePingTimer);
      keepAlivePingTimer = null;
    }
    if (keepAliveRafId) {
      cancelAnimationFrame(keepAliveRafId);
      keepAliveRafId = null;
    }
    try {
      keepAlivePort?.disconnect();
    } catch {
    }
    keepAlivePort = null;
    safeSendMessage({ type: "RELEASE_TAB_KEEPALIVE" });
  }
  function installFocusSpoof() {
    if (window.__lazyfrogFocusSpoofInstalled) return;
    window.__lazyfrogFocusSpoofInstalled = true;
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
    } catch (error) {
      devvitLogger.warn("Could not override visibility properties", { error: String(error) });
    }
    try {
      const blockBlur = (event) => {
        event.stopImmediatePropagation();
      };
      const capturePassive = { capture: true, passive: true };
      window.addEventListener("blur", blockBlur, capturePassive);
      document.addEventListener("blur", blockBlur, capturePassive);
      document.addEventListener(
        "visibilitychange",
        (event) => {
          event.stopImmediatePropagation();
        },
        capturePassive
      );
      const forceFocused = () => {
        try {
          window.focus();
        } catch {
        }
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      };
      forceFocused();
      setInterval(forceFocused, 3e3);
      devvitLogger.log("Installed focus spoof");
    } catch (error) {
      devvitLogger.warn("Focus spoof failed", { error: String(error) });
    }
  }
  const redditMainFrameMessageTypes = /* @__PURE__ */ new Set([
    "FETCH_MISSION_DATA_FROM_PAGE",
    "BATCH_GRPC_ENRICH_MISSIONS",
    "ENRICH_MISSION_ON_PAGE",
    "PING_REDDIT_CS",
    "NAVIGATE_TO_MISSION",
    "CLICK_GAME_UI",
    "OPEN_GAME_IF_NEEDED",
    "CLOSE_GAME_DIALOG",
    "CHECK_GAME_DIALOG_STATUS",
    "CHECK_FOR_GAME_LOADER",
    "GAME_WAIT_TIMEOUT"
  ]);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (redditMainFrameMessageTypes.has(message.type)) {
      return false;
    }
    const noisyTypes = /* @__PURE__ */ new Set(["STATE_CHANGED", "GET_GAME_STATE", "CHECK_AUTOMATION_STATUS", "PING"]);
    if (!noisyTypes.has(message.type)) {
      devvitLogger.log(`Received ${message.type} message`, { message });
    }
    switch (message.type) {
      case "CHECK_AUTOMATION_STATUS":
        const isReady = gameAutomation !== null;
        const automationState = gameAutomation ? gameAutomation.getState() : null;
        sendResponse({
          isReady,
          isRunning: automationState === "running",
          state: automationState
        });
        break;
      case "START_MISSION_AUTOMATION":
        lfDevvitTrace("DEVVIT_START_MSG", { ready: !!gameAutomation });
        refreshBotSessionFlags(() => {
          if (!botSessionActive) {
            lfDevvitTrace("DEVVIT_START_SKIP", { reason: "no-active-session" });
            pendingStartMessage = null;
            sendResponse({ success: true, ignored: true });
            return;
          }
          if (!gameAutomation) {
            devvitLogger.log("Automation not ready, queuing START_MISSION_AUTOMATION");
            pendingStartMessage = message;
            sendResponse({ success: true, queued: true });
            return;
          }
          chrome.storage.local.get(["automationConfig"], (result2) => {
            if (result2.automationConfig) {
              updateAutomationConfig(result2.automationConfig);
            }
            gameAutomation.innCompletionHandled = false;
            gameAutomation.victoryFlow = null;
            gameAutomation.victoryCompletionReported = false;
            gameAutomation._inProgressSinceMs = 0;
            gameAutomation._unknownSinceMs = 0;
            gameAutomation._hollowUiSinceMs = 0;
            gameAutomation._hollowUiReloadedForPostId = null;
            gameAutomation._hollowUiErrorReported = false;
            gameAutomation._hollowUiNudgedReady = false;
            ensureAutomationEnabled("START_MISSION_AUTOMATION");
            sendResponse({ success: true, state: gameAutomation.getState() });
          });
        });
        return true;
      case "STOP_MISSION_AUTOMATION":
        lfDevvitTrace("DEVVIT_STOP_MSG", {});
        pendingStartMessage = null;
        if (gameAutomation) {
          gameAutomation.enterMissionDoneNoClick("STOP_MISSION_AUTOMATION");
        }
        toggleAutomation(false, "STOP_MISSION_AUTOMATION");
        sendResponse({ success: true });
        break;
      case "STATE_CHANGED":
        lfDevvitTrace("DEVVIT_STATE_CHANGED", { state: message.state });
        lazyfrogBotPresentationState = message.state || "idle";
        if (message.context?.currentMissionId && gameAutomation) {
          const postId = normalizePostId(message.context.currentMissionId);
          if (postId) {
            const switched = gameAutomation.resetSessionForMissionSwitch(postId, "STATE_CHANGED:" + message.state);
            if (switched) {
              chrome.storage.local.set({ lazyfrogCurrentMissionId: postId });
            }
          }
        }
        if (["starting", "navigating", "waitingForGame", "openingGame", "gameReady", "running", "completing", "waitingForDialogClose"].includes(message.state)) {
          if (gameAutomation) {
            gameAutomation.innCompletionHandled = false;
            if (["navigating", "waitingForDialogClose", "completing"].includes(message.state)) {
              gameAutomation.victoryFlowGiveUpAt = 0;
              if (!gameAutomation.victoryFlow) {
                gameAutomation.victoryCompletionReported = false;
              }
            }
          }
          if (message.state === "waitingForDialogClose" || message.state === "completing" || message.state === "navigating") {
            const victoryScreen = gameAutomation?.gameState?.currentScreen;
            const stillOnVictoryUi = ["victory_end", "finish", "continue"].includes(victoryScreen);
            if (!stillOnVictoryUi) {
              if (gameAutomation) {
                gameAutomation.enterMissionDoneNoClick(`STATE_CHANGED:${message.state}`);
              }
              toggleAutomation(false, `STATE_CHANGED:${message.state}:reddit-handles-queue`);
            } else {
              lfDevvitTrace("DEVVIT_STATE_CHANGED_KEEP_CLICKING", {
                state: message.state,
                victoryScreen,
                note: "queue-leaving state while victory UI visible — keep devvit clicking"
              });
              ensureAutomationEnabled(`STATE_CHANGED:${message.state}:victory-ui`);
            }
          } else if (botSessionActive && autoPlayEnabled) {
            ensureAutomationEnabled("STATE_CHANGED:" + message.state);
          } else {
            toggleAutomation(false, `STATE_CHANGED:${message.state}:session-inactive`);
          }
        } else if (message.state === "idleDialogOpen" || message.state === "idle" || message.state === "error") {
          refreshBotSessionFlags(() => {
            lfDevvitTrace("DEVVIT_STATE_TERMINAL", {
              state: message.state,
              botSessionActive,
              note: botSessionActive
                ? "idle/error but session still true — devvit stays on until activeBotSession cleared"
                : "session false — expect STOP_MISSION or storage sync to disable"
            });
            if (!botSessionActive) {
              toggleAutomation(false, `STATE_CHANGED:${message.state}:session-false`);
            }
          });
        }
        sendResponse({ success: true });
        break;
      case "GET_GAME_STATE":
        if (gameAutomation) {
          const state = gameAutomation.getGameState();
          sendResponse({ gameState: state });
        } else {
          sendResponse({ gameState: null });
        }
        break;
      case "FETCH_DEVVIT_API_INIT":
        (async () => {
          try {
            const response = await fetch("/api/init?mode=game");
            const initPayload = await response.json();
            const postId = normalizePostId(initPayload?.postId);
            const expected = normalizePostId(message.expectedPostId);
            if (expected && postId && postId !== expected) {
              sendResponse({
                success: false,
                error: `init postId mismatch (${postId} vs ${expected})`
              });
              return;
            }
            if (initPayload?.success) {
              notifyMissionMetadataCaptured(postId, initPayload, "api-init-fetch");
              handleDevvitInitPayload(initPayload, "api-init-fetch");
            }
            sendResponse({ success: !!initPayload?.success, init: initPayload });
          } catch (error) {
            sendResponse({ success: false, error: String(error) });
          }
        })();
        return true;
      default:
        devvitLogger.warn(`Unknown message type: ${message.type}`, { message });
        sendResponse({ error: "Unknown message type: " + message.type });
    }
    return true;
  });
  function injectDevvitPageScripts() {
    if (window.__lazyfrogDevvitScriptsInjected) return;
    window.__lazyfrogDevvitScriptsInjected = true;
    try {
      const fetchScript = document.createElement("script");
      fetchScript.src = chrome.runtime.getURL("fetchInterceptor.js");
      (document.documentElement || document.head).appendChild(fetchScript);
    } catch (error) {
      devvitLogger.warn("Failed to inject Devvit page scripts", { error: String(error) });
    }
  }
  function handleDevvitInitPayload(initPayload, source) {
    if (!initPayload?.success || !initPayload?.postId) return;
    const postId = initPayload.postId;
    devvitLogger.log("Devvit /api/init payload captured", {
      source,
      postId,
      environment: initPayload.missionMetadata?.mission?.environment,
      difficulty: initPayload.missionMetadata?.mission?.difficulty,
      encounters: initPayload.missionMetadata?.mission?.encounters?.length || 0
    });
    notifyMissionMetadataCaptured(postId, initPayload, source);
    safeSendMessage({
      type: "DEVVIT_INIT_CAPTURED",
      postId: normalizePostId(postId),
      init: initPayload
    });
    if (gameAutomation && initPayload.missionMetadata) {
      gameAutomation.resetSessionForMissionSwitch(postId, source);
      gameAutomation.currentPostId = postId;
      gameAutomation.missionMetadata = initPayload.missionMetadata;
      gameAutomation.gameState.setMissionData(initPayload.missionMetadata, postId);
      gameAutomation.saveMissionToDatabase(postId, initPayload.username || "Unknown", initPayload.missionMetadata).catch((err) => {
        devvitLogger.error("Failed to save mission from /api/init", { error: String(err) });
      });
    }
  }
  document.addEventListener("lazyfrog:api-init", (event) => {
    handleDevvitInitPayload(event.detail, "api-init");
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectDevvitPageScripts);
  } else {
    injectDevvitPageScripts();
  }
  setTimeout(() => {
    devvitLogger.log("Running initial game analysis");
    initializeAutomation();
  }, 2e3);
  return result;
})();