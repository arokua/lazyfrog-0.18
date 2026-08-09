// Shared mission rules (flair parsing, classification, archival, queue gating).
// Classic service worker, so importScripts is available and runs synchronously
// before the bundle body below. Exposes globalThis.LazyFrogMissionCore.
importScripts("/lib/missionCore.js");
importScripts("/lib/missionTelemetry.js");

var background = (function() {
  "use strict";
  const missionCore = globalThis.LazyFrogMissionCore;
  const MissionKind = missionCore.MissionKind;
  function defineBackground(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  function getGlobal() {
    if (typeof globalThis !== "undefined") {
      return globalThis;
    }
    if (typeof self !== "undefined") {
      return self;
    }
    if (typeof window !== "undefined") {
      return window;
    }
    if (typeof global !== "undefined") {
      return global;
    }
  }
  function getDevTools() {
    const w = getGlobal();
    if (w.__xstate__) {
      return w.__xstate__;
    }
    return void 0;
  }
  const devToolsAdapter = (service) => {
    if (typeof window === "undefined") {
      return;
    }
    const devTools = getDevTools();
    if (devTools) {
      devTools.register(service);
    }
  };
  class Mailbox {
    constructor(_process) {
      this._process = _process;
      this._active = false;
      this._current = null;
      this._last = null;
    }
    start() {
      this._active = true;
      this.flush();
    }
    clear() {
      if (this._current) {
        this._current.next = null;
        this._last = this._current;
      }
    }
    enqueue(event) {
      const enqueued = {
        value: event,
        next: null
      };
      if (this._current) {
        this._last.next = enqueued;
        this._last = enqueued;
        return;
      }
      this._current = enqueued;
      this._last = enqueued;
      if (this._active) {
        this.flush();
      }
    }
    flush() {
      while (this._current) {
        const consumed = this._current;
        this._process(consumed.value);
        this._current = consumed.next;
      }
      this._last = null;
    }
  }
  const STATE_DELIMITER = ".";
  const TARGETLESS_KEY = "";
  const NULL_EVENT = "";
  const STATE_IDENTIFIER$1 = "#";
  const WILDCARD = "*";
  const XSTATE_INIT = "xstate.init";
  const XSTATE_ERROR = "xstate.error";
  const XSTATE_STOP = "xstate.stop";
  function createAfterEvent(delayRef, id) {
    return {
      type: `xstate.after.${delayRef}.${id}`
    };
  }
  function createDoneStateEvent(id, output) {
    return {
      type: `xstate.done.state.${id}`,
      output
    };
  }
  function createDoneActorEvent(invokeId, output) {
    return {
      type: `xstate.done.actor.${invokeId}`,
      output,
      actorId: invokeId
    };
  }
  function createErrorActorEvent(id, error) {
    return {
      type: `xstate.error.actor.${id}`,
      error,
      actorId: id
    };
  }
  function createInitEvent(input) {
    return {
      type: XSTATE_INIT,
      input
    };
  }
  function reportUnhandledError(err) {
    setTimeout(() => {
      throw err;
    });
  }
  const symbolObservable = (() => typeof Symbol === "function" && Symbol.observable || "@@observable")();
  function matchesState(parentStateId, childStateId) {
    const parentStateValue = toStateValue(parentStateId);
    const childStateValue = toStateValue(childStateId);
    if (typeof childStateValue === "string") {
      if (typeof parentStateValue === "string") {
        return childStateValue === parentStateValue;
      }
      return false;
    }
    if (typeof parentStateValue === "string") {
      return parentStateValue in childStateValue;
    }
    return Object.keys(parentStateValue).every((key) => {
      if (!(key in childStateValue)) {
        return false;
      }
      return matchesState(parentStateValue[key], childStateValue[key]);
    });
  }
  function toStatePath(stateId) {
    if (isArray(stateId)) {
      return stateId;
    }
    const result2 = [];
    let segment = "";
    for (let i = 0; i < stateId.length; i++) {
      const char = stateId.charCodeAt(i);
      switch (char) {
        // \
        case 92:
          segment += stateId[i + 1];
          i++;
          continue;
        // .
        case 46:
          result2.push(segment);
          segment = "";
          continue;
      }
      segment += stateId[i];
    }
    result2.push(segment);
    return result2;
  }
  function toStateValue(stateValue) {
    if (isMachineSnapshot(stateValue)) {
      return stateValue.value;
    }
    if (typeof stateValue !== "string") {
      return stateValue;
    }
    const statePath = toStatePath(stateValue);
    return pathToStateValue(statePath);
  }
  function pathToStateValue(statePath) {
    if (statePath.length === 1) {
      return statePath[0];
    }
    const value = {};
    let marker = value;
    for (let i = 0; i < statePath.length - 1; i++) {
      if (i === statePath.length - 2) {
        marker[statePath[i]] = statePath[i + 1];
      } else {
        const previous = marker;
        marker = {};
        previous[statePath[i]] = marker;
      }
    }
    return value;
  }
  function mapValues(collection, iteratee) {
    const result2 = {};
    const collectionKeys = Object.keys(collection);
    for (let i = 0; i < collectionKeys.length; i++) {
      const key = collectionKeys[i];
      result2[key] = iteratee(collection[key], key, collection, i);
    }
    return result2;
  }
  function toArrayStrict(value) {
    if (isArray(value)) {
      return value;
    }
    return [value];
  }
  function toArray(value) {
    if (value === void 0) {
      return [];
    }
    return toArrayStrict(value);
  }
  function resolveOutput(mapper, context, event, self2) {
    if (typeof mapper === "function") {
      return mapper({
        context,
        event,
        self: self2
      });
    }
    return mapper;
  }
  function isArray(value) {
    return Array.isArray(value);
  }
  function isErrorActorEvent(event) {
    return event.type.startsWith("xstate.error.actor");
  }
  function toTransitionConfigArray(configLike) {
    return toArrayStrict(configLike).map((transitionLike) => {
      if (typeof transitionLike === "undefined" || typeof transitionLike === "string") {
        return {
          target: transitionLike
        };
      }
      return transitionLike;
    });
  }
  function normalizeTarget(target) {
    if (target === void 0 || target === TARGETLESS_KEY) {
      return void 0;
    }
    return toArray(target);
  }
  function toObserver(nextHandler, errorHandler, completionHandler) {
    const isObserver = typeof nextHandler === "object";
    const self2 = isObserver ? nextHandler : void 0;
    return {
      next: (isObserver ? nextHandler.next : nextHandler)?.bind(self2),
      error: (isObserver ? nextHandler.error : errorHandler)?.bind(self2),
      complete: (isObserver ? nextHandler.complete : completionHandler)?.bind(self2)
    };
  }
  function createInvokeId(stateNodeId, index) {
    return `${index}.${stateNodeId}`;
  }
  function resolveReferencedActor(machine, src) {
    const match = src.match(/^xstate\.invoke\.(\d+)\.(.*)/);
    if (!match) {
      return machine.implementations.actors[src];
    }
    const [, indexStr, nodeId] = match;
    const node = machine.getStateNodeById(nodeId);
    const invokeConfig = node.config.invoke;
    return (Array.isArray(invokeConfig) ? invokeConfig[indexStr] : invokeConfig).src;
  }
  function createScheduledEventId(actorRef, id) {
    return `${actorRef.sessionId}.${id}`;
  }
  let idCounter = 0;
  function createSystem(rootActor, options) {
    const children = /* @__PURE__ */ new Map();
    const keyedActors = /* @__PURE__ */ new Map();
    const reverseKeyedActors = /* @__PURE__ */ new WeakMap();
    const inspectionObservers = /* @__PURE__ */ new Set();
    const timerMap = {};
    const {
      clock,
      logger: logger2
    } = options;
    const scheduler = {
      schedule: (source, target, event, delay, id = Math.random().toString(36).slice(2)) => {
        const scheduledEvent = {
          source,
          target,
          event,
          delay,
          id,
          startedAt: Date.now()
        };
        const scheduledEventId = createScheduledEventId(source, id);
        system._snapshot._scheduledEvents[scheduledEventId] = scheduledEvent;
        const timeout = clock.setTimeout(() => {
          delete timerMap[scheduledEventId];
          delete system._snapshot._scheduledEvents[scheduledEventId];
          system._relay(source, target, event);
        }, delay);
        timerMap[scheduledEventId] = timeout;
      },
      cancel: (source, id) => {
        const scheduledEventId = createScheduledEventId(source, id);
        const timeout = timerMap[scheduledEventId];
        delete timerMap[scheduledEventId];
        delete system._snapshot._scheduledEvents[scheduledEventId];
        if (timeout !== void 0) {
          clock.clearTimeout(timeout);
        }
      },
      cancelAll: (actorRef) => {
        for (const scheduledEventId in system._snapshot._scheduledEvents) {
          const scheduledEvent = system._snapshot._scheduledEvents[scheduledEventId];
          if (scheduledEvent.source === actorRef) {
            scheduler.cancel(actorRef, scheduledEvent.id);
          }
        }
      }
    };
    const sendInspectionEvent = (event) => {
      if (!inspectionObservers.size) {
        return;
      }
      const resolvedInspectionEvent = {
        ...event,
        rootId: rootActor.sessionId
      };
      inspectionObservers.forEach((observer) => observer.next?.(resolvedInspectionEvent));
    };
    const system = {
      _snapshot: {
        _scheduledEvents: (options?.snapshot && options.snapshot.scheduler) ?? {}
      },
      _bookId: () => `x:${idCounter++}`,
      _register: (sessionId, actorRef) => {
        children.set(sessionId, actorRef);
        return sessionId;
      },
      _unregister: (actorRef) => {
        children.delete(actorRef.sessionId);
        const systemId = reverseKeyedActors.get(actorRef);
        if (systemId !== void 0) {
          keyedActors.delete(systemId);
          reverseKeyedActors.delete(actorRef);
        }
      },
      get: (systemId) => {
        return keyedActors.get(systemId);
      },
      getAll: () => {
        return Object.fromEntries(keyedActors.entries());
      },
      _set: (systemId, actorRef) => {
        const existing = keyedActors.get(systemId);
        if (existing && existing !== actorRef) {
          throw new Error(`Actor with system ID '${systemId}' already exists.`);
        }
        keyedActors.set(systemId, actorRef);
        reverseKeyedActors.set(actorRef, systemId);
      },
      inspect: (observerOrFn) => {
        const observer = toObserver(observerOrFn);
        inspectionObservers.add(observer);
        return {
          unsubscribe() {
            inspectionObservers.delete(observer);
          }
        };
      },
      _sendInspectionEvent: sendInspectionEvent,
      _relay: (source, target, event) => {
        system._sendInspectionEvent({
          type: "@xstate.event",
          sourceRef: source,
          actorRef: target,
          event
        });
        target._send(event);
      },
      scheduler,
      getSnapshot: () => {
        return {
          _scheduledEvents: {
            ...system._snapshot._scheduledEvents
          }
        };
      },
      start: () => {
        const scheduledEvents = system._snapshot._scheduledEvents;
        system._snapshot._scheduledEvents = {};
        for (const scheduledId in scheduledEvents) {
          const {
            source,
            target,
            event,
            delay,
            id
          } = scheduledEvents[scheduledId];
          scheduler.schedule(source, target, event, delay, id);
        }
      },
      _clock: clock,
      _logger: logger2
    };
    return system;
  }
  let executingCustomAction = false;
  const $$ACTOR_TYPE = 1;
  let ProcessingStatus = /* @__PURE__ */ (function(ProcessingStatus2) {
    ProcessingStatus2[ProcessingStatus2["NotStarted"] = 0] = "NotStarted";
    ProcessingStatus2[ProcessingStatus2["Running"] = 1] = "Running";
    ProcessingStatus2[ProcessingStatus2["Stopped"] = 2] = "Stopped";
    return ProcessingStatus2;
  })({});
  const defaultOptions = {
    clock: {
      setTimeout: (fn, ms) => {
        return setTimeout(fn, ms);
      },
      clearTimeout: (id) => {
        return clearTimeout(id);
      }
    },
    logger: console.log.bind(console),
    devTools: false
  };
  class Actor {
    /**
     * Creates a new actor instance for the given logic with the provided options,
     * if any.
     *
     * @param logic The logic to create an actor from
     * @param options Actor options
     */
    constructor(logic, options) {
      this.logic = logic;
      this._snapshot = void 0;
      this.clock = void 0;
      this.options = void 0;
      this.id = void 0;
      this.mailbox = new Mailbox(this._process.bind(this));
      this.observers = /* @__PURE__ */ new Set();
      this.eventListeners = /* @__PURE__ */ new Map();
      this.logger = void 0;
      this._processingStatus = ProcessingStatus.NotStarted;
      this._parent = void 0;
      this._syncSnapshot = void 0;
      this.ref = void 0;
      this._actorScope = void 0;
      this.systemId = void 0;
      this.sessionId = void 0;
      this.system = void 0;
      this._doneEvent = void 0;
      this.src = void 0;
      this._deferred = [];
      const resolvedOptions = {
        ...defaultOptions,
        ...options
      };
      const {
        clock,
        logger: logger2,
        parent,
        syncSnapshot,
        id,
        systemId,
        inspect
      } = resolvedOptions;
      this.system = parent ? parent.system : createSystem(this, {
        clock,
        logger: logger2
      });
      if (inspect && !parent) {
        this.system.inspect(toObserver(inspect));
      }
      this.sessionId = this.system._bookId();
      this.id = id ?? this.sessionId;
      this.logger = options?.logger ?? this.system._logger;
      this.clock = options?.clock ?? this.system._clock;
      this._parent = parent;
      this._syncSnapshot = syncSnapshot;
      this.options = resolvedOptions;
      this.src = resolvedOptions.src ?? logic;
      this.ref = this;
      this._actorScope = {
        self: this,
        id: this.id,
        sessionId: this.sessionId,
        logger: this.logger,
        defer: (fn) => {
          this._deferred.push(fn);
        },
        system: this.system,
        stopChild: (child) => {
          if (child._parent !== this) {
            throw new Error(`Cannot stop child actor ${child.id} of ${this.id} because it is not a child`);
          }
          child._stop();
        },
        emit: (emittedEvent) => {
          const listeners = this.eventListeners.get(emittedEvent.type);
          const wildcardListener = this.eventListeners.get("*");
          if (!listeners && !wildcardListener) {
            return;
          }
          const allListeners = [...listeners ? listeners.values() : [], ...wildcardListener ? wildcardListener.values() : []];
          for (const handler of allListeners) {
            try {
              handler(emittedEvent);
            } catch (err) {
              reportUnhandledError(err);
            }
          }
        },
        actionExecutor: (action) => {
          const exec = () => {
            this._actorScope.system._sendInspectionEvent({
              type: "@xstate.action",
              actorRef: this,
              action: {
                type: action.type,
                params: action.params
              }
            });
            if (!action.exec) {
              return;
            }
            const saveExecutingCustomAction = executingCustomAction;
            try {
              executingCustomAction = true;
              action.exec(action.info, action.params);
            } finally {
              executingCustomAction = saveExecutingCustomAction;
            }
          };
          if (this._processingStatus === ProcessingStatus.Running) {
            exec();
          } else {
            this._deferred.push(exec);
          }
        }
      };
      this.send = this.send.bind(this);
      this.system._sendInspectionEvent({
        type: "@xstate.actor",
        actorRef: this
      });
      if (systemId) {
        this.systemId = systemId;
        this.system._set(systemId, this);
      }
      this._initState(options?.snapshot ?? options?.state);
      if (systemId && this._snapshot.status !== "active") {
        this.system._unregister(this);
      }
    }
    _initState(persistedState) {
      try {
        this._snapshot = persistedState ? this.logic.restoreSnapshot ? this.logic.restoreSnapshot(persistedState, this._actorScope) : persistedState : this.logic.getInitialSnapshot(this._actorScope, this.options?.input);
      } catch (err) {
        this._snapshot = {
          status: "error",
          output: void 0,
          error: err
        };
      }
    }
    update(snapshot, event) {
      this._snapshot = snapshot;
      let deferredFn;
      while (deferredFn = this._deferred.shift()) {
        try {
          deferredFn();
        } catch (err) {
          this._deferred.length = 0;
          this._snapshot = {
            ...snapshot,
            status: "error",
            error: err
          };
        }
      }
      switch (this._snapshot.status) {
        case "active":
          for (const observer of this.observers) {
            try {
              observer.next?.(snapshot);
            } catch (err) {
              reportUnhandledError(err);
            }
          }
          break;
        case "done":
          for (const observer of this.observers) {
            try {
              observer.next?.(snapshot);
            } catch (err) {
              reportUnhandledError(err);
            }
          }
          this._stopProcedure();
          this._complete();
          this._doneEvent = createDoneActorEvent(this.id, this._snapshot.output);
          if (this._parent) {
            this.system._relay(this, this._parent, this._doneEvent);
          }
          break;
        case "error":
          this._error(this._snapshot.error);
          break;
      }
      this.system._sendInspectionEvent({
        type: "@xstate.snapshot",
        actorRef: this,
        event,
        snapshot
      });
    }
    /**
     * Subscribe an observer to an actor’s snapshot values.
     *
     * @remarks
     * The observer will receive the actor’s snapshot value when it is emitted.
     * The observer can be:
     *
     * - A plain function that receives the latest snapshot, or
     * - An observer object whose `.next(snapshot)` method receives the latest
     *   snapshot
     *
     * @example
     *
     * ```ts
     * // Observer as a plain function
     * const subscription = actor.subscribe((snapshot) => {
     *   console.log(snapshot);
     * });
     * ```
     *
     * @example
     *
     * ```ts
     * // Observer as an object
     * const subscription = actor.subscribe({
     *   next(snapshot) {
     *     console.log(snapshot);
     *   },
     *   error(err) {
     *     // ...
     *   },
     *   complete() {
     *     // ...
     *   }
     * });
     * ```
     *
     * The return value of `actor.subscribe(observer)` is a subscription object
     * that has an `.unsubscribe()` method. You can call
     * `subscription.unsubscribe()` to unsubscribe the observer:
     *
     * @example
     *
     * ```ts
     * const subscription = actor.subscribe((snapshot) => {
     *   // ...
     * });
     *
     * // Unsubscribe the observer
     * subscription.unsubscribe();
     * ```
     *
     * When the actor is stopped, all of its observers will automatically be
     * unsubscribed.
     *
     * @param observer - Either a plain function that receives the latest
     *   snapshot, or an observer object whose `.next(snapshot)` method receives
     *   the latest snapshot
     */
    subscribe(nextListenerOrObserver, errorListener, completeListener) {
      const observer = toObserver(nextListenerOrObserver, errorListener, completeListener);
      if (this._processingStatus !== ProcessingStatus.Stopped) {
        this.observers.add(observer);
      } else {
        switch (this._snapshot.status) {
          case "done":
            try {
              observer.complete?.();
            } catch (err) {
              reportUnhandledError(err);
            }
            break;
          case "error": {
            const err = this._snapshot.error;
            if (!observer.error) {
              reportUnhandledError(err);
            } else {
              try {
                observer.error(err);
              } catch (err2) {
                reportUnhandledError(err2);
              }
            }
            break;
          }
        }
      }
      return {
        unsubscribe: () => {
          this.observers.delete(observer);
        }
      };
    }
    on(type, handler) {
      let listeners = this.eventListeners.get(type);
      if (!listeners) {
        listeners = /* @__PURE__ */ new Set();
        this.eventListeners.set(type, listeners);
      }
      const wrappedHandler = handler.bind(void 0);
      listeners.add(wrappedHandler);
      return {
        unsubscribe: () => {
          listeners.delete(wrappedHandler);
        }
      };
    }
    /** Starts the Actor from the initial state */
    start() {
      if (this._processingStatus === ProcessingStatus.Running) {
        return this;
      }
      if (this._syncSnapshot) {
        this.subscribe({
          next: (snapshot) => {
            if (snapshot.status === "active") {
              this.system._relay(this, this._parent, {
                type: `xstate.snapshot.${this.id}`,
                snapshot
              });
            }
          },
          error: () => {
          }
        });
      }
      this.system._register(this.sessionId, this);
      if (this.systemId) {
        this.system._set(this.systemId, this);
      }
      this._processingStatus = ProcessingStatus.Running;
      const initEvent = createInitEvent(this.options.input);
      this.system._sendInspectionEvent({
        type: "@xstate.event",
        sourceRef: this._parent,
        actorRef: this,
        event: initEvent
      });
      const status = this._snapshot.status;
      switch (status) {
        case "done":
          this.update(this._snapshot, initEvent);
          return this;
        case "error":
          this._error(this._snapshot.error);
          return this;
      }
      if (!this._parent) {
        this.system.start();
      }
      if (this.logic.start) {
        try {
          this.logic.start(this._snapshot, this._actorScope);
        } catch (err) {
          this._snapshot = {
            ...this._snapshot,
            status: "error",
            error: err
          };
          this._error(err);
          return this;
        }
      }
      this.update(this._snapshot, initEvent);
      if (this.options.devTools) {
        this.attachDevTools();
      }
      this.mailbox.start();
      return this;
    }
    _process(event) {
      let nextState;
      let caughtError;
      try {
        nextState = this.logic.transition(this._snapshot, event, this._actorScope);
      } catch (err) {
        caughtError = {
          err
        };
      }
      if (caughtError) {
        const {
          err
        } = caughtError;
        this._snapshot = {
          ...this._snapshot,
          status: "error",
          error: err
        };
        this._error(err);
        return;
      }
      this.update(nextState, event);
      if (event.type === XSTATE_STOP) {
        this._stopProcedure();
        this._complete();
      }
    }
    _stop() {
      if (this._processingStatus === ProcessingStatus.Stopped) {
        return this;
      }
      this.mailbox.clear();
      if (this._processingStatus === ProcessingStatus.NotStarted) {
        this._processingStatus = ProcessingStatus.Stopped;
        return this;
      }
      this.mailbox.enqueue({
        type: XSTATE_STOP
      });
      return this;
    }
    /** Stops the Actor and unsubscribe all listeners. */
    stop() {
      if (this._parent) {
        throw new Error("A non-root actor cannot be stopped directly.");
      }
      return this._stop();
    }
    _complete() {
      for (const observer of this.observers) {
        try {
          observer.complete?.();
        } catch (err) {
          reportUnhandledError(err);
        }
      }
      this.observers.clear();
    }
    _reportError(err) {
      if (!this.observers.size) {
        if (!this._parent) {
          reportUnhandledError(err);
        }
        return;
      }
      let reportError = false;
      for (const observer of this.observers) {
        const errorListener = observer.error;
        reportError ||= !errorListener;
        try {
          errorListener?.(err);
        } catch (err2) {
          reportUnhandledError(err2);
        }
      }
      this.observers.clear();
      if (reportError) {
        reportUnhandledError(err);
      }
    }
    _error(err) {
      this._stopProcedure();
      this._reportError(err);
      if (this._parent) {
        this.system._relay(this, this._parent, createErrorActorEvent(this.id, err));
      }
    }
    // TODO: atm children don't belong entirely to the actor so
    // in a way - it's not even super aware of them
    // so we can't stop them from here but we really should!
    // right now, they are being stopped within the machine's transition
    // but that could throw and leave us with "orphaned" active actors
    _stopProcedure() {
      if (this._processingStatus !== ProcessingStatus.Running) {
        return this;
      }
      this.system.scheduler.cancelAll(this);
      this.mailbox.clear();
      this.mailbox = new Mailbox(this._process.bind(this));
      this._processingStatus = ProcessingStatus.Stopped;
      this.system._unregister(this);
      return this;
    }
    /** @internal */
    _send(event) {
      if (this._processingStatus === ProcessingStatus.Stopped) {
        return;
      }
      this.mailbox.enqueue(event);
    }
    /**
     * Sends an event to the running Actor to trigger a transition.
     *
     * @param event The event to send
     */
    send(event) {
      this.system._relay(void 0, this, event);
    }
    attachDevTools() {
      const {
        devTools
      } = this.options;
      if (devTools) {
        const resolvedDevToolsAdapter = typeof devTools === "function" ? devTools : devToolsAdapter;
        resolvedDevToolsAdapter(this);
      }
    }
    toJSON() {
      return {
        xstate$$type: $$ACTOR_TYPE,
        id: this.id
      };
    }
    /**
     * Obtain the internal state of the actor, which can be persisted.
     *
     * @remarks
     * The internal state can be persisted from any actor, not only machines.
     *
     * Note that the persisted state is not the same as the snapshot from
     * {@link Actor.getSnapshot}. Persisted state represents the internal state of
     * the actor, while snapshots represent the actor's last emitted value.
     *
     * Can be restored with {@link ActorOptions.state}
     * @see https://stately.ai/docs/persistence
     */
    getPersistedSnapshot(options) {
      return this.logic.getPersistedSnapshot(this._snapshot, options);
    }
    [symbolObservable]() {
      return this;
    }
    /**
     * Read an actor’s snapshot synchronously.
     *
     * @remarks
     * The snapshot represent an actor's last emitted value.
     *
     * When an actor receives an event, its internal state may change. An actor
     * may emit a snapshot when a state transition occurs.
     *
     * Note that some actors, such as callback actors generated with
     * `fromCallback`, will not emit snapshots.
     * @see {@link Actor.subscribe} to subscribe to an actor’s snapshot values.
     * @see {@link Actor.getPersistedSnapshot} to persist the internal state of an actor (which is more than just a snapshot).
     */
    getSnapshot() {
      return this._snapshot;
    }
  }
  function createActor(logic, ...[options]) {
    return new Actor(logic, options);
  }
  function resolveCancel(_, snapshot, actionArgs, actionParams, {
    sendId
  }) {
    const resolvedSendId = typeof sendId === "function" ? sendId(actionArgs, actionParams) : sendId;
    return [snapshot, {
      sendId: resolvedSendId
    }, void 0];
  }
  function executeCancel(actorScope, params) {
    actorScope.defer(() => {
      actorScope.system.scheduler.cancel(actorScope.self, params.sendId);
    });
  }
  function cancel(sendId) {
    function cancel2(_args, _params) {
    }
    cancel2.type = "xstate.cancel";
    cancel2.sendId = sendId;
    cancel2.resolve = resolveCancel;
    cancel2.execute = executeCancel;
    return cancel2;
  }
  function resolveSpawn(actorScope, snapshot, actionArgs, _actionParams, {
    id,
    systemId,
    src,
    input,
    syncSnapshot
  }) {
    const logic = typeof src === "string" ? resolveReferencedActor(snapshot.machine, src) : src;
    const resolvedId = typeof id === "function" ? id(actionArgs) : id;
    let actorRef;
    let resolvedInput = void 0;
    if (logic) {
      resolvedInput = typeof input === "function" ? input({
        context: snapshot.context,
        event: actionArgs.event,
        self: actorScope.self
      }) : input;
      actorRef = createActor(logic, {
        id: resolvedId,
        src,
        parent: actorScope.self,
        syncSnapshot,
        systemId,
        input: resolvedInput
      });
    }
    return [cloneMachineSnapshot(snapshot, {
      children: {
        ...snapshot.children,
        [resolvedId]: actorRef
      }
    }), {
      id,
      systemId,
      actorRef,
      src,
      input: resolvedInput
    }, void 0];
  }
  function executeSpawn(actorScope, {
    actorRef
  }) {
    if (!actorRef) {
      return;
    }
    actorScope.defer(() => {
      if (actorRef._processingStatus === ProcessingStatus.Stopped) {
        return;
      }
      actorRef.start();
    });
  }
  function spawnChild(...[src, {
    id,
    systemId,
    input,
    syncSnapshot = false
  } = {}]) {
    function spawnChild2(_args, _params) {
    }
    spawnChild2.type = "xstate.spawnChild";
    spawnChild2.id = id;
    spawnChild2.systemId = systemId;
    spawnChild2.src = src;
    spawnChild2.input = input;
    spawnChild2.syncSnapshot = syncSnapshot;
    spawnChild2.resolve = resolveSpawn;
    spawnChild2.execute = executeSpawn;
    return spawnChild2;
  }
  function resolveStop(_, snapshot, args, actionParams, {
    actorRef
  }) {
    const actorRefOrString = typeof actorRef === "function" ? actorRef(args, actionParams) : actorRef;
    const resolvedActorRef = typeof actorRefOrString === "string" ? snapshot.children[actorRefOrString] : actorRefOrString;
    let children = snapshot.children;
    if (resolvedActorRef) {
      children = {
        ...children
      };
      delete children[resolvedActorRef.id];
    }
    return [cloneMachineSnapshot(snapshot, {
      children
    }), resolvedActorRef, void 0];
  }
  function executeStop(actorScope, actorRef) {
    if (!actorRef) {
      return;
    }
    actorScope.system._unregister(actorRef);
    if (actorRef._processingStatus !== ProcessingStatus.Running) {
      actorScope.stopChild(actorRef);
      return;
    }
    actorScope.defer(() => {
      actorScope.stopChild(actorRef);
    });
  }
  function stopChild(actorRef) {
    function stop(_args, _params) {
    }
    stop.type = "xstate.stopChild";
    stop.actorRef = actorRef;
    stop.resolve = resolveStop;
    stop.execute = executeStop;
    return stop;
  }
  function evaluateGuard(guard, context, event, snapshot) {
    const {
      machine
    } = snapshot;
    const isInline = typeof guard === "function";
    const resolved = isInline ? guard : machine.implementations.guards[typeof guard === "string" ? guard : guard.type];
    if (!isInline && !resolved) {
      throw new Error(`Guard '${typeof guard === "string" ? guard : guard.type}' is not implemented.'.`);
    }
    if (typeof resolved !== "function") {
      return evaluateGuard(resolved, context, event, snapshot);
    }
    const guardArgs = {
      context,
      event
    };
    const guardParams = isInline || typeof guard === "string" ? void 0 : "params" in guard ? typeof guard.params === "function" ? guard.params({
      context,
      event
    }) : guard.params : void 0;
    if (!("check" in resolved)) {
      return resolved(guardArgs, guardParams);
    }
    const builtinGuard = resolved;
    return builtinGuard.check(
      snapshot,
      guardArgs,
      resolved
      // this holds all params
    );
  }
  const isAtomicStateNode = (stateNode) => stateNode.type === "atomic" || stateNode.type === "final";
  function getChildren(stateNode) {
    return Object.values(stateNode.states).filter((sn) => sn.type !== "history");
  }
  function getProperAncestors(stateNode, toStateNode) {
    const ancestors = [];
    if (toStateNode === stateNode) {
      return ancestors;
    }
    let m = stateNode.parent;
    while (m && m !== toStateNode) {
      ancestors.push(m);
      m = m.parent;
    }
    return ancestors;
  }
  function getAllStateNodes(stateNodes) {
    const nodeSet = new Set(stateNodes);
    const adjList = getAdjList(nodeSet);
    for (const s of nodeSet) {
      if (s.type === "compound" && (!adjList.get(s) || !adjList.get(s).length)) {
        getInitialStateNodesWithTheirAncestors(s).forEach((sn) => nodeSet.add(sn));
      } else {
        if (s.type === "parallel") {
          for (const child of getChildren(s)) {
            if (child.type === "history") {
              continue;
            }
            if (!nodeSet.has(child)) {
              const initialStates = getInitialStateNodesWithTheirAncestors(child);
              for (const initialStateNode of initialStates) {
                nodeSet.add(initialStateNode);
              }
            }
          }
        }
      }
    }
    for (const s of nodeSet) {
      let m = s.parent;
      while (m) {
        nodeSet.add(m);
        m = m.parent;
      }
    }
    return nodeSet;
  }
  function getValueFromAdj(baseNode, adjList) {
    const childStateNodes = adjList.get(baseNode);
    if (!childStateNodes) {
      return {};
    }
    if (baseNode.type === "compound") {
      const childStateNode = childStateNodes[0];
      if (childStateNode) {
        if (isAtomicStateNode(childStateNode)) {
          return childStateNode.key;
        }
      } else {
        return {};
      }
    }
    const stateValue = {};
    for (const childStateNode of childStateNodes) {
      stateValue[childStateNode.key] = getValueFromAdj(childStateNode, adjList);
    }
    return stateValue;
  }
  function getAdjList(stateNodes) {
    const adjList = /* @__PURE__ */ new Map();
    for (const s of stateNodes) {
      if (!adjList.has(s)) {
        adjList.set(s, []);
      }
      if (s.parent) {
        if (!adjList.has(s.parent)) {
          adjList.set(s.parent, []);
        }
        adjList.get(s.parent).push(s);
      }
    }
    return adjList;
  }
  function getStateValue(rootNode, stateNodes) {
    const config = getAllStateNodes(stateNodes);
    return getValueFromAdj(rootNode, getAdjList(config));
  }
  function isInFinalState(stateNodeSet, stateNode) {
    if (stateNode.type === "compound") {
      return getChildren(stateNode).some((s) => s.type === "final" && stateNodeSet.has(s));
    }
    if (stateNode.type === "parallel") {
      return getChildren(stateNode).every((sn) => isInFinalState(stateNodeSet, sn));
    }
    return stateNode.type === "final";
  }
  const isStateId = (str) => str[0] === STATE_IDENTIFIER$1;
  function getCandidates(stateNode, receivedEventType) {
    const candidates = stateNode.transitions.get(receivedEventType) || [...stateNode.transitions.keys()].filter((eventDescriptor) => {
      if (eventDescriptor === WILDCARD) {
        return true;
      }
      if (!eventDescriptor.endsWith(".*")) {
        return false;
      }
      const partialEventTokens = eventDescriptor.split(".");
      const eventTokens = receivedEventType.split(".");
      for (let tokenIndex = 0; tokenIndex < partialEventTokens.length; tokenIndex++) {
        const partialEventToken = partialEventTokens[tokenIndex];
        const eventToken = eventTokens[tokenIndex];
        if (partialEventToken === "*") {
          const isLastToken = tokenIndex === partialEventTokens.length - 1;
          return isLastToken;
        }
        if (partialEventToken !== eventToken) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => b.length - a.length).flatMap((key) => stateNode.transitions.get(key));
    return candidates;
  }
  function getDelayedTransitions(stateNode) {
    const afterConfig = stateNode.config.after;
    if (!afterConfig) {
      return [];
    }
    const mutateEntryExit = (delay) => {
      const afterEvent = createAfterEvent(delay, stateNode.id);
      const eventType = afterEvent.type;
      stateNode.entry.push(raise(afterEvent, {
        id: eventType,
        delay
      }));
      stateNode.exit.push(cancel(eventType));
      return eventType;
    };
    const delayedTransitions = Object.keys(afterConfig).flatMap((delay) => {
      const configTransition = afterConfig[delay];
      const resolvedTransition = typeof configTransition === "string" ? {
        target: configTransition
      } : configTransition;
      const resolvedDelay = Number.isNaN(+delay) ? delay : +delay;
      const eventType = mutateEntryExit(resolvedDelay);
      return toArray(resolvedTransition).map((transition) => ({
        ...transition,
        event: eventType,
        delay: resolvedDelay
      }));
    });
    return delayedTransitions.map((delayedTransition) => {
      const {
        delay
      } = delayedTransition;
      return {
        ...formatTransition(stateNode, delayedTransition.event, delayedTransition),
        delay
      };
    });
  }
  function formatTransition(stateNode, descriptor, transitionConfig) {
    const normalizedTarget = normalizeTarget(transitionConfig.target);
    const reenter = transitionConfig.reenter ?? false;
    const target = resolveTarget(stateNode, normalizedTarget);
    const transition = {
      ...transitionConfig,
      actions: toArray(transitionConfig.actions),
      guard: transitionConfig.guard,
      target,
      source: stateNode,
      reenter,
      eventType: descriptor,
      toJSON: () => ({
        ...transition,
        source: `#${stateNode.id}`,
        target: target ? target.map((t) => `#${t.id}`) : void 0
      })
    };
    return transition;
  }
  function formatTransitions(stateNode) {
    const transitions = /* @__PURE__ */ new Map();
    if (stateNode.config.on) {
      for (const descriptor of Object.keys(stateNode.config.on)) {
        if (descriptor === NULL_EVENT) {
          throw new Error('Null events ("") cannot be specified as a transition key. Use `always: { ... }` instead.');
        }
        const transitionsConfig = stateNode.config.on[descriptor];
        transitions.set(descriptor, toTransitionConfigArray(transitionsConfig).map((t) => formatTransition(stateNode, descriptor, t)));
      }
    }
    if (stateNode.config.onDone) {
      const descriptor = `xstate.done.state.${stateNode.id}`;
      transitions.set(descriptor, toTransitionConfigArray(stateNode.config.onDone).map((t) => formatTransition(stateNode, descriptor, t)));
    }
    for (const invokeDef of stateNode.invoke) {
      if (invokeDef.onDone) {
        const descriptor = `xstate.done.actor.${invokeDef.id}`;
        transitions.set(descriptor, toTransitionConfigArray(invokeDef.onDone).map((t) => formatTransition(stateNode, descriptor, t)));
      }
      if (invokeDef.onError) {
        const descriptor = `xstate.error.actor.${invokeDef.id}`;
        transitions.set(descriptor, toTransitionConfigArray(invokeDef.onError).map((t) => formatTransition(stateNode, descriptor, t)));
      }
      if (invokeDef.onSnapshot) {
        const descriptor = `xstate.snapshot.${invokeDef.id}`;
        transitions.set(descriptor, toTransitionConfigArray(invokeDef.onSnapshot).map((t) => formatTransition(stateNode, descriptor, t)));
      }
    }
    for (const delayedTransition of stateNode.after) {
      let existing = transitions.get(delayedTransition.eventType);
      if (!existing) {
        existing = [];
        transitions.set(delayedTransition.eventType, existing);
      }
      existing.push(delayedTransition);
    }
    return transitions;
  }
  function formatInitialTransition(stateNode, _target) {
    const resolvedTarget = typeof _target === "string" ? stateNode.states[_target] : _target ? stateNode.states[_target.target] : void 0;
    if (!resolvedTarget && _target) {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string
        `Initial state node "${_target}" not found on parent state node #${stateNode.id}`
      );
    }
    const transition = {
      source: stateNode,
      actions: !_target || typeof _target === "string" ? [] : toArray(_target.actions),
      eventType: null,
      reenter: false,
      target: resolvedTarget ? [resolvedTarget] : [],
      toJSON: () => ({
        ...transition,
        source: `#${stateNode.id}`,
        target: resolvedTarget ? [`#${resolvedTarget.id}`] : []
      })
    };
    return transition;
  }
  function resolveTarget(stateNode, targets) {
    if (targets === void 0) {
      return void 0;
    }
    return targets.map((target) => {
      if (typeof target !== "string") {
        return target;
      }
      if (isStateId(target)) {
        return stateNode.machine.getStateNodeById(target);
      }
      const isInternalTarget = target[0] === STATE_DELIMITER;
      if (isInternalTarget && !stateNode.parent) {
        return getStateNodeByPath(stateNode, target.slice(1));
      }
      const resolvedTarget = isInternalTarget ? stateNode.key + target : target;
      if (stateNode.parent) {
        try {
          const targetStateNode = getStateNodeByPath(stateNode.parent, resolvedTarget);
          return targetStateNode;
        } catch (err) {
          throw new Error(`Invalid transition definition for state node '${stateNode.id}':
${err.message}`);
        }
      } else {
        throw new Error(`Invalid target: "${target}" is not a valid target from the root node. Did you mean ".${target}"?`);
      }
    });
  }
  function resolveHistoryDefaultTransition(stateNode) {
    const normalizedTarget = normalizeTarget(stateNode.config.target);
    if (!normalizedTarget) {
      return stateNode.parent.initial;
    }
    return {
      target: normalizedTarget.map((t) => typeof t === "string" ? getStateNodeByPath(stateNode.parent, t) : t)
    };
  }
  function isHistoryNode(stateNode) {
    return stateNode.type === "history";
  }
  function getInitialStateNodesWithTheirAncestors(stateNode) {
    const states = getInitialStateNodes(stateNode);
    for (const initialState of states) {
      for (const ancestor of getProperAncestors(initialState, stateNode)) {
        states.add(ancestor);
      }
    }
    return states;
  }
  function getInitialStateNodes(stateNode) {
    const set = /* @__PURE__ */ new Set();
    function iter(descStateNode) {
      if (set.has(descStateNode)) {
        return;
      }
      set.add(descStateNode);
      if (descStateNode.type === "compound") {
        iter(descStateNode.initial.target[0]);
      } else if (descStateNode.type === "parallel") {
        for (const child of getChildren(descStateNode)) {
          iter(child);
        }
      }
    }
    iter(stateNode);
    return set;
  }
  function getStateNode(stateNode, stateKey) {
    if (isStateId(stateKey)) {
      return stateNode.machine.getStateNodeById(stateKey);
    }
    if (!stateNode.states) {
      throw new Error(`Unable to retrieve child state '${stateKey}' from '${stateNode.id}'; no child states exist.`);
    }
    const result2 = stateNode.states[stateKey];
    if (!result2) {
      throw new Error(`Child state '${stateKey}' does not exist on '${stateNode.id}'`);
    }
    return result2;
  }
  function getStateNodeByPath(stateNode, statePath) {
    if (typeof statePath === "string" && isStateId(statePath)) {
      try {
        return stateNode.machine.getStateNodeById(statePath);
      } catch {
      }
    }
    const arrayStatePath = toStatePath(statePath).slice();
    let currentStateNode = stateNode;
    while (arrayStatePath.length) {
      const key = arrayStatePath.shift();
      if (!key.length) {
        break;
      }
      currentStateNode = getStateNode(currentStateNode, key);
    }
    return currentStateNode;
  }
  function getStateNodes(stateNode, stateValue) {
    if (typeof stateValue === "string") {
      const childStateNode = stateNode.states[stateValue];
      if (!childStateNode) {
        throw new Error(`State '${stateValue}' does not exist on '${stateNode.id}'`);
      }
      return [stateNode, childStateNode];
    }
    const childStateKeys = Object.keys(stateValue);
    const childStateNodes = childStateKeys.map((subStateKey) => getStateNode(stateNode, subStateKey)).filter(Boolean);
    return [stateNode.machine.root, stateNode].concat(childStateNodes, childStateKeys.reduce((allSubStateNodes, subStateKey) => {
      const subStateNode = getStateNode(stateNode, subStateKey);
      if (!subStateNode) {
        return allSubStateNodes;
      }
      const subStateNodes = getStateNodes(subStateNode, stateValue[subStateKey]);
      return allSubStateNodes.concat(subStateNodes);
    }, []));
  }
  function transitionAtomicNode(stateNode, stateValue, snapshot, event) {
    const childStateNode = getStateNode(stateNode, stateValue);
    const next = childStateNode.next(snapshot, event);
    if (!next || !next.length) {
      return stateNode.next(snapshot, event);
    }
    return next;
  }
  function transitionCompoundNode(stateNode, stateValue, snapshot, event) {
    const subStateKeys = Object.keys(stateValue);
    const childStateNode = getStateNode(stateNode, subStateKeys[0]);
    const next = transitionNode(childStateNode, stateValue[subStateKeys[0]], snapshot, event);
    if (!next || !next.length) {
      return stateNode.next(snapshot, event);
    }
    return next;
  }
  function transitionParallelNode(stateNode, stateValue, snapshot, event) {
    const allInnerTransitions = [];
    for (const subStateKey of Object.keys(stateValue)) {
      const subStateValue = stateValue[subStateKey];
      if (!subStateValue) {
        continue;
      }
      const subStateNode = getStateNode(stateNode, subStateKey);
      const innerTransitions = transitionNode(subStateNode, subStateValue, snapshot, event);
      if (innerTransitions) {
        allInnerTransitions.push(...innerTransitions);
      }
    }
    if (!allInnerTransitions.length) {
      return stateNode.next(snapshot, event);
    }
    return allInnerTransitions;
  }
  function transitionNode(stateNode, stateValue, snapshot, event) {
    if (typeof stateValue === "string") {
      return transitionAtomicNode(stateNode, stateValue, snapshot, event);
    }
    if (Object.keys(stateValue).length === 1) {
      return transitionCompoundNode(stateNode, stateValue, snapshot, event);
    }
    return transitionParallelNode(stateNode, stateValue, snapshot, event);
  }
  function getHistoryNodes(stateNode) {
    return Object.keys(stateNode.states).map((key) => stateNode.states[key]).filter((sn) => sn.type === "history");
  }
  function isDescendant(childStateNode, parentStateNode) {
    let marker = childStateNode;
    while (marker.parent && marker.parent !== parentStateNode) {
      marker = marker.parent;
    }
    return marker.parent === parentStateNode;
  }
  function hasIntersection(s1, s2) {
    const set1 = new Set(s1);
    const set2 = new Set(s2);
    for (const item of set1) {
      if (set2.has(item)) {
        return true;
      }
    }
    for (const item of set2) {
      if (set1.has(item)) {
        return true;
      }
    }
    return false;
  }
  function removeConflictingTransitions(enabledTransitions, stateNodeSet, historyValue) {
    const filteredTransitions = /* @__PURE__ */ new Set();
    for (const t1 of enabledTransitions) {
      let t1Preempted = false;
      const transitionsToRemove = /* @__PURE__ */ new Set();
      for (const t2 of filteredTransitions) {
        if (hasIntersection(computeExitSet([t1], stateNodeSet, historyValue), computeExitSet([t2], stateNodeSet, historyValue))) {
          if (isDescendant(t1.source, t2.source)) {
            transitionsToRemove.add(t2);
          } else {
            t1Preempted = true;
            break;
          }
        }
      }
      if (!t1Preempted) {
        for (const t3 of transitionsToRemove) {
          filteredTransitions.delete(t3);
        }
        filteredTransitions.add(t1);
      }
    }
    return Array.from(filteredTransitions);
  }
  function findLeastCommonAncestor(stateNodes) {
    const [head, ...tail] = stateNodes;
    for (const ancestor of getProperAncestors(head, void 0)) {
      if (tail.every((sn) => isDescendant(sn, ancestor))) {
        return ancestor;
      }
    }
  }
  function getEffectiveTargetStates(transition, historyValue) {
    if (!transition.target) {
      return [];
    }
    const targets = /* @__PURE__ */ new Set();
    for (const targetNode of transition.target) {
      if (isHistoryNode(targetNode)) {
        if (historyValue[targetNode.id]) {
          for (const node of historyValue[targetNode.id]) {
            targets.add(node);
          }
        } else {
          for (const node of getEffectiveTargetStates(resolveHistoryDefaultTransition(targetNode), historyValue)) {
            targets.add(node);
          }
        }
      } else {
        targets.add(targetNode);
      }
    }
    return [...targets];
  }
  function getTransitionDomain(transition, historyValue) {
    const targetStates = getEffectiveTargetStates(transition, historyValue);
    if (!targetStates) {
      return;
    }
    if (!transition.reenter && targetStates.every((target) => target === transition.source || isDescendant(target, transition.source))) {
      return transition.source;
    }
    const lca = findLeastCommonAncestor(targetStates.concat(transition.source));
    if (lca) {
      return lca;
    }
    if (transition.reenter) {
      return;
    }
    return transition.source.machine.root;
  }
  function computeExitSet(transitions, stateNodeSet, historyValue) {
    const statesToExit = /* @__PURE__ */ new Set();
    for (const t of transitions) {
      if (t.target?.length) {
        const domain = getTransitionDomain(t, historyValue);
        if (t.reenter && t.source === domain) {
          statesToExit.add(domain);
        }
        for (const stateNode of stateNodeSet) {
          if (isDescendant(stateNode, domain)) {
            statesToExit.add(stateNode);
          }
        }
      }
    }
    return [...statesToExit];
  }
  function areStateNodeCollectionsEqual(prevStateNodes, nextStateNodeSet) {
    if (prevStateNodes.length !== nextStateNodeSet.size) {
      return false;
    }
    for (const node of prevStateNodes) {
      if (!nextStateNodeSet.has(node)) {
        return false;
      }
    }
    return true;
  }
  function microstep(transitions, currentSnapshot, actorScope, event, isInitial, internalQueue) {
    if (!transitions.length) {
      return currentSnapshot;
    }
    const mutStateNodeSet = new Set(currentSnapshot._nodes);
    let historyValue = currentSnapshot.historyValue;
    const filteredTransitions = removeConflictingTransitions(transitions, mutStateNodeSet, historyValue);
    let nextState = currentSnapshot;
    if (!isInitial) {
      [nextState, historyValue] = exitStates(nextState, event, actorScope, filteredTransitions, mutStateNodeSet, historyValue, internalQueue, actorScope.actionExecutor);
    }
    nextState = resolveActionsAndContext(nextState, event, actorScope, filteredTransitions.flatMap((t) => t.actions), internalQueue, void 0);
    nextState = enterStates(nextState, event, actorScope, filteredTransitions, mutStateNodeSet, internalQueue, historyValue, isInitial);
    const nextStateNodes = [...mutStateNodeSet];
    if (nextState.status === "done") {
      nextState = resolveActionsAndContext(nextState, event, actorScope, nextStateNodes.sort((a, b) => b.order - a.order).flatMap((state) => state.exit), internalQueue, void 0);
    }
    try {
      if (historyValue === currentSnapshot.historyValue && areStateNodeCollectionsEqual(currentSnapshot._nodes, mutStateNodeSet)) {
        return nextState;
      }
      return cloneMachineSnapshot(nextState, {
        _nodes: nextStateNodes,
        historyValue
      });
    } catch (e) {
      throw e;
    }
  }
  function getMachineOutput(snapshot, event, actorScope, rootNode, rootCompletionNode) {
    if (rootNode.output === void 0) {
      return;
    }
    const doneStateEvent = createDoneStateEvent(rootCompletionNode.id, rootCompletionNode.output !== void 0 && rootCompletionNode.parent ? resolveOutput(rootCompletionNode.output, snapshot.context, event, actorScope.self) : void 0);
    return resolveOutput(rootNode.output, snapshot.context, doneStateEvent, actorScope.self);
  }
  function enterStates(currentSnapshot, event, actorScope, filteredTransitions, mutStateNodeSet, internalQueue, historyValue, isInitial) {
    let nextSnapshot = currentSnapshot;
    const statesToEnter = /* @__PURE__ */ new Set();
    const statesForDefaultEntry = /* @__PURE__ */ new Set();
    computeEntrySet(filteredTransitions, historyValue, statesForDefaultEntry, statesToEnter);
    if (isInitial) {
      statesForDefaultEntry.add(currentSnapshot.machine.root);
    }
    const completedNodes = /* @__PURE__ */ new Set();
    for (const stateNodeToEnter of [...statesToEnter].sort((a, b) => a.order - b.order)) {
      mutStateNodeSet.add(stateNodeToEnter);
      const actions = [];
      actions.push(...stateNodeToEnter.entry);
      for (const invokeDef of stateNodeToEnter.invoke) {
        actions.push(spawnChild(invokeDef.src, {
          ...invokeDef,
          syncSnapshot: !!invokeDef.onSnapshot
        }));
      }
      if (statesForDefaultEntry.has(stateNodeToEnter)) {
        const initialActions = stateNodeToEnter.initial.actions;
        actions.push(...initialActions);
      }
      nextSnapshot = resolveActionsAndContext(nextSnapshot, event, actorScope, actions, internalQueue, stateNodeToEnter.invoke.map((invokeDef) => invokeDef.id));
      if (stateNodeToEnter.type === "final") {
        const parent = stateNodeToEnter.parent;
        let ancestorMarker = parent?.type === "parallel" ? parent : parent?.parent;
        let rootCompletionNode = ancestorMarker || stateNodeToEnter;
        if (parent?.type === "compound") {
          internalQueue.push(createDoneStateEvent(parent.id, stateNodeToEnter.output !== void 0 ? resolveOutput(stateNodeToEnter.output, nextSnapshot.context, event, actorScope.self) : void 0));
        }
        while (ancestorMarker?.type === "parallel" && !completedNodes.has(ancestorMarker) && isInFinalState(mutStateNodeSet, ancestorMarker)) {
          completedNodes.add(ancestorMarker);
          internalQueue.push(createDoneStateEvent(ancestorMarker.id));
          rootCompletionNode = ancestorMarker;
          ancestorMarker = ancestorMarker.parent;
        }
        if (ancestorMarker) {
          continue;
        }
        nextSnapshot = cloneMachineSnapshot(nextSnapshot, {
          status: "done",
          output: getMachineOutput(nextSnapshot, event, actorScope, nextSnapshot.machine.root, rootCompletionNode)
        });
      }
    }
    return nextSnapshot;
  }
  function computeEntrySet(transitions, historyValue, statesForDefaultEntry, statesToEnter) {
    for (const t of transitions) {
      const domain = getTransitionDomain(t, historyValue);
      for (const s of t.target || []) {
        if (!isHistoryNode(s) && // if the target is different than the source then it will *definitely* be entered
        (t.source !== s || // we know that the domain can't lie within the source
        // if it's different than the source then it's outside of it and it means that the target has to be entered as well
        t.source !== domain || // reentering transitions always enter the target, even if it's the source itself
        t.reenter)) {
          statesToEnter.add(s);
          statesForDefaultEntry.add(s);
        }
        addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
      }
      const targetStates = getEffectiveTargetStates(t, historyValue);
      for (const s of targetStates) {
        const ancestors = getProperAncestors(s, domain);
        if (domain?.type === "parallel") {
          ancestors.push(domain);
        }
        addAncestorStatesToEnter(statesToEnter, historyValue, statesForDefaultEntry, ancestors, !t.source.parent && t.reenter ? void 0 : domain);
      }
    }
  }
  function addDescendantStatesToEnter(stateNode, historyValue, statesForDefaultEntry, statesToEnter) {
    if (isHistoryNode(stateNode)) {
      if (historyValue[stateNode.id]) {
        const historyStateNodes = historyValue[stateNode.id];
        for (const s of historyStateNodes) {
          statesToEnter.add(s);
          addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
        }
        for (const s of historyStateNodes) {
          addProperAncestorStatesToEnter(s, stateNode.parent, statesToEnter, historyValue, statesForDefaultEntry);
        }
      } else {
        const historyDefaultTransition = resolveHistoryDefaultTransition(stateNode);
        for (const s of historyDefaultTransition.target) {
          statesToEnter.add(s);
          if (historyDefaultTransition === stateNode.parent?.initial) {
            statesForDefaultEntry.add(stateNode.parent);
          }
          addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
        }
        for (const s of historyDefaultTransition.target) {
          addProperAncestorStatesToEnter(s, stateNode.parent, statesToEnter, historyValue, statesForDefaultEntry);
        }
      }
    } else {
      if (stateNode.type === "compound") {
        const [initialState] = stateNode.initial.target;
        if (!isHistoryNode(initialState)) {
          statesToEnter.add(initialState);
          statesForDefaultEntry.add(initialState);
        }
        addDescendantStatesToEnter(initialState, historyValue, statesForDefaultEntry, statesToEnter);
        addProperAncestorStatesToEnter(initialState, stateNode, statesToEnter, historyValue, statesForDefaultEntry);
      } else {
        if (stateNode.type === "parallel") {
          for (const child of getChildren(stateNode).filter((sn) => !isHistoryNode(sn))) {
            if (![...statesToEnter].some((s) => isDescendant(s, child))) {
              if (!isHistoryNode(child)) {
                statesToEnter.add(child);
                statesForDefaultEntry.add(child);
              }
              addDescendantStatesToEnter(child, historyValue, statesForDefaultEntry, statesToEnter);
            }
          }
        }
      }
    }
  }
  function addAncestorStatesToEnter(statesToEnter, historyValue, statesForDefaultEntry, ancestors, reentrancyDomain) {
    for (const anc of ancestors) {
      if (!reentrancyDomain || isDescendant(anc, reentrancyDomain)) {
        statesToEnter.add(anc);
      }
      if (anc.type === "parallel") {
        for (const child of getChildren(anc).filter((sn) => !isHistoryNode(sn))) {
          if (![...statesToEnter].some((s) => isDescendant(s, child))) {
            statesToEnter.add(child);
            addDescendantStatesToEnter(child, historyValue, statesForDefaultEntry, statesToEnter);
          }
        }
      }
    }
  }
  function addProperAncestorStatesToEnter(stateNode, toStateNode, statesToEnter, historyValue, statesForDefaultEntry) {
    addAncestorStatesToEnter(statesToEnter, historyValue, statesForDefaultEntry, getProperAncestors(stateNode, toStateNode));
  }
  function exitStates(currentSnapshot, event, actorScope, transitions, mutStateNodeSet, historyValue, internalQueue, _actionExecutor) {
    let nextSnapshot = currentSnapshot;
    const statesToExit = computeExitSet(transitions, mutStateNodeSet, historyValue);
    statesToExit.sort((a, b) => b.order - a.order);
    let changedHistory;
    for (const exitStateNode of statesToExit) {
      for (const historyNode of getHistoryNodes(exitStateNode)) {
        let predicate;
        if (historyNode.history === "deep") {
          predicate = (sn) => isAtomicStateNode(sn) && isDescendant(sn, exitStateNode);
        } else {
          predicate = (sn) => {
            return sn.parent === exitStateNode;
          };
        }
        changedHistory ??= {
          ...historyValue
        };
        changedHistory[historyNode.id] = Array.from(mutStateNodeSet).filter(predicate);
      }
    }
    for (const s of statesToExit) {
      nextSnapshot = resolveActionsAndContext(nextSnapshot, event, actorScope, [...s.exit, ...s.invoke.map((def) => stopChild(def.id))], internalQueue, void 0);
      mutStateNodeSet.delete(s);
    }
    return [nextSnapshot, changedHistory || historyValue];
  }
  function getAction(machine, actionType) {
    return machine.implementations.actions[actionType];
  }
  function resolveAndExecuteActionsWithContext(currentSnapshot, event, actorScope, actions, extra, retries) {
    const {
      machine
    } = currentSnapshot;
    let intermediateSnapshot = currentSnapshot;
    for (const action of actions) {
      const isInline = typeof action === "function";
      const resolvedAction = isInline ? action : (
        // the existing type of `.actions` assumes non-nullable `TExpressionAction`
        // it's fine to cast this here to get a common type and lack of errors in the rest of the code
        // our logic below makes sure that we call those 2 "variants" correctly
        getAction(machine, typeof action === "string" ? action : action.type)
      );
      const actionArgs = {
        context: intermediateSnapshot.context,
        event,
        self: actorScope.self,
        system: actorScope.system
      };
      const actionParams = isInline || typeof action === "string" ? void 0 : "params" in action ? typeof action.params === "function" ? action.params({
        context: intermediateSnapshot.context,
        event
      }) : action.params : void 0;
      if (!resolvedAction || !("resolve" in resolvedAction)) {
        actorScope.actionExecutor({
          type: typeof action === "string" ? action : typeof action === "object" ? action.type : action.name || "(anonymous)",
          info: actionArgs,
          params: actionParams,
          exec: resolvedAction
        });
        continue;
      }
      const builtinAction = resolvedAction;
      const [nextState, params, actions2] = builtinAction.resolve(
        actorScope,
        intermediateSnapshot,
        actionArgs,
        actionParams,
        resolvedAction,
        // this holds all params
        extra
      );
      intermediateSnapshot = nextState;
      if ("retryResolve" in builtinAction) {
        retries?.push([builtinAction, params]);
      }
      if ("execute" in builtinAction) {
        actorScope.actionExecutor({
          type: builtinAction.type,
          info: actionArgs,
          params,
          exec: builtinAction.execute.bind(null, actorScope, params)
        });
      }
      if (actions2) {
        intermediateSnapshot = resolveAndExecuteActionsWithContext(intermediateSnapshot, event, actorScope, actions2, extra, retries);
      }
    }
    return intermediateSnapshot;
  }
  function resolveActionsAndContext(currentSnapshot, event, actorScope, actions, internalQueue, deferredActorIds) {
    const retries = deferredActorIds ? [] : void 0;
    const nextState = resolveAndExecuteActionsWithContext(currentSnapshot, event, actorScope, actions, {
      internalQueue,
      deferredActorIds
    }, retries);
    retries?.forEach(([builtinAction, params]) => {
      builtinAction.retryResolve(actorScope, nextState, params);
    });
    return nextState;
  }
  function macrostep(snapshot, event, actorScope, internalQueue) {
    let nextSnapshot = snapshot;
    const microstates = [];
    function addMicrostate(microstate, event2, transitions) {
      actorScope.system._sendInspectionEvent({
        type: "@xstate.microstep",
        actorRef: actorScope.self,
        event: event2,
        snapshot: microstate,
        _transitions: transitions
      });
      microstates.push(microstate);
    }
    if (event.type === XSTATE_STOP) {
      nextSnapshot = cloneMachineSnapshot(stopChildren(nextSnapshot, event, actorScope), {
        status: "stopped"
      });
      addMicrostate(nextSnapshot, event, []);
      return {
        snapshot: nextSnapshot,
        microstates
      };
    }
    let nextEvent = event;
    if (nextEvent.type !== XSTATE_INIT) {
      const currentEvent = nextEvent;
      const isErr = isErrorActorEvent(currentEvent);
      const transitions = selectTransitions(currentEvent, nextSnapshot);
      if (isErr && !transitions.length) {
        nextSnapshot = cloneMachineSnapshot(snapshot, {
          status: "error",
          error: currentEvent.error
        });
        addMicrostate(nextSnapshot, currentEvent, []);
        return {
          snapshot: nextSnapshot,
          microstates
        };
      }
      nextSnapshot = microstep(
        transitions,
        snapshot,
        actorScope,
        nextEvent,
        false,
        // isInitial
        internalQueue
      );
      addMicrostate(nextSnapshot, currentEvent, transitions);
    }
    let shouldSelectEventlessTransitions = true;
    while (nextSnapshot.status === "active") {
      let enabledTransitions = shouldSelectEventlessTransitions ? selectEventlessTransitions(nextSnapshot, nextEvent) : [];
      const previousState = enabledTransitions.length ? nextSnapshot : void 0;
      if (!enabledTransitions.length) {
        if (!internalQueue.length) {
          break;
        }
        nextEvent = internalQueue.shift();
        enabledTransitions = selectTransitions(nextEvent, nextSnapshot);
      }
      nextSnapshot = microstep(enabledTransitions, nextSnapshot, actorScope, nextEvent, false, internalQueue);
      shouldSelectEventlessTransitions = nextSnapshot !== previousState;
      addMicrostate(nextSnapshot, nextEvent, enabledTransitions);
    }
    if (nextSnapshot.status !== "active") {
      stopChildren(nextSnapshot, nextEvent, actorScope);
    }
    return {
      snapshot: nextSnapshot,
      microstates
    };
  }
  function stopChildren(nextState, event, actorScope) {
    return resolveActionsAndContext(nextState, event, actorScope, Object.values(nextState.children).map((child) => stopChild(child)), [], void 0);
  }
  function selectTransitions(event, nextState) {
    return nextState.machine.getTransitionData(nextState, event);
  }
  function selectEventlessTransitions(nextState, event) {
    const enabledTransitionSet = /* @__PURE__ */ new Set();
    const atomicStates = nextState._nodes.filter(isAtomicStateNode);
    for (const stateNode of atomicStates) {
      loop: for (const s of [stateNode].concat(getProperAncestors(stateNode, void 0))) {
        if (!s.always) {
          continue;
        }
        for (const transition of s.always) {
          if (transition.guard === void 0 || evaluateGuard(transition.guard, nextState.context, event, nextState)) {
            enabledTransitionSet.add(transition);
            break loop;
          }
        }
      }
    }
    return removeConflictingTransitions(Array.from(enabledTransitionSet), new Set(nextState._nodes), nextState.historyValue);
  }
  function resolveStateValue(rootNode, stateValue) {
    const allStateNodes = getAllStateNodes(getStateNodes(rootNode, stateValue));
    return getStateValue(rootNode, [...allStateNodes]);
  }
  function isMachineSnapshot(value) {
    return !!value && typeof value === "object" && "machine" in value && "value" in value;
  }
  const machineSnapshotMatches = function matches(testValue) {
    return matchesState(testValue, this.value);
  };
  const machineSnapshotHasTag = function hasTag(tag) {
    return this.tags.has(tag);
  };
  const machineSnapshotCan = function can(event) {
    const transitionData = this.machine.getTransitionData(this, event);
    return !!transitionData?.length && // Check that at least one transition is not forbidden
    transitionData.some((t) => t.target !== void 0 || t.actions.length);
  };
  const machineSnapshotToJSON = function toJSON() {
    const {
      _nodes: nodes,
      tags,
      machine,
      getMeta,
      toJSON: toJSON2,
      can,
      hasTag,
      matches,
      ...jsonValues
    } = this;
    return {
      ...jsonValues,
      tags: Array.from(tags)
    };
  };
  const machineSnapshotGetMeta = function getMeta() {
    return this._nodes.reduce((acc, stateNode) => {
      if (stateNode.meta !== void 0) {
        acc[stateNode.id] = stateNode.meta;
      }
      return acc;
    }, {});
  };
  function createMachineSnapshot(config, machine) {
    return {
      status: config.status,
      output: config.output,
      error: config.error,
      machine,
      context: config.context,
      _nodes: config._nodes,
      value: getStateValue(machine.root, config._nodes),
      tags: new Set(config._nodes.flatMap((sn) => sn.tags)),
      children: config.children,
      historyValue: config.historyValue || {},
      matches: machineSnapshotMatches,
      hasTag: machineSnapshotHasTag,
      can: machineSnapshotCan,
      getMeta: machineSnapshotGetMeta,
      toJSON: machineSnapshotToJSON
    };
  }
  function cloneMachineSnapshot(snapshot, config = {}) {
    return createMachineSnapshot({
      ...snapshot,
      ...config
    }, snapshot.machine);
  }
  function serializeHistoryValue(historyValue) {
    if (typeof historyValue !== "object" || historyValue === null) {
      return {};
    }
    const result2 = {};
    for (const key in historyValue) {
      const value = historyValue[key];
      if (Array.isArray(value)) {
        result2[key] = value.map((item) => ({
          id: item.id
        }));
      }
    }
    return result2;
  }
  function getPersistedSnapshot(snapshot, options) {
    const {
      _nodes: nodes,
      tags,
      machine,
      children,
      context,
      can,
      hasTag,
      matches,
      getMeta,
      toJSON,
      ...jsonValues
    } = snapshot;
    const childrenJson = {};
    for (const id in children) {
      const child = children[id];
      childrenJson[id] = {
        snapshot: child.getPersistedSnapshot(options),
        src: child.src,
        systemId: child.systemId,
        syncSnapshot: child._syncSnapshot
      };
    }
    const persisted = {
      ...jsonValues,
      context: persistContext(context),
      children: childrenJson,
      historyValue: serializeHistoryValue(jsonValues.historyValue)
    };
    return persisted;
  }
  function persistContext(contextPart) {
    let copy;
    for (const key in contextPart) {
      const value = contextPart[key];
      if (value && typeof value === "object") {
        if ("sessionId" in value && "send" in value && "ref" in value) {
          copy ??= Array.isArray(contextPart) ? contextPart.slice() : {
            ...contextPart
          };
          copy[key] = {
            xstate$$type: $$ACTOR_TYPE,
            id: value.id
          };
        } else {
          const result2 = persistContext(value);
          if (result2 !== value) {
            copy ??= Array.isArray(contextPart) ? contextPart.slice() : {
              ...contextPart
            };
            copy[key] = result2;
          }
        }
      }
    }
    return copy ?? contextPart;
  }
  function resolveRaise(_, snapshot, args, actionParams, {
    event: eventOrExpr,
    id,
    delay
  }, {
    internalQueue
  }) {
    const delaysMap = snapshot.machine.implementations.delays;
    if (typeof eventOrExpr === "string") {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Only event objects may be used with raise; use raise({ type: "${eventOrExpr}" }) instead`
      );
    }
    const resolvedEvent = typeof eventOrExpr === "function" ? eventOrExpr(args, actionParams) : eventOrExpr;
    let resolvedDelay;
    if (typeof delay === "string") {
      const configDelay = delaysMap && delaysMap[delay];
      resolvedDelay = typeof configDelay === "function" ? configDelay(args, actionParams) : configDelay;
    } else {
      resolvedDelay = typeof delay === "function" ? delay(args, actionParams) : delay;
    }
    if (typeof resolvedDelay !== "number") {
      internalQueue.push(resolvedEvent);
    }
    return [snapshot, {
      event: resolvedEvent,
      id,
      delay: resolvedDelay
    }, void 0];
  }
  function executeRaise(actorScope, params) {
    const {
      event,
      delay,
      id
    } = params;
    if (typeof delay === "number") {
      actorScope.defer(() => {
        const self2 = actorScope.self;
        actorScope.system.scheduler.schedule(self2, self2, event, delay, id);
      });
      return;
    }
  }
  function raise(eventOrExpr, options) {
    function raise2(_args, _params) {
    }
    raise2.type = "xstate.raise";
    raise2.event = eventOrExpr;
    raise2.id = options?.id;
    raise2.delay = options?.delay;
    raise2.resolve = resolveRaise;
    raise2.execute = executeRaise;
    return raise2;
  }
  function createSpawner(actorScope, {
    machine,
    context
  }, event, spawnedChildren) {
    const spawn = (src, options) => {
      if (typeof src === "string") {
        const logic = resolveReferencedActor(machine, src);
        if (!logic) {
          throw new Error(`Actor logic '${src}' not implemented in machine '${machine.id}'`);
        }
        const actorRef = createActor(logic, {
          id: options?.id,
          parent: actorScope.self,
          syncSnapshot: options?.syncSnapshot,
          input: typeof options?.input === "function" ? options.input({
            context,
            event,
            self: actorScope.self
          }) : options?.input,
          src,
          systemId: options?.systemId
        });
        spawnedChildren[actorRef.id] = actorRef;
        return actorRef;
      } else {
        const actorRef = createActor(src, {
          id: options?.id,
          parent: actorScope.self,
          syncSnapshot: options?.syncSnapshot,
          input: options?.input,
          src,
          systemId: options?.systemId
        });
        return actorRef;
      }
    };
    return (src, options) => {
      const actorRef = spawn(src, options);
      spawnedChildren[actorRef.id] = actorRef;
      actorScope.defer(() => {
        if (actorRef._processingStatus === ProcessingStatus.Stopped) {
          return;
        }
        actorRef.start();
      });
      return actorRef;
    };
  }
  function resolveAssign(actorScope, snapshot, actionArgs, actionParams, {
    assignment
  }) {
    if (!snapshot.context) {
      throw new Error("Cannot assign to undefined `context`. Ensure that `context` is defined in the machine config.");
    }
    const spawnedChildren = {};
    const assignArgs = {
      context: snapshot.context,
      event: actionArgs.event,
      spawn: createSpawner(actorScope, snapshot, actionArgs.event, spawnedChildren),
      self: actorScope.self,
      system: actorScope.system
    };
    let partialUpdate = {};
    if (typeof assignment === "function") {
      partialUpdate = assignment(assignArgs, actionParams);
    } else {
      for (const key of Object.keys(assignment)) {
        const propAssignment = assignment[key];
        partialUpdate[key] = typeof propAssignment === "function" ? propAssignment(assignArgs, actionParams) : propAssignment;
      }
    }
    const updatedContext = Object.assign({}, snapshot.context, partialUpdate);
    return [cloneMachineSnapshot(snapshot, {
      context: updatedContext,
      children: Object.keys(spawnedChildren).length ? {
        ...snapshot.children,
        ...spawnedChildren
      } : snapshot.children
    }), void 0, void 0];
  }
  function assign(assignment) {
    function assign2(_args, _params) {
    }
    assign2.type = "xstate.assign";
    assign2.assignment = assignment;
    assign2.resolve = resolveAssign;
    return assign2;
  }
  const cache = /* @__PURE__ */ new WeakMap();
  function memo(object, key, fn) {
    let memoizedData = cache.get(object);
    if (!memoizedData) {
      memoizedData = {
        [key]: fn()
      };
      cache.set(object, memoizedData);
    } else if (!(key in memoizedData)) {
      memoizedData[key] = fn();
    }
    return memoizedData[key];
  }
  const EMPTY_OBJECT = {};
  const toSerializableAction = (action) => {
    if (typeof action === "string") {
      return {
        type: action
      };
    }
    if (typeof action === "function") {
      if ("resolve" in action) {
        return {
          type: action.type
        };
      }
      return {
        type: action.name
      };
    }
    return action;
  };
  class StateNode {
    constructor(config, options) {
      this.config = config;
      this.key = void 0;
      this.id = void 0;
      this.type = void 0;
      this.path = void 0;
      this.states = void 0;
      this.history = void 0;
      this.entry = void 0;
      this.exit = void 0;
      this.parent = void 0;
      this.machine = void 0;
      this.meta = void 0;
      this.output = void 0;
      this.order = -1;
      this.description = void 0;
      this.tags = [];
      this.transitions = void 0;
      this.always = void 0;
      this.parent = options._parent;
      this.key = options._key;
      this.machine = options._machine;
      this.path = this.parent ? this.parent.path.concat(this.key) : [];
      this.id = this.config.id || [this.machine.id, ...this.path].join(STATE_DELIMITER);
      this.type = this.config.type || (this.config.states && Object.keys(this.config.states).length ? "compound" : this.config.history ? "history" : "atomic");
      this.description = this.config.description;
      this.order = this.machine.idMap.size;
      this.machine.idMap.set(this.id, this);
      this.states = this.config.states ? mapValues(this.config.states, (stateConfig, key) => {
        const stateNode = new StateNode(stateConfig, {
          _parent: this,
          _key: key,
          _machine: this.machine
        });
        return stateNode;
      }) : EMPTY_OBJECT;
      if (this.type === "compound" && !this.config.initial) {
        throw new Error(`No initial state specified for compound state node "#${this.id}". Try adding { initial: "${Object.keys(this.states)[0]}" } to the state config.`);
      }
      this.history = this.config.history === true ? "shallow" : this.config.history || false;
      this.entry = toArray(this.config.entry).slice();
      this.exit = toArray(this.config.exit).slice();
      this.meta = this.config.meta;
      this.output = this.type === "final" || !this.parent ? this.config.output : void 0;
      this.tags = toArray(config.tags).slice();
    }
    /** @internal */
    _initialize() {
      this.transitions = formatTransitions(this);
      if (this.config.always) {
        this.always = toTransitionConfigArray(this.config.always).map((t) => formatTransition(this, NULL_EVENT, t));
      }
      Object.keys(this.states).forEach((key) => {
        this.states[key]._initialize();
      });
    }
    /** The well-structured state node definition. */
    get definition() {
      return {
        id: this.id,
        key: this.key,
        version: this.machine.version,
        type: this.type,
        initial: this.initial ? {
          target: this.initial.target,
          source: this,
          actions: this.initial.actions.map(toSerializableAction),
          eventType: null,
          reenter: false,
          toJSON: () => ({
            target: this.initial.target.map((t) => `#${t.id}`),
            source: `#${this.id}`,
            actions: this.initial.actions.map(toSerializableAction),
            eventType: null
          })
        } : void 0,
        history: this.history,
        states: mapValues(this.states, (state) => {
          return state.definition;
        }),
        on: this.on,
        transitions: [...this.transitions.values()].flat().map((t) => ({
          ...t,
          actions: t.actions.map(toSerializableAction)
        })),
        entry: this.entry.map(toSerializableAction),
        exit: this.exit.map(toSerializableAction),
        meta: this.meta,
        order: this.order || -1,
        output: this.output,
        invoke: this.invoke,
        description: this.description,
        tags: this.tags
      };
    }
    /** @internal */
    toJSON() {
      return this.definition;
    }
    /** The logic invoked as actors by this state node. */
    get invoke() {
      return memo(this, "invoke", () => toArray(this.config.invoke).map((invokeConfig, i) => {
        const {
          src,
          systemId
        } = invokeConfig;
        const resolvedId = invokeConfig.id ?? createInvokeId(this.id, i);
        const sourceName = typeof src === "string" ? src : `xstate.invoke.${createInvokeId(this.id, i)}`;
        return {
          ...invokeConfig,
          src: sourceName,
          id: resolvedId,
          systemId,
          toJSON() {
            const {
              onDone,
              onError,
              ...invokeDefValues
            } = invokeConfig;
            return {
              ...invokeDefValues,
              type: "xstate.invoke",
              src: sourceName,
              id: resolvedId
            };
          }
        };
      }));
    }
    /** The mapping of events to transitions. */
    get on() {
      return memo(this, "on", () => {
        const transitions = this.transitions;
        return [...transitions].flatMap(([descriptor, t]) => t.map((t2) => [descriptor, t2])).reduce((map, [descriptor, transition]) => {
          map[descriptor] = map[descriptor] || [];
          map[descriptor].push(transition);
          return map;
        }, {});
      });
    }
    get after() {
      return memo(this, "delayedTransitions", () => getDelayedTransitions(this));
    }
    get initial() {
      return memo(this, "initial", () => formatInitialTransition(this, this.config.initial));
    }
    /** @internal */
    next(snapshot, event) {
      const eventType = event.type;
      const actions = [];
      let selectedTransition;
      const candidates = memo(this, `candidates-${eventType}`, () => getCandidates(this, eventType));
      for (const candidate of candidates) {
        const {
          guard
        } = candidate;
        const resolvedContext = snapshot.context;
        let guardPassed = false;
        try {
          guardPassed = !guard || evaluateGuard(guard, resolvedContext, event, snapshot);
        } catch (err) {
          const guardType = typeof guard === "string" ? guard : typeof guard === "object" ? guard.type : void 0;
          throw new Error(`Unable to evaluate guard ${guardType ? `'${guardType}' ` : ""}in transition for event '${eventType}' in state node '${this.id}':
${err.message}`);
        }
        if (guardPassed) {
          actions.push(...candidate.actions);
          selectedTransition = candidate;
          break;
        }
      }
      return selectedTransition ? [selectedTransition] : void 0;
    }
    /** All the event types accepted by this state node and its descendants. */
    get events() {
      return memo(this, "events", () => {
        const {
          states
        } = this;
        const events = new Set(this.ownEvents);
        if (states) {
          for (const stateId of Object.keys(states)) {
            const state = states[stateId];
            if (state.states) {
              for (const event of state.events) {
                events.add(`${event}`);
              }
            }
          }
        }
        return Array.from(events);
      });
    }
    /**
     * All the events that have transitions directly from this state node.
     *
     * Excludes any inert events.
     */
    get ownEvents() {
      const events = new Set([...this.transitions.keys()].filter((descriptor) => {
        return this.transitions.get(descriptor).some((transition) => !(!transition.target && !transition.actions.length && !transition.reenter));
      }));
      return Array.from(events);
    }
  }
  const STATE_IDENTIFIER = "#";
  class StateMachine {
    constructor(config, implementations) {
      this.config = config;
      this.version = void 0;
      this.schemas = void 0;
      this.implementations = void 0;
      this.__xstatenode = true;
      this.idMap = /* @__PURE__ */ new Map();
      this.root = void 0;
      this.id = void 0;
      this.states = void 0;
      this.events = void 0;
      this.id = config.id || "(machine)";
      this.implementations = {
        actors: implementations?.actors ?? {},
        actions: implementations?.actions ?? {},
        delays: implementations?.delays ?? {},
        guards: implementations?.guards ?? {}
      };
      this.version = this.config.version;
      this.schemas = this.config.schemas;
      this.transition = this.transition.bind(this);
      this.getInitialSnapshot = this.getInitialSnapshot.bind(this);
      this.getPersistedSnapshot = this.getPersistedSnapshot.bind(this);
      this.restoreSnapshot = this.restoreSnapshot.bind(this);
      this.start = this.start.bind(this);
      this.root = new StateNode(config, {
        _key: this.id,
        _machine: this
      });
      this.root._initialize();
      this.states = this.root.states;
      this.events = this.root.events;
    }
    /**
     * Clones this state machine with the provided implementations.
     *
     * @param implementations Options (`actions`, `guards`, `actors`, `delays`) to
     *   recursively merge with the existing options.
     * @returns A new `StateMachine` instance with the provided implementations.
     */
    provide(implementations) {
      const {
        actions,
        guards,
        actors,
        delays
      } = this.implementations;
      return new StateMachine(this.config, {
        actions: {
          ...actions,
          ...implementations.actions
        },
        guards: {
          ...guards,
          ...implementations.guards
        },
        actors: {
          ...actors,
          ...implementations.actors
        },
        delays: {
          ...delays,
          ...implementations.delays
        }
      });
    }
    resolveState(config) {
      const resolvedStateValue = resolveStateValue(this.root, config.value);
      const nodeSet = getAllStateNodes(getStateNodes(this.root, resolvedStateValue));
      return createMachineSnapshot({
        _nodes: [...nodeSet],
        context: config.context || {},
        children: {},
        status: isInFinalState(nodeSet, this.root) ? "done" : config.status || "active",
        output: config.output,
        error: config.error,
        historyValue: config.historyValue
      }, this);
    }
    /**
     * Determines the next snapshot given the current `snapshot` and received
     * `event`. Calculates a full macrostep from all microsteps.
     *
     * @param snapshot The current snapshot
     * @param event The received event
     */
    transition(snapshot, event, actorScope) {
      return macrostep(snapshot, event, actorScope, []).snapshot;
    }
    /**
     * Determines the next state given the current `state` and `event`. Calculates
     * a microstep.
     *
     * @param state The current state
     * @param event The received event
     */
    microstep(snapshot, event, actorScope) {
      return macrostep(snapshot, event, actorScope, []).microstates;
    }
    getTransitionData(snapshot, event) {
      return transitionNode(this.root, snapshot.value, snapshot, event) || [];
    }
    /**
     * The initial state _before_ evaluating any microsteps. This "pre-initial"
     * state is provided to initial actions executed in the initial state.
     */
    getPreInitialState(actorScope, initEvent, internalQueue) {
      const {
        context
      } = this.config;
      const preInitial = createMachineSnapshot({
        context: typeof context !== "function" && context ? context : {},
        _nodes: [this.root],
        children: {},
        status: "active"
      }, this);
      if (typeof context === "function") {
        const assignment = ({
          spawn,
          event,
          self: self2
        }) => context({
          spawn,
          input: event.input,
          self: self2
        });
        return resolveActionsAndContext(preInitial, initEvent, actorScope, [assign(assignment)], internalQueue, void 0);
      }
      return preInitial;
    }
    /**
     * Returns the initial `State` instance, with reference to `self` as an
     * `ActorRef`.
     */
    getInitialSnapshot(actorScope, input) {
      const initEvent = createInitEvent(input);
      const internalQueue = [];
      const preInitialState = this.getPreInitialState(actorScope, initEvent, internalQueue);
      const nextState = microstep([{
        target: [...getInitialStateNodes(this.root)],
        source: this.root,
        reenter: true,
        actions: [],
        eventType: null,
        toJSON: null
        // TODO: fix
      }], preInitialState, actorScope, initEvent, true, internalQueue);
      const {
        snapshot: macroState
      } = macrostep(nextState, initEvent, actorScope, internalQueue);
      return macroState;
    }
    start(snapshot) {
      Object.values(snapshot.children).forEach((child) => {
        if (child.getSnapshot().status === "active") {
          child.start();
        }
      });
    }
    getStateNodeById(stateId) {
      const fullPath = toStatePath(stateId);
      const relativePath = fullPath.slice(1);
      const resolvedStateId = isStateId(fullPath[0]) ? fullPath[0].slice(STATE_IDENTIFIER.length) : fullPath[0];
      const stateNode = this.idMap.get(resolvedStateId);
      if (!stateNode) {
        throw new Error(`Child state node '#${resolvedStateId}' does not exist on machine '${this.id}'`);
      }
      return getStateNodeByPath(stateNode, relativePath);
    }
    get definition() {
      return this.root.definition;
    }
    toJSON() {
      return this.definition;
    }
    getPersistedSnapshot(snapshot, options) {
      return getPersistedSnapshot(snapshot, options);
    }
    restoreSnapshot(snapshot, _actorScope) {
      const children = {};
      const snapshotChildren = snapshot.children;
      Object.keys(snapshotChildren).forEach((actorId) => {
        const actorData = snapshotChildren[actorId];
        const childState = actorData.snapshot;
        const src = actorData.src;
        const logic = typeof src === "string" ? resolveReferencedActor(this, src) : src;
        if (!logic) {
          return;
        }
        const actorRef = createActor(logic, {
          id: actorId,
          parent: _actorScope.self,
          syncSnapshot: actorData.syncSnapshot,
          snapshot: childState,
          src,
          systemId: actorData.systemId
        });
        children[actorId] = actorRef;
      });
      function resolveHistoryReferencedState(root, referenced) {
        if (referenced instanceof StateNode) {
          return referenced;
        }
        try {
          return root.machine.getStateNodeById(referenced.id);
        } catch {
        }
      }
      function reviveHistoryValue(root, historyValue) {
        if (!historyValue || typeof historyValue !== "object") {
          return {};
        }
        const revived = {};
        for (const key in historyValue) {
          const arr = historyValue[key];
          for (const item of arr) {
            const resolved = resolveHistoryReferencedState(root, item);
            if (!resolved) {
              continue;
            }
            revived[key] ??= [];
            revived[key].push(resolved);
          }
        }
        return revived;
      }
      const revivedHistoryValue = reviveHistoryValue(this.root, snapshot.historyValue);
      const restoredSnapshot = createMachineSnapshot({
        ...snapshot,
        children,
        _nodes: Array.from(getAllStateNodes(getStateNodes(this.root, snapshot.value))),
        historyValue: revivedHistoryValue
      }, this);
      const seen = /* @__PURE__ */ new Set();
      function reviveContext(contextPart, children2) {
        if (seen.has(contextPart)) {
          return;
        }
        seen.add(contextPart);
        for (const key in contextPart) {
          const value = contextPart[key];
          if (value && typeof value === "object") {
            if ("xstate$$type" in value && value.xstate$$type === $$ACTOR_TYPE) {
              contextPart[key] = children2[value.id];
              continue;
            }
            reviveContext(value, children2);
          }
        }
      }
      reviveContext(restoredSnapshot.context, children);
      return restoredSnapshot;
    }
  }
  function resolveEmit(_, snapshot, args, actionParams, {
    event: eventOrExpr
  }) {
    const resolvedEvent = typeof eventOrExpr === "function" ? eventOrExpr(args, actionParams) : eventOrExpr;
    return [snapshot, {
      event: resolvedEvent
    }, void 0];
  }
  function executeEmit(actorScope, {
    event
  }) {
    actorScope.defer(() => actorScope.emit(event));
  }
  function emit(eventOrExpr) {
    function emit2(_args, _params) {
    }
    emit2.type = "xstate.emit";
    emit2.event = eventOrExpr;
    emit2.resolve = resolveEmit;
    emit2.execute = executeEmit;
    return emit2;
  }
  let SpecialTargets = /* @__PURE__ */ (function(SpecialTargets2) {
    SpecialTargets2["Parent"] = "#_parent";
    SpecialTargets2["Internal"] = "#_internal";
    return SpecialTargets2;
  })({});
  function resolveSendTo(actorScope, snapshot, args, actionParams, {
    to,
    event: eventOrExpr,
    id,
    delay
  }, extra) {
    const delaysMap = snapshot.machine.implementations.delays;
    if (typeof eventOrExpr === "string") {
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `Only event objects may be used with sendTo; use sendTo({ type: "${eventOrExpr}" }) instead`
      );
    }
    const resolvedEvent = typeof eventOrExpr === "function" ? eventOrExpr(args, actionParams) : eventOrExpr;
    let resolvedDelay;
    if (typeof delay === "string") {
      const configDelay = delaysMap && delaysMap[delay];
      resolvedDelay = typeof configDelay === "function" ? configDelay(args, actionParams) : configDelay;
    } else {
      resolvedDelay = typeof delay === "function" ? delay(args, actionParams) : delay;
    }
    const resolvedTarget = typeof to === "function" ? to(args, actionParams) : to;
    let targetActorRef;
    if (typeof resolvedTarget === "string") {
      if (resolvedTarget === SpecialTargets.Parent) {
        targetActorRef = actorScope.self._parent;
      } else if (resolvedTarget === SpecialTargets.Internal) {
        targetActorRef = actorScope.self;
      } else if (resolvedTarget.startsWith("#_")) {
        targetActorRef = snapshot.children[resolvedTarget.slice(2)];
      } else {
        targetActorRef = extra.deferredActorIds?.includes(resolvedTarget) ? resolvedTarget : snapshot.children[resolvedTarget];
      }
      if (!targetActorRef) {
        throw new Error(`Unable to send event to actor '${resolvedTarget}' from machine '${snapshot.machine.id}'.`);
      }
    } else {
      targetActorRef = resolvedTarget || actorScope.self;
    }
    return [snapshot, {
      to: targetActorRef,
      targetId: typeof resolvedTarget === "string" ? resolvedTarget : void 0,
      event: resolvedEvent,
      id,
      delay: resolvedDelay
    }, void 0];
  }
  function retryResolveSendTo(_, snapshot, params) {
    if (typeof params.to === "string") {
      params.to = snapshot.children[params.to];
    }
  }
  function executeSendTo(actorScope, params) {
    actorScope.defer(() => {
      const {
        to,
        event,
        delay,
        id
      } = params;
      if (typeof delay === "number") {
        actorScope.system.scheduler.schedule(actorScope.self, to, event, delay, id);
        return;
      }
      actorScope.system._relay(
        actorScope.self,
        // at this point, in a deferred task, it should already be mutated by retryResolveSendTo
        // if it initially started as a string
        to,
        event.type === XSTATE_ERROR ? createErrorActorEvent(actorScope.self.id, event.data) : event
      );
    });
  }
  function sendTo(to, eventOrExpr, options) {
    function sendTo2(_args, _params) {
    }
    sendTo2.type = "xstate.sendTo";
    sendTo2.to = to;
    sendTo2.event = eventOrExpr;
    sendTo2.id = options?.id;
    sendTo2.delay = options?.delay;
    sendTo2.resolve = resolveSendTo;
    sendTo2.retryResolve = retryResolveSendTo;
    sendTo2.execute = executeSendTo;
    return sendTo2;
  }
  function sendParent(event, options) {
    return sendTo(SpecialTargets.Parent, event, options);
  }
  function resolveEnqueueActions(actorScope, snapshot, args, actionParams, {
    collect
  }) {
    const actions = [];
    const enqueue = function enqueue2(action) {
      actions.push(action);
    };
    enqueue.assign = (...args2) => {
      actions.push(assign(...args2));
    };
    enqueue.cancel = (...args2) => {
      actions.push(cancel(...args2));
    };
    enqueue.raise = (...args2) => {
      actions.push(raise(...args2));
    };
    enqueue.sendTo = (...args2) => {
      actions.push(sendTo(...args2));
    };
    enqueue.sendParent = (...args2) => {
      actions.push(sendParent(...args2));
    };
    enqueue.spawnChild = (...args2) => {
      actions.push(spawnChild(...args2));
    };
    enqueue.stopChild = (...args2) => {
      actions.push(stopChild(...args2));
    };
    enqueue.emit = (...args2) => {
      actions.push(emit(...args2));
    };
    collect({
      context: args.context,
      event: args.event,
      enqueue,
      check: (guard) => evaluateGuard(guard, snapshot.context, args.event, snapshot),
      self: actorScope.self,
      system: actorScope.system
    }, actionParams);
    return [snapshot, void 0, actions];
  }
  function enqueueActions(collect) {
    function enqueueActions2(_args, _params) {
    }
    enqueueActions2.type = "xstate.enqueueActions";
    enqueueActions2.collect = collect;
    enqueueActions2.resolve = resolveEnqueueActions;
    return enqueueActions2;
  }
  function resolveLog(_, snapshot, actionArgs, actionParams, {
    value,
    label
  }) {
    return [snapshot, {
      value: typeof value === "function" ? value(actionArgs, actionParams) : value,
      label
    }, void 0];
  }
  function executeLog({
    logger: logger2
  }, {
    value,
    label
  }) {
    if (label) {
      logger2(label, value);
    } else {
      logger2(value);
    }
  }
  function log(value = ({
    context,
    event
  }) => ({
    context,
    event
  }), label) {
    function log2(_args, _params) {
    }
    log2.type = "xstate.log";
    log2.value = value;
    log2.label = label;
    log2.resolve = resolveLog;
    log2.execute = executeLog;
    return log2;
  }
  function createMachine(config, implementations) {
    return new StateMachine(config, implementations);
  }
  function setup({
    schemas,
    actors,
    actions,
    guards,
    delays
  }) {
    return {
      assign,
      sendTo,
      raise,
      log,
      cancel,
      stopChild,
      enqueueActions,
      emit,
      spawnChild,
      createStateConfig: (config) => config,
      createAction: (fn) => fn,
      createMachine: (config) => createMachine({
        ...config,
        schemas
      }, {
        actors,
        actions,
        guards,
        delays
      })
    };
  }
  const DEFAULT_MAX_STORED_LOGS = 5e3;
  const BATCH_WRITE_INTERVAL = 1e4;
  const BATCH_SIZE_THRESHOLD = 50;
  // Remote-log transport. Every context funnels through this one queue: content
  // scripts relay here over REMOTE_LOG rather than POSTing themselves, because a
  // page frame cannot be relied on to reach http://localhost (the game runs in a
  // cross-origin devvit.net iframe whose direct fetches never arrived).
  //
  // This replaces a flat "at most one POST every 2s" throttle. That throttle
  // fired whether or not the server was healthy, so a live server received
  // roughly one entry every two seconds and silently lost the rest -- which is
  // exactly the wrong behaviour for the case the log server exists to serve.
  // Backpressure now comes from a bounded queue, and backoff only from real
  // failures.
  const REMOTE_LOG_QUEUE_LIMIT = 2e3;
  const REMOTE_LOG_POST_BATCH = 100;
  const REMOTE_LOG_FAILURE_LIMIT = 3;
  const REMOTE_LOG_BACKOFF_MS = 5 * 60 * 1e3;
  // A drain must always finish. While entries arrive faster than they are
  // POSTed the loop below never reaches an empty queue, which leaves an await
  // pending inside a message handler indefinitely -- and a service worker whose
  // handler never returns gets force-terminated, taking the state machine and
  // the whole run with it. Hand control back after this many batches and let
  // the next enqueue (or the resume timer) continue.
  const REMOTE_LOG_MAX_BATCHES_PER_DRAIN = 10;
  const REMOTE_LOG_RESUME_MS = 50;
  const remoteLogQueue = [];
  let remoteLogDraining = false;
  let remoteLogDisabledUntil = 0;
  let remoteLogFailures = 0;
  function serializeRemoteLogEntry(entry) {
    try {
      const json = JSON.stringify(entry);
      // JSON.stringify returns undefined (not a string) for undefined and for
      // functions. Splicing that into the batch array would emit invalid JSON
      // and the server would reject the whole batch, not just the bad entry.
      if (typeof json !== "string") throw new Error("not serializable");
      return json;
    } catch {
      return JSON.stringify({
        ts: Date.now(),
        level: entry?.level || "log",
        source: entry?.source || entry?.context || "SW",
        message: String(entry?.message || "log entry not serializable"),
        data: { note: "original log data omitted (not JSON-serializable)" }
      });
    }
  }
  function disableRemoteLoggingInStorage() {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.get(["automationConfig"], (result2) => {
      const cfg = result2.automationConfig || {};
      if (cfg.remoteLogging) {
        chrome.storage.local.set({
          automationConfig: { ...cfg, remoteLogging: false }
        });
      }
    });
  }
  function enqueueRemoteLogEntry(entry, remoteUrl) {
    if (!remoteUrl) return;
    if (remoteLogDisabledUntil && Date.now() < remoteLogDisabledUntil) return;
    if (remoteLogQueue.length >= REMOTE_LOG_QUEUE_LIMIT) {
      // Drop the oldest rather than the newest: during a burst the tail is what
      // explains whatever just went wrong, and an unbounded queue in a service
      // worker is a leak that outlives the burst.
      remoteLogQueue.shift();
    }
    remoteLogQueue.push({ url: remoteUrl, body: serializeRemoteLogEntry(entry) });
    void drainRemoteLogQueue();
  }
  async function drainRemoteLogQueue() {
    if (remoteLogDraining) return;
    remoteLogDraining = true;
    try {
      let batches = 0;
      while (remoteLogQueue.length) {
        if (remoteLogDisabledUntil && Date.now() < remoteLogDisabledUntil) {
          remoteLogQueue.length = 0;
          return;
        }
        if (batches >= REMOTE_LOG_MAX_BATCHES_PER_DRAIN) {
          // Yield. Anything still queued is picked up by the resume timer, so
          // this handler returns instead of running until Chrome kills it.
          setTimeout(() => {
            void drainRemoteLogQueue();
          }, REMOTE_LOG_RESUME_MS);
          return;
        }
        batches += 1;
        // Drain as an array in one POST. Each entry was serialized on the way
        // in, so one unserializable entry cannot poison the batch, and /log
        // accepts either a single object or an array.
        const url = remoteLogQueue[0].url;
        const bodies = [];
        while (remoteLogQueue.length && bodies.length < REMOTE_LOG_POST_BATCH) {
          if (remoteLogQueue[0].url !== url) break;
          bodies.push(remoteLogQueue.shift().body);
        }
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `[${bodies.join(",")}]`
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          remoteLogFailures = 0;
        } catch {
          remoteLogFailures += 1;
          if (remoteLogFailures >= REMOTE_LOG_FAILURE_LIMIT) {
            remoteLogDisabledUntil = Date.now() + REMOTE_LOG_BACKOFF_MS;
            remoteLogQueue.length = 0;
            disableRemoteLoggingInStorage();
            return;
          }
        }
      }
    } finally {
      remoteLogDraining = false;
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
        storeLogs: config?.storeLogs ?? true,
        maxStoredLogs: config?.maxStoredLogs ?? DEFAULT_MAX_STORED_LOGS
      };
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(["automationConfig"], (result2) => {
          if (result2.automationConfig?.remoteLogging !== void 0) {
            this.config.remoteLogging = result2.automationConfig.remoteLogging;
          }
          if (result2.automationConfig?.consoleLogging !== void 0) {
            this.config.consoleLogging = result2.automationConfig.consoleLogging;
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
     * Queue the entry for the shared remote-log transport above, which owns
     * ordering, backpressure and failure backoff for every context at once.
     */
    async sendToRemote(entry) {
      if (!this.config.remoteLogging) return;
      enqueueRemoteLogEntry(entry, this.config.remoteUrl);
    }
    /**
     * Flush buffered logs to chrome.storage
     * This is called periodically or when buffer reaches threshold
     */
    static async flushLogsToStorage() {
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
        _Logger.logBuffer.unshift(...logsToFlush);
        console.error("[LF] Failed to flush logs:", error);
      }
      if (_Logger.logBuffer.length > 0) {
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
      if (!this.config.storeLogs) return;
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
      const entry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        context: this.config.context,
        // log-server.js reads `source` (never `context`), so without this every
        // entry lands in the unattributed bucket and by-source/ is useless.
        source: fullContext,
        level,
        message,
        data: args.length > 1 ? this.serializeData(args.slice(1)) : void 0
      };
      if (this.config.consoleLogging) {
        const consoleMethod = console[level] || console.log;
        consoleMethod(`[LF][${fullContext}]`, ...args);
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
  let Logger = _Logger;
  function createLogger(context, config, parentContext) {
    return new Logger(context, config, parentContext);
  }
  createLogger("POPUP");
  const extensionLogger = createLogger("SW");
  createLogger("REDDIT");
  createLogger("DEVVIT");
  createLogger("DEVVIT-GIAE");
  const STORAGE_PROPAGATION_DELAY = 500;
  const INITIAL_RETRY_DELAY = 2e3;
  const RETRY_BACKOFF_BASE = 2;
  const STATE_TIMEOUT = 12e4;
  const QUEUE_DISCOVERY_SETTLE_MS = 2500;
  const SUBREDDIT_SCAN_URL = "https://www.reddit.com/r/SwordAndSupperGame/new/";
  const MISSION_LEVEL_MAX = 9999;
  const logger$1 = createLogger("StateMachine");
  const botMachine = setup({
    actions: {
      // Set current mission from event
      setMission: assign({
        currentMissionId: ({ event }) => {
          if (event.type === "MISSION_PAGE_LOADED" || event.type === "NEXT_MISSION_FOUND" || event.type === "NAVIGATE_TO_MISSION") {
            return event.missionId;
          }
          return null;
        },
        currentMissionPermalink: ({ event }) => {
          if (event.type === "MISSION_PAGE_LOADED" || event.type === "NEXT_MISSION_FOUND" || event.type === "NAVIGATE_TO_MISSION") {
            return event.permalink;
          }
          return null;
        }
      }),
      // Clear mission info
      clearMission: assign({
        currentMissionId: null,
        currentMissionPermalink: null
      }),
      // Set error message
      setError: assign({
        errorMessage: ({ event }) => {
          if (event.type === "ERROR_OCCURRED") {
            return event.message;
          }
          return null;
        },
        retryCount: ({ context, event }) => {
          if (event.type === "ERROR_OCCURRED") {
            return context.retryCount + 1;
          }
          return context.retryCount;
        }
      }),
      // Clear error
      clearError: assign({
        errorMessage: null,
        retryCount: 0
      }),
      // Log why we're going idle (before reset clears it)
      logIdleReason: ({ context, event }) => {
        logger$1.log("Entering idle state", {
          event: event.type,
          completionReason: context.completionReason,
          errorMessage: context.errorMessage,
          currentMissionId: context.currentMissionId
        });
      },
      // Reset context on stop
      resetContext: assign({
        currentMissionId: null,
        currentMissionPermalink: null,
        errorMessage: null,
        retryCount: 0,
        findMissionRetryCount: 0,
        completionReason: null
      }),
      // Increment find mission retry count
      incrementFindMissionRetry: assign({
        findMissionRetryCount: ({ context }) => context.findMissionRetryCount + 1
      }),
      // Reset find mission retry count
      resetFindMissionRetry: assign({
        findMissionRetryCount: 0
      }),
      // Set completion reason
      setCompletionReason: assign({
        completionReason: ({ event }) => {
          let reason = null;
          if (event.type === "STOP_BOT") {
            reason = "stopped";
          } else if (event.type === "NO_MISSIONS_FOUND") {
            reason = "no_missions";
          } else if (event.type === "ERROR_OCCURRED") {
            reason = "error";
          }
          logger$1.log("Setting completion reason", {
            event: event.type,
            reason
          });
          return reason;
        }
      }),
      // Log error state entry
      logError: ({ context, event }) => {
        logger$1.error("Entered error state", {
          event: event.type,
          errorMessage: context.errorMessage,
          retryCount: context.retryCount,
          currentMissionId: context.currentMissionId
        });
      },
      // Log state transitions
      logTransition: ({ context, event }) => {
        logger$1.log(`Transition: ${event.type}`, {
          event,
          context
        });
      }
    }
  }).createMachine({
    id: "bot",
    description: "Overall bot state machine",
    initial: "idle",
    context: {
      currentMissionId: null,
      currentMissionPermalink: null,
      errorMessage: null,
      retryCount: 0,
      findMissionRetryCount: 0,
      completionReason: null
    },
    states: {
      // ========================================================================
      // IDLE: Bot is stopped, no automation
      // Sub-states track whether game dialog is open
      // ========================================================================
      idle: {
        description: "Bot is stopped, no automation",
        initial: "stopped",
        entry: ["logIdleReason", "resetContext"],
        states: {
          stopped: {
            description: "Normal idle state - no game dialog open",
            on: {
              START_BOT: {
                // Normal flow: find mission and open game
                target: "#bot.starting"
              }
            }
          },
          dialogOpen: {
            description: "Game dialog is open and automation engine ready",
            on: {
              START_BOT: {
                // Dialog already open — resume automation in-place (old source behavior).
                target: "#bot.gameMission.gameReady",
                actions: ["logTransition"]
              }
            }
          }
        },
        on: {
          AUTOMATION_READY: {
            // When iframe loads while idle, go to dialogOpen sub-state
            target: ".dialogOpen",
            actions: ["logTransition"]
          }
        }
      },
      // ========================================================================
      // STARTING: User clicked Start, preparing to find/open mission
      // ========================================================================
      starting: {
        entry: ["logTransition"],
        after: {
          [STATE_TIMEOUT]: {
            target: "error",
            actions: assign({
              errorMessage: `Timeout in starting state - no mission found within ${STATE_TIMEOUT / 1e3} seconds`,
              completionReason: "error"
            })
          }
        },
        on: {
          STOP_BOT: {
            target: "idle",
            actions: ["setCompletionReason"]
          },
          MISSION_PAGE_LOADED: {
            target: "gameMission.waitingForGame",
            actions: ["setMission"]
          },
          NAVIGATE_TO_MISSION: {
            target: "navigating",
            actions: ["setMission"]
          },
          MISSION_DELETED: {
            target: "gameMission.completing",
            actions: ["logTransition"]
          },
          NO_MISSIONS_FOUND: {
            target: "idle",
            actions: ["setCompletionReason"]
          },
          ERROR_OCCURRED: {
            target: "error",
            actions: ["setError"]
          }
        }
      },
      // ========================================================================
      // NAVIGATING: Navigating to a mission page
      // ========================================================================
      navigating: {
        description: "Navigating to a mission page",
        entry: ["logTransition"],
        on: {
          STOP_BOT: {
            target: "idle",
            actions: ["setCompletionReason"]
          },
          MISSION_PAGE_LOADED: {
            target: "gameMission.waitingForGame"
          },
          MISSION_COMPLETED: {
            target: "gameMission.completing",
            actions: ["logTransition", "resetFindMissionRetry"]
          },
          MISSION_DELETED: { target: "gameMission.completing", actions: ["logTransition"] },
          ERROR_OCCURRED: {
            description: "Error occurred while navigating to a mission page",
            target: "error",
            actions: ["setError", "setCompletionReason"]
          }
        }
      },
      // ========================================================================
      // gameMission: Nested mission subflow
      // ========================================================================
      gameMission: {
        initial: "waitingForGame",
        states: {
          waitingForGame: {
            entry: ["logTransition"],
            on: {
              GAME_LOADER_DETECTED: { target: "openingGame", actions: ["logTransition"] },
              GAME_DIALOG_OPENED: {
                target: "gameReady",
                actions: ["logTransition"]
              },
              AUTOMATION_READY: {
                target: "gameReady",
                actions: ["logTransition"]
              },
              MISSION_DELETED: { target: "completing", actions: ["logTransition"] },
              MISSION_COMPLETED: { target: "completing", actions: ["logTransition", "resetFindMissionRetry"] },
              ERROR_OCCURRED: {
                target: "#bot.error",
                actions: ["setError", "setCompletionReason"]
              },
              STOP_BOT: { target: "#bot.idle", actions: ["setCompletionReason"] }
            }
          },
          openingGame: {
            entry: ["logTransition"],
            on: {
              GAME_DIALOG_OPENED: { target: "gameReady", actions: ["logTransition"] },
              AUTOMATION_READY: {
                target: "gameReady",
                actions: ["logTransition"]
              },
              MISSION_DELETED: { target: "completing", actions: ["logTransition"] },
              MISSION_COMPLETED: { target: "completing", actions: ["logTransition", "resetFindMissionRetry"] },
              ERROR_OCCURRED: {
                target: "#bot.error",
                actions: ["setError", "setCompletionReason"]
              },
              STOP_BOT: { target: "#bot.idle", actions: ["setCompletionReason"] }
            }
          },
          gameReady: {
            entry: ["logTransition"],
            on: {
              AUTOMATION_STARTED: { target: "running", actions: ["logTransition"] },
              MISSION_DELETED: { target: "completing", actions: ["logTransition"] },
              MISSION_COMPLETED: { target: "completing", actions: ["logTransition"] },
              ERROR_OCCURRED: {
                target: "#bot.error",
                actions: ["setError", "setCompletionReason"]
              },
              STOP_BOT: { target: "#bot.idle", actions: ["setCompletionReason"] }
            }
          },
          running: {
            entry: ["logTransition"],
            on: {
              MISSION_DELETED: { target: "completing", actions: ["logTransition"] },
              MISSION_COMPLETED: { target: "completing", actions: ["logTransition"] },
              ERROR_OCCURRED: {
                target: "#bot.error",
                actions: ["setError", "setCompletionReason"]
              },
              STOP_BOT: { target: "#bot.idle", actions: ["setCompletionReason"] }
            }
          },
          completing: {
            entry: ["logTransition", "resetFindMissionRetry"],
            on: {
              STOP_BOT: {
                target: "#bot.idle",
                actions: ["setCompletionReason"]
              },
              MISSION_COMPLETED: {
                target: "completing",
                actions: ["logTransition", "resetFindMissionRetry"]
              },
              NEXT_MISSION_FOUND: {
                target: "waitingForDialogClose",
                actions: ["setMission", "clearError", "resetFindMissionRetry", "resetDialogCloseTracking"]
              },
              NO_MISSIONS_FOUND: [
                {
                  // If we've retried less than 3 times, increment retry count
                  // Internal transition (no target) - stays in completing state without re-entering
                  guard: ({ context }) => context.findMissionRetryCount < 3,
                  actions: ["incrementFindMissionRetry"]
                },
                {
                  // After 3 retries, give up and go idle
                  target: "#bot.idle",
                  actions: ["setCompletionReason"]
                }
              ],
              ERROR_OCCURRED: [
                {
                  // If we've retried less than 3 times, increment retry count
                  // Internal transition (no target) - stays in completing state without re-entering
                  guard: ({ context }) => context.findMissionRetryCount < 3,
                  actions: ["incrementFindMissionRetry", "setError"]
                },
                {
                  // After 3 retries, go to error state
                  target: "#bot.error",
                  actions: ["setError", "setCompletionReason"]
                }
              ]
            }
          },
          waitingForDialogClose: {
            description: "Waiting for game dialog to close before navigating to next mission",
            entry: ["logTransition"],
            on: {
              GAME_DIALOG_CLOSED: {
                target: "#bot.navigating"
              },
              // Escape hatch. Closing the dialog gracefully can fail outright --
              // e.g. the victory screen keeps the iframe mounted, so the Reddit
              // side keeps reporting it open. Without this the state had no exit
              // but GAME_DIALOG_CLOSED and the run hung permanently. Navigating
              // sets window.location, which tears the iframe down regardless.
              // The next mission's permalink is already in context: setMission
              // runs on NEXT_MISSION_FOUND, before this state is entered.
              DIALOG_CLOSE_TIMEOUT: {
                target: "#bot.navigating",
                actions: ["logTransition"]
              },
              ERROR_OCCURRED: {
                target: "#bot.error",
                actions: ["setError", "setCompletionReason"]
              },
              STOP_BOT: {
                target: "#bot.idle",
                actions: ["setCompletionReason"]
              }
            }
          }
        }
      },
      // ========================================================================
      // ERROR: Something went wrong, need user intervention or retry
      // ========================================================================
      error: {
        entry: ["logError"],
        on: {
          STOP_BOT: {
            target: "idle",
            actions: ["clearError", "setCompletionReason"]
          },
          START_BOT: {
            target: "starting",
            actions: ["clearError"]
          },
          RETRY: {
            target: "starting",
            actions: ["clearError"]
          }
        }
      }
    },
    on: {
      START_BOT: [
        {
          guard: ({ self }) => {
            const snap = self.getSnapshot();
            return snap.matches("gameMission.running") || snap.matches("gameMission.gameReady");
          },
          actions: ["logTransition"]
        },
        {
          target: ".starting",
          actions: ["resetFindMissionRetry", "clearError", "clearMission"]
        }
      ]
    }
  });
  const STORAGE_KEYS = {
    MISSIONS: "missions",
    // Mission data (static, from database)
    USER_PROGRESS: "userProgress",
    NON_MISSION_POSTS: "nonMissionPosts"
  };
  function normalizeNonMissionPostId(postId) {
    if (!postId || typeof postId !== "string") return null;
    return postId.startsWith("t3_") ? postId : `t3_${postId}`;
  }
  async function getNonMissionPostIdSet() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.NON_MISSION_POSTS], (result2) => {
        if (chrome.runtime.lastError) {
          resolve(/* @__PURE__ */ new Set());
          return;
        }
        const list = result2[STORAGE_KEYS.NON_MISSION_POSTS];
        const set = /* @__PURE__ */ new Set();
        if (Array.isArray(list)) {
          for (const id of list) {
            const full = normalizeNonMissionPostId(id);
            if (!full) continue;
            set.add(full);
            set.add(full.replace(/^t3_/, ""));
          }
        }
        resolve(set);
      });
    });
  }
  async function addNonMissionPosts(postIds) {
    const existing = await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.NON_MISSION_POSTS], (result2) => {
        resolve(Array.isArray(result2[STORAGE_KEYS.NON_MISSION_POSTS]) ? result2[STORAGE_KEYS.NON_MISSION_POSTS] : []);
      });
    });
    const set = /* @__PURE__ */ new Set(existing.map(normalizeNonMissionPostId).filter(Boolean));
    for (const id of postIds || []) {
      const full = normalizeNonMissionPostId(id);
      if (full) {
        set.add(full);
      }
    }
    const next = [...set];
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.NON_MISSION_POSTS]: next }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    return next.length;
  }
  const CACHE_DURATION = 5 * 60 * 1e3;
  const STORAGE_KEY = "redditUserCache";
  async function getCurrentRedditUser() {
    const cachedUser = await getCachedUserIncludingExpired();
    const isCacheFresh = cachedUser ? Date.now() - cachedUser.timestamp < CACHE_DURATION : false;
    if (isCacheFresh && cachedUser) {
      return cachedUser.username;
    }
    try {
      const response = await fetch("https://www.reddit.com/api/me.json", {
        credentials: "include"
      });
      if (!response.ok) {
        if (cachedUser) {
          return cachedUser.username;
        }
        return "default";
      }
      const data = await response.json();
      const username = data?.data?.name;
      if (username && typeof username === "string") {
        await cacheUser(username);
        return username;
      } else {
        if (cachedUser) {
          return cachedUser.username;
        }
        return "default";
      }
    } catch (error) {
      if (cachedUser) {
        return cachedUser.username;
      }
      return "default";
    }
  }
  async function getCachedUserIncludingExpired() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result2) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        const cache2 = result2[STORAGE_KEY];
        resolve(cache2 || null);
      });
    });
  }
  async function cacheUser(username) {
    return new Promise((resolve, reject) => {
      const cache2 = {
        username,
        timestamp: Date.now()
      };
      chrome.storage.local.set({ [STORAGE_KEY]: cache2 }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
  function createEmptyProgressData() {
    return {
      cleared: [],
      disabled: [],
      clearedAt: {},
      loot: {}
    };
  }
  async function getMultiUserProgress() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEYS.USER_PROGRESS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result2[STORAGE_KEYS.USER_PROGRESS] || {});
        }
      });
    });
  }
  async function setMultiUserProgress(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.USER_PROGRESS]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
  async function getAllUserProgress() {
    const username = await getCurrentRedditUser();
    const multiUserData = await getMultiUserProgress();
    return multiUserData[username] || createEmptyProgressData();
  }
  async function markMissionCleared$1(postId) {
    const username = await getCurrentRedditUser();
    const multiUserData = await getMultiUserProgress();
    const userProgress = multiUserData[username] || createEmptyProgressData();
    if (!userProgress.cleared.includes(postId)) {
      userProgress.cleared.push(postId);
    }
    userProgress.clearedAt[postId] = {
      timestamp: Date.now(),
      duration: void 0
    };
    multiUserData[username] = userProgress;
    await setMultiUserProgress(multiUserData);
  }
  async function setMissionDisabled$1(postId, disabled) {
    const username = await getCurrentRedditUser();
    const multiUserData = await getMultiUserProgress();
    const userProgress = multiUserData[username] || createEmptyProgressData();
    {
      if (!userProgress.disabled.includes(postId)) {
        userProgress.disabled.push(postId);
      }
    }
    multiUserData[username] = userProgress;
    await setMultiUserProgress(multiUserData);
  }
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
    const normalized = isLegacyFormat(record) ? migrateLegacyRecord(record) : { ...record };
    if (normalized.postId && !normalized.permalink) {
      normalized.permalink = missionPermalinkFromPostId(normalized.postId);
    }
    return normalized;
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
  async function markMissionCleared(postId) {
    await markMissionCleared$1(postId);
    await compactClearedMissionRecord(postId);
  }
  function buildCompactClearedMission(mission) {
    if (!mission?.postId) return null;
    return {
      postId: mission.postId,
      timestamp: mission.timestamp,
      postedAt: mission.postedAt,
      createdUtc: mission.createdUtc,
      permalink: mission.permalink,
      missionTitle: mission.missionTitle,
      missionAuthorName: mission.missionAuthorName,
      minLevel: mission.minLevel,
      maxLevel: mission.maxLevel,
      difficulty: mission.difficulty,
      environment: mission.environment,
      foodName: mission.foodName,
      devvitEnrichedAt: mission.devvitEnrichedAt,
      compactCleared: true
    };
  }
  async function compactClearedMissionRecord(postId) {
    if (!postId) return false;
    const missions = await getAllMissions();
    const mission = missions[postId];
    if (!mission || mission.compactCleared) return false;
    const compact = buildCompactClearedMission(mission);
    if (!compact) return false;
    missions[postId] = compact;
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: missions }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    return true;
  }
  async function compactAllClearedMissions() {
    const [missions, progress] = await Promise.all([getAllMissions(), getAllUserProgress()]);
    const clearedSet = new Set(progress?.cleared || []);
    let compacted = 0;
    for (const postId of clearedSet) {
      const mission = missions[postId];
      if (!mission || mission.compactCleared) continue;
      const compact = buildCompactClearedMission(mission);
      if (!compact) continue;
      missions[postId] = compact;
      compacted++;
    }
    if (compacted > 0) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: missions }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
    }
    return compacted;
  }
  /**
   * Collapse missions older than the Reddit archive window down to tombstones.
   *
   * Reddit archives posts after ~30 days, after which they can never be played,
   * so their encounters, images and metadata are dead weight. The record itself
   * is KEPT (id + posting date only) rather than deleted, which is what keeps
   * cleared history in `userProgress` meaningful and stops sync re-adding the
   * post later. This replaces the old delete-and-forget cleanup, which also
   * stripped the matching progress entries.
   *
   * @returns {{archived:number, scanned:number, bytesFreed:number}}
   */
  async function archiveOldMissions(options = {}) {
    const days = options.days ?? missionCore.ARCHIVE_AFTER_DAYS;
    const now = Date.now();
    const missions = await getAllMissions();
    let archived = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;
    for (const [postId, mission] of Object.entries(missions)) {
      if (!mission) continue;
      if (missionCore.isTombstone(mission)) continue;
      if (!missionCore.isMissionArchived(mission, now, days)) continue;
      const tombstone = missionCore.buildArchivedTombstone(mission);
      if (!tombstone) continue;
      bytesBefore += JSON.stringify(mission).length;
      bytesAfter += JSON.stringify(tombstone).length;
      missions[postId] = tombstone;
      archived++;
    }
    if (archived > 0) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: missions }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
      chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
      });
    }
    const result = {
      archived,
      scanned: Object.keys(missions).length,
      bytesFreed: Math.max(0, bytesBefore - bytesAfter)
    };
    extensionLogger.log("[MissionArchive] Archived old missions to tombstones", { ...result, days });
    return result;
  }
  /**
   * One-off migration: give stored missions a flairText + missionKind.
   *
   * Records written before flair classification existed have neither, because
   * the old ingest parsed flair for levels and discarded the text. Flair is
   * re-fetched in batches of 100 via /api/info.json (the same endpoint the
   * level backfill already uses).
   *
   * Archived tombstones and already-classified records are skipped, so this is
   * cheap to re-run and safe to call more than once.
   */
  async function reclassifyStoredMissions(options = {}) {
    const maxCount = options.maxCount ?? 5e3;
    const missions = await getAllMissions();
    const candidates = Object.values(missions)
      .filter((m) => m?.postId && !missionCore.isTombstone(m) && !m.missionKind)
      .sort((a, b) => (getMissionPostedMs(b) || 0) - (getMissionPostedMs(a) || 0))
      .slice(0, maxCount);
    if (!candidates.length) {
      return { updated: 0, scanned: 0, byKind: {} };
    }
    const flairMap = await fetchFlairLevelsBatchFromRedditApi(candidates.map((m) => m.postId));
    const merged = { ...missions };
    const byKind = {};
    let updated = 0;
    let unresolved = 0;
    for (const mission of candidates) {
      const entry = getFlairEntryForPostId(flairMap, mission.postId);
      if (!entry) {
        // Post is deleted or no longer returned by the API. Leave it untouched
        // rather than guessing a kind for it.
        unresolved++;
        continue;
      }
      const next = { ...mission };
      applyFlairEntryToMission(next, entry);
      if (!next.missionKind) continue;
      merged[mission.postId] = next;
      byKind[next.missionKind] = (byKind[next.missionKind] || 0) + 1;
      updated++;
    }
    if (updated > 0) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: merged }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
      chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
      });
    }
    const result = { updated, scanned: candidates.length, unresolved, byKind };
    extensionLogger.log("[MissionReclassify] Classified stored missions", result);
    return result;
  }
  async function setMissionDisabled(postId, disabled) {
    return setMissionDisabled$1(postId);
  }
  const DEFAULT_ESSENCE_LOOT_DICTIONARY = {
    version: 2,
    essences: {
      EssenceCrunchy: { displayName: "Crunchy Essence" },
      EssenceHearty: { displayName: "Hearty Essence" },
      EssenceChewy: { displayName: "Chewy Essence" },
      EssenceSpicy: { displayName: "Spicy Essence" },
      EssenceCreamy: { displayName: "Creamy Essence" },
      EssenceFluffy: { displayName: "Fluffy Essence" },
      EssenceDecadent: { displayName: "Decadent Essence" },
      EssenceTangy: { displayName: "Tangy Essence" },
      EssenceFresh: { displayName: "Fresh Essence" }
    },
    foods: {
      cookie: {
        label: "Cookie",
        names: ["cookie", "chocolate chip cookie", "cocoa cookie"],
        essences: { EssenceCrunchy: 2 }
      },
      melt_cheese: {
        label: "Melt Cheese",
        names: ["melt cheese", "melted cheese"],
        essences: { EssenceCrunchy: 2 }
      }
    }
  };
  function normalizeEssenceLootText(value) {
    return String(value || "").toLowerCase().trim();
  }
  function slugifyFoodId(value, fallback = "food") {
    const slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return slug || fallback;
  }
  function uniqueFoodId(baseId, usedIds) {
    let id = slugifyFoodId(baseId);
    if (!usedIds.has(id)) {
      return id;
    }
    let counter = 2;
    while (usedIds.has(`${id}_${counter}`)) {
      counter++;
    }
    return `${id}_${counter}`;
  }
  function normalizeEssenceMeta(key, entry) {
    if (!key || typeof key !== "string") {
      return null;
    }
    return {
      displayName: String(entry?.displayName || key).trim() || key
    };
  }
  function normalizeFoodNameList(input, fallbackLabel = "") {
    const names = [];
    const seen = /* @__PURE__ */ new Set();
    const pushName = (value) => {
      const name = String(value || "").trim();
      const key = normalizeEssenceLootText(name);
      if (!name || seen.has(key)) {
        return;
      }
      seen.add(key);
      names.push(name);
    };
    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item === "string") {
          pushName(item);
        } else if (item && typeof item === "object") {
          pushName(item.name || item.food || item.label);
        }
      }
    } else if (typeof input === "string") {
      for (const line of input.split(/[\n,]/)) {
        pushName(line);
      }
    }
    if (names.length === 0 && fallbackLabel) {
      pushName(fallbackLabel);
    }
    return names;
  }
  function normalizeFoodEssences(entry) {
    const essences = {};
    const defaultQty = Math.max(1, Math.round(Number(entry?.quantity ?? entry?.qty) || 1));
    if (entry?.essences && typeof entry.essences === "object" && !Array.isArray(entry.essences)) {
      for (const [rawId, rawQty] of Object.entries(entry.essences)) {
        const essenceId = String(rawId).trim();
        if (!essenceId) {
          continue;
        }
        essences[essenceId] = Math.max(1, Math.round(Number(rawQty) || defaultQty));
      }
    }
    if (Array.isArray(entry?.essences)) {
      for (const item of entry.essences) {
        if (typeof item === "string") {
          const essenceId = item.trim();
          if (essenceId) {
            essences[essenceId] = defaultQty;
          }
        } else if (item && typeof item === "object") {
          const essenceId = String(item.id || item.essenceId || item.essence || "").trim();
          if (essenceId) {
            essences[essenceId] = Math.max(1, Math.round(Number(item.quantity ?? item.qty) || defaultQty));
          }
        }
      }
    }
    if (Array.isArray(entry?.essenceIds)) {
      for (const rawId of entry.essenceIds) {
        const essenceId = String(rawId).trim();
        if (essenceId) {
          essences[essenceId] = defaultQty;
        }
      }
    }
    const singleEssenceId = String(entry?.essenceId || entry?.essence || "").trim();
    if (singleEssenceId) {
      essences[singleEssenceId] = essences[singleEssenceId] ?? defaultQty;
    }
    return essences;
  }
  function normalizeFoodGroup(id, entry) {
    if (!id || typeof id !== "string" || !entry || typeof entry !== "object") {
      return null;
    }
    const label = String(entry.label || entry.name || id).trim() || id;
    const names = normalizeFoodNameList(entry.names ?? entry.aliases ?? entry.variations, label);
    if (names.length === 0) {
      return null;
    }
    const essences = normalizeFoodEssences(entry);
    if (Object.keys(essences).length === 0) {
      return null;
    }
    return { label, names, essences };
  }
  function dedupeEssencesByDisplayName(essences) {
    const deduped = {};
    const displayToId = /* @__PURE__ */ new Map();
    for (const [id, entry] of Object.entries(essences || {})) {
      const displayName = String(entry?.displayName || id).trim() || id;
      const normDisplay = normalizeEssenceLootText(displayName);
      const existingId = displayToId.get(normDisplay);
      if (!existingId) {
        displayToId.set(normDisplay, id);
        deduped[id] = { displayName };
        continue;
      }
      const keepExisting = existingId.startsWith("Essence") && !id.startsWith("Essence");
      if (keepExisting) {
        continue;
      }
      delete deduped[existingId];
      displayToId.set(normDisplay, id);
      deduped[id] = { displayName };
    }
    return deduped;
  }
  function resolveCanonicalEssenceId(rawId, essences) {
    const trimmed = String(rawId || "").trim();
    if (!trimmed) {
      return null;
    }
    if (essences[trimmed]) {
      return trimmed;
    }
    const normRaw = normalizeEssenceLootText(trimmed);
    for (const [id, entry] of Object.entries(essences)) {
      const displayName = String(entry?.displayName || id).trim() || id;
      if (normalizeEssenceLootText(displayName) === normRaw || normalizeEssenceLootText(id) === normRaw) {
        return id;
      }
    }
    return trimmed;
  }
  function remapFoodEssenceMap(rawEssences, essences) {
    const remapped = {};
    for (const [rawId, rawQty] of Object.entries(rawEssences || {})) {
      const canonicalId = resolveCanonicalEssenceId(rawId, essences);
      if (!canonicalId) {
        continue;
      }
      if (!essences[canonicalId]) {
        essences[canonicalId] = { displayName: String(rawId).trim() };
      }
      const qty = Math.max(1, Math.round(Number(rawQty) || 1));
      remapped[canonicalId] = remapped[canonicalId] ? Math.max(remapped[canonicalId], qty) : qty;
    }
    return remapped;
  }
  function isLegacyEssenceDictionary(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return false;
    }
    if (input.version === 2 && input.essences && input.foods) {
      return false;
    }
    return Object.values(input).some(
      (entry) => entry && typeof entry === "object" && ("foods" in entry || "displayName" in entry && !("essenceId" in entry))
    );
  }
  function migrateLegacyEssenceDictionary(input) {
    const essences = {};
    const foods = {};
    const foodsByName = /* @__PURE__ */ new Map();
    const usedIds = /* @__PURE__ */ new Set();
    const entries = Array.isArray(input) ? input.map((item) => [item?.id || item?.key, item]) : Object.entries(input);
    for (const [essenceId, entry] of entries) {
      if (!essenceId || typeof essenceId !== "string" || !entry || typeof entry !== "object") {
        continue;
      }
      essences[essenceId] = normalizeEssenceMeta(essenceId, entry);
      const foodMap = entry.foods;
      if (!foodMap || typeof foodMap !== "object") {
        continue;
      }
      const foodEntries = Array.isArray(foodMap) ? foodMap.map((food) => {
        if (typeof food === "string") {
          return [food, entry.quantity || 1];
        }
        if (food && typeof food === "object") {
          return [food.name || food.food || "", food.quantity ?? food.qty ?? entry.quantity ?? 1];
        }
        return ["", 1];
      }) : Object.entries(foodMap);
      for (const [foodName, quantity] of foodEntries) {
        const name = String(foodName || "").trim();
        if (!name) {
          continue;
        }
        const normKey = normalizeEssenceLootText(name);
        let foodId = foodsByName.get(normKey);
        if (!foodId) {
          foodId = uniqueFoodId(name, usedIds);
          usedIds.add(foodId);
          foodsByName.set(normKey, foodId);
          foods[foodId] = {
            label: name,
            names: [name],
            essences: {}
          };
        }
        foods[foodId].essences[essenceId] = Math.max(1, Math.round(Number(quantity) || 1));
      }
    }
    return { version: 2, essences, foods };
  }
  function normalizeEssenceLootDictionary(input, options = {}) {
    if (!input || typeof input !== "object") {
      return normalizeEssenceLootDictionary(DEFAULT_ESSENCE_LOOT_DICTIONARY);
    }
    if (isLegacyEssenceDictionary(input)) {
      return normalizeEssenceLootDictionary(migrateLegacyEssenceDictionary(input));
    }
    const hasStoredEssences = input.essences && typeof input.essences === "object" && Object.keys(input.essences).length > 0;
    const seedDefaultEssences = options.seedDefaultEssences ?? !hasStoredEssences;
    const essences = seedDefaultEssences ? { ...DEFAULT_ESSENCE_LOOT_DICTIONARY.essences } : {};
    if (input.essences && typeof input.essences === "object") {
      for (const [key, entry] of Object.entries(input.essences)) {
        const normalizedEssence = normalizeEssenceMeta(key, entry);
        if (normalizedEssence) {
          essences[key] = normalizedEssence;
        }
      }
    }
    let workingEssences = dedupeEssencesByDisplayName(essences);
    const foods = {};
    const usedIds = /* @__PURE__ */ new Set();
    const foodSource = input.foods && typeof input.foods === "object" ? input.foods : {};
    const foodEntries = Array.isArray(foodSource) ? foodSource.map((item, index) => [item?.id || item?.key || `food_${index + 1}`, item]) : Object.entries(foodSource);
    for (const [rawId, entry] of foodEntries) {
      const id = uniqueFoodId(rawId || entry?.label || entry?.names?.[0] || "food", usedIds);
      usedIds.add(id);
      const normalizedFood = normalizeFoodGroup(id, entry);
      if (!normalizedFood) {
        continue;
      }
      normalizedFood.essences = remapFoodEssenceMap(normalizedFood.essences, workingEssences);
      if (Object.keys(normalizedFood.essences).length > 0) {
        foods[id] = normalizedFood;
      }
    }
    const dedupedEssences = dedupeEssencesByDisplayName(workingEssences);
    return { version: 2, essences: dedupedEssences, foods };
  }
  function mergeEssenceLootDictionaries(_base, stored) {
    return normalizeEssenceLootDictionary(stored, { seedDefaultEssences: false });
  }
  async function getEssenceLootDictionary() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["essenceLootDictionary"], (result) => {
        const stored = result.essenceLootDictionary;
        if (!stored || typeof stored !== "object" || Object.keys(stored).length === 0) {
          resolve(normalizeEssenceLootDictionary(DEFAULT_ESSENCE_LOOT_DICTIONARY));
          return;
        }
        const normalized = normalizeEssenceLootDictionary(stored, { seedDefaultEssences: false });
        const needsPersist = isLegacyEssenceDictionary(stored) || Object.values(stored?.foods || {}).some((food) => food?.essenceId || food?.quantity !== void 0 && !food?.essences) || Object.keys(normalized.essences || {}).length !== Object.keys(stored?.essences || {}).length || JSON.stringify(normalized.essences) !== JSON.stringify(stored?.essences);
        if (needsPersist) {
          chrome.storage.local.set({ essenceLootDictionary: normalized });
        }
        resolve(normalized);
      });
    });
  }
  const normalizeStarFilter = missionCore.normalizeStarFilter;
  const isAllStarsSelected = missionCore.isAllStarsSelected;
  const getMissionStarDifficulty = missionCore.getMissionStarDifficulty;
  function normalizeAutomationFilters(filters) {
    const source = filters || {};
    return {
      stars: normalizeStarFilter(source.stars ?? [1, 2, 3, 4, 5]),
      minLevel: source.minLevel !== void 0 ? Number(source.minLevel) : 1,
      maxLevel: source.maxLevel !== void 0 ? Number(source.maxLevel) : 1200,
      targetEssences: Array.isArray(source.targetEssences) ? source.targetEssences : [],
      // Daily Dungeons run in a separate game mode (its own Phaser scene) that the
      // standard mission automation does not drive, so they are opt-in.
      includeDailyDungeon: source.includeDailyDungeon === true
    };
  }
  function getMissionSortTime(mission) {
    if (!mission || typeof mission !== "object") return 0;
    if (typeof mission.timestamp === "number" && mission.timestamp > 0) return mission.timestamp;
    if (typeof mission.postedAt === "number" && mission.postedAt > 0) return mission.postedAt;
    if (typeof mission.createdUtc === "number" && mission.createdUtc > 0) return mission.createdUtc * 1e3;
    return 0;
  }
  const BOT_QUEUE_SNAPSHOT_KEY = "lazyfrogBotQueueSnapshot";
  /** Read the user's saved bot filters from storage. */
  async function getStoredAutomationFilters() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["automationFilters"], resolve);
    });
    return stored?.automationFilters;
  }
  async function buildBotQueueSnapshot(filters) {
    const normalizedFilters = normalizeAutomationFilters(filters);
    const queue = await getFilteredUnclearedMissions(normalizedFilters);
    const snapshot = {
      filters: normalizedFilters,
      count: queue.length,
      nextPostId: queue[0]?.postId || null,
      queuePostIds: queue.map((m) => m.postId),
      refreshedAt: Date.now()
    };
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [BOT_QUEUE_SNAPSHOT_KEY]: snapshot }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    chrome.runtime.sendMessage({ type: "BOT_QUEUE_UPDATED", snapshot }).catch(() => {
    });
    return snapshot;
  }
  function missionMatchesEssenceFilter(mission, targetEssences, dictionary) {
    if (!targetEssences || targetEssences.length === 0) {
      return true;
    }
    const haystack = normalizeEssenceLootText(`${mission?.missionTitle || ""} ${mission?.foodName || ""}`);
    if (!haystack) {
      return false;
    }
    const dict = normalizeEssenceLootDictionary(dictionary, { seedDefaultEssences: false });
    const targetSet = new Set(targetEssences);
    for (const food of Object.values(dict.foods || {})) {
      const essences = food?.essences || {};
      for (const essenceId of Object.keys(essences)) {
        if (!targetSet.has(essenceId)) {
          continue;
        }
        for (const name of food.names || []) {
          const needle = normalizeEssenceLootText(name);
          if (needle && haystack.includes(needle)) {
            return true;
          }
        }
      }
    }
    return false;
  }
  const MISSION_SYNC_DAYS = 30;
  const MISSION_DISCOVERY_SYNC_DAYS = 15;
  const MISSION_QUEUE_MAX_AGE_DAYS = 30;
  const MISSION_SYNC_MAX_PAGES = 80;
  const MISSION_SYNC_NEW_LISTING_MAX_PAGES = 10;
  const MISSION_SYNC_SEARCH_SLICE_DAYS = 1;
  const MISSION_SYNC_SEARCH_MAX_PAGES = 40;
  const MISSION_SYNC_PAGE_DELAY_MS = 350;
  /** How long bot start will wait on the freshness sync before carrying on without it. */
  const START_BOT_SYNC_BUDGET_MS = 2e4;
  const NAVIGATION_SETTLE_MS = 1e4;
  function getMissionMaxAgeCutoffMs(asOfMs = Date.now()) {
    return asOfMs - MISSION_QUEUE_MAX_AGE_DAYS * 24 * 60 * 60 * 1e3;
  }
  function getMissionSyncCutoffMs(asOfMs = Date.now()) {
    return asOfMs - MISSION_SYNC_DAYS * 24 * 60 * 60 * 1e3;
  }
  const getMissionPostedMs = missionCore.getMissionPostedMs;
  function isMissionWithinMaxAge(mission, asOfMs = Date.now()) {
    const postedMs = getMissionPostedMs(mission);
    if (!postedMs) return true;
    return postedMs >= getMissionMaxAgeCutoffMs(asOfMs);
  }
  async function getFilteredUnclearedMissions(filters) {
    const [missions, progress, dictionary, nonMissionSet] = await Promise.all([
      getAllMissions(),
      getAllUserProgress(),
      getEssenceLootDictionary(),
      getNonMissionPostIdSet()
    ]);
    const normalizedFilters = filters ? normalizeAutomationFilters(filters) : null;
    const starFilter = normalizedFilters?.stars || [];
    const allStarsSelected = isAllStarsSelected(starFilter);
    let unclearedMissions = Object.values(missions).filter((m) => {
      if (nonMissionSet.has(m.postId) || nonMissionSet.has(String(m.postId || "").replace(/^t3_/, ""))) {
        return false;
      }
      // Archived records are reduced to id + date tombstones; they hold no
      // playable data and the post can no longer be played on Reddit anyway.
      if (missionCore.isTombstone(m)) {
        return false;
      }
      // Cloak / unflaired posts are not missions; Daily Dungeons are a separate
      // game mode and stay out of the queue unless explicitly opted in.
      if (!missionCore.isMissionKindQueueable(m, normalizedFilters)) {
        return false;
      }
      if (progress.cleared.includes(m.postId) || progress.disabled.includes(m.postId)) {
        return false;
      }
      if (!isMissionWithinMaxAge(m)) {
        return false;
      }
      return m.minLevel !== void 0 && m.maxLevel !== void 0;
    });
    if (normalizedFilters) {
      unclearedMissions = unclearedMissions.filter((m) => {
        if (starFilter.length > 0 && !allStarsSelected) {
          const missionDifficulty = getMissionStarDifficulty(m);
          if (missionDifficulty > 0 && !starFilter.includes(missionDifficulty)) {
            return false;
          }
        }
        if (normalizedFilters.minLevel !== void 0 || normalizedFilters.maxLevel !== void 0) {
          const minF = normalizedFilters.minLevel ?? 1;
          const maxF = normalizedFilters.maxLevel ?? 999;
          if (m.minLevel === void 0 || m.maxLevel === void 0) {
            return false;
          }
          if (m.minLevel > maxF || m.maxLevel < minF) {
            return false;
          }
        }
        if (normalizedFilters.targetEssences.length > 0) {
          if (!missionMatchesEssenceFilter(m, normalizedFilters.targetEssences, dictionary)) {
            return false;
          }
        }
        return true;
      });
    }
    unclearedMissions.sort((a, b) => getMissionSortTime(b) - getMissionSortTime(a));
    return unclearedMissions;
  }
  async function getNextUnclearedMission(filters) {
    const normalizedFilters = normalizeAutomationFilters(filters);
    const unclearedMissions = await getFilteredUnclearedMissions(normalizedFilters);
    const filteredMissions = filters?.excludePostIds ? unclearedMissions.filter((m) => !filters.excludePostIds.includes(m.postId)) : unclearedMissions;
    const debugPayload = {
      ts: Date.now(),
      filters: normalizedFilters,
      allStarsSelected: isAllStarsSelected(normalizedFilters.stars),
      excludePostIds: filters?.excludePostIds || null,
      matchedCount: unclearedMissions.length,
      afterExcludeCount: filteredMissions.length,
      nextPostId: filteredMissions[0]?.postId || null
    };
    console.log("[getNextUnclearedMission]", debugPayload);
    chrome.storage.local.set({ lazyfrogMissionQueueDebug: debugPayload }).catch(() => {
    });
    return filteredMissions[0] || null;
  }
  async function getNextUnclearedMissions(filters, count) {
    const normalizedFilters = normalizeAutomationFilters(filters);
    const unclearedMissions = await getFilteredUnclearedMissions(normalizedFilters);
    const filteredMissions = filters?.excludePostIds ? unclearedMissions.filter((m) => !filters.excludePostIds.includes(m.postId)) : unclearedMissions;
    return filteredMissions.slice(0, Math.max(0, count || 0));
  }
  const parseLevelRangeFromFlair = missionCore.parseLevelRangeFromFlair;
  function normalizeRedditPostIdForApi(postId) {
    if (!postId || typeof postId !== "string") return null;
    return postId.startsWith("t3_") ? postId : `t3_${postId}`;
  }
  async function fetchFlairLevelsBatchFromRedditApi(postIds) {
    const flairByPostId = /* @__PURE__ */ new Map();
    const unique = [...new Set(postIds.map(normalizeRedditPostIdForApi).filter(Boolean))];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const url = `https://www.reddit.com/api/info.json?id=${chunk.join(",")}`;
      try {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            Accept: "application/json",
            "User-Agent": "LazyFrog/0.16.1 (Chrome Extension; mission flair backfill)"
          }
        });
        if (!response.ok) {
          extensionLogger.warn("[MissionSync] info.json flair batch failed", {
            status: response.status,
            batch: i / 100
          });
          continue;
        }
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          extensionLogger.warn("[MissionSync] info.json returned non-JSON for flair batch", {
            batch: i / 100
          });
          continue;
        }
        const data = await response.json();
        for (const child of data?.data?.children || []) {
          const post = child?.data;
          if (!post?.id) continue;
          const flairText = extractFlairTextFromPost(post);
          const createdUtc = post.created_utc || post.created || 0;
          const classification = missionCore.classifyMission({
            flairText,
            title: post.title,
            postedAt: createdUtc ? createdUtc * 1e3 : 0,
            now: Date.now()
          });
          // Entries without a level range are kept deliberately: a Cloak or Daily
          // Dungeon flair carries no levels, and dropping them here is what
          // previously left those posts permanently unclassified.
          const fullId = `t3_${post.id}`;
          const entry = {
            flairText,
            missionKind: classification.kind,
            difficulty: classification.difficulty,
            minLevel: classification.levels?.minLevel,
            maxLevel: classification.levels?.maxLevel
          };
          flairByPostId.set(fullId, entry);
          flairByPostId.set(post.id, entry);
        }
      } catch (error) {
        extensionLogger.warn("[MissionSync] info.json flair batch error", {
          batch: i / 100,
          error: String(error)
        });
      }
      if (i + 100 < unique.length && MISSION_SYNC_PAGE_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(MISSION_SYNC_PAGE_DELAY_MS, 1100)));
      }
    }
    return flairByPostId;
  }
  /**
   * Write freshly fetched flair onto a mission record.
   * Returns true when something actually changed, so callers can count real work.
   */
  function applyFlairEntryToMission(mission, flairEntry) {
    if (!mission || !flairEntry) return false;
    let changed = false;
    if (flairEntry.flairText !== void 0 && mission.flairText !== flairEntry.flairText) {
      mission.flairText = flairEntry.flairText;
      changed = true;
    }
    if (flairEntry.missionKind && mission.missionKind !== flairEntry.missionKind) {
      mission.missionKind = flairEntry.missionKind;
      changed = true;
    }
    const hasLevels = Number.isFinite(flairEntry.minLevel) && Number.isFinite(flairEntry.maxLevel);
    if (hasLevels) {
      if (mission.minLevel !== flairEntry.minLevel || mission.maxLevel !== flairEntry.maxLevel) {
        mission.minLevel = flairEntry.minLevel;
        mission.maxLevel = flairEntry.maxLevel;
        changed = true;
      }
      mission.needsFlairLevels = false;
    }
    const difficulty = Math.max(Number(mission.difficulty) || 0, Number(flairEntry.difficulty) || 0);
    if (difficulty !== mission.difficulty) {
      mission.difficulty = difficulty;
      changed = true;
    }
    return changed;
  }
  function getFlairEntryForPostId(flairMap, postId) {
    if (!flairMap || !postId) return null;
    return flairMap.get(postId) || flairMap.get(String(postId).replace(/^t3_/, "")) || flairMap.get(normalizeRedditPostIdForApi(postId)) || null;
  }
  async function backfillFlairOnMissionArray(missions) {
    // Also pick up records predating flair classification, so existing storage
    // gets a missionKind rather than only newly synced posts.
    const needs = missions.filter(
      (m) => m?.postId && (m.needsFlairLevels || isPlaceholderLevelRange(m) || !m.missionKind)
    );
    if (!needs.length) {
      return { enriched: 0, scanned: 0 };
    }
    const flairMap = await fetchFlairLevelsBatchFromRedditApi(needs.map((m) => m.postId));
    let enriched = 0;
    for (const mission of needs) {
      const entry = getFlairEntryForPostId(flairMap, mission.postId);
      if (entry && applyFlairEntryToMission(mission, entry)) {
        enriched++;
      }
    }
    return { enriched, scanned: needs.length };
  }
  async function backfillPlaceholderMissionsInStorage(cutoffMs, options = {}) {
    const maxCount = options.maxCount ?? 600;
    const allMissions = await getAllMissions();
    const nonMissionSet = await getNonMissionPostIdSet();
    let candidates = Object.values(allMissions).filter((m) => {
      if (!m?.postId) return false;
      if (nonMissionSet.has(m.postId) || nonMissionSet.has(String(m.postId).replace(/^t3_/, ""))) {
        return false;
      }
      if (missionCore.isTombstone(m)) return false;
      // Records with no missionKind predate flair classification and need one,
      // even if their level range is already known.
      if (!isPlaceholderLevelRange(m) && m.missionKind) return false;
      const postedMs = getMissionPostedMs(m);
      if (postedMs && postedMs < cutoffMs) return false;
      return true;
    });
    candidates.sort((a, b) => (getMissionPostedMs(b) || 0) - (getMissionPostedMs(a) || 0));
    candidates = candidates.slice(0, maxCount);
    if (!candidates.length) {
      return { updated: 0, scanned: 0 };
    }
    const flairMap = await fetchFlairLevelsBatchFromRedditApi(candidates.map((m) => m.postId));
    const mergedMissions = { ...allMissions };
    let updated = 0;
    for (const mission of candidates) {
      const entry = getFlairEntryForPostId(flairMap, mission.postId);
      if (!entry) continue;
      const next = { ...mission };
      if (!applyFlairEntryToMission(next, entry)) continue;
      mergedMissions[mission.postId] = next;
      updated++;
    }
    if (updated > 0) {
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: mergedMissions }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve();
        });
      });
      chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
      });
    }
    return { updated, scanned: candidates.length };
  }
  const extractFlairTextFromPost = missionCore.extractFlairText;
  const parseDifficultyFromFlair = missionCore.parseDifficultyFromFlair;
  function resolveMissionDifficulty(existing, incoming) {
    const existingDifficulty = Number(existing?.difficulty) || Number(existing?.stars) || 0;
    const incomingDifficulty = Number(incoming?.difficulty) || Number(incoming?.stars) || 0;
    if (existing?.devvitEnrichedAt && existingDifficulty > 0) return existingDifficulty;
    return Math.max(existingDifficulty, incomingDifficulty);
  }
  const isPlaceholderLevelRange = missionCore.isPlaceholderLevelRange;
  function mergeSyncedMissionRecord(existing, incoming) {
    if (!existing) return { ...incoming };
    const incomingHasRealLevels = !isPlaceholderLevelRange(incoming);
    const existingHasPlaceholder = isPlaceholderLevelRange(existing);
    return {
      ...incoming,
      permalink: existing.permalink || incoming.permalink,
      missionTitle: existing.missionTitle || incoming.missionTitle,
      missionAuthorName: existing.missionAuthorName || incoming.missionAuthorName,
      encounters: existing.devvitEnrichedAt && existing.encounters?.length ? existing.encounters : incoming.encounters,
      environment: existing.devvitEnrichedAt && existing.environment && existing.environment !== PLACEHOLDER_ENVIRONMENT ? existing.environment : existing.environment || incoming.environment,
      difficulty: resolveMissionDifficulty(existing, incoming),
      foodImage: existing.foodImage || incoming.foodImage,
      foodName: existing.devvitEnrichedAt && existing.foodName ? existing.foodName : existing.foodName || incoming.foodName,
      authorWeaponId: existing.authorWeaponId || incoming.authorWeaponId,
      chef: existing.chef || incoming.chef,
      cart: existing.cart || incoming.cart,
      rarity: existing.rarity || incoming.rarity,
      minLevel: existingHasPlaceholder && incomingHasRealLevels ? incoming.minLevel : existing.minLevel ?? incoming.minLevel,
      maxLevel: existingHasPlaceholder && incomingHasRealLevels ? incoming.maxLevel : existing.maxLevel ?? incoming.maxLevel,
      postedAt: existing.postedAt || incoming.postedAt || (incoming.createdUtc ? incoming.createdUtc * 1e3 : void 0),
      createdUtc: existing.createdUtc || incoming.createdUtc,
      devvitEnrichedAt: existing.devvitEnrichedAt
    };
  }
  function parseDifficultyFromKind(kind) {
    if (!kind || typeof kind !== "string") return 0;
    const match = kind.match(/^t(\d+)$/i);
    if (!match) return 0;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : 0;
  }
  const PLACEHOLDER_ENVIRONMENT = "haunted_forest";
  const ENRICH_HUB_URL = "https://www.reddit.com/r/SwordAndSupperGame/";
  const DEFAULT_ENRICH_MAX_COUNT = 50;
  const DEFAULT_ENRICH_CONCURRENCY = 4;
  const ENRICH_GRPC_DELAY_MS = 120;
  const BOT_STATES_BLOCKING_ENRICH = /* @__PURE__ */ new Set([
    "starting",
    "navigating",
    "waitingForGame",
    "openingGame",
    "gameReady",
    "running",
    "completing",
    "waitingForDialogClose",
    "gameMission"
  ]);
  let metadataEnrichmentTabId = null;
  let metadataEnrichmentRunning = false;
  const pendingMissionEnrichments = /* @__PURE__ */ new Map();
  function normalizeEnrichPostId(postId) {
    if (!postId) return "";
    const s = String(postId).trim();
    if (s.startsWith("t3_")) return s;
    if (/^[a-z0-9]+$/i.test(s)) return `t3_${s}`;
    return s;
  }
  function postIdsMatch(a, b) {
    const left = normalizeEnrichPostId(a);
    const right = normalizeEnrichPostId(b);
    return !!left && left === right;
  }
  function hasEnrichableMissionData(data) {
    if (!data) return false;
    const difficulty = Number(data.difficulty);
    const hasEncounters = Array.isArray(data.encounters) && data.encounters.length > 0;
    const hasEnvironment = !!data.environment && data.environment !== PLACEHOLDER_ENVIRONMENT;
    return Number.isFinite(difficulty) && difficulty > 0 && hasEnvironment && hasEncounters;
  }
  function hasPartialEnrichData(data) {
    if (!data) return false;
    const difficulty = Number(data.difficulty);
    return Number.isFinite(difficulty) && difficulty > 0;
  }
  async function isEnrichmentBlockedByBot() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["activeBotSession", "lazyfrogBotPresentationState"], (result2) => {
        resolve(result2);
      });
    });
    if (!stored.activeBotSession) return { blocked: false };
    const state = stored.lazyfrogBotPresentationState || "";
    if (BOT_STATES_BLOCKING_ENRICH.has(state)) {
      return { blocked: true, reason: `Bot active (${state})` };
    }
    return { blocked: false };
  }
  async function getProtectedTabIdSet() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["lazyfrogProtectedTabIds"], (result2) => {
        resolve(result2.lazyfrogProtectedTabIds || []);
      });
    });
    return new Set(stored.filter((id) => typeof id === "number"));
  }
  function isDedicatedEnrichHubUrl(url) {
    const u = String(url || "");
    return u.includes("/r/SwordAndSupperGame") && !u.includes("/comments/");
  }
  const MISSION_COMMENTS_PATH_RE = /^\/r\/(?:SwordAndSupperGame|SwordAndSupper)\/comments\/[a-z0-9]+/i;
  function isMissionCommentsUrl(url) {
    try {
      const path = new URL(String(url || "")).pathname;
      return MISSION_COMMENTS_PATH_RE.test(path);
    } catch {
      return false;
    }
  }
  function getMissionPostIdShortFromUrl(url) {
    try {
      const match = new URL(String(url || "")).pathname.match(
        /^\/r\/(?:SwordAndSupperGame|SwordAndSupper)\/comments\/([a-z0-9]+)/i
      );
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
  function shouldAcceptRedditBotGameEvent(tab) {
    const url = tab?.url;
    if (!url || !url.includes("reddit.com")) return false;
    if (isDedicatedEnrichHubUrl(url)) return false;
    return isMissionCommentsUrl(url);
  }
  const BOT_TERMINAL_PRESENTATION_STATES = ["idle", "error"];
  const BOT_ACTIVE_PRESENTATION_STATES = [
    "starting",
    "navigating",
    "waitingForGame",
    "openingGame",
    "gameReady",
    "running",
    "completing",
    "waitingForDialogClose",
    "idleDialogOpen"
  ];
  const MID_MISSION_GAME_SCREENS = /* @__PURE__ */ new Set([
    "in_progress",
    "battle",
    "choice",
    "crossroads",
    "bargain",
    "creatorBonus",
    "skip",
    "start"
  ]);
  function isMidMissionPlayState(snapshot) {
    const pres = snapshot ? getPresentationStateName(snapshot) : null;
    const screen = snapshot?.context?.gameState?.screen;
    return (
      (pres === "running" || pres === "gameReady") &&
      !!screen &&
      MID_MISSION_GAME_SCREENS.has(screen)
    );
  }
  function isPrematureRedditRecoveryCompletion(source) {
    const src = String(source || "");
    return (
      src.includes("reddit-banner") ||
      src.includes("inn-") ||
      src.includes("victory-end-stuck") ||
      src.includes("missionUnavailable") ||
      src.includes("no-devvit") ||
      src.includes("mc-btn-inn")
    );
  }
  function logModalCloseDispatch(source, detail = {}) {
    const snapshot = getStateMachineSnapshot();
    const missionId =
      snapshot?.context?.currentMissionId || batchState.activePostId || detail.missionId || null;
    const screen = snapshot?.context?.gameState?.screen ?? null;
    const state = snapshot ? getPresentationStateName(snapshot) : null;
    const ts = Date.now();
    const txtLine =
      `[${new Date(ts).toISOString()}] MODAL_CLOSE_DISPATCHED` +
      ` | mission=${missionId || "?"}` +
      ` | screen=${screen ?? "null"}` +
      ` | state=${state || "?"}` +
      ` | source=${source}`;
    extensionLogger.warn(txtLine, {
      ts,
      event: "MODAL_CLOSE_DISPATCHED",
      missionId,
      screen,
      state,
      source,
      ...detail,
      auditKind: "modal-close-audit"
    });
    if (typeof fetch === "function") {
      chrome.storage.local.get(["automationConfig"], (result2) => {
        const cfg = result2?.automationConfig || {};
        const remoteUrl = cfg.remoteUrl || "http://localhost:7856/log";
        fetch(remoteUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ts,
            level: "WARN",
            source: "SW",
            kind: "modal-close-audit",
            message: txtLine,
            data: { event: "MODAL_CLOSE_DISPATCHED", missionId, screen, state, source, ...detail }
          })
        }).catch(() => {});
      });
    }
  }
  function sendCloseGameDialog(tabId, source, broadcast = false) {
    logModalCloseDispatch(source, { tabId, broadcast });
    const payload = { type: "CLOSE_GAME_DIALOG", source };
    if (broadcast) {
      broadcastToReddit(payload);
      return;
    }
    if (tabId != null) {
      sendToRedditTab(tabId, payload);
      return;
    }
    broadcastToReddit(payload);
  }
  function isSafeToCloseGameDialog() {
    const snapshot = getStateMachineSnapshot();
    const pres = snapshot ? getPresentationStateName(snapshot) : null;
    const screen = snapshot?.context?.gameState?.screen;
    if (pres === "waitingForDialogClose" || pres === "completing" || pres === "navigating") {
      return true;
    }
    if (pres === "running" || pres === "gameReady" || pres === "openingGame" || pres === "waitingForGame") {
      if (screen && MID_MISSION_GAME_SCREENS.has(screen)) {
        return false;
      }
      if (pres === "running" || pres === "gameReady") {
        if (!screen || screen === "in_progress" || screen === "unknown" || screen === "start") {
          return false;
        }
      }
    }
    return true;
  }
  function shouldAcceptMissionCompletedEvent(tab, message) {
    const source = message?.source || "";
    if (source.includes("reddit-banner") || source.includes("inn-button") || source.includes("inn-screen")) {
      return true;
    }
    return shouldAcceptRedditBotGameEvent(tab);
  }
  function cancelPendingMissionEnrichment(postId) {
    const key = normalizeEnrichPostId(postId);
    const pending = pendingMissionEnrichments.get(key);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingMissionEnrichments.delete(key);
  }
  function fulfillPendingMissionEnrichment(postId, payload) {
    const key = normalizeEnrichPostId(postId);
    const pending = pendingMissionEnrichments.get(key);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    pendingMissionEnrichments.delete(key);
    pending.resolve(payload);
    return true;
  }
  function waitForMissionMetadataCapture(postId, timeoutMs = 55e3) {
    const key = normalizeEnrichPostId(postId);
    return new Promise((resolve) => {
      cancelPendingMissionEnrichment(key);
      const timeoutId = setTimeout(() => {
        pendingMissionEnrichments.delete(key);
        resolve({ success: false, error: "Timeout waiting for Devvit initialData (/api/init)" });
      }, timeoutMs);
      pendingMissionEnrichments.set(key, { resolve, timeoutId });
    });
  }
  function missionDataFromInitPayload(initPayload) {
    const mission = initPayload?.missionMetadata?.mission;
    const meta = initPayload?.missionMetadata;
    if (!mission) return null;
    return {
      title: meta?.missionTitle,
      authorName: meta?.missionAuthorName || initPayload?.username,
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
  }
  function missionPermalinkFromPostId(postId) {
    const shortId = postId?.startsWith("t3_") ? postId.slice(3) : postId;
    return `https://www.reddit.com/r/SwordAndSupperGame/comments/${shortId}/`;
  }
  function isPlaceholderMissionRecord(mission) {
    if (!mission) return true;
    if (mission.devvitEnrichedAt) return false;
    const hasRealEnvironment = mission.environment && mission.environment !== PLACEHOLDER_ENVIRONMENT;
    const hasEncounters = Array.isArray(mission.encounters) && mission.encounters.length > 0;
    const hasDifficulty = Number(mission.difficulty) > 0;
    return !hasRealEnvironment || !hasEncounters || !hasDifficulty;
  }
  function waitForTabComplete(tabId, timeoutMs = 25e3) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const poll = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (tab?.status === "complete") {
            resolve();
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error("Tab load timeout"));
            return;
          }
          setTimeout(poll, 350);
        });
      };
      poll();
    });
  }
  function sendMessageToRedditMainFrame(tabId, message, callback) {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, callback);
  }
  function fetchDevvitMissionDataOnTab(tabId, postId) {
    return new Promise((resolve) => {
      sendMessageToRedditMainFrame(
        tabId,
        { type: "FETCH_MISSION_DATA_FROM_PAGE", postId: normalizeEnrichPostId(postId) },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: "No response" });
        }
      );
    });
  }
  function enrichMissionOnTab(tabId, postId) {
    return new Promise((resolve) => {
      sendMessageToRedditMainFrame(
        tabId,
        { type: "ENRICH_MISSION_ON_PAGE", postId: normalizeEnrichPostId(postId) },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { success: false, error: "No response" });
        }
      );
    });
  }
  async function fetchInitFromDevvitFrames(tabId, postId) {
    const frames = await new Promise((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId }, (result2) => {
        resolve(result2 || []);
      });
    });
    for (const frame of frames) {
      if (!frame.url?.includes("devvit.net")) continue;
      const initPayload = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { type: "FETCH_DEVVIT_API_INIT", expectedPostId: normalizeEnrichPostId(postId) },
          { frameId: frame.frameId },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(response?.init || null);
          }
        );
      });
      const data = missionDataFromInitPayload(initPayload);
      if (hasEnrichableMissionData(data)) {
        return { init: initPayload, data };
      }
    }
    return null;
  }
  async function upsertMissionFromDevvitFetch(postId, existing, data) {
    const missionsMap = await getAllMissions();
    const permalink = existing?.permalink || missionPermalinkFromPostId(postId);
    const record = normalizeMissionRecord({
      ...existing,
      postId,
      timestamp: existing?.timestamp || Date.now(),
      permalink,
      missionTitle: data.title || existing?.missionTitle || data.foodName || `Mission ${String(postId).replace(/^t3_/, "")}`,
      missionAuthorName: data.authorName || existing?.missionAuthorName || "Unknown",
      environment: data.environment || existing?.environment || PLACEHOLDER_ENVIRONMENT,
      encounters: data.encounters || existing?.encounters || [],
      minLevel: data.minLevel ?? existing?.minLevel ?? 1,
      maxLevel: data.maxLevel ?? existing?.maxLevel ?? 340,
      difficulty: data.difficulty ?? existing?.difficulty ?? 0,
      foodImage: existing?.foodImage || "",
      foodName: data.foodName || existing?.foodName || "",
      authorWeaponId: existing?.authorWeaponId || "",
      chef: existing?.chef || "",
      cart: existing?.cart || "",
      rarity: existing?.rarity || "common",
      devvitEnrichedAt: hasEnrichableMissionData(data) ? Date.now() : existing?.devvitEnrichedAt
    });
    missionsMap[postId] = record;
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: missionsMap }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
    chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
    });
    return record;
  }
  async function upsertMissionFromDevvitInit(initPayload, existing) {
    const postId = initPayload?.postId || existing?.postId;
    if (!postId) return null;
    const mission = initPayload?.missionMetadata?.mission;
    if (!mission) return null;
    const meta = initPayload.missionMetadata;
    return upsertMissionFromDevvitFetch(postId, existing, {
      title: meta?.missionTitle || existing?.missionTitle,
      authorName: meta?.missionAuthorName || existing?.missionAuthorName,
      environment: mission.environment,
      encounters: mission.encounters,
      minLevel: mission.minLevel,
      maxLevel: mission.maxLevel,
      difficulty: mission.difficulty,
      foodName: mission.foodName
    });
  }
  async function getEnrichmentSettings() {
    const stored = await new Promise((resolve) => {
      chrome.storage.local.get(["missionEnrichSettings"], (result2) => {
        resolve(result2.missionEnrichSettings || {});
      });
    });
    return {
      maxCount: Number(stored.maxCount) > 0 ? Math.min(500, Number(stored.maxCount)) : DEFAULT_ENRICH_MAX_COUNT,
      concurrency: Number(stored.concurrency) > 0 ? Math.min(24, Number(stored.concurrency)) : DEFAULT_ENRICH_CONCURRENCY
    };
  }
  async function pingRedditContentScript(tabId) {
    return new Promise((resolve) => {
      sendMessageToRedditMainFrame(tabId, { type: "PING_REDDIT_CS" }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(!!response?.ok);
      });
    });
  }
  async function ensureRedditEnrichTabReady(tabId) {
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await pingRedditContentScript(tabId)) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  async function getOrCreateEnrichmentHubTab() {
    const protectedIds = await getProtectedTabIdSet();
    if (metadataEnrichmentTabId && protectedIds.has(metadataEnrichmentTabId)) {
      metadataEnrichmentTabId = null;
    }
    if (metadataEnrichmentTabId) {
      try {
        const tab = await chrome.tabs.get(metadataEnrichmentTabId);
        if (tab?.id && !protectedIds.has(tab.id) && isDedicatedEnrichHubUrl(tab.url)) {
          return tab.id;
        }
        if (tab?.id && !protectedIds.has(tab.id) && !isDedicatedEnrichHubUrl(tab.url)) {
          await chrome.tabs.update(tab.id, { url: ENRICH_HUB_URL, active: false });
          await waitForTabComplete(tab.id);
          await ensureRedditEnrichTabReady(tab.id);
          return tab.id;
        }
      } catch {
        metadataEnrichmentTabId = null;
      }
    }
    const tab = await chrome.tabs.create({ url: ENRICH_HUB_URL, active: false });
    metadataEnrichmentTabId = tab.id ?? null;
    if (metadataEnrichmentTabId) {
      await waitForTabComplete(metadataEnrichmentTabId);
      await ensureRedditEnrichTabReady(metadataEnrichmentTabId);
    }
    return metadataEnrichmentTabId;
  }
  function batchGrpcEnrichOnTab(tabId, postIds, concurrency) {
    return new Promise((resolve) => {
      sendMessageToRedditMainFrame(
        tabId,
        {
          type: "BATCH_GRPC_ENRICH_MISSIONS",
          postIds,
          concurrency,
          delayMs: ENRICH_GRPC_DELAY_MS
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, results: [] });
            return;
          }
          resolve(response || { success: false, error: "No response", results: [] });
        }
      );
    });
  }
  async function enrichSingleMissionGrpcFast(mission, tabId) {
    const postId = normalizeEnrichPostId(mission.postId);
    const response = await fetchDevvitMissionDataOnTab(tabId, postId);
    const data = response?.data;
    if (response?.success && hasPartialEnrichData(data)) {
      await upsertMissionFromDevvitFetch(postId, mission, data);
      return {
        success: true,
        postId,
        source: "grpc-fast",
        partial: !hasEnrichableMissionData(data)
      };
    }
    return { success: false, postId, error: response?.error || "GRPC returned no mission metadata" };
  }
  async function enrichSingleMissionWithPreview(mission) {
    const postId = normalizeEnrichPostId(mission.postId);
    const permalink = mission.permalink || missionPermalinkFromPostId(postId);
    const capturePromise = waitForMissionMetadataCapture(postId);
    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url: permalink, active: false });
      tabId = tab.id ?? null;
      if (!tabId) {
        cancelPendingMissionEnrichment(postId);
        return { success: false, postId, error: "Failed to open enrichment tab" };
      }
      await waitForTabComplete(tabId);
      await new Promise((r) => setTimeout(r, 1500));
      const pageResponse = await enrichMissionOnTab(tabId, postId);
      if (pageResponse?.success && hasEnrichableMissionData(pageResponse.data)) {
        cancelPendingMissionEnrichment(postId);
        await upsertMissionFromDevvitFetch(postId, mission, pageResponse.data);
        return { success: true, postId, source: pageResponse.source || "preview" };
      }
      const captured = await capturePromise;
      if (captured?.success && hasEnrichableMissionData(captured.data)) {
        await upsertMissionFromDevvitFetch(postId, mission, captured.data);
        return { success: true, postId, source: captured.source || "initialData" };
      }
      return { success: false, postId, error: captured?.error || pageResponse?.error || "Preview enrich failed" };
    } catch (error) {
      cancelPendingMissionEnrichment(postId);
      return { success: false, postId, error: String(error) };
    } finally {
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
        } catch {
        }
      }
    }
  }
  async function runMissionMetadataEnrichment(options = {}) {
    if (metadataEnrichmentRunning) {
      extensionLogger.warn("[MissionEnrich] Enrichment already running, skipping duplicate request");
      return { enriched: 0, failed: 0, skipped: 0, total: 0, alreadyRunning: true, mode: "grpc-batch" };
    }
    if (options.allowDuringBot !== true) {
      const block = await isEnrichmentBlockedByBot();
      if (block.blocked) {
        extensionLogger.warn("[MissionEnrich] Skipped — bot session would be interrupted", {
          reason: block.reason
        });
        return {
          enriched: 0,
          failed: 0,
          skipped: 0,
          total: 0,
          blocked: true,
          reason: block.reason,
          mode: "grpc-batch"
        };
      }
    }
    metadataEnrichmentRunning = true;
    const settings = await getEnrichmentSettings();
    const maxCount = options.maxCount ?? settings.maxCount;
    const concurrency = options.concurrency ?? settings.concurrency;
    const previewFallback = options.previewFallback === true;
    const progress = await getAllUserProgress();
    const clearedSet = new Set(progress?.cleared || []);
    const allMissions = await getAllMissions();
    let candidates = Object.values(allMissions).filter(
      (m) => m?.postId && !clearedSet.has(m.postId) && isPlaceholderMissionRecord(m)
    );
    if (Array.isArray(options.postIds) && options.postIds.length > 0) {
      const wanted = new Set(options.postIds.map((id) => normalizeEnrichPostId(id)));
      candidates = candidates.filter((m) => wanted.has(normalizeEnrichPostId(m.postId)));
    }
    candidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const queue = candidates.slice(0, maxCount);
    const skippedByCap = Math.max(0, candidates.length - queue.length);
    let enriched = 0;
    let failed = 0;
    extensionLogger.log("[MissionEnrich] Starting fast GRPC batch enrichment", {
      candidates: candidates.length,
      processing: queue.length,
      skippedByCap,
      maxCount,
      concurrency,
      mode: "grpc-batch"
    });
    try {
      const tabId = await getOrCreateEnrichmentHubTab();
      if (!tabId) {
        return { enriched: 0, failed: queue.length, skipped: skippedByCap, total: candidates.length, error: "No Reddit hub tab" };
      }
      const ready = await ensureRedditEnrichTabReady(tabId);
      if (!ready) {
        extensionLogger.error("[MissionEnrich] Reddit content script not ready on hub tab", { tabId });
        return {
          enriched: 0,
          failed: queue.length,
          skipped: skippedByCap,
          total: candidates.length,
          processed: queue.length,
          error: "Reddit content script not ready",
          mode: "grpc-batch"
        };
      }
      const batch = await batchGrpcEnrichOnTab(
        tabId,
        queue.map((m) => normalizeEnrichPostId(m.postId)),
        concurrency
      );
      if (!batch.success && batch.error) {
        extensionLogger.error("[MissionEnrich] Batch GRPC failed", { error: batch.error, tabId });
      }
      const results = batch.results || [];
      if (results.length === 0 && queue.length > 0) {
        extensionLogger.warn("[MissionEnrich] No batch results — falling back to sequential GRPC", {
          count: queue.length
        });
        for (const mission of queue) {
          const one = await enrichSingleMissionGrpcFast(mission, tabId);
          if (one.success) enriched++;
          else failed++;
        }
      } else {
        for (const item of results) {
          const postId = normalizeEnrichPostId(item.postId);
          const mission = allMissions[postId] || queue.find((m) => normalizeEnrichPostId(m.postId) === postId);
          const data = item.data;
          if (mission && (item.success || hasPartialEnrichData(data)) && hasPartialEnrichData(data)) {
            await upsertMissionFromDevvitFetch(postId, mission, data);
            enriched++;
          } else {
            failed++;
          }
        }
      }
      if (previewFallback && failed > 0) {
        const failedIds = new Set(
          results.filter((r) => !r.success).map((r) => normalizeEnrichPostId(r.postId))
        );
        for (const mission of queue) {
          if (!failedIds.has(normalizeEnrichPostId(mission.postId))) continue;
          const previewResult = await enrichSingleMissionWithPreview(mission);
          if (previewResult.success) {
            enriched++;
            failed--;
          }
        }
      }
    } finally {
      metadataEnrichmentRunning = false;
    }
    const summary = {
      enriched,
      failed,
      skipped: skippedByCap,
      total: candidates.length,
      processed: queue.length,
      mode: "grpc-batch",
      maxCount,
      concurrency
    };
    extensionLogger.log("[MissionEnrich] Fast enrichment complete", summary);
    return summary;
  }
  function hasCompletedTitleHint(title) {
    if (!title || typeof title !== "string") return false;
    const lowered = title.toLowerCase();
    return lowered.includes("cleared") || lowered.includes("completed") || lowered.includes("[done]") || lowered.includes("solved") || title.includes("✓") || title.includes("✔");
  }
  function isLikelyNonMissionRedditPost(post) {
    if (!post || typeof post !== "object") return true;
    return missionCore.isNonMissionTitle(post.title);
  }
  /**
   * Reddit listing post -> mission record, or null to skip the post.
   *
   * Classification is delegated to the shared core so that flair rules (Cloak is
   * not a mission, Daily Dungeon is its own kind, unflaired posts get a grace
   * window before being written off) are identical everywhere. The flair text
   * and resolved kind are persisted on the record -- previously the flair was
   * parsed for levels and then thrown away, which made those rules impossible
   * to apply downstream.
   *
   * `options.skipReason` receives why a post was rejected, for sync stats.
   */
  function mapRedditPostToMission(child, options = {}) {
    const post = child?.data;
    if (!post?.id || !post?.permalink) return null;
    if (post.stickied || post.pinned) return null;
    const createdUtc = post.created_utc || post.created || 0;
    const postedAt = createdUtc ? createdUtc * 1e3 : Date.now();
    const flairText = extractFlairTextFromPost(post);
    const classification = missionCore.classifyMission({
      flairText,
      title: post.title,
      postedAt,
      now: Date.now()
    });
    if (classification.kind === MissionKind.NOT_MISSION) {
      if (options.skipReason) options.skipReason.value = classification.reason;
      return null;
    }
    const allowPlaceholders = options.allowPlaceholders === true;
    const parsedLevels = classification.levels;
    // Unflaired and still inside the grace window: keep only when the caller is
    // willing to hold a placeholder open for a later flair backfill.
    if (classification.kind === MissionKind.UNKNOWN && !allowPlaceholders) {
      if (options.skipReason) options.skipReason.value = classification.reason;
      return null;
    }
    // A Daily Dungeon has no level flair by design, so it must never be gated on
    // one the way a standard mission is.
    if (!parsedLevels && !allowPlaceholders && classification.kind !== MissionKind.DAILY_DUNGEON) {
      if (options.skipReason) options.skipReason.value = "noLevelFlair";
      return null;
    }
    const levelRange = parsedLevels || {
      minLevel: missionCore.PLACEHOLDER_MIN_LEVEL,
      maxLevel: missionCore.PLACEHOLDER_MAX_LEVEL
    };
    return {
      postId: `t3_${post.id}`,
      flairText,
      missionKind: classification.kind,
      timestamp: postedAt,
      postedAt,
      createdUtc: createdUtc || void 0,
      permalink: `https://www.reddit.com${post.permalink}`,
      missionTitle: post.title || `Mission ${post.id}`,
      missionAuthorName: post.author || "Unknown",
      environment: "haunted_forest",
      encounters: [],
      minLevel: levelRange.minLevel,
      maxLevel: levelRange.maxLevel,
      difficulty: parseDifficultyFromFlair(flairText),
      needsFlairLevels: !parsedLevels,
      foodImage: "",
      foodName: "",
      authorWeaponId: "",
      chef: "",
      cart: "",
      rarity: "common",
      _completedTitleHint: hasCompletedTitleHint(post.title || "")
    };
  }
  function ingestRedditListingChildren(children, cutoffMs, untilMs, missions, seenPostIds, stats, options = {}) {
    let oldestOnPageMs = Infinity;
    for (const child of children) {
      const createdMs = (child?.data?.created_utc || child?.data?.created || 0) * 1e3;
      if (createdMs) {
        oldestOnPageMs = Math.min(oldestOnPageMs, createdMs);
      }
      if (createdMs && createdMs < cutoffMs) continue;
      if (untilMs && createdMs && createdMs > untilMs) continue;
      stats.postsScanned++;
      const skipReason = { value: null };
      const mission = mapRedditPostToMission(child, { ...options, skipReason });
      if (!mission) {
        // Break the skip count out by cause so a sync that silently drops
        // everything is visible in the summary rather than guessed at.
        const reason = skipReason.value || "other";
        stats.skippedByReason = stats.skippedByReason || {};
        stats.skippedByReason[reason] = (stats.skippedByReason[reason] || 0) + 1;
        if (reason === "noLevelFlair" || reason === "awaitingFlair" || reason === "noFlairPastGrace") {
          stats.postsSkippedNoFlair = (stats.postsSkippedNoFlair || 0) + 1;
        }
        continue;
      }
      stats.byKind = stats.byKind || {};
      stats.byKind[mission.missionKind] = (stats.byKind[mission.missionKind] || 0) + 1;
      if (mission.needsFlairLevels) {
        stats.postsWithoutFlair++;
      } else {
        stats.postsWithFlair++;
      }
      if (seenPostIds.has(mission.postId)) continue;
      seenPostIds.add(mission.postId);
      missions.push(mission);
    }
    return oldestOnPageMs;
  }
  async function fetchRedditJsonListing(url) {
    const response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        Accept: "application/json",
        "User-Agent": "LazyFrog/0.16.1 (Chrome Extension; mission sync)"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch subreddit feed: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Reddit returned non-JSON (${contentType || "unknown"})`);
    }
    return response.json();
  }
  async function fetchMissionsFromRedditNewListing(cutoffMs, missions, seenPostIds, stats, options = {}) {
    const maxPages = options.maxPages ?? MISSION_SYNC_NEW_LISTING_MAX_PAGES;
    let after = null;
    let page = 0;
    while (page < maxPages) {
      const url = new URL("https://www.reddit.com/r/SwordAndSupperGame/new.json");
      url.searchParams.set("limit", "100");
      if (after) {
        url.searchParams.set("after", after);
      }
      const data = await fetchRedditJsonListing(url);
      const listingData = data?.data;
      const children = listingData?.children || [];
      if (!children.length) break;
      const oldestOnPageMs = ingestRedditListingChildren(children, cutoffMs, null, missions, seenPostIds, stats, options);
      after = listingData?.after || null;
      page++;
      stats.pagesFetched = (stats.pagesFetched || 0) + 1;
      const pagePastCutoff = Number.isFinite(oldestOnPageMs) && oldestOnPageMs < cutoffMs;
      if (pagePastCutoff || !after) break;
      if (MISSION_SYNC_PAGE_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_PAGE_DELAY_MS));
      }
    }
  }
  async function fetchMissionsFromRedditSearchWindow(cutoffMs, untilMs, missions, seenPostIds, stats, options = {}) {
    const maxPages = options.maxSearchPages ?? MISSION_SYNC_SEARCH_MAX_PAGES;
    const startSec = Math.floor(cutoffMs / 1e3);
    const endSec = Math.floor(untilMs / 1e3);
    let after = null;
    for (let page = 0; page < maxPages; page++) {
      const url = new URL("https://www.reddit.com/r/SwordAndSupperGame/search.json");
      url.searchParams.set("q", `timestamp:${startSec}..${endSec}`);
      url.searchParams.set("restrict_sr", "on");
      url.searchParams.set("sort", "new");
      url.searchParams.set("limit", "100");
      url.searchParams.set("include_over_18", "on");
      if (after) {
        url.searchParams.set("after", after);
      }
      let data;
      try {
        data = await fetchRedditJsonListing(url);
      } catch (error) {
        extensionLogger.warn("[MissionSync] Search window fetch failed", {
          startSec,
          endSec,
          page,
          error: String(error)
        });
        break;
      }
      const listingData = data?.data;
      const children = listingData?.children || [];
      if (!children.length) break;
      ingestRedditListingChildren(children, cutoffMs, untilMs, missions, seenPostIds, stats, options);
      after = listingData?.after || null;
      stats.searchPagesFetched = (stats.searchPagesFetched || 0) + 1;
      if (!after) break;
      if (MISSION_SYNC_PAGE_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_PAGE_DELAY_MS));
      }
    }
  }
  async function fetchMissionsFromRedditSince(cutoffMs, options = {}) {
    const missions = [];
    const seenPostIds = /* @__PURE__ */ new Set();
    const stats = {
      postsScanned: 0,
      postsWithFlair: 0,
      postsWithoutFlair: 0,
      postsSkippedNoFlair: 0,
      pagesFetched: 0,
      searchPagesFetched: 0,
      searchSlicesFetched: 0
    };
    const nowMs = Date.now();
    await fetchMissionsFromRedditNewListing(cutoffMs, missions, seenPostIds, stats, options);
    const sliceMs = (options.searchSliceDays ?? MISSION_SYNC_SEARCH_SLICE_DAYS) * 24 * 60 * 60 * 1e3;
    let sliceEnd = nowMs;
    while (sliceEnd > cutoffMs) {
      const sliceStart = Math.max(cutoffMs, sliceEnd - sliceMs);
      await fetchMissionsFromRedditSearchWindow(sliceStart, sliceEnd, missions, seenPostIds, stats, options);
      stats.searchSlicesFetched++;
      sliceEnd = sliceStart;
      if (MISSION_SYNC_PAGE_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, MISSION_SYNC_PAGE_DELAY_MS));
      }
    }
    missions._syncStats = stats;
    return missions;
  }
  async function ensureSubredditTabForMissionScan() {
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: "https://www.reddit.com/r/SwordAndSupperGame/*" }, resolve);
    });
    if (tabs?.length) {
      return tabs[0];
    }
    extensionLogger.log("[MissionDiscovery] Opening subreddit /new tab for DOM mission scan");
    const tab = await chrome.tabs.create({ url: SUBREDDIT_SCAN_URL, active: false });
    await new Promise((resolve) => setTimeout(resolve, 4500));
    return tab;
  }
  async function scanOpenSubredditTabsForMissions() {
    let tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: "https://www.reddit.com/r/SwordAndSupperGame/*" }, resolve);
    });
    if (!tabs?.length) {
      const opened = await ensureSubredditTabForMissionScan();
      tabs = opened ? [opened] : [];
    }
    let tabsScanned = 0;
    for (const tab of tabs) {
      if (!tab?.id) continue;
      try {
        await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tab.id, { type: "SCAN_SUBREDDIT_MISSIONS" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(response);
          });
        });
        tabsScanned++;
      } catch (error) {
        extensionLogger.log("[MissionSync] Subreddit tab scan skipped", {
          tabId: tab.id,
          error: String(error)
        });
      }
    }
    return tabsScanned;
  }
  async function pruneUnflairedJunkMissionsFromStorage(options = {}) {
    const tagAsNonMission = options.tagAsNonMission !== false;
    const allMissions = await getAllMissions();
    const toRemove = [];
    const now = Date.now();
    for (const [postId, mission] of Object.entries(allMissions)) {
      if (!mission) continue;
      if (missionCore.isTombstone(mission)) continue;
      // Never prune a real mission or a Daily Dungeon. A Daily Dungeon carries no
      // level flair by design, so it always looks like a placeholder here -- the
      // kind check is what stops it being deleted and permanently blacklisted.
      const kind = missionCore.getMissionKind(mission);
      if (kind !== MissionKind.NOT_MISSION && kind !== MissionKind.UNKNOWN) continue;
      if (!isPlaceholderLevelRange(mission)) continue;
      if (mission.devvitEnrichedAt) continue;
      const postedMs = getMissionPostedMs(mission);
      // Only prune once the post has had its full grace window to acquire a flair.
      // Previously this comparison was inverted -- it kept stale placeholders and
      // deleted fresh ones, destroying posts that were merely awaiting flair.
      if (postedMs && now - postedMs < missionCore.FLAIR_GRACE_MS) continue;
      const full = normalizeNonMissionPostId(postId);
      if (full) {
        toRemove.push(full);
      }
    }
    const unique = [...new Set(toRemove)];
    if (!unique.length) {
      return { removed: 0, tagged: 0 };
    }
    let removed = 0;
    const mergedMissions = { ...allMissions };
    for (const id of unique) {
      const short = id.replace(/^t3_/, "");
      if (mergedMissions[id]) {
        delete mergedMissions[id];
        removed++;
      }
      if (mergedMissions[short]) {
        delete mergedMissions[short];
        removed++;
      }
    }
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: mergedMissions }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    let tagged = 0;
    if (tagAsNonMission) {
      await addNonMissionPosts(unique);
      tagged = unique.length;
    }
    chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
    });
    extensionLogger.log("[MissionSync] Pruned unflaired junk placeholders", {
      removed,
      tagged,
      graceHours: missionCore.FLAIR_GRACE_MS / 36e5
    });
    return { removed, tagged };
  }
  async function fetchRecentMissionsFromReddit(daysBack = 3) {
    const cutoffMs = Date.now() - daysBack * 24 * 60 * 60 * 1e3;
    return fetchMissionsFromRedditSince(cutoffMs, { maxPages: Math.min(MISSION_SYNC_MAX_PAGES, 30) });
  }
  async function persistFetchedMissions(fetchedMissions, options = {}) {
    const overwriteExisting = options.overwriteExisting === true;
    const existingMissions = await getAllMissions();
    const mergedMissions = { ...existingMissions };
    const progress = await getAllUserProgress();
    const clearedSet = new Set(progress?.cleared || []);
    const nonMissionSet = await getNonMissionPostIdSet();
    let added = 0;
    let skippedExisting = 0;
    let updatedExisting = 0;
    let skippedNonMission = 0;
    let autoMarkedCleared = 0;
    const newlyAddedPostIds = [];
    for (const mission of fetchedMissions) {
      if (nonMissionSet.has(mission.postId) || nonMissionSet.has(String(mission.postId || "").replace(/^t3_/, ""))) {
        if (mergedMissions[mission.postId]) {
          delete mergedMissions[mission.postId];
        }
        skippedNonMission++;
        continue;
      }
      const existing = mergedMissions[mission.postId];
      if (!existing && (mission.needsFlairLevels || isPlaceholderLevelRange(mission))) {
        skippedExisting++;
        continue;
      }
      if (existing && !overwriteExisting) {
        const incomingHasRealLevels = !mission.needsFlairLevels && !isPlaceholderLevelRange(mission);
        const existingNeedsLevels = !existing || existing.minLevel == null || existing.maxLevel == null || isPlaceholderLevelRange(existing);
        if (incomingHasRealLevels && existingNeedsLevels) {
          const record = mergeSyncedMissionRecord(existing, mission);
          delete record._completedTitleHint;
          delete record.needsFlairLevels;
          mergedMissions[mission.postId] = record;
          updatedExisting++;
          continue;
        }
        skippedExisting++;
        continue;
      }
      const record = existing ? mergeSyncedMissionRecord(existing, mission) : { ...mission };
      delete record._completedTitleHint;
      delete record.needsFlairLevels;
      mergedMissions[mission.postId] = record;
      if (!existing) {
        added++;
        newlyAddedPostIds.push(mission.postId);
      }
      if (!existing && mission._completedTitleHint && !clearedSet.has(mission.postId)) {
        try {
          await markMissionCleared(mission.postId);
          clearedSet.add(mission.postId);
          autoMarkedCleared++;
          extensionLogger.log("[MissionSync] Auto-marked mission as completed from title hint", {
            postId: mission.postId,
            title: mission.missionTitle
          });
        } catch (error) {
          extensionLogger.warn("[MissionSync] Failed to auto-mark mission completion", {
            postId: mission.postId,
            title: mission.missionTitle,
            error: String(error)
          });
        }
      }
    }
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: mergedMissions }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
    chrome.runtime.sendMessage({ type: "MISSIONS_UPDATED" }).catch(() => {
    });
    try {
      const stored = await new Promise((resolve) => {
        chrome.storage.local.get(["automationFilters"], resolve);
      });
      await buildBotQueueSnapshot(stored.automationFilters);
    } catch (error) {
      extensionLogger.warn("[MissionSync] Failed to refresh bot queue snapshot after persist", {
        error: String(error)
      });
    }
    return { added, skippedExisting, updatedExisting, skippedNonMission, autoMarkedCleared, newlyAddedPostIds };
  }
  async function syncLatestMissionsFromReddit(options = {}) {
    const runEnrichment = options.runEnrichment === true;
    const daysBack = options.daysBack ?? MISSION_SYNC_DAYS;
    const syncPressedAt = Date.now();
    const cutoffMs = Date.now() - daysBack * 24 * 60 * 60 * 1e3;
    const missions = await fetchMissionsFromRedditSince(cutoffMs, {
      searchSliceDays: options.searchSliceDays ?? MISSION_SYNC_SEARCH_SLICE_DAYS,
      maxPages: options.maxPages,
      maxSearchPages: options.maxSearchPages
    });
    const syncStats = missions._syncStats || {};
    delete missions._syncStats;
    const fetchedFlairBackfill = await backfillFlairOnMissionArray(missions);
    if (fetchedFlairBackfill.enriched > 0) {
      syncStats.postsWithoutFlair = Math.max(0, (syncStats.postsWithoutFlair || 0) - fetchedFlairBackfill.enriched);
      syncStats.postsWithFlair = (syncStats.postsWithFlair || 0) + fetchedFlairBackfill.enriched;
    }
    const tabsScanned = await scanOpenSubredditTabsForMissions();
    const persistResult = await persistFetchedMissions(missions, { overwriteExisting: false });
    const placeholderCutoffMs = syncPressedAt - daysBack * 24 * 60 * 60 * 1e3;
    const storageFlairBackfill = await backfillPlaceholderMissionsInStorage(placeholderCutoffMs, {
      maxCount: 800
    });
    const prunedJunk = await pruneUnflairedJunkMissionsFromStorage({ tagAsNonMission: true });
    const archivedOld = await archiveOldMissions();
    const enrichment = runEnrichment ? await runMissionMetadataEnrichment({
      postIds: persistResult.newlyAddedPostIds,
      maxCount: Math.min(persistResult.newlyAddedPostIds.length, 100),
      allowDuringBot: false
    }) : null;
    extensionLogger.log("[MissionSync] Sync summary", {
      fetched: missions.length,
      added: persistResult.added,
      skippedExisting: persistResult.skippedExisting,
      updatedExisting: persistResult.updatedExisting,
      skippedNonMission: persistResult.skippedNonMission,
      daysBack,
      cutoffIso: new Date(cutoffMs).toISOString(),
      autoMarkedCleared: persistResult.autoMarkedCleared,
      postsScanned: syncStats.postsScanned,
      postsWithFlair: syncStats.postsWithFlair,
      postsWithoutFlair: syncStats.postsWithoutFlair,
      postsSkippedNoFlair: syncStats.postsSkippedNoFlair,
      pagesFetched: syncStats.pagesFetched,
      searchPagesFetched: syncStats.searchPagesFetched,
      searchSlicesFetched: syncStats.searchSlicesFetched,
      fetchedFlairBackfill,
      storageFlairBackfill,
      prunedJunk,
      archivedOld,
      subredditTabsScanned: tabsScanned,
      enrichment
    });
    return {
      syncedCount: persistResult.added,
      fetchedCount: missions.length,
      skippedExisting: persistResult.skippedExisting,
      updatedExisting: persistResult.updatedExisting + storageFlairBackfill.updated,
      skippedNonMission: persistResult.skippedNonMission,
      autoMarkedCleared: persistResult.autoMarkedCleared,
      daysBack,
      postsScanned: syncStats.postsScanned,
      postsWithFlair: syncStats.postsWithFlair,
      postsWithoutFlair: syncStats.postsWithoutFlair,
      postsSkippedNoFlair: syncStats.postsSkippedNoFlair,
      pagesFetched: syncStats.pagesFetched,
      searchPagesFetched: syncStats.searchPagesFetched,
      searchSlicesFetched: syncStats.searchSlicesFetched,
      fetchedFlairBackfill,
      storageFlairBackfill,
      prunedJunk,
      archivedOld,
      subredditTabsScanned: tabsScanned,
      enrichment
    };
  }
  async function syncRecentMissionsFromReddit(daysBack = 3, options = {}) {
    const runEnrichment = options.runEnrichment === true;
    const cutoffMs = Date.now() - daysBack * 24 * 60 * 60 * 1e3;
    const missions = await fetchMissionsFromRedditSince(cutoffMs, { maxPages: Math.min(MISSION_SYNC_MAX_PAGES, 30) });
    const syncStats = missions._syncStats || {};
    delete missions._syncStats;
    const persistResult = await persistFetchedMissions(missions, { overwriteExisting: false });
    const enrichment = runEnrichment ? await runMissionMetadataEnrichment({
      postIds: persistResult.newlyAddedPostIds,
      maxCount: Math.min(persistResult.newlyAddedPostIds.length, 100),
      allowDuringBot: false
    }) : null;
    extensionLogger.log("[MissionSync] 3-day sync summary", {
      fetched: missions.length,
      added: persistResult.added,
      skippedExisting: persistResult.skippedExisting,
      updatedExisting: persistResult.updatedExisting,
      autoMarkedCleared: persistResult.autoMarkedCleared,
      daysBack,
      enrichment
    });
    return {
      syncedCount: persistResult.added,
      fetchedCount: missions.length,
      skippedExisting: persistResult.skippedExisting,
      updatedExisting: persistResult.updatedExisting,
      autoMarkedCleared: persistResult.autoMarkedCleared,
      daysBack,
      enrichment
    };
  }
  async function getCachedUsernameForMigration() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["redditUserCache"], (result2) => {
        if (chrome.runtime.lastError || !result2.redditUserCache) {
          resolve("default");
          return;
        }
        const cache2 = result2.redditUserCache;
        resolve(cache2.username || "default");
      });
    });
  }
  async function requestUsernameFromRedditTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: "*://*.reddit.com/*" }, (tabs) => {
        if (chrome.runtime.lastError || !tabs.length) {
          console.log("[Migration] No Reddit tabs found to fetch username from");
          resolve();
          return;
        }
        console.log("[Migration] Found", tabs.length, "Reddit tabs, requesting username...");
        chrome.tabs.sendMessage(tabs[0].id, { type: "FETCH_REDDIT_USERNAME" }, (response) => {
          if (chrome.runtime.lastError) {
            console.log(
              "[Migration] Could not communicate with Reddit tab:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log("[Migration] Username fetch requested from Reddit tab");
          }
          setTimeout(resolve, 500);
        });
      });
    });
  }
  async function migrateToSeparateProgress() {
    await requestUsernameFromRedditTabs();
    const username = await getCachedUsernameForMigration();
    console.log("[Migration] Migrating progress to username:", username);
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEYS.MISSIONS, STORAGE_KEYS.USER_PROGRESS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const oldMissions = result2[STORAGE_KEYS.MISSIONS] || {};
        const existingUserProgress = result2[STORAGE_KEYS.USER_PROGRESS] || {};
        function isUserProgressData(val) {
          return val && typeof val === "object" && (Array.isArray(val.cleared) || Array.isArray(val.disabled) || typeof val.clearedAt === "object" && val.clearedAt !== null || typeof val.loot === "object" && val.loot !== null);
        }
        const isAlreadyMultiUser = Object.values(existingUserProgress).some(isUserProgressData);
        let existingMultiUserProgress;
        if (!isAlreadyMultiUser && Object.keys(existingUserProgress).length > 0) {
          console.log("[Migration] Detected flat progress format, converting to array-based format");
          const convertedUserProgress = {
            cleared: [],
            disabled: [],
            clearedAt: {},
            loot: {}
          };
          for (const [postId, entry] of Object.entries(existingUserProgress)) {
            const progressEntry = entry;
            if (progressEntry.cleared) {
              convertedUserProgress.cleared.push(postId);
            }
            if (progressEntry.disabled) {
              convertedUserProgress.disabled.push(postId);
            }
            if (progressEntry.clearedAt !== void 0) {
              convertedUserProgress.clearedAt[postId] = progressEntry.clearedAt;
            }
            if (progressEntry.totalLoot !== void 0 && progressEntry.totalLoot.length > 0) {
              convertedUserProgress.loot[postId] = progressEntry.totalLoot;
            }
          }
          existingMultiUserProgress = {
            [username]: convertedUserProgress
          };
        } else {
          existingMultiUserProgress = existingUserProgress;
        }
        const cleanedMissions = {};
        const multiUserProgress = { ...existingMultiUserProgress };
        const userProgress = multiUserProgress[username] || {
          cleared: [],
          disabled: [],
          clearedAt: {},
          loot: {}
        };
        let migrated = 0;
        let skipped = 0;
        for (const postId in oldMissions) {
          const old = oldMissions[postId];
          const hasProgress = old.cleared !== void 0 || old.clearedAt !== void 0 || old.disabled !== void 0 || old.totalLoot !== void 0;
          if (hasProgress) {
            if (old.cleared && !userProgress.cleared.includes(postId)) {
              userProgress.cleared.push(postId);
            }
            if (old.disabled && !userProgress.disabled.includes(postId)) {
              userProgress.disabled.push(postId);
            }
            if (old.clearedAt !== void 0) {
              userProgress.clearedAt[postId] = old.clearedAt;
            }
            if (old.totalLoot !== void 0 && old.totalLoot.length > 0) {
              userProgress.loot[postId] = old.totalLoot;
            }
            migrated++;
          } else {
            skipped++;
          }
          const { cleared, clearedAt, disabled, totalLoot, ...cleanMission } = old;
          cleanedMissions[postId] = cleanMission;
        }
        multiUserProgress[username] = userProgress;
        chrome.storage.local.set(
          {
            [STORAGE_KEYS.MISSIONS]: cleanedMissions,
            [STORAGE_KEYS.USER_PROGRESS]: multiUserProgress
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              console.log("[Migration] Successfully migrated:", { migrated, skipped, username });
              resolve({ migrated, skipped });
            }
          }
        );
      });
    });
  }
  async function needsMigration() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEYS.MISSIONS, STORAGE_KEYS.USER_PROGRESS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const missions = result2[STORAGE_KEYS.MISSIONS] || {};
        const userProgress = result2[STORAGE_KEYS.USER_PROGRESS] || {};
        if (Object.keys(userProgress).length === 0 && Object.keys(missions).length > 0) {
          const hasProgressFields = Object.values(missions).some(
            (m) => m.cleared !== void 0 || m.clearedAt !== void 0 || m.disabled !== void 0 || m.totalLoot !== void 0
          );
          resolve(hasProgressFields);
        } else {
          resolve(false);
        }
      });
    });
  }
  async function migrateMissionsStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([STORAGE_KEYS.MISSIONS], (result2) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        const rawMissions = result2[STORAGE_KEYS.MISSIONS] || {};
        const postIds = Object.keys(rawMissions);
        const migrationResult = {
          total: postIds.length,
          migrated: 0,
          alreadyFlat: 0,
          errors: []
        };
        if (postIds.length === 0) {
          resolve(migrationResult);
          return;
        }
        const migratedMissions = {};
        for (const postId of postIds) {
          try {
            const mission = rawMissions[postId];
            if (isLegacyFormat(mission)) {
              const migrated = normalizeMissionRecord(mission);
              if (migrated.authorWeaponId === "") {
                delete migrated.authorWeaponId;
              }
              if (migrated.chef === "") {
                delete migrated.chef;
              }
              if (migrated.cart === "") {
                delete migrated.cart;
              }
              if (!migrated.timestamp || migrated.timestamp === 0) {
                delete migrated.timestamp;
              }
              migratedMissions[postId] = migrated;
              migrationResult.migrated++;
            } else {
              migratedMissions[postId] = mission;
              migrationResult.alreadyFlat++;
            }
          } catch (error) {
            migrationResult.errors.push(`${postId}: ${error instanceof Error ? error.message : String(error)}`);
            migratedMissions[postId] = rawMissions[postId];
          }
        }
        chrome.storage.local.set({ [STORAGE_KEYS.MISSIONS]: migratedMissions }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            chrome.runtime.sendMessage({
              type: "MISSIONS_UPDATED"
            }).catch(() => {
            });
            resolve(migrationResult);
          }
        });
      });
    });
  }
  const definition = defineBackground(() => {
    extensionLogger.info("Starting up", {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: chrome.runtime.getManifest().version
    });
    let botActor = null;
    const gamePreviewReloadAttempts = /* @__PURE__ */ new Map();
    let gameFrameId = void 0;
    let gameTabId = void 0;
    const BATCH_STORAGE_KEY = "lazyfrogBatchQueue";
    const BATCH_SIZE = 1;
    const BATCH_REFILL_SIZE = 1;
    /**
     * How long the victory screen is left alone before navigating away, so the
     * mission result is confirmed server-side first. Not a dialog-teardown wait:
     * navigation removes the iframe on its own.
     */
    const DIALOG_CLOSE_SETTLE_MS = 1e3;
    const tabsPendingClose = /* @__PURE__ */ new Set();
    let activeMissionTabId = null;
    let dialogOwnerTabId = null;
    let batchState = {
      enabled: false,
      filters: null,
      activePostId: null,
      activeTabId: null,
      slots: []
    };
    function syncBotProtectedTabsToStorage() {
      const ids = [activeMissionTabId, dialogOwnerTabId, batchState.activeTabId].filter(
        (id) => typeof id === "number"
      );
      chrome.storage.local.set({ lazyfrogProtectedTabIds: [...new Set(ids)] });
    }
    function createBatchSlot(mission) {
      return {
        postId: mission.postId,
        permalink: normalizeMissionPermalink(mission.permalink || mission.postId),
        tabId: null,
        status: "pending",
        openedAt: 0,
        completedAt: 0,
        error: null
      };
    }
    async function persistBatchState() {
      try {
        await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: batchState });
      } catch {
      }
    }
    async function loadBatchState() {
      try {
        const data = await chrome.storage.local.get([BATCH_STORAGE_KEY]);
        const stored = data[BATCH_STORAGE_KEY];
        if (stored && Array.isArray(stored.slots)) {
          batchState = {
            enabled: !!stored.enabled,
            filters: stored.filters || null,
            activePostId: stored.activePostId || null,
            activeTabId: stored.activeTabId ?? null,
            slots: stored.slots
          };
          activeMissionTabId = batchState.activeTabId;
        }
      } catch {
      }
    }
    async function clearBatchState() {
      batchState = {
        enabled: false,
        filters: null,
        activePostId: null,
        activeTabId: null,
        slots: []
      };
      activeMissionTabId = null;
      dialogOwnerTabId = null;
      try {
        await chrome.storage.local.remove([BATCH_STORAGE_KEY]);
      } catch {
      }
    }
    function getInFlightPostIds() {
      return batchState.slots.filter((slot) => slot.status === "pending" || slot.status === "running").map((slot) => slot.postId);
    }
    function getSlotByPostId(postId) {
      return batchState.slots.find((slot) => slot.postId === postId);
    }
    function getSlotByTabId(tabId) {
      return batchState.slots.find((slot) => slot.tabId === tabId);
    }
    async function openSlotTab(slot) {
      if (slot.tabId) return slot.tabId;
      const tab = await chrome.tabs.create({ url: slot.permalink, active: false });
      slot.tabId = tab.id ?? null;
      slot.openedAt = Date.now();
      await persistBatchState();
      return slot.tabId;
    }
    async function openMissionsIntoBatch(missions) {
      for (const mission of missions) {
        const slot = createBatchSlot(mission);
        batchState.slots.push(slot);
        await openSlotTab(slot);
      }
      await persistBatchState();
    }
    async function refillBatchIfNeeded() {
      if (!batchState.enabled) return;
      const pendingCount = batchState.slots.filter((slot) => slot.status === "pending" || slot.status === "running").length;
      if (pendingCount > 0) return;
      const missions = await getNextUnclearedMissions({
        ...(batchState.filters || {}),
        excludePostIds: getInFlightPostIds()
      }, BATCH_REFILL_SIZE);
      if (missions.length > 0) {
        extensionLogger.log("[Batch] Refilling batch", { count: missions.length });
        await openMissionsIntoBatch(missions);
      }
    }
    async function activateSlot(slot, activateTab = true) {
      if (!slot) return false;
      if (!slot.tabId) {
        await openSlotTab(slot);
      }
      if (!slot.tabId) return false;
      slot.status = "running";
      batchState.activePostId = slot.postId;
      batchState.activeTabId = slot.tabId;
      activeMissionTabId = slot.tabId;
      syncBotProtectedTabsToStorage();
      if (activateTab) {
        try {
          await chrome.tabs.update(slot.tabId, { active: true });
        } catch (err) {
          extensionLogger.warn("[Batch] Failed to activate slot tab", {
            tabId: slot.tabId,
            error: String(err)
          });
        }
      }
      await persistBatchState();
      // The new mission tab is open and active — safe to close any tabs
      // that finished previous missions.
      await flushPendingTabCloses("activateSlot");
      return true;
    }
    async function activateNextBatchSlot() {
      await refillBatchIfNeeded();
      const nextSlot = batchState.slots.find((slot) => slot.status === "pending");
      if (!nextSlot) return null;
      const ok = await activateSlot(nextSlot, true);
      return ok ? nextSlot : null;
    }
    function isSlotFinalized(slot) {
      return !!slot && (slot.status === "completed" || slot.status === "failed");
    }
    async function flushPendingTabCloses(reason = "") {
      if (tabsPendingClose.size === 0) return;
      const ids = Array.from(tabsPendingClose);
      tabsPendingClose.clear();
      extensionLogger.log("[Batch] Closing deferred tabs", { ids, reason });
      for (const id of ids) {
        try {
          await chrome.tabs.remove(id);
        } catch {
        }
      }
    }
    async function markBatchSlotDoneByPostId(postId, status, error) {
      const slot = getSlotByPostId(postId);
      if (!slot || isSlotFinalized(slot)) return;
      slot.status = status;
      slot.error = error || null;
      slot.completedAt = Date.now();
      const tabIdToClose = slot.tabId;
      if (tabIdToClose) {
        // Defer the actual close until the next mission tab is activated so
        // the user is never left without a mission tab visible.
        tabsPendingClose.add(tabIdToClose);
        slot.tabId = null;
      }
      if (batchState.activePostId === postId || batchState.activeTabId === tabIdToClose) {
        batchState.activePostId = null;
        batchState.activeTabId = null;
        activeMissionTabId = null;
      }
      await persistBatchState();
    }
    async function markBatchSlotDoneByTabId(tabId, status, error) {
      const slot = getSlotByTabId(tabId);
      if (!slot || isSlotFinalized(slot)) return;
      slot.status = status;
      slot.error = error || null;
      slot.completedAt = Date.now();
      const slotTabId = slot.tabId;
      if (slotTabId) {
        tabsPendingClose.add(slotTabId);
        slot.tabId = null;
      }
      if (batchState.activeTabId === tabId) {
        batchState.activePostId = null;
        batchState.activeTabId = null;
        activeMissionTabId = null;
      }
      await persistBatchState();
    }
    async function closeAllBatchTabs() {
      const ids = batchState.slots.map((slot) => slot.tabId).filter((id) => typeof id === "number");
      const allIds = new Set([...ids, ...tabsPendingClose]);
      tabsPendingClose.clear();
      if (allIds.size > 0) {
        try {
          await chrome.tabs.remove(Array.from(allIds));
        } catch {
        }
      }
      await clearBatchState();
    }
    async function recoverBatchTabs() {
      await loadBatchState();
      if (!batchState.enabled || batchState.slots.length === 0) return;
      const tabs = await chrome.tabs.query({});
      const tabIds = new Set(tabs.map((t) => t.id));
      for (const slot of batchState.slots) {
        if (!slot.tabId) continue;
        if (!tabIds.has(slot.tabId)) {
          slot.tabId = null;
          if (slot.status === "running") {
            slot.status = "pending";
          }
        }
      }
      if (batchState.activeTabId && !tabIds.has(batchState.activeTabId)) {
        batchState.activeTabId = null;
        batchState.activePostId = null;
        activeMissionTabId = null;
      }
      await persistBatchState();
    }
    function initializeStateMachine() {
      if (botActor) {
        extensionLogger.log("[StateMachine] Stopping existing actor before creating new one");
        try {
          botActor.stop();
        } catch (error) {
          extensionLogger.warn("[StateMachine] Error stopping existing actor", {
            error: String(error)
          });
        }
        botActor = null;
      }
      botActor = createActor(botMachine);
      botActor.start();
      extensionLogger.log("[StateMachine] Actor started in service worker", {
        initialState: botActor.getSnapshot().value
      });
      subscribeToStateChanges();
    }
    function getPresentationStateName(stateObj) {
      try {
        if (typeof stateObj?.value === "string") return stateObj.value;
        if (stateObj?.value && typeof stateObj.value === "object") {
          if (stateObj.value.gameMission && typeof stateObj.value.gameMission === "string") {
            return String(stateObj.value.gameMission);
          }
          if (stateObj.value.idle && typeof stateObj.value.idle === "string") {
            return stateObj.value.idle === "dialogOpen" ? "idleDialogOpen" : "idle";
          }
        }
        if (stateObj?.matches) {
          if (stateObj.matches("idle.stopped")) return "idle";
          if (stateObj.matches("idle.dialogOpen")) return "idleDialogOpen";
          if (stateObj.matches("gameMission.waitingForGame")) return "waitingForGame";
          if (stateObj.matches("gameMission.openingGame")) return "openingGame";
          if (stateObj.matches("gameMission.gameReady")) return "gameReady";
          if (stateObj.matches("gameMission.running")) return "running";
          if (stateObj.matches("gameMission.completing")) return "completing";
          if (stateObj.matches("gameMission.waitingForDialogClose")) return "waitingForDialogClose";
        }
      } catch {
      }
      return String(stateObj?.value ?? "unknown");
    }
    function subscribeToStateChanges() {
      botActor.subscribe((state) => {
        const context = state.context;
        const presentationState = getPresentationStateName(state);
        extensionLogger.log("[StateMachine] State changed", {
          state: presentationState,
          context
        });
        if (context.currentMissionId) {
          chrome.storage.local.set({ lazyfrogCurrentMissionId: context.currentMissionId });
        }
        chrome.storage.local.set({ lazyfrogBotPresentationState: presentationState });
        if (
          presentationState === "idle" &&
          context.completionReason &&
          ["stopped", "no_missions", "error"].includes(context.completionReason)
        ) {
          chrome.storage.local.get(["activeBotSession"], (stored) => {
            if (stored.activeBotSession) {
              extensionLogger.log("[StateMachine] Clearing activeBotSession after idle", {
                completionReason: context.completionReason
              });
              chrome.storage.local.remove(["activeBotSession"]);
              broadcastToAllFrames({ type: "STOP_MISSION_AUTOMATION" });
            }
          });
        }
        syncBotProtectedTabsToStorage();
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id && tab.url?.includes("reddit.com")) {
              chrome.tabs.sendMessage(
                tab.id,
                {
                  type: "STATE_CHANGED",
                  state: presentationState,
                  context
                },
                { frameId: void 0 }
              );
            }
          });
        });
        handleStateTransition(state, context);
      });
    }
    initializeStateMachine();
    chrome.storage.local.set({
      lazyfrogSwHealth: { ok: true, phase: "ready", ts: Date.now() }
    });
    console.log("[LazyFrog:RunGate] SW_BOOT_OK");
    function sendToStateMachine(event) {
      if (!botActor) {
        extensionLogger.error("[StateMachine] Actor not initialized, cannot send event", { event });
        return false;
      }
      botActor.send(event);
      return true;
    }
    function getStateMachineSnapshot() {
      if (!botActor) {
        extensionLogger.warn("[StateMachine] Actor not initialized, returning null snapshot");
        return null;
      }
      return botActor.getSnapshot();
    }
    function isBotInActiveGamePlayState() {
      const snapshot = getStateMachineSnapshot();
      if (!snapshot?.matches) return false;
      return snapshot.matches("gameMission.running") || snapshot.matches("gameMission.gameReady");
    }
    function isActiveGameMissionState() {
      const snapshot = getStateMachineSnapshot();
      if (!snapshot?.matches) return false;
      return (
        snapshot.matches("gameMission.running") ||
        snapshot.matches("gameMission.gameReady") ||
        snapshot.matches("gameMission.openingGame") ||
        snapshot.matches("gameMission.waitingForGame")
      );
    }
    function shouldBlockNavigationWhenCheckFails() {
      const snapshot = getStateMachineSnapshot();
      if (!snapshot?.matches) return false;
      return (
        snapshot.matches("starting") ||
        snapshot.matches("gameMission.running") ||
        snapshot.matches("gameMission.gameReady") ||
        snapshot.matches("gameMission.openingGame") ||
        snapshot.matches("gameMission.waitingForGame")
      );
    }
    const PAGE_RELOAD_LOG_KEY = "lazyfrogPageReloadLog";
    const MAX_PAGE_RELOAD_LOGS = 50;
    function persistPageReloadLog(source, reason, payload) {
      const entry = { source, reason, ...payload, storedAt: Date.now() };
      chrome.storage.local.get([PAGE_RELOAD_LOG_KEY], (result2) => {
        const logs = Array.isArray(result2[PAGE_RELOAD_LOG_KEY]) ? result2[PAGE_RELOAD_LOG_KEY] : [];
        logs.push(entry);
        while (logs.length > MAX_PAGE_RELOAD_LOGS) {
          logs.shift();
        }
        chrome.storage.local.set({ [PAGE_RELOAD_LOG_KEY]: logs });
      });
    }
    function formatPageReloadEntry(entry) {
      if (!entry || typeof entry !== "object") {
        return String(entry ?? "invalid-entry");
      }
      const ts = entry.storedAt ?? entry.ts ?? 0;
      const when = ts ? new Date(ts).toISOString() : "?";
      const reason = entry.reason ?? entry.source ?? "unknown";
      const parts = [`time=${when}`, `reason=${reason}`];
      if (entry.trigger) parts.push(`trigger=${entry.trigger}`);
      if (entry.navType) parts.push(`navType=${entry.navType}`);
      if (entry.url) parts.push(`url=${entry.url}`);
      const extra = { ...entry };
      delete extra.storedAt;
      delete extra.ts;
      delete extra.reason;
      delete extra.source;
      delete extra.url;
      delete extra.trigger;
      delete extra.navType;
      if (Object.keys(extra).length) {
        try {
          parts.push(`detail=${JSON.stringify(extra)}`);
        } catch {
          parts.push("detail=[unserializable]");
        }
      }
      return parts.join(" | ");
    }
    function logLfPageReload(reason, detail = {}) {
      const payload = {
        ts: Date.now(),
        reason,
        ...detail
      };
      persistPageReloadLog("background", reason, payload);
      extensionLogger.warn("[PageReload] " + reason, payload);
      console.warn(`[LazyFrog:PageReload] ${formatPageReloadEntry(payload)}`);
    }
    function pickTabForMissionCheck(tabs, preferTabId = null) {
      if (!tabs?.length) return null;
      if (preferTabId != null) {
        const preferred = tabs.find((t) => t.id === preferTabId);
        if (preferred) return preferred;
      }
      const activeTab = tabs.find((t) => t.active);
      if (activeTab) return activeTab;
      const missionTab = tabs.find((t) => isMissionCommentsUrl(t.url));
      if (missionTab) return missionTab;
      return tabs[0];
    }
    function isTabOnMissionPost(tabUrl, missionPostId) {
      if (!tabUrl || !missionPostId) return false;
      const shortId = getPostIdShort(missionPostId);
      if (!shortId) return false;
      return tabUrl.includes(shortId) || tabUrl.includes(missionPostId);
    }
    function isGameSessionProtectedFromResponse(response) {
      return !!(response?.isOpen ?? response?.dialogOpen);
    }
    /**
     * Append one completed mission to the telemetry CSV store.
     *
     * The encounter metrics ride in on the content script's snapshot, taken at
     * initialData time -- by now the mission is about to be compactCleared and
     * its encounters are gone. A completion without a snapshot (a mission the
     * bot joined mid-flight, say) is skipped rather than written as zeroes,
     * which would look like a real zero-enemy mission in the regression.
     */
    async function recordMissionTelemetry({ snapshot, completionSource, outcome = "cleared" }) {
      const telemetry = globalThis.LazyFrogMissionTelemetry;
      if (!telemetry || !snapshot) return;
      try {
        const stored = await chrome.storage.local.get(["automationConfig", telemetry.TELEMETRY_STORAGE_KEY]);
        const row = telemetry.buildTelemetryRow({
          snapshot: { ...snapshot, navigationStartedMs: telemetryNavStartedMs },
          completedAtMs: Date.now(),
          outcome,
          completionSource,
          config: stored.automationConfig || {},
          extensionVersion: chrome.runtime.getManifest()?.version || ""
        });
        if (!row) return;
        const rows = telemetry.appendRow(stored[telemetry.TELEMETRY_STORAGE_KEY], row);
        await chrome.storage.local.set({ [telemetry.TELEMETRY_STORAGE_KEY]: rows });
        extensionLogger.log("[Telemetry] Mission row recorded", {
          postId: row.postId,
          outcome: row.outcome,
          enemyCount: row.enemyCount,
          playMs: row.playMs,
          wallMs: row.wallMs,
          totalRows: rows.length
        });
      } catch (error) {
        // Telemetry must never take the run down with it.
        extensionLogger.warn("[Telemetry] Could not record mission row", { error: String(error) });
      } finally {
        telemetryNavStartedMs = 0;
      }
    }
    async function canNavigateAway(targetTabId = null) {
      return new Promise((resolve) => {
        const finishCheck = (response, hadError, errorMessage) => {
          if (hadError) {
            const block = shouldBlockNavigationWhenCheckFails();
            extensionLogger.warn("[canNavigateAway] Status check failed — using bot-state fallback", {
              error: errorMessage,
              blockNavigation: block
            });
            resolve(!block);
            return;
          }
          const sessionProtected = isGameSessionProtectedFromResponse(response);
          extensionLogger.log("[canNavigateAway] Game session check result", {
            sessionProtected,
            dialogOpen: response?.dialogOpen ?? null,
            fullscreenIframe: response?.fullscreenIframe ?? null,
            canNavigate: !sessionProtected
          });
          resolve(!sessionProtected);
        };
        if (targetTabId != null) {
          chrome.tabs.sendMessage(
            targetTabId,
            { type: "CHECK_GAME_DIALOG_STATUS" },
            (response) => {
              finishCheck(
                response,
                !!chrome.runtime.lastError,
                chrome.runtime.lastError?.message
              );
            }
          );
          return;
        }
        chrome.tabs.query({ url: "https://www.reddit.com/*" }, (tabs) => {
          if (tabs.length === 0 || !tabs[0].id) {
            extensionLogger.log("[canNavigateAway] No Reddit tab found, safe to navigate");
            resolve(true);
            return;
          }
          chrome.tabs.sendMessage(
            tabs[0].id,
            { type: "CHECK_GAME_DIALOG_STATUS" },
            (response) => {
              finishCheck(
                response,
                !!chrome.runtime.lastError,
                chrome.runtime.lastError?.message
              );
            }
          );
        });
      });
    }
    let lastCompletingRetryCount = -1;
    let skipAdvanceInFlight = false;
    let botRunActive = false;
    let startSenderTabId = null;
    let completingMissionTimer = null;
    let latestMissionSyncPromise = null;
    let latestMissionSyncAt = 0;
    let idleStateCheckInterval = null;
    let dialogCloseSettleTimer = null;
    let lastMissionPageLoadedId = null;
    let lastMissionPageLoadedAt = 0;
    let lastNavigationUrl = null;
    let lastNavigationAt = 0;
    /**
     * When the current mission's navigation was committed, for the telemetry
     * wall clock. Separate from lastNavigationAt, which is also used for
     * debouncing and gets cleared on paths telemetry should survive.
     */
    let telemetryNavStartedMs = 0;
    let lastNavigatingStateAt = 0;
    let navigationRetryTimer = null;
    let navigationDialogCloseAttempts = 0;
    function normalizeMissionPermalink(input) {
      const base = "https://www.reddit.com";
      const stripT3 = (id) => id?.startsWith("t3_") ? id.slice(3) : id;
      if (input && String(input).startsWith("http")) {
        try {
          const url = new URL(String(input));
          if (isMissionCommentsUrl(url.href)) {
            let path = url.pathname;
            if (!path.endsWith("/")) {
              path += "/";
            }
            return `${url.origin}${path}`;
          }
        } catch {
        }
      }
      let postId = "";
      try {
        if (input?.startsWith("http")) {
          const url = new URL(input);
          const match = url.pathname.match(/\/comments\/([^/]+)/);
          postId = stripT3(match?.[1] || "");
        } else if (input?.startsWith("/")) {
          const match = input.match(/\/comments\/([^/]+)/);
          postId = stripT3(match?.[1] || "");
        } else if (input) {
          postId = stripT3(input);
        }
      } catch {
        postId = stripT3(input);
      }
      return postId ? `${base}/r/SwordAndSupperGame/comments/${postId}/` : `${base}/r/SwordAndSupperGame/`;
    }
    function getPostIdShort(postIdOrUrl) {
      if (!postIdOrUrl) return "";
      try {
        if (String(postIdOrUrl).startsWith("http")) {
          const match = new URL(postIdOrUrl).pathname.match(/\/comments\/([^/]+)/);
          return (match?.[1] || "").replace(/^t3_/, "");
        }
      } catch {
      }
      const match = String(postIdOrUrl).match(/\/comments\/([^/]+)/);
      return (match?.[1] || String(postIdOrUrl)).replace(/^t3_/, "");
    }
    function recordMissionPageLoaded(missionId) {
      if (!missionId) return;
      lastMissionPageLoadedId = missionId;
      lastMissionPageLoadedAt = Date.now();
    }
    function shouldSkipDuplicateMissionPageLoaded(missionId) {
      return !!(
        missionId &&
        lastMissionPageLoadedId === missionId &&
        Date.now() - lastMissionPageLoadedAt < 8e3
      );
    }
    async function sendMissionPageLoadedOnce(missionId, permalink) {
      const stillNavigating = getStateMachineSnapshot()?.matches?.("navigating");
      const settleRemaining = lastNavigatingStateAt > 0 ? NAVIGATION_SETTLE_MS - (Date.now() - lastNavigatingStateAt) : 0;
      if (stillNavigating && settleRemaining > 0) {
        extensionLogger.log("[Navigation] Waiting for page settle before MISSION_PAGE_LOADED", {
          missionId,
          settleRemainingMs: settleRemaining
        });
        await new Promise((resolve) => setTimeout(resolve, settleRemaining));
      }
      const stillNavigatingAfterWait = getStateMachineSnapshot()?.matches?.("navigating");
      if (shouldSkipDuplicateMissionPageLoaded(missionId) && !stillNavigatingAfterWait) {
        extensionLogger.log("[Navigation] Skipping duplicate MISSION_PAGE_LOADED", { missionId });
        return false;
      }
      if (shouldSkipDuplicateMissionPageLoaded(missionId) && stillNavigatingAfterWait) {
        extensionLogger.log("[Navigation] Re-sending MISSION_PAGE_LOADED — still in navigating", {
          missionId
        });
      }
      try {
        const progress = await getAllUserProgress();
        if (missionId && progress?.cleared?.includes(missionId)) {
          extensionLogger.log("[Navigation] Mission already cleared — advancing instead of MISSION_PAGE_LOADED", {
            missionId
          });
          sendToStateMachine({ type: "MISSION_COMPLETED", missionId });
          return false;
        }
      } catch (error) {
        extensionLogger.warn("[Navigation] Cleared check failed before MISSION_PAGE_LOADED", {
          missionId,
          error: String(error)
        });
      }
      recordMissionPageLoaded(missionId);
      sendToStateMachine({
        type: "MISSION_PAGE_LOADED",
        missionId,
        permalink
      });
      return true;
    }
    function publishBotStateToClients(reason) {
      const snapshot = getStateMachineSnapshot();
      if (!snapshot) return;
      const presentationState = getPresentationStateName(snapshot);
      const context = snapshot.context;
      extensionLogger.log("[StateSync] Publishing bot state", { reason, state: presentationState });
      chrome.storage.local.set({ lazyfrogBotPresentationState: presentationState });
      chrome.tabs.query({ url: "https://www.reddit.com/*" }, (tabs) => {
        for (const tab of tabs) {
          if (!tab.id) continue;
          chrome.tabs.sendMessage(
            tab.id,
            { type: "STATE_CHANGED", state: presentationState, context },
            { frameId: 0 },
            () => {
            }
          );
        }
      });
    }
    async function performMissionNavigation(context) {
      if (!context?.currentMissionPermalink && !context?.currentMissionId) {
        extensionLogger.error("[Navigation] No permalink or mission id set", { context });
        return;
      }
      if (isBotInActiveGamePlayState()) {
        extensionLogger.log("[Navigation] Blocked — mission in progress (running/gameReady)");
        return;
      }
      const targetPermalink = normalizeMissionPermalink(
        context.currentMissionPermalink || context.currentMissionId
      );
      const missionId = context.currentMissionId || "";
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({ url: "https://www.reddit.com/*" }, resolve);
      });
      const missionTabs = tabs.filter((t) => isMissionCommentsUrl(t.url));
      const preferTabId = activeMissionTabId ?? startSenderTabId;
      const targetTab = preferTabId
        ? tabs.find((t) => t.id === preferTabId) || missionTabs[0] || tabs[0]
        : missionTabs[0] || tabs[0];
      if (!targetTab?.id) {
        extensionLogger.log("[Navigation] No Reddit tab — opening mission in a new tab", {
          targetPermalink
        });
        try {
          const tab = await chrome.tabs.create({ url: targetPermalink, active: true });
          if (tab?.id) {
            activeMissionTabId = tab.id;
            syncBotProtectedTabsToStorage();
            lastNavigationUrl = targetPermalink;
            lastNavigationAt = Date.now();
          }
        } catch (error) {
          extensionLogger.error("[Navigation] chrome.tabs.create failed", { error: String(error) });
          sendToStateMachine({
            type: "ERROR_OCCURRED",
            message: "Could not open a Reddit tab for the mission"
          });
        }
        return;
      }
      const currentUrl = targetTab.url || "";
      const postIdShort = getPostIdShort(missionId || targetPermalink);
      const urlPostShort = getMissionPostIdShortFromUrl(currentUrl);
      const alreadyOnMission = !!postIdShort && isMissionCommentsUrl(currentUrl) && urlPostShort === postIdShort;
      const onMissionPost = alreadyOnMission || isTabOnMissionPost(currentUrl, missionId || targetPermalink);
      if (onMissionPost) {
        extensionLogger.log("[Navigation] Already on target mission page (no reload)", {
          tabId: targetTab.id,
          postIdShort,
          urlPostShort,
          currentUrl,
          targetPermalink
        });
        activeMissionTabId = targetTab.id;
        syncBotProtectedTabsToStorage();
        void sendMissionPageLoadedOnce(missionId, currentUrl || targetPermalink);
        return;
      }
      if (lastNavigationUrl === targetPermalink && Date.now() - lastNavigationAt < 1e4) {
        extensionLogger.log("[Navigation] Skipping duplicate tab navigation", {
          targetPermalink,
          msSinceLast: Date.now() - lastNavigationAt
        });
        return;
      }
      const safeToNavigate = await canNavigateAway(targetTab.id);
      if (!safeToNavigate) {
        if (shouldBlockNavigationWhenCheckFails() || isActiveGameMissionState()) {
          extensionLogger.log("[Navigation] Deferred — game session active, not closing modal", {
            tabId: targetTab.id,
            state: getPresentationStateName(getStateMachineSnapshot())
          });
          return;
        }
        navigationDialogCloseAttempts += 1;
        extensionLogger.warn(
          "[Navigation] Game dialog still open — requesting close before navigation",
          { attempt: navigationDialogCloseAttempts, tabId: targetTab.id }
        );
        sendCloseGameDialog(targetTab.id, "performMissionNavigation");
        if (navigationDialogCloseAttempts >= 8) {
          navigationDialogCloseAttempts = 0;
          extensionLogger.warn(
            "[Navigation] Dialog still open after close retries — re-queuing via completing"
          );
          allowCompletingRefind();
          sendToStateMachine({
            type: "MISSION_COMPLETED",
            missionId: getMissionPostIdShortFromUrl(targetTab.url || "") || missionId || null
          });
          return;
        }
        if (!navigationRetryTimer) {
          navigationRetryTimer = setTimeout(() => {
            navigationRetryTimer = null;
            const snapshot = getStateMachineSnapshot();
            if (snapshot?.matches?.("navigating")) {
              performMissionNavigation(snapshot.context);
            }
          }, 2500);
        }
        return;
      }
      navigationDialogCloseAttempts = 0;
      logLfPageReload("background.tabs.update", {
        tabId: targetTab.id,
        fromUrl: currentUrl,
        toUrl: targetPermalink,
        missionId,
        trigger: "performMissionNavigation"
      });
      extensionLogger.log("[Navigation] Navigating tab to mission", {
        tabId: targetTab.id,
        url: targetPermalink
      });
      activeMissionTabId = targetTab.id;
      syncBotProtectedTabsToStorage();
      lastNavigationUrl = targetPermalink;
      lastNavigationAt = Date.now();
      telemetryNavStartedMs = lastNavigationAt;
      try {
        await chrome.tabs.update(targetTab.id, { url: targetPermalink });
      } catch (error) {
        extensionLogger.error("[Navigation] chrome.tabs.update failed", {
          error: String(error),
          tabId: targetTab.id
        });
      }
    }
    function shouldSyncMissionListingNow() {
      const snapshot = getStateMachineSnapshot();
      if (!snapshot?.matches) return true;
      if (snapshot.matches("gameMission.running")) return false;
      if (snapshot.matches("gameMission.gameReady")) return false;
      if (snapshot.matches("gameMission.openingGame")) return false;
      if (snapshot.matches("gameMission.waitingForGame")) return false;
      return true;
    }
    async function ensureLatestMissionSync(filters, options = {}) {
      if (!shouldSyncMissionListingNow()) {
        extensionLogger.log("[MissionSync] Skipped — bot is actively playing a mission");
        return;
      }
      const cacheMs = 2 * 60 * 1e3;
      const force = options.force === true;
      if (!force && Date.now() - latestMissionSyncAt < cacheMs) return;
      if (latestMissionSyncPromise) {
        await latestMissionSyncPromise;
        return;
      }
      latestMissionSyncPromise = syncLatestMissionsFromReddit({
        daysBack: MISSION_DISCOVERY_SYNC_DAYS,
        searchSliceDays: MISSION_SYNC_SEARCH_SLICE_DAYS,
        runEnrichment: false
      }).then((result2) => {
        latestMissionSyncAt = Date.now();
        extensionLogger.log("[MissionSync] Synced latest missions from subreddit", result2);
      }).catch((error) => {
        extensionLogger.warn("[MissionSync] Failed to sync latest missions", { error: String(error) });
      }).finally(() => {
        latestMissionSyncPromise = null;
      });
      await latestMissionSyncPromise;
    }
    function allowCompletingRefind() {
      lastCompletingRetryCount = -1;
    }
    function resetDialogCloseTracking() {
      allowCompletingRefind();
      if (dialogCloseSettleTimer) {
        clearTimeout(dialogCloseSettleTimer);
        dialogCloseSettleTimer = null;
      }
    }
    function forceAdvanceAfterSkip(postId, senderTabId, requestDialogClose) {
      extensionLogger.log("[SkipMission] Forcing advance to next mission", {
        postId,
        senderTabId
      });
      broadcastToAllFrames({ type: "STOP_MISSION_AUTOMATION" });
      resetDialogCloseTracking();
      requestDialogClose();
      sendToStateMachine({
        type: "MISSION_COMPLETED",
        missionId: postId
      });
    }
    async function resolveNextMissionWithDiscovery(filters, excludePostIds) {
      const lookup = async () => {
        return getNextUnclearedMission({
          ...filters,
          excludePostIds: excludePostIds?.length ? excludePostIds : void 0
        });
      };
      const snapshot = getStateMachineSnapshot();
      const lightweightQueueLookup = !!(
        snapshot?.matches?.("gameMission.completing") ||
        snapshot?.matches?.("navigating") ||
        snapshot?.matches?.("starting")
      );
      let mission = await lookup();
      if (mission?.postId) {
        return mission;
      }
      extensionLogger.log("[MissionDiscovery] Queue empty — scanning open subreddit tabs", {
        lightweightQueueLookup
      });
      await scanOpenSubredditTabsForMissions();
      await new Promise((resolve) => setTimeout(resolve, QUEUE_DISCOVERY_SETTLE_MS));
      mission = await lookup();
      if (mission?.postId) {
        return mission;
      }
      if (lightweightQueueLookup) {
        extensionLogger.log("[MissionDiscovery] Lightweight queue lookup still empty after tab scan — skipping Reddit sync");
        return null;
      }
      if (shouldSyncMissionListingNow()) {
        extensionLogger.log("[MissionDiscovery] Queue still empty — syncing Reddit listings");
        await ensureLatestMissionSync(filters, { force: true }).catch((error) => {
          extensionLogger.warn("[MissionDiscovery] Mission sync failed during queue build", {
            error: String(error)
          });
        });
        mission = await lookup();
        if (mission?.postId) {
          return mission;
        }
      }
      try {
        const placeholderCutoffMs = Date.now() - MISSION_DISCOVERY_SYNC_DAYS * 24 * 60 * 60 * 1e3;
        await backfillPlaceholderMissionsInStorage(placeholderCutoffMs, { maxCount: 800 });
        mission = await lookup();
      } catch (error) {
        extensionLogger.warn("[MissionDiscovery] Placeholder flair backfill failed", {
          error: String(error)
        });
      }
      return mission?.postId ? mission : null;
    }
    async function findAndSendNextMission() {
      try {
        if (!botRunActive) {
          extensionLogger.log("[findAndSendNextMission] Skipped — bot run is not active");
          return;
        }
        if (batchState.enabled) {
          const snapshot2 = getStateMachineSnapshot();
          const currentState2 = getPresentationStateName(snapshot2);
          const slot = await activateNextBatchSlot();
          if (!slot) {
            extensionLogger.log("[Batch] No pending slot available");
            // Nothing else to run — close any dangling completed mission tabs.
            await flushPendingTabCloses("no-pending-slot");
            sendToStateMachine({ type: "NO_MISSIONS_FOUND" });
            return;
          }
          extensionLogger.log("[Batch] Activated slot", {
            postId: slot.postId,
            tabId: slot.tabId,
            state: currentState2
          });
          if (currentState2 === "completing") {
            sendToStateMachine({
              type: "NEXT_MISSION_FOUND",
              missionId: slot.postId,
              permalink: slot.permalink
            });
          } else {
            sendToStateMachine({
              type: "NAVIGATE_TO_MISSION",
              missionId: slot.postId,
              permalink: slot.permalink
            });
          }
          return;
        }
        const result2 = await chrome.storage.local.get(["automationFilters"]);
        const filters = normalizeAutomationFilters(result2.automationFilters || {
          stars: [1, 2, 3, 4, 5],
          minLevel: 1,
          maxLevel: 340
        });
        const snapshot = getStateMachineSnapshot();
        const presentationState = getPresentationStateName(snapshot);
        const currentMissionId = snapshot?.context?.currentMissionId;
        const excludePostIds =
          presentationState === "completing" && currentMissionId ? [currentMissionId] : void 0;
        extensionLogger.log("[findAndSendNextMission] Searching for next mission", {
          filters,
          presentationState,
          excludePostIds: excludePostIds || null
        });
        let mission = await resolveNextMissionWithDiscovery(filters, excludePostIds);
        if (!mission?.postId && excludePostIds?.length) {
          const stored = await chrome.storage.local.get([BOT_QUEUE_SNAPSHOT_KEY]);
          const queueCount = stored[BOT_QUEUE_SNAPSHOT_KEY]?.count ?? 0;
          if (queueCount > 0) {
            extensionLogger.log("[findAndSendNextMission] Retrying without exclude — queue has missions", {
              queueCount,
              excludePostIds
            });
            mission = await getNextUnclearedMission(filters);
          }
        }
        if (mission && mission.postId) {
          const missionPermalink = normalizeMissionPermalink(
            mission.permalink || missionPermalinkFromPostId(mission.postId)
          );
          extensionLogger.log("[findAndSendNextMission] Found mission", {
            missionId: mission.postId,
            permalink: missionPermalink
          });
          const currentState = getPresentationStateName(getStateMachineSnapshot());
          extensionLogger.log("[findAndSendNextMission] Current state", { currentState });
          if (currentState === "completing") {
            extensionLogger.log(
              "[findAndSendNextMission] In completing state, sending NEXT_MISSION_FOUND"
            );
            sendToStateMachine({
              type: "NEXT_MISSION_FOUND",
              missionId: mission.postId,
              permalink: missionPermalink
            });
          } else {
            let eventSent = false;
            const timeoutId = setTimeout(() => {
              if (!eventSent) {
                extensionLogger.warn(
                  "[findAndSendNextMission] Tab query timeout, defaulting to NAVIGATE_TO_MISSION"
                );
                eventSent = true;
                sendToStateMachine({
                  type: "NAVIGATE_TO_MISSION",
                  missionId: mission.postId,
                  permalink: missionPermalink
                });
              }
            }, 1e3);
            chrome.tabs.query({ url: "https://www.reddit.com/*" }, (tabs) => {
              if (eventSent) return;
              clearTimeout(timeoutId);
              eventSent = true;
              const checkTab = pickTabForMissionCheck(tabs, startSenderTabId ?? activeMissionTabId);
              const currentUrl = checkTab?.url || "";
              const isOnMissionPage = isTabOnMissionPost(currentUrl, mission.postId);
              if (checkTab?.id) {
                activeMissionTabId = checkTab.id;
              }
              extensionLogger.log("[findAndSendNextMission] Tab check", {
                currentUrl,
                missionPostId: mission.postId,
                isOnMissionPage,
                tabsFound: tabs.length,
                checkTabId: checkTab?.id ?? null,
                startSenderTabId
              });
              if (isOnMissionPage) {
                extensionLogger.log(
                  "[findAndSendNextMission] Already on mission page, sending MISSION_PAGE_LOADED"
                );
                sendToStateMachine({
                  type: "MISSION_PAGE_LOADED",
                  missionId: mission.postId,
                  permalink: currentUrl ? normalizeMissionPermalink(currentUrl) : missionPermalink
                });
              } else {
                extensionLogger.log(
                  "[findAndSendNextMission] Need to navigate, sending NAVIGATE_TO_MISSION"
                );
                sendToStateMachine({
                  type: "NAVIGATE_TO_MISSION",
                  missionId: mission.postId,
                  permalink: missionPermalink
                });
              }
            });
          }
          void buildBotQueueSnapshot(filters).catch((error) => {
            extensionLogger.warn("[findAndSendNextMission] Failed to refresh bot queue snapshot", {
              error: String(error)
            });
          });
        } else {
          const stored = await chrome.storage.local.get([BOT_QUEUE_SNAPSHOT_KEY, "missions"]);
          const snap = stored[BOT_QUEUE_SNAPSHOT_KEY];
          const fallbackPostId = snap?.nextPostId;
          const fallbackMission = fallbackPostId ? stored.missions?.[fallbackPostId] : null;
          if (fallbackMission?.postId) {
            extensionLogger.log("[findAndSendNextMission] Using cached queue snapshot mission", {
              postId: fallbackMission.postId,
              queueCount: snap?.count ?? 0
            });
            sendToStateMachine({
              type: "NAVIGATE_TO_MISSION",
              missionId: fallbackMission.postId,
              permalink: normalizeMissionPermalink(
                fallbackMission.permalink || missionPermalinkFromPostId(fallbackMission.postId)
              )
            });
            return;
          }
          extensionLogger.log("[findAndSendNextMission] No missions found");
          sendToStateMachine({ type: "NO_MISSIONS_FOUND" });
        }
      } catch (error) {
        extensionLogger.error("[findAndSendNextMission] Error finding mission", {
          error: String(error)
        });
        sendToStateMachine({
          type: "ERROR_OCCURRED",
          message: "Failed to find next mission: " + String(error)
        });
      }
    }
    function abortBotAutomationSideEffects(reason) {
      botRunActive = false;
      extensionLogger.log("[StopBot] Aborting pending automation side effects", { reason });
      if (completingMissionTimer) {
        clearTimeout(completingMissionTimer);
        completingMissionTimer = null;
      }
      if (idleStateCheckInterval) {
        clearInterval(idleStateCheckInterval);
        idleStateCheckInterval = null;
      }
      if (dialogCloseSettleTimer) {
        clearTimeout(dialogCloseSettleTimer);
        dialogCloseSettleTimer = null;
      }
      if (navigationRetryTimer) {
        clearTimeout(navigationRetryTimer);
        navigationRetryTimer = null;
      }
      lastCompletingRetryCount = -1;
      skipAdvanceInFlight = false;
    }
    function clearSkipAdvanceInFlightIfMissionLoaded(presentationState) {
      if (["waitingForGame", "openingGame", "gameReady", "running"].includes(presentationState)) {
        skipAdvanceInFlight = false;
      }
    }
    function handleStateTransition(stateObj, context) {
      const presentationState = getPresentationStateName(stateObj);
      extensionLogger.log("[StateTransition] Entered state", { state: presentationState });
      clearSkipAdvanceInFlightIfMissionLoaded(presentationState);
      if (!botRunActive && presentationState !== "idle" && presentationState !== "idleDialogOpen" && presentationState !== "error") {
        extensionLogger.log("[StateTransition] Ignoring transition — bot run is not active", {
          state: presentationState
        });
        return;
      }
      if (presentationState !== "idle" && presentationState !== "idleDialogOpen" && idleStateCheckInterval) {
        extensionLogger.log("[StateTransition] Clearing idle state check interval");
        clearInterval(idleStateCheckInterval);
        idleStateCheckInterval = null;
      }
      if (stateObj?.matches) {
        if (stateObj.matches("gameMission.waitingForGame")) {
          broadcastToReddit({ type: "CHECK_FOR_GAME_LOADER" });
          return;
        }
        if (stateObj.matches("gameMission.openingGame")) {
          broadcastToReddit({ type: "CLICK_GAME_UI" });
          return;
        }
        if (stateObj.matches("gameMission.gameReady")) {
          broadcastToAllFrames({ type: "START_MISSION_AUTOMATION" });
          return;
        }
        if (stateObj.matches("gameMission.running")) {
          extensionLogger.log("[StateTransition] Entered running state");
          return;
        }
        if (stateObj.matches("gameMission.completing")) {
          const retryCount = context.findMissionRetryCount || 0;
          if (retryCount === lastCompletingRetryCount) {
            extensionLogger.log("[StateTransition] Skipping duplicate FIND_NEXT_MISSION", {
              retryCount,
              lastRetryCount: lastCompletingRetryCount
            });
            return;
          }
          lastCompletingRetryCount = retryCount;
          const delayMs = retryCount > 0 ? INITIAL_RETRY_DELAY * RETRY_BACKOFF_BASE ** (retryCount - 1) : STORAGE_PROPAGATION_DELAY;
          extensionLogger.log("[StateTransition] Finding next mission", {
            retryCount,
            delayMs
          });
          if (completingMissionTimer) {
            clearTimeout(completingMissionTimer);
          }
          completingMissionTimer = setTimeout(() => {
            completingMissionTimer = null;
            if (!botRunActive) {
              extensionLogger.log("[StateTransition] Skipping deferred find — bot stopped");
              return;
            }
            findAndSendNextMission();
          }, delayMs);
          return;
        }
        if (stateObj.matches("gameMission.waitingForDialogClose")) {
          lastCompletingRetryCount = -1;
          if (batchState.enabled) {
            extensionLogger.log(
              "[StateTransition] Batch mode: previous mission tab already closed, skipping dialog wait"
            );
            dialogOwnerTabId = null;
            if (dialogCloseSettleTimer) {
              clearTimeout(dialogCloseSettleTimer);
              dialogCloseSettleTimer = null;
            }
            sendToStateMachine({ type: "GAME_DIALOG_CLOSED" });
            return;
          }
          // The dialog is no longer clicked shut or waited on. By the time this
          // state is entered the mission completion has already been reported and
          // the next mission already chosen, and canNavigateAway() only ever
          // inspected UI teardown (dialogOpen / fullscreenIframe) -- never
          // server-side completion -- so the poll guarded nothing while costing up
          // to twenty seconds per mission (ten re-checks, two seconds apart).
          // Navigation sets window.location, which tears the iframe down by
          // itself, and performMissionNavigation() still runs its own
          // canNavigateAway() check and close attempts before it commits. All that
          // remains here is a short settle so the victory result lands server-side
          // first. This is the DIALOG_CLOSE_TIMEOUT escape hatch's destination,
          // now reached in one second rather than twenty.
          if (dialogCloseSettleTimer) {
            return;
          }
          extensionLogger.log("[StateTransition] Victory reached — settling before navigation", {
            settleMs: DIALOG_CLOSE_SETTLE_MS
          });
          dialogCloseSettleTimer = setTimeout(() => {
            dialogCloseSettleTimer = null;
            const snapshot = getStateMachineSnapshot();
            if (!snapshot?.matches?.("gameMission.waitingForDialogClose")) {
              return;
            }
            extensionLogger.log("[StateTransition] Settle elapsed, advancing to navigation");
            sendToStateMachine({ type: "GAME_DIALOG_CLOSED" });
          }, DIALOG_CLOSE_SETTLE_MS);
          return;
        }
      }
      switch (presentationState) {
        case "idle":
          lastCompletingRetryCount = -1;
          if (dialogCloseSettleTimer) {
            clearTimeout(dialogCloseSettleTimer);
            dialogCloseSettleTimer = null;
          }
          if (!idleStateCheckInterval) {
            extensionLogger.log("[StateTransition] Starting idle state check interval (every 5s)");
            idleStateCheckInterval = setInterval(() => {
              if (!botRunActive) {
                return;
              }
              extensionLogger.log("[IdleCheck] Checking if automation is ready");
              checkAutomationReady().then((isReady) => {
                if (!botRunActive) return;
                if (isReady) {
                  extensionLogger.log("[IdleCheck] Automation ready, sending AUTOMATION_READY");
                  sendToStateMachine({ type: "AUTOMATION_READY" });
                }
              });
            }, 5e3);
          }
          break;
        case "error":
          lastCompletingRetryCount = -1;
          if (dialogCloseSettleTimer) {
            clearTimeout(dialogCloseSettleTimer);
            dialogCloseSettleTimer = null;
          }
          break;
        case "navigating":
          navigationDialogCloseAttempts = 0;
          lastNavigatingStateAt = Date.now();
          if (dialogCloseSettleTimer) {
            clearTimeout(dialogCloseSettleTimer);
            dialogCloseSettleTimer = null;
          }
          extensionLogger.log("[StateTransition] Navigating state, checking permalink", {
            hasPermalink: !!context.currentMissionPermalink,
            permalink: context.currentMissionPermalink,
            fullContext: context
          });
          performMissionNavigation(context);
          break;
      }
    }
    function sendToRedditTab(tabId, message) {
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    }
    function pickRedditTab(tabs, preferMissionComments) {
      if (!tabs?.length) return null;
      if (activeMissionTabId) {
        const active = tabs.find((t) => t.id === activeMissionTabId);
        if (active?.id) return active;
      }
      if (preferMissionComments) {
        const missionTab = tabs.find((t) => shouldAcceptRedditBotGameEvent(t));
        if (missionTab?.id) return missionTab;
      }
      return tabs.find((t) => t.url?.includes("reddit.com")) || tabs[0];
    }
    function resolveRedditTabId(preferMissionComments, callback) {
      chrome.tabs.query({ url: "https://www.reddit.com/*" }, (tabs) => {
        const tab = pickRedditTab(tabs, preferMissionComments);
        callback(tab?.id ?? null);
      });
    }
    function broadcastToReddit(message, preferMissionComments = false) {
      const needsMissionTab = ["CHECK_FOR_GAME_LOADER", "OPEN_GAME_IF_NEEDED", "CLICK_GAME_UI", "CLOSE_GAME_DIALOG"].includes(
        message.type
      );
      resolveRedditTabId(needsMissionTab || preferMissionComments, (tabId) => {
        if (tabId) {
          sendToRedditTab(tabId, message);
        } else {
          extensionLogger.warn("[broadcastToReddit] No Reddit tab found", { type: message.type });
        }
      });
    }
    function broadcastToAllFrames(message) {
      resolveRedditTabId(true, (tabId) => {
        if (tabId) {
          chrome.tabs.sendMessage(tabId, message, { frameId: void 0 });
        } else {
          extensionLogger.warn("[broadcastToAllFrames] No Reddit tab found", { type: message.type });
        }
      });
    }
    function sendToGameFrame(message) {
      return new Promise((resolve, reject) => {
        if (gameFrameId === void 0 || gameTabId === void 0) {
          reject(new Error("Game frame not tracked yet"));
          return;
        }
        chrome.tabs.sendMessage(
          gameTabId,
          message,
          { frameId: gameFrameId },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        );
      });
    }
    async function checkAutomationReady() {
      try {
        const response = await sendToGameFrame({ type: "CHECK_AUTOMATION_STATUS" });
        const isReady = response?.isReady || false;
        extensionLogger.log("[checkAutomationReady] Automation status check result", {
          isReady,
          state: response?.state
        });
        return isReady;
      } catch (error) {
        extensionLogger.log("[checkAutomationReady] Error or game frame not tracked", {
          error: String(error)
        });
        return false;
      }
    }
    const keepAliveTabIds = /* @__PURE__ */ new Set();
    async function registerPageWorldScripts() {
      const scriptId = "lazyfrog-page-world";
      try {
        const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
        if (existing?.length) {
          return;
        }
      } catch {
      }
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [scriptId] });
      } catch {
      }
      await chrome.scripting.registerContentScripts([
        {
          id: scriptId,
          matches: ["https://www.reddit.com/*", "https://*.devvit.net/*"],
          js: ["pageWorldKeepAlive.js"],
          runAt: "document_start",
          world: "MAIN",
          allFrames: true,
          persistAcrossSessions: true
        }
      ]);
      extensionLogger.log("[PageWorld] Registered document_start MAIN world script");
    }
    async function ensurePageWorldInFrame(tabId, frameId) {
      try {
        const target = frameId != null ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true };
        await chrome.scripting.executeScript({
          target,
          files: ["pageWorldKeepAlive.js"],
          world: "MAIN"
        });
        return true;
      } catch (error) {
        extensionLogger.warn("[PageWorld] Inject failed", {
          tabId,
          frameId,
          error: String(error)
        });
        return false;
      }
    }
    async function clickInPageWorld(tabId, frameId, x, y) {
      if (tabId == null || frameId == null || x == null || y == null) {
        return false;
      }
      await ensurePageWorldInFrame(tabId, frameId);
      const results = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: "MAIN",
        func: (clickX, clickY) => {
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
          const marked = findMarkedElement();
          if (marked) {
            marked.removeAttribute("data-lf-target");
            if (typeof window.__lazyfrogClickElement === "function") {
              return window.__lazyfrogClickElement(marked);
            }
            marked.click();
            return true;
          }
          if (typeof window.__lazyfrogClickAt === "function") {
            return window.__lazyfrogClickAt(clickX, clickY);
          }
          const el = document.elementFromPoint(clickX, clickY);
          if (el) {
            el.click();
            return true;
          }
          return false;
        },
        args: [x, y]
      });
      return !!results?.[0]?.result;
    }
    async function injectPageKeepAlive(tabId) {
      if (keepAliveTabIds.has(tabId)) {
        return true;
      }
      try {
        const existing = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          world: "MAIN",
          func: () => !!window.__lazyfrogPageWorld
        });
        if (existing?.[0]?.result) {
          await chrome.tabs.update(tabId, { autoDiscardable: false });
          keepAliveTabIds.add(tabId);
          extensionLogger.log("[KeepAlive] Page keep-alive already present", { tabId });
          return true;
        }
      } catch {
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          files: ["pageWorldKeepAlive.js"],
          world: "MAIN"
        });
        await chrome.tabs.update(tabId, { autoDiscardable: false });
        keepAliveTabIds.add(tabId);
        extensionLogger.log("[KeepAlive] Injected page keep-alive (top frame only)", { tabId });
        return true;
      } catch (error) {
        extensionLogger.warn("[KeepAlive] Failed to inject page keep-alive", {
          tabId,
          error: String(error)
        });
        return false;
      }
    }
    async function releaseTabKeepAlive(tabId) {
      keepAliveTabIds.delete(tabId);
      try {
        await chrome.tabs.update(tabId, { autoDiscardable: true });
      } catch {
      }
    }
    async function ensureRedditTabKeepAlive() {
      const tabs = await chrome.tabs.query({ url: "https://www.reddit.com/*" });
      for (const tab of tabs) {
        if (tab.id != null) {
          await injectPageKeepAlive(tab.id);
        }
      }
    }
    async function releaseAllTabKeepAlive() {
      for (const tabId of [...keepAliveTabIds]) {
        await releaseTabKeepAlive(tabId);
      }
    }
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== "lazyfrog-keepalive") return;
      extensionLogger.log("[KeepAlive] Port connected", { tabId: port.sender?.tab?.id });
      port.onMessage.addListener(() => {
      });
    });
    async function runStartBotAsyncWork() {
      try {
        batchState.enabled = false;
        batchState.slots = [];
        batchState.activePostId = null;
        batchState.activeTabId = null;
        await persistBatchState().catch(() => {
        });
        const isReady = await checkAutomationReady();
        const postStartSnapshot = getStateMachineSnapshot();
        if (isReady && postStartSnapshot?.matches?.("idle")) {
          extensionLogger.log("[START_BOT] Automation already ready while idle, sending AUTOMATION_READY");
          sendToStateMachine({ type: "AUTOMATION_READY" });
        }
        const username = await getCurrentRedditUser();
        extensionLogger.log("[UserDetection] Current user:", username);
        const stored = await new Promise((resolve) => {
          chrome.storage.local.get(["automationConfig", "automationFilters"], resolve);
        });
        const filters = normalizeAutomationFilters(stored.automationFilters || {
          stars: [1, 2, 3, 4, 5],
          minLevel: 1,
          maxLevel: 340
        });
        await chrome.storage.local.set({
          automationConfig: stored.automationConfig || {},
          automationFilters: filters
        });
        // Pull in missions posted since the last run. Previously the queue was
        // only refreshed from Reddit once it ran completely dry, so a non-empty
        // queue meant new posts were never picked up without pressing Sync by
        // hand. ensureLatestMissionSync keeps its own 2 minute cache, and the
        // race keeps a slow sync from holding up the start -- it carries on in
        // the background and lands in time for the next queue lookup.
        await Promise.race([
          ensureLatestMissionSync(filters).catch((error) => {
            extensionLogger.warn("[START_BOT] Startup mission sync failed", { error: String(error) });
          }),
          new Promise((resolve) => setTimeout(resolve, START_BOT_SYNC_BUDGET_MS))
        ]);
        console.log("[LazyFrog:RunGate] BG_START_BOT_SEND", {
          ts: Date.now(),
          resumeState: getPresentationStateName(getStateMachineSnapshot())
        });
        batchState.filters = filters;
        const resumeState = getPresentationStateName(getStateMachineSnapshot());
        if (resumeState === "gameReady") {
          extensionLogger.log("[START_BOT] Resuming in gameReady — skip findAndSendNextMission");
        } else {
          extensionLogger.log("START_BOT: Calling findAndSendNextMission");
          await findAndSendNextMission();
        }
        await ensureRedditTabKeepAlive().catch((error) => {
          extensionLogger.warn("[KeepAlive] Failed on START_BOT", { error: String(error) });
        });
      } catch (error) {
        extensionLogger.error("[START_BOT] Async startup failed", {
          error: String(error)
        });
        console.log("[LazyFrog:RunGate] BG_START_BOT_ASYNC_FAILED", {
          ts: Date.now(),
          error: String(error)
        });
      }
    }
    function clearStartBotTimers() {
      if (completingMissionTimer) {
        clearTimeout(completingMissionTimer);
        completingMissionTimer = null;
      }
      if (dialogCloseSettleTimer) {
        clearTimeout(dialogCloseSettleTimer);
        dialogCloseSettleTimer = null;
      }
      if (navigationRetryTimer) {
        clearTimeout(navigationRetryTimer);
        navigationRetryTimer = null;
      }
      lastCompletingRetryCount = -1;
      skipAdvanceInFlight = false;
    }
    function handleStartBotMessage(sendResponse, sender) {
      extensionLogger.log("START_BOT received, sending to state machine");
      console.log("[LazyFrog:RunGate] BG_START_BOT", {
        ts: Date.now(),
        hasBotActor: !!botActor,
        senderTab: sender.tab?.id ?? null,
        state: getPresentationStateName(getStateMachineSnapshot())
      });
      if (!botActor) {
        extensionLogger.error("State machine not initialized yet!");
        console.log("[LazyFrog:RunGate] BG_START_BOT_FAILED", { reason: "no-bot-actor" });
        sendResponse({ success: false, error: "State machine not ready" });
        return;
      }
      clearStartBotTimers();
      botRunActive = true;
      startSenderTabId = sender.tab?.id ?? null;
      if (startSenderTabId && shouldAcceptRedditBotGameEvent(sender.tab)) {
        activeMissionTabId = startSenderTabId;
      }
      sendResponse({ success: true, ack: "sync" });
      sendToStateMachine({ type: "START_BOT" });
      chrome.storage.local.set(
        {
          activeBotSession: true,
          lazyfrogBotPresentationState: "starting"
        },
        () => {
          console.log("[LazyFrog:RunGate] BG_SESSION_SET", {
            ts: Date.now(),
            activeBotSession: true,
            presentationState: "starting",
            storageError: chrome.runtime.lastError?.message ?? null
          });
        }
      );
      void runStartBotAsyncWork();
    }
    function handleStopBotMessage(sendResponse) {
      extensionLogger.log("STOP_BOT received, sending to state machine");
      console.log("[LazyFrog:RunGate] BG_STOP_BOT", {
        ts: Date.now(),
        state: getPresentationStateName(getStateMachineSnapshot()),
      });
      abortBotAutomationSideEffects("STOP_BOT");
      startSenderTabId = null;
      sendResponse({ success: true, ack: "sync" });
      sendToStateMachine({ type: "STOP_BOT" });
      chrome.storage.local.remove([
        "activeBotSession",
        "lazyfrogCurrentMissionId",
        SESSION_RESUME_KEY
      ]);
      chrome.storage.local.set({ lazyfrogBotPresentationState: "idle" });
      releaseAllTabKeepAlive().catch((error) => {
        extensionLogger.warn("[KeepAlive] Failed on STOP_BOT", { error: String(error) });
      });
      gamePreviewReloadAttempts.clear();
      void closeAllBatchTabs();
      broadcastToAllFrames({ type: "STOP_MISSION_AUTOMATION" });
    }
    // A service worker can disappear at any moment — Chrome reclaims idle ones,
    // and kills outright any whose handler overruns its budget. What comes back
    // is a blank slate: createActor starts the machine in `idle` and
    // botRunActive is false again. The page side does not reset with it.
    // `activeBotSession` lives in storage, so devvit re-enables its clicker and
    // waits for a mission the queue will never send, while handleStateTransition
    // drops every transition because botRunActive says no run is in progress.
    // The bot sits at the inn reporting "idle" until someone presses Start.
    //
    // Storage is the only thing that survives the restart, and activeBotSession
    // is already the record of the user's intent, so restart the run from it.
    // A deliberate Stop removes the flag, so a stopped bot stays stopped.
    const SESSION_RESUME_KEY = "lazyfrogSessionResume";
    const SESSION_RESUME_WINDOW_MS = 10 * 60 * 1e3;
    const SESSION_RESUME_LIMIT = 5;
    const SESSION_RESUME_SETTLE_MS = 2e3;
    async function resumeBotSessionAfterWorkerRestart() {
      const stored = await chrome.storage.local.get([
        "activeBotSession",
        "lazyfrogBotPresentationState",
        SESSION_RESUME_KEY
      ]);
      if (!stored.activeBotSession) return;
      const tabs = await chrome.tabs.query({ url: "*://*.reddit.com/*" });
      if (!tabs.length) {
        extensionLogger.log("[SessionResume] Session flag set but no Reddit tab — leaving it alone");
        return;
      }
      // Should the resume itself be what kills the worker, this stops the pair
      // of them rebooting each other indefinitely.
      const now = Date.now();
      const prior = stored[SESSION_RESUME_KEY];
      const inWindow = !!prior && now - prior.firstAt < SESSION_RESUME_WINDOW_MS;
      const attempt = inWindow ? prior.count + 1 : 1;
      if (attempt > SESSION_RESUME_LIMIT) {
        extensionLogger.error("[SessionResume] Worker keeps restarting — stopping the bot", {
          attempts: prior.count,
          windowMs: now - prior.firstAt
        });
        await chrome.storage.local.remove(["activeBotSession", SESSION_RESUME_KEY]);
        broadcastToAllFrames({ type: "STOP_MISSION_AUTOMATION" });
        return;
      }
      await chrome.storage.local.set({
        [SESSION_RESUME_KEY]: { count: attempt, firstAt: inWindow ? prior.firstAt : now, lastAt: now }
      });
      extensionLogger.warn("[SessionResume] Restarting the run after a worker restart", {
        attempt,
        stateBeforeRestart: stored.lazyfrogBotPresentationState || null
      });
      // The content scripts reconnect on their own schedule; starting before
      // they have re-registered wastes the attempt on an empty broadcast.
      await new Promise((resolve) => setTimeout(resolve, SESSION_RESUME_SETTLE_MS));
      handleStartBotMessage(() => {}, {});
    }
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // REMOTE_LOG is the log relay itself. Logging its arrival makes every
      // content-script line produce a second line here, doubling both the POST
      // volume and the worker's own wakeups -- logging would become the biggest
      // thing the worker does.
      if (message.type !== "REMOTE_LOG") {
        extensionLogger.log("Received message", {
          type: message.type,
          source: sender.tab ? `tab ${sender.tab.id}` : "extension",
          frameId: sender.frameId
        });
      }
      if (message.type === "PING") {
        const snapshot2 = getStateMachineSnapshot();
        const state = getPresentationStateName(snapshot2);
        sendResponse({
          success: true,
          state,
          context: snapshot2?.context,
          timestamp: Date.now()
        });
        return false;
      }
      if (message.type === "START_BOT") {
        handleStartBotMessage(sendResponse, sender);
        return false;
      }
      if (message.type === "STOP_BOT") {
        handleStopBotMessage(sendResponse);
        return false;
      }
      (async () => {
        try {
          await handleMessage(message, sender, sendResponse);
        } catch (error) {
          extensionLogger.error("Error handling message", {
            type: message.type,
            error: error instanceof Error ? error.message : String(error)
          });
          sendResponse({ success: false, error: String(error) });
        }
      })();
      return true;
    });
    async function handleMessage(message, sender, sendResponse) {
      switch (message.type) {
        // Messages from popup - route to state machine
        case "START_BOT":
          extensionLogger.warn("START_BOT reached async handler — should use sync path");
          sendResponse({ success: true, ack: "async-fallback" });
          break;
        case "STOP_BOT":
          extensionLogger.warn("STOP_BOT reached async handler — should use sync path");
          sendResponse({ success: true, ack: "async-fallback" });
          break;
        case "SKIP_CURRENT_MISSION":
          {
            if (skipAdvanceInFlight) {
              extensionLogger.log("[SkipMission] Ignored — skip already in flight");
              sendResponse({ success: true, ignored: true, reason: "skip-already-pending" });
              break;
            }
            skipAdvanceInFlight = true;
            const senderTabId = sender.tab?.id ?? null;
            const snap = getStateMachineSnapshot();
            const fallbackPostId = snap?.context?.currentMissionId || batchState.activePostId || null;
            const postId = message.postId || fallbackPostId;
            dialogOwnerTabId = senderTabId ?? dialogOwnerTabId;
            syncBotProtectedTabsToStorage();
            extensionLogger.log("[SkipMission] Requested", { postId, senderTabId, fallbackPostId });
            const inBatchMode = batchState.enabled;
            const requestDialogClose = () => {
              if (inBatchMode) return;
              sendCloseGameDialog(dialogOwnerTabId, "skip-mission", dialogOwnerTabId == null);
            };
            if (postId) {
              markMissionCleared(postId).then(async () => {
                await markBatchSlotDoneByPostId(postId, "completed", "skipped-by-user").catch(() => {});
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "completed", "skipped-by-user").catch(() => {});
                }
                forceAdvanceAfterSkip(postId, senderTabId, requestDialogClose);
              }).catch(async (error) => {
                extensionLogger.warn("[SkipMission] Failed to mark cleared", { postId, error: String(error) });
                await markBatchSlotDoneByPostId(postId, "failed", String(error)).catch(() => {});
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "failed", String(error)).catch(() => {});
                }
                forceAdvanceAfterSkip(postId, senderTabId, requestDialogClose);
              });
            } else {
              (async () => {
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "completed", "skipped-no-postid").catch(() => {});
                }
                forceAdvanceAfterSkip(null, senderTabId, requestDialogClose);
              })();
            }
            sendResponse({ success: true, postId });
          }
          break;
        // Navigate to mission - route to reddit-content
        case "NAVIGATE_TO_MISSION":
          extensionLogger.log("Forwarding NAVIGATE_TO_MISSION to reddit-content");
          if (activeMissionTabId) {
            chrome.tabs.sendMessage(
              activeMissionTabId,
              {
                type: "NAVIGATE_TO_MISSION",
                filters: message.filters
              },
              (response) => {
                sendResponse(response);
              }
            );
          } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  {
                    type: "NAVIGATE_TO_MISSION",
                    filters: message.filters
                  },
                  (response) => {
                    sendResponse(response);
                  }
                );
              } else {
                sendResponse({ error: "No active tab" });
              }
            });
          }
          return true;
        // Will respond asynchronously
        // Open mission iframe - route to reddit-content
        case "OPEN_MISSION_IFRAME":
          extensionLogger.log("Forwarding OPEN_MISSION_IFRAME to reddit-content");
          if (activeMissionTabId) {
            chrome.tabs.sendMessage(
              activeMissionTabId,
              {
                type: "OPEN_MISSION_IFRAME"
              },
              (response) => {
                sendResponse(response);
              }
            );
          } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) {
                chrome.tabs.sendMessage(
                  tabs[0].id,
                  {
                    type: "OPEN_MISSION_IFRAME"
                  },
                  (response) => {
                    sendResponse(response);
                  }
                );
              } else {
                sendResponse({ error: "No active tab" });
              }
            });
          }
          return true;
        // Will respond asynchronously
        // Start mission automation - broadcast to all frames (including game iframe)
        case "START_MISSION_AUTOMATION":
          extensionLogger.log("Broadcasting START_MISSION_AUTOMATION to all frames");
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(
                tabs[0].id,
                {
                  type: "START_MISSION_AUTOMATION"
                },
                { frameId: void 0 },
                // undefined = all frames
                (response) => {
                  if (chrome.runtime.lastError) {
                    extensionLogger.warn("Message error", {
                      error: chrome.runtime.lastError.message
                    });
                  } else {
                    extensionLogger.log("Message delivered", { response });
                  }
                }
              );
            }
          });
          sendResponse({ success: true });
          break;
        // Stop mission automation - broadcast to all frames
        case "STOP_MISSION_AUTOMATION":
          extensionLogger.log("Broadcasting STOP_MISSION_AUTOMATION to all frames");
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "STOP_MISSION_AUTOMATION"
              });
            }
          });
          sendResponse({ success: true });
          break;
        // Events from content scripts → state machine
        case "REMOTE_LOG":
          // A batch of content-script log lines. Only extension contexts can
          // reach this listener (no externally_connectable), so the payload is
          // ours. `entry` is the single-entry form kept for older frames still
          // running a pre-batching content script after an extension update.
          if (Array.isArray(message.entries)) {
            for (const item of message.entries) {
              enqueueRemoteLogEntry(item, message.remoteUrl);
            }
          } else if (message.entry) {
            enqueueRemoteLogEntry(message.entry, message.remoteUrl);
          }
          sendResponse({ ok: true });
          break;
        case "GET_CURRENT_MISSION_ID":
          {
            const snap = getStateMachineSnapshot();
            const postId = snap?.context?.currentMissionId || null;
            sendResponse({ postId });
          }
          break;
        case "ENSURE_PAGE_KEEPALIVE":
          {
            const tabId = sender.tab?.id;
            if (!tabId) {
              sendResponse({ success: false, error: "No tab id" });
              break;
            }
            if (isActiveGameMissionState()) {
              const canNavigate = await canNavigateAway(tabId);
              if (!canNavigate) {
                extensionLogger.log("[KeepAlive] Deferred inject — game modal open", { tabId });
                keepAliveTabIds.add(tabId);
                sendResponse({ success: true, deferred: true });
                break;
              }
            }
            const ok = await injectPageKeepAlive(tabId);
            sendResponse({ success: ok });
          }
          break;
        case "RELEASE_TAB_KEEPALIVE":
          {
            const tabId = sender.tab?.id;
            if (tabId) {
              await releaseTabKeepAlive(tabId);
            }
            sendResponse({ success: true });
          }
          break;
        case "PAGE_WORLD_CLICK":
          {
            const tabId = sender.tab?.id;
            const frameId = sender.frameId;
            const x = message.x;
            const y = message.y;
            if (tabId == null || frameId == null || x == null || y == null) {
              sendResponse({ success: false, error: "Missing tab, frame, or coordinates" });
              break;
            }
            try {
              const ok = await clickInPageWorld(tabId, frameId, x, y);
              sendResponse({ success: ok });
            } catch (error) {
              extensionLogger.warn("[PageWorld] Click failed", {
                tabId,
                frameId,
                x,
                y,
                error: String(error)
              });
              sendResponse({ success: false, error: String(error) });
            }
          }
          break;
        case "GAME_LOADER_DETECTED":
          if (!shouldAcceptRedditBotGameEvent(sender.tab)) {
            extensionLogger.log("GAME_LOADER_DETECTED ignored — sender not on mission /comments/ page", {
              url: sender.tab?.url
            });
            sendResponse({ success: true, ignored: true });
            break;
          }
          extensionLogger.log("GAME_LOADER_DETECTED, sending to state machine");
          if (sender.tab?.id && shouldAcceptRedditBotGameEvent(sender.tab)) {
            activeMissionTabId = sender.tab.id;
          }
          sendToStateMachine({ type: "GAME_LOADER_DETECTED" });
          sendResponse({ success: true });
          break;
        case "GAME_DIALOG_OPENED":
          if (!shouldAcceptRedditBotGameEvent(sender.tab)) {
            extensionLogger.log("GAME_DIALOG_OPENED ignored — sender not on mission /comments/ page", {
              url: sender.tab?.url
            });
            sendResponse({ success: true, ignored: true });
            break;
          }
          extensionLogger.log("GAME_DIALOG_OPENED, sending to state machine");
          if (sender.tab?.id && shouldAcceptRedditBotGameEvent(sender.tab)) {
            activeMissionTabId = sender.tab.id;
            dialogOwnerTabId = sender.tab.id;
          }
          sendToStateMachine({ type: "GAME_DIALOG_OPENED" });
          sendResponse({ success: true });
          break;
        case "GAME_WAIT_TIMEOUT":
          {
            if (!shouldAcceptRedditBotGameEvent(sender.tab)) {
              extensionLogger.log("GAME_WAIT_TIMEOUT ignored — sender not on mission /comments/ page", {
                url: sender.tab?.url
              });
              sendResponse({ success: true, ignored: true });
              break;
            }
            const waitSnap = getStateMachineSnapshot();
            const waitPresState = waitSnap ? getPresentationStateName(waitSnap) : null;
            const waitScreen = waitSnap?.context?.gameState?.screen;
            if (
              (waitPresState === "running" || waitPresState === "gameReady") &&
              waitScreen &&
              waitScreen !== "victory_end"
            ) {
              extensionLogger.log("[GameWait] Timeout ignored — mission still active in iframe", {
                waitPresState,
                waitScreen
              });
              sendResponse({ success: true, ignored: true });
              break;
            }
            const postId = message.postId || message.missionId;
            extensionLogger.warn("[GameWait] No game modal opened within timeout, advancing queue", {
              postId
            });
            if (postId) {
              getAllUserProgress().then((progress) => {
                if (progress?.cleared && !progress.cleared.includes(postId)) {
                  extensionLogger.log("[GameWait] Mission not in cleared list; may still be playable later", {
                    postId
                  });
                }
              }).catch(() => {
              });
            }
            sendToStateMachine({ type: "GAME_WAIT_TIMEOUT", missionId: postId });
            sendResponse({ success: true });
          }
          break;
        case "GAME_DIALOG_CLOSED":
          extensionLogger.log("GAME_DIALOG_CLOSED received from content script", {
            source: message.source
          });
          {
            const dialogSnapshot = getStateMachineSnapshot();
            if (dialogSnapshot?.matches?.("gameMission.waitingForDialogClose")) {
              sendToStateMachine({ type: "GAME_DIALOG_CLOSED" });
            } else {
              extensionLogger.log("GAME_DIALOG_CLOSED ignored — not waiting for dialog close", {
                state: getPresentationStateName(dialogSnapshot)
              });
            }
          }
          sendResponse({ success: true });
          break;
        case "REQUEST_CLOSE_GAME_DIALOG":
          if (!isSafeToCloseGameDialog()) {
            extensionLogger.warn("REQUEST_CLOSE_GAME_DIALOG ignored — mission still in active play", {
              state: getPresentationStateName(getStateMachineSnapshot()),
              screen: getStateMachineSnapshot()?.context?.gameState?.screen ?? null
            });
            sendResponse({ success: true, ignored: true });
            break;
          }
          extensionLogger.log("REQUEST_CLOSE_GAME_DIALOG, closing modal on Reddit tab");
          sendCloseGameDialog(dialogOwnerTabId, "REQUEST_CLOSE_GAME_DIALOG", dialogOwnerTabId == null);
          sendResponse({ success: true });
          break;
        case "AUTOMATION_READY":
          extensionLogger.log("AUTOMATION_READY, sending AUTOMATION_STARTED to state machine");
          if (!botRunActive) {
            extensionLogger.log("AUTOMATION_READY ignored — bot run is not active");
            sendResponse({ success: true, ignored: true });
            break;
          }
          gameFrameId = sender.frameId;
          gameTabId = sender.tab?.id;
          if (sender.tab?.id) {
            activeMissionTabId = sender.tab.id;
          }
          extensionLogger.log("Tracked game frame", { gameFrameId, gameTabId });
          if (gameTabId != null && gameFrameId != null) {
            ensurePageWorldInFrame(gameTabId, gameFrameId).catch((error) => {
              extensionLogger.warn("[PageWorld] Inject on AUTOMATION_READY failed", {
                error: String(error)
              });
            });
          }
          sendToStateMachine({ type: "AUTOMATION_STARTED" });
          {
            const currentState = botActor?.getSnapshot();
            if (currentState?.matches?.("gameMission.running")) {
              extensionLogger.log(
                "Bot is running, re-broadcasting START_MISSION_AUTOMATION to newly ready iframe"
              );
              if (sender.tab?.id) {
                chrome.tabs.sendMessage(
                  sender.tab.id,
                  { type: "START_MISSION_AUTOMATION" },
                  { frameId: void 0 }
                );
              }
            }
          }
          sendResponse({ success: true });
          break;
        case "MISSION_DELETED":
          {
            const deletedPostId = message.missionId;
            dialogOwnerTabId = sender.tab?.id ?? dialogOwnerTabId;
            syncBotProtectedTabsToStorage();
            extensionLogger.log("MISSION_DELETED received", {
              postId: deletedPostId
            });
            if (deletedPostId) {
              gamePreviewReloadAttempts.delete(deletedPostId);
              markBatchSlotDoneByPostId(deletedPostId, "failed", "mission-deleted").catch(() => {
              });
            }
            if (deletedPostId) {
              try {
                await setMissionDisabled(deletedPostId, true);
                extensionLogger.log("Mission disabled in storage", {
                  postId: deletedPostId
                });
                sendToStateMachine({
                  type: "MISSION_DELETED",
                  missionId: deletedPostId
                });
                extensionLogger.log("Finding next mission after deleted post");
              } catch (error) {
                extensionLogger.error("Failed to disable mission", {
                  postId: deletedPostId,
                  error: String(error)
                });
                sendToStateMachine({
                  type: "MISSION_DELETED",
                  missionId: deletedPostId
                });
                extensionLogger.log("Finding next mission after error disabling deleted post");
              }
              findAndSendNextMission();
            } else {
              sendToStateMachine({
                type: "MISSION_DELETED",
                missionId: deletedPostId
              });
            }
            sendResponse({ success: true });
          }
          break;
        case "GAME_STATE_UPDATE":
          {
            const gameState = message.gameState;
            if (gameState) {
              const snapshot2 = getStateMachineSnapshot();
              if (snapshot2 && botActor) {
                snapshot2.context.gameState = {
                  postId: gameState.postId,
                  encounterCurrent: gameState.encounterCurrent ?? 0,
                  encounterTotal: gameState.encounterTotal ?? 0,
                  lives: gameState.lives ?? 3,
                  screen: gameState.screen ?? "unknown",
                  difficulty: gameState.difficulty
                };
                const presentationState = getPresentationStateName(snapshot2);
                broadcastToReddit({
                  type: "STATE_CHANGED",
                  state: presentationState,
                  context: snapshot2.context
                });
              }
            }
            sendResponse({ success: true });
          }
          break;
        case "GAME_UI_STUCK":
          {
            if (message.reloading) {
              extensionLogger.warn("[GameUI] Devvit hollow UI — reloading game iframe", {
                postId: message.postId,
                stuckMs: message.stuckMs
              });
            } else {
              extensionLogger.warn("[GameUI] Devvit still stuck after reload attempt", {
                postId: message.postId,
                stuckMs: message.stuckMs
              });
              sendToStateMachine({
                type: "GAME_WAIT_TIMEOUT",
                missionId: message.postId
              });
            }
            sendResponse({ success: true });
          }
          break;
        case "GET_TAB_ACTIVE":
          {
            const senderTabId = sender.tab?.id;
            if (!senderTabId) {
              sendResponse({ active: true });
              break;
            }
            chrome.storage.local.get(["activeBotSession"], (stored) => {
              if (stored.activeBotSession) {
                sendResponse({ active: true });
                return;
              }
              chrome.tabs.get(senderTabId, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                  sendResponse({ active: true });
                  return;
                }
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (activeTabs) => {
                  const activeTab = activeTabs?.[0];
                  sendResponse({
                    active: activeTab?.id === senderTabId && !tab.discarded
                  });
                });
              });
            });
          }
          return true;
        case "GAME_PREVIEW_FAILED":
          {
            const missionId = message.missionId;
            dialogOwnerTabId = sender.tab?.id ?? dialogOwnerTabId;
            syncBotProtectedTabsToStorage();
            const attempts = gamePreviewReloadAttempts.get(missionId) || 0;
            if (attempts === 0) {
              extensionLogger.warn("[GamePreview] Failed, skipping reload loop and disabling mission", {
                missionId
              });
              gamePreviewReloadAttempts.set(missionId, 1);
              try {
                await setMissionDisabled(missionId, true);
                extensionLogger.log("[GamePreview] Mission marked as disabled in storage", {
                  missionId
                });
                sendToStateMachine({
                  type: "MISSION_DELETED",
                  missionId
                });
                sendResponse({ action: "skip" });
              } catch (error) {
                extensionLogger.error("[GamePreview] Failed to disable mission after preview failure", {
                  missionId,
                  error: String(error)
                });
                sendResponse({ action: "error", error: String(error) });
              }
            } else {
              extensionLogger.error("[GamePreview] Failed after reload, skipping mission", {
                missionId
              });
              gamePreviewReloadAttempts.delete(missionId);
              try {
                await setMissionDisabled(missionId, true);
                extensionLogger.log("[GamePreview] Mission marked as disabled in storage", {
                  missionId
                });
                sendToStateMachine({
                  type: "MISSION_DELETED",
                  missionId
                });
                sendResponse({ action: "skip" });
              } catch (error) {
                extensionLogger.error(
                  "[GamePreview] CRITICAL: Failed to disable mission in storage, stopping bot",
                  {
                    missionId,
                    error: String(error)
                  }
                );
                sendToStateMachine({
                  type: "ERROR_OCCURRED",
                  message: `Failed to disable broken mission ${missionId}: ${String(error)}`
                });
                sendResponse({ action: "error", error: String(error) });
              }
            }
          }
          break;
        case "MISSION_COMPLETED":
          {
            if (!shouldAcceptMissionCompletedEvent(sender.tab, message)) {
              extensionLogger.log("MISSION_COMPLETED ignored — not from mission page or cleared banner", {
                url: sender.tab?.url,
                postId: message.postId,
                source: message.source
              });
              sendResponse({ success: true, ignored: true });
              break;
            }
            const advanceState = getPresentationStateName(getStateMachineSnapshot());
            if (["completing", "waitingForDialogClose", "navigating"].includes(advanceState)) {
              extensionLogger.log("MISSION_COMPLETED ignored — already advancing queue", {
                advanceState,
                postId: message.postId,
                source: message.source
              });
              sendResponse({ success: true, ignored: true, reason: "already-advancing" });
              break;
            }
            const completedPostId = message.postId;
            const senderTabId = sender.tab?.id ?? null;
            if (sender.tab?.id && shouldAcceptRedditBotGameEvent(sender.tab)) {
              dialogOwnerTabId = sender.tab.id;
              activeMissionTabId = sender.tab.id;
            }
            syncBotProtectedTabsToStorage();
            extensionLogger.log("MISSION_COMPLETED received", {
              postId: completedPostId,
              tabId: senderTabId,
              source: message.source
            });
            recordMissionTelemetry({
              snapshot: message.telemetrySnapshot,
              completionSource: message.source
            });
            if (completedPostId) {
              gamePreviewReloadAttempts.delete(completedPostId);
            }
            if (completedPostId) {
              markMissionCleared(completedPostId).then(async () => {
                await markBatchSlotDoneByPostId(completedPostId, "completed").catch(() => {});
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "completed").catch(() => {});
                }
                extensionLogger.log("Mission marked as cleared in storage", {
                  postId: completedPostId
                });
                // A cleared mission is proof the run is healthy, so the restart
                // budget starts over — an all-night session must not exhaust it
                // one respawn at a time.
                chrome.storage.local.remove([SESSION_RESUME_KEY]);
                const snapshotDone = getStateMachineSnapshot();
                const machineState = getPresentationStateName(snapshotDone);
                if (BOT_TERMINAL_PRESENTATION_STATES.includes(machineState) && !botRunActive) {
                  extensionLogger.log(
                    "[MISSION_COMPLETED] Bot already stopped; cleared storage only",
                    { machineState }
                  );
                  chrome.storage.local.remove(["activeBotSession"]);
                  broadcastToAllFrames({ type: "STOP_MISSION_AUTOMATION" });
                  sendResponse({ success: true, terminalCleanup: true });
                  return;
                }
                sendToStateMachine({
                  type: "MISSION_COMPLETED",
                  missionId: completedPostId
                });
              }).catch(async (error) => {
                await markBatchSlotDoneByPostId(completedPostId, "failed", String(error)).catch(() => {});
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "failed", String(error)).catch(() => {});
                }
                extensionLogger.error("Failed to mark mission as cleared", {
                  postId: completedPostId,
                  error: String(error)
                });
                sendToStateMachine({
                  type: "MISSION_COMPLETED",
                  missionId: completedPostId
                });
              });
            } else {
              (async () => {
                if (senderTabId != null) {
                  await markBatchSlotDoneByTabId(senderTabId, "completed", "completed-no-postid").catch(() => {});
                }
                sendToStateMachine({
                  type: "MISSION_COMPLETED",
                  missionId: completedPostId
                });
              })();
            }
            sendResponse({ success: true });
          }
          break;
        case "MISSION_FOUND":
          extensionLogger.log("MISSION_FOUND, sending event to state machine");
          const missionData = message;
          if (missionData.isCurrentPage && !shouldAcceptRedditBotGameEvent(sender.tab)) {
            extensionLogger.log("MISSION_FOUND ignored — isCurrentPage but tab is not mission /comments/", {
              url: sender.tab?.url,
              missionId: missionData.missionId
            });
            sendResponse({ success: true, ignored: true });
            break;
          }
          if (sender.tab?.id && shouldAcceptRedditBotGameEvent(sender.tab)) {
            activeMissionTabId = sender.tab.id;
            extensionLogger.log("MISSION_FOUND tracked mission tab", { tabId: sender.tab.id });
          }
          const snapshot = getStateMachineSnapshot();
          const currentState = getPresentationStateName(snapshot);
          if (currentState === "completing") {
            extensionLogger.log("In completing state, sending NEXT_MISSION_FOUND");
            sendToStateMachine({
              type: "NEXT_MISSION_FOUND",
              missionId: missionData.missionId,
              permalink: missionData.permalink
            });
          } else if (missionData.isCurrentPage) {
            extensionLogger.log("Already on page, sending MISSION_PAGE_LOADED");
            sendToStateMachine({
              type: "MISSION_PAGE_LOADED",
              missionId: missionData.missionId,
              permalink: missionData.permalink
            });
          } else {
            extensionLogger.log("Need to navigate, sending NAVIGATE_TO_MISSION");
            sendToStateMachine({
              type: "NAVIGATE_TO_MISSION",
              missionId: missionData.missionId,
              permalink: missionData.permalink
            });
          }
          sendResponse({ success: true });
          break;
        case "NO_MISSIONS_FOUND":
          extensionLogger.log("NO_MISSIONS_FOUND, sending to state machine");
          sendToStateMachine({ type: "NO_MISSIONS_FOUND" });
          sendResponse({ success: true });
          break;
        case "ERROR_OCCURRED":
          {
            const errorSnapshot = getStateMachineSnapshot();
            const errorMessage = message.message || "Unknown error";
            extensionLogger.error("ERROR_OCCURRED", {
              errorMessage,
              currentState: errorSnapshot?.value
            });
            // Only run-ending failures carry telemetry (see the out-of-lives
            // branch in devvit.js). Other ERROR_OCCURRED senders are reporting
            // extension faults, not mission outcomes, and must not become rows.
            if (message.telemetryOutcome && message.telemetrySnapshot) {
              recordMissionTelemetry({
                snapshot: message.telemetrySnapshot,
                completionSource: message.telemetrySource || "error",
                outcome: message.telemetryOutcome
              });
            }
            sendToStateMachine({
              type: "ERROR_OCCURRED",
              message: errorMessage
            });
            sendResponse({ success: true });
          }
          break;
        case "MISSIONS_UPDATED":
          {
            chrome.runtime.sendMessage({
              type: "MISSIONS_CHANGED"
            }).catch(() => {
            });
            try {
              const stored = await new Promise((resolve) => {
                chrome.storage.local.get(["automationFilters"], resolve);
              });
              await buildBotQueueSnapshot(stored.automationFilters);
            } catch (error) {
              extensionLogger.warn("[MISSIONS_UPDATED] Bot queue refresh failed", {
                error: String(error)
              });
            }
            sendResponse({ success: true });
          }
          break;
        case "PING":
          {
            const snapshot2 = getStateMachineSnapshot();
            const state = getPresentationStateName(snapshot2);
            sendResponse({
              success: true,
              state,
              context: snapshot2?.context,
              timestamp: Date.now()
            });
          }
          break;
        case "GET_AUTOMATION_CONFIG":
          {
            chrome.storage.local.get(["automationConfig"], (result2) => {
              sendResponse({
                success: true,
                config: result2?.automationConfig || {}
              });
            });
          }
          return true;
        case "DEVVIT_FETCH_DEBUG":
          {
            try {
              const detail = message.payload || {};
              extensionLogger.log("[fetchDebug] devvit fetch", {
                url: detail.url,
                method: detail.method,
                status: detail.status,
                postId: detail.postId || null,
                bodyLength: detail.bodyLength,
                elapsedMs: detail.elapsedMs,
                requestHeaders: detail.requestHeaders,
                responseHeaders: detail.responseHeaders,
                bodyBase64Preview: typeof detail.bodyBase64 === "string"
                  ? (detail.bodyBase64.length <= 256
                      ? detail.bodyBase64
                      : detail.bodyBase64.slice(0, 256) + "...")
                  : "",
                bodyBase64: detail.bodyBase64
              });
            } catch (error) {
              extensionLogger.error("[fetchDebug] Failed to log devvit fetch", {
                error: String(error)
              });
            }
            sendResponse({ success: true });
          }
          break;
        case "FETCH_MISSION_DATA":
          {
            const { postId, tabId } = message;
            if (!postId || !tabId) {
              sendResponse({ success: false, error: "Missing postId or tabId" });
              break;
            }
            extensionLogger.log("[FETCH_MISSION_DATA] Forwarding request to content script", {
              postId,
              tabId
            });
            sendMessageToRedditMainFrame(
              tabId,
              {
                type: "FETCH_MISSION_DATA_FROM_PAGE",
                postId
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  extensionLogger.error("[FETCH_MISSION_DATA] Failed to communicate with tab", {
                    error: chrome.runtime.lastError.message,
                    tabId
                  });
                  sendResponse({
                    success: false,
                    error: `Failed to communicate with tab: ${chrome.runtime.lastError.message}`
                  });
                } else if (response?.success) {
                  extensionLogger.log("[FETCH_MISSION_DATA] Successfully fetched mission data", {
                    postId,
                    data: response.data
                  });
                  sendResponse({
                    success: true,
                    data: response.data
                  });
                } else {
                  extensionLogger.error("[FETCH_MISSION_DATA] Failed to fetch mission data", {
                    error: response?.error
                  });
                  sendResponse({
                    success: false,
                    error: response?.error || "Unknown error occurred"
                  });
                }
              }
            );
          }
          return true;
        // Will respond asynchronously
        case "REFRESH_BOT_QUEUE":
          {
            try {
              const snapshot = await buildBotQueueSnapshot(await getStoredAutomationFilters());
              sendResponse({ success: true, snapshot });
            } catch (error) {
              extensionLogger.error("[REFRESH_BOT_QUEUE] Failed", { error: String(error) });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        case "SYNC_LATEST_MISSIONS":
          {
            try {
              const syncResult = await syncLatestMissionsFromReddit({
                runEnrichment: message.runEnrichment !== false
              });
              const compacted = await compactAllClearedMissions();
              extensionLogger.log("[SYNC_LATEST_MISSIONS] Manual sync completed", {
                syncedCount: syncResult.syncedCount,
                fetchedCount: syncResult.fetchedCount,
                skippedExisting: syncResult.skippedExisting,
                updatedExisting: syncResult.updatedExisting,
                daysBack: syncResult.daysBack,
                postsScanned: syncResult.postsScanned,
                pagesFetched: syncResult.pagesFetched,
                subredditTabsScanned: syncResult.subredditTabsScanned,
                autoMarkedCleared: syncResult.autoMarkedCleared,
                compactedCleared: compacted,
                enrichment: syncResult.enrichment
              });
              sendResponse({
                success: true,
                syncedCount: syncResult.syncedCount,
                fetchedCount: syncResult.fetchedCount,
                skippedExisting: syncResult.skippedExisting,
                updatedExisting: syncResult.updatedExisting,
                skippedNonMission: syncResult.skippedNonMission,
                daysBack: syncResult.daysBack,
                postsScanned: syncResult.postsScanned,
                postsWithFlair: syncResult.postsWithFlair,
                postsWithoutFlair: syncResult.postsWithoutFlair,
                postsSkippedNoFlair: syncResult.postsSkippedNoFlair,
                pagesFetched: syncResult.pagesFetched,
                searchPagesFetched: syncResult.searchPagesFetched,
                searchSlicesFetched: syncResult.searchSlicesFetched,
                fetchedFlairBackfill: syncResult.fetchedFlairBackfill,
                storageFlairBackfill: syncResult.storageFlairBackfill,
                prunedJunk: syncResult.prunedJunk,
                subredditTabsScanned: syncResult.subredditTabsScanned,
                autoMarkedCleared: syncResult.autoMarkedCleared,
                compactedCleared: compacted,
                enrichment: syncResult.enrichment
              });
            } catch (error) {
              extensionLogger.error("[SYNC_LATEST_MISSIONS] Manual sync failed", {
                error: String(error)
              });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        // Will respond asynchronously
        case "SYNC_RECENT_MISSIONS_3D":
          {
            try {
              const syncResult = await syncRecentMissionsFromReddit(3, { runEnrichment: true });
              extensionLogger.log("[SYNC_RECENT_MISSIONS_3D] Manual sync completed", {
                syncedCount: syncResult.syncedCount,
                fetchedCount: syncResult.fetchedCount,
                skippedExisting: syncResult.skippedExisting,
                autoMarkedCleared: syncResult.autoMarkedCleared,
                daysBack: syncResult.daysBack,
                enrichment: syncResult.enrichment
              });
              sendResponse({
                success: true,
                syncedCount: syncResult.syncedCount,
                fetchedCount: syncResult.fetchedCount,
                skippedExisting: syncResult.skippedExisting,
                autoMarkedCleared: syncResult.autoMarkedCleared,
                daysBack: syncResult.daysBack,
                enrichment: syncResult.enrichment
              });
            } catch (error) {
              extensionLogger.error("[SYNC_RECENT_MISSIONS_3D] Manual sync failed", {
                error: String(error)
              });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        case "ENRICH_MISSION_METADATA":
          {
            try {
              const enrichment = await runMissionMetadataEnrichment();
              sendResponse({ success: true, enrichment });
            } catch (error) {
              extensionLogger.error("[ENRICH_MISSION_METADATA] Failed", { error: String(error) });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        case "ARCHIVE_OLD_MISSIONS":
          {
            try {
              const result = await archiveOldMissions({ days: message.days });
              await buildBotQueueSnapshot(await getStoredAutomationFilters());
              sendResponse({ success: true, ...result });
            } catch (error) {
              extensionLogger.error("[ARCHIVE_OLD_MISSIONS] Failed", { error: String(error) });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        case "RECLASSIFY_MISSIONS":
          {
            try {
              const result = await reclassifyStoredMissions({ maxCount: message.maxCount });
              await buildBotQueueSnapshot(await getStoredAutomationFilters());
              sendResponse({ success: true, ...result });
            } catch (error) {
              extensionLogger.error("[RECLASSIFY_MISSIONS] Failed", { error: String(error) });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        case "DEVVIT_INIT_CAPTURED":
        case "MISSION_METADATA_CAPTURED":
          {
            try {
              const postId = message.postId;
              if (!postId) {
                sendResponse({ success: false, error: "Missing postId" });
                break;
              }
              const initPayload = message.init || message;
              const data = message.data || missionDataFromInitPayload(initPayload);
              if (hasEnrichableMissionData(data)) {
                fulfillPendingMissionEnrichment(postId, {
                  success: true,
                  data,
                  source: message.source || message.type
                });
              }
              const allMissions = await getAllMissions();
              const key = normalizeEnrichPostId(postId);
              const existing = allMissions[key] || allMissions[postId] || null;
              let record = null;
              if (data && hasEnrichableMissionData(data)) {
                record = await upsertMissionFromDevvitFetch(key, existing, data);
              } else {
                record = await upsertMissionFromDevvitInit(initPayload, existing);
              }
              sendResponse({ success: !!record, postId: key });
            } catch (error) {
              extensionLogger.error("[DEVVIT_INIT_CAPTURED] Failed", { error: String(error) });
              sendResponse({ success: false, error: String(error) });
            }
          }
          return true;
        // Will respond asynchronously
        default:
          extensionLogger.warn("Unknown message type", { type: message.type });
          sendResponse({ error: "Unknown message type: " + message.type });
      }
    }
    function cleanup() {
      extensionLogger.warn("Shutting down", {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        hadActiveActor: !!botActor
      });
      if (botActor) {
        try {
          botActor.stop();
          extensionLogger.log("Stopped botActor");
        } catch (error) {
          extensionLogger.warn("Error stopping botActor", { error: String(error) });
        }
        botActor = null;
      }
    }
    if (chrome.runtime.onSuspend) {
      chrome.runtime.onSuspend.addListener(() => {
        extensionLogger.warn("onSuspend event fired, running cleanup");
        cleanup();
      });
    }
    async function initializeExtension() {
      try {
      await registerPageWorldScripts();
        await recoverBatchTabs();
      } catch (error) {
        extensionLogger.warn("[Batch] Recovery/register failed", { error: String(error) });
      }
      try {
      const tabs = await chrome.tabs.query({
        url: ["https://www.reddit.com/*", "https://*.devvit.net/*"]
      });
      for (const tab of tabs) {
        if (tab.id != null) {
          injectPageKeepAlive(tab.id).catch(() => {
          });
        }
      }
      const username = await getCurrentRedditUser();
        extensionLogger.log("[UserDetection] Extension loaded, current user:", username);
      } catch (error) {
        extensionLogger.error("[UserDetection] Failed to detect user on load:", error);
      }
      try {
        extensionLogger.log("[MissionMigration] Checking for missions to migrate...");
        const result2 = await migrateMissionsStorage();
        if (result2.migrated > 0) {
          extensionLogger.log("[MissionMigration] Migrated missions from old format", {
            total: result2.total,
            migrated: result2.migrated,
            alreadyFlat: result2.alreadyFlat,
            errors: result2.errors.length
          });
        } else {
          extensionLogger.log("[MissionMigration] All missions already in flat format");
        }
      } catch (error) {
        extensionLogger.error("[MissionMigration] Failed to migrate missions", {
          error: String(error)
        });
      }
      try {
        const needsToMigrate = await needsMigration();
        if (needsToMigrate) {
          extensionLogger.log("[ProgressMigration] Storage migration needed, starting migration...");
          const result2 = await migrateToSeparateProgress();
          extensionLogger.log("[ProgressMigration] Migration completed", result2);
        } else {
          extensionLogger.log("[ProgressMigration] No migration needed");
        }
      } catch (error) {
        extensionLogger.error("[ProgressMigration] Migration check failed", { error: String(error) });
      }
    }
    initializeExtension().then(
      () => resumeBotSessionAfterWorkerRestart().catch((error) => {
        extensionLogger.error("[SessionResume] Failed", { error: String(error) });
      })
    );
    extensionLogger.log("Sword & Supper Bot background script loaded");
  });
  function initPlugins() {
  }
  globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
  function print(method, ...args) {
    return;
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  let result;
  try {
    initPlugins();
    result = definition.main();
    if (result instanceof Promise) {
      console.warn(
        "The background's main() function return a promise, but it must be synchronous"
      );
    }
  } catch (err) {
    const bootErr = err instanceof Error ? err : new Error(String(err));
    console.error("[LazyFrog:RunGate] SW_BOOT_CRASH", bootErr.message, bootErr.stack);
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
        chrome.storage.local.set({
          lazyfrogSwHealth: {
            ok: false,
            error: bootErr.message,
            stack: bootErr.stack,
            ts: Date.now()
          }
        });
      }
    } catch {
    }
  }
  const result$1 = result;
  return result$1;
})();
