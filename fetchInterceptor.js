var fetchinterceptor = (function() {
  "use strict";
  function defineUnlistedScript(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  // URLs that we always want to surface raw bytes for when debug mode is on.
  // Tweak this list freely — it's matched against the fetch URL string with
  // RegExp.test, so partial substring patterns work too.
  const FETCH_DEBUG_PATTERNS = [
    /CustomPost\/RenderPostContent/i,
    /devvit\.net\/.*api/i,
    /devvit-gateway/i,
    /\/api\/.*devvit/i,
    /reddit\.com\/svc\/shreddit/i,
    /encounter/i,
    /mission/i,
    /game/i,
    /run/i,
    /loot/i,
    /Custom(?:Post|Action)/i
  ];
  function shouldDebugLogUrl(url) {
    if (typeof url !== "string") return false;
    return FETCH_DEBUG_PATTERNS.some((re) => re.test(url));
  }
  function arrayBufferToBase64(buf) {
    try {
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, i + chunk)
        );
      }
      return btoa(binary);
    } catch {
      return "";
    }
  }
  function headersToPlain(input) {
    const out = {};
    try {
      if (!input) return out;
      if (typeof input.forEach === "function") {
        input.forEach((value, key) => {
          out[key] = String(value);
        });
        return out;
      }
      if (typeof input === "object") {
        for (const k of Object.keys(input)) out[k] = String(input[k]);
      }
    } catch {
    }
    return out;
  }
  const definition = defineUnlistedScript(() => {
    if (window.__lazyfrogFetchInterceptorInstalled) {
      return;
    }
    window.__lazyfrogFetchInterceptorInstalled = true;
    document.addEventListener("lazyfrog:set-debug-fetch", (event) => {
      window.__lazyfrogDebugFetch = !!event.detail?.enabled;
    });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function lazyFrogFetch(...args) {
      const resource = args[0];
      const config = args[1];
      const url = typeof resource === "string"
        ? resource
        : resource instanceof Request
          ? resource.url
          : String(resource);
      const debugEnabled = !!window.__lazyfrogDebugFetch;
      const isPostRenderContent = url.includes("CustomPost/RenderPostContent");
      const isApiInit = /\/api\/init\b/i.test(url);
      const isInteresting = isPostRenderContent || isApiInit || (debugEnabled && shouldDebugLogUrl(url));
      if (!isInteresting) {
        return nativeFetch(...args);
      }
      let headers = config?.headers || {};
      if (headers instanceof Headers) {
        headers = headersToPlain(headers);
      } else if (typeof headers === "object" && headers !== null) {
        headers = headersToPlain(headers);
      }
      const postId = headers["devvit-post"];
      const method = (config?.method || (resource instanceof Request ? resource.method : "GET")).toUpperCase();
      const startedAt = Date.now();
      return nativeFetch(...args).then((response) => {
        if (isApiInit && response.ok) {
          response.clone().json().then((json) => {
            if (json?.success) {
              document.dispatchEvent(
                new CustomEvent("lazyfrog:api-init", { detail: json })
              );
            }
          }).catch(() => {
          });
        }
        if (isPostRenderContent && postId) {
          response.clone().arrayBuffer().then((buffer) => {
            window.dispatchEvent(
              new CustomEvent("autosupper:raw-mission-data", {
                detail: { postId, arrayBuffer: buffer }
              })
            );
          }).catch((err) => {
            console.error("[LazyFrog] Failed to get response buffer:", err);
          });
        }
        if (debugEnabled) {
          response.clone().arrayBuffer().then((buffer) => {
            const elapsedMs = Date.now() - startedAt;
            const responseHeaders = headersToPlain(response.headers);
            const base64 = arrayBufferToBase64(buffer);
            window.dispatchEvent(
              new CustomEvent("lazyfrog:fetch-debug", {
                detail: {
                  url,
                  method,
                  status: response.status,
                  postId: postId || null,
                  requestHeaders: headers,
                  responseHeaders,
                  bodyBase64: base64,
                  bodyLength: buffer.byteLength,
                  elapsedMs,
                  startedAt
                }
              })
            );
          }).catch(() => {
          });
        }
        return response;
      });
    };
  });
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
      return await definition.main();
    } catch (err) {
      logger.error(
        `The unlisted script "${"fetchInterceptor"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
})();
fetchinterceptor;
