var missiondatafetcher = (function() {
  "use strict";
  function defineUnlistedScript(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  const definition = defineUnlistedScript(() => {
    window.addEventListener("autosupper:fetch-mission-request", async (event) => {
      const { postId, requestId, requestBody } = event.detail;
      try {
        const body = requestBody instanceof Uint8Array ? requestBody : new Uint8Array(requestBody);
        const response = await fetch(
          "https://devvit-gateway.reddit.com/devvit.reddit.custom_post.v1alpha.CustomPost/RenderPostContent",
          {
            method: "POST",
            mode: "cors",
            credentials: "include",
            headers: {
              accept: "*/*",
              "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
              "content-type": "application/grpc-web+proto",
              "devvit-accept-language": "en-GB",
              "devvit-accept-timezone": "Europe/Copenhagen",
              "devvit-actor": "main",
              "devvit-installation": "7f2e80d7-6821-4a20-9405-05c3b43012ea",
              "devvit-post": postId,
              "devvit-user-agent": "Reddit;Shreddit;not-provided",
              "x-grpc-web": "1"
            },
            referrer: "https://www.reddit.com/",
            body
          }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        window.dispatchEvent(
          new CustomEvent("autosupper:fetch-mission-response", {
            detail: {
              requestId,
              postId,
              success: true,
              arrayBuffer
            }
          })
        );
      } catch (error) {
        console.error("[LazyFrog] Fetch failed:", postId, error);
        window.dispatchEvent(
          new CustomEvent("autosupper:fetch-mission-response", {
            detail: {
              requestId,
              postId,
              success: false,
              error: error.message || String(error)
            }
          })
        );
      }
    });
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
        `The unlisted script "${"missionDataFetcher"}" crashed on startup!`,
        err
      );
      throw err;
    }
  })();
  return result;
})();
missiondatafetcher;