// This script is injected by the server into uncached SPA pages.
// Its primary responsibility is to capture the main content rendered by the SPA
// and send it back to the server for caching.

(function () {
  function findMainContent() {
    // Common SPA container selectors in order of preference (most specific to most general)
    const selectors = [
      '[data-wrapper="app"]',
      "#root",
      "#app",
      "#__next",
      '[role="main"]',
      "body", // Fallback to body as a last resort
    ];

    // Try to find the main content container using the defined selectors
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return document.documentElement;
  }
  function getMainContent() {
    try {
      // Find the main content container
      const mainContentElement = findMainContent();
      // Create a sanitized clone of the main content element for processing.
      // Using cloneNode(true) ensures all children are copied.
      const sanitizedContentClone = mainContentElement.cloneNode(
        true
      ) as HTMLElement;

      // Remove any script tags from the cloned content.
      // Querying on the cloned node ensures we don't affect the live DOM.
      const scripts = sanitizedContentClone.querySelectorAll("script");
      scripts.forEach((script) => script.remove());

      // Remove event handlers and javascript: URIs from all elements within the cloned content.
      // Iterate backwards when removing attributes to avoid issues with collection mutation.
      const allElements = sanitizedContentClone.getElementsByTagName("*");
      for (let i = allElements.length - 1; i >= 0; i--) {
        const el = allElements[i];
        const attrs = Array.from(el.attributes); // Convert to array to iterate safely

        for (let j = attrs.length - 1; j >= 0; j--) {
          const attr = attrs[j];
          const attrNameLower = attr.name.toLowerCase();
          const attrValueLower =
            typeof attr.value === "string" ? attr.value.toLowerCase() : "";

          // Check for on* event handler attributes
          if (attrNameLower.startsWith("on")) {
            el.removeAttribute(attr.name);
            continue; // Move to next attribute for this element
          }

          // Check for javascript: URIs in href or src attributes
          if (
            (attrNameLower === "href" || attrNameLower === "src") &&
            attrValueLower.startsWith("javascript:")
          ) {
            el.removeAttribute(attr.name); // Remove the attribute entirely
          }
        }
      }

      // Return the necessary data for caching.
      return {
        title: document.title,
        content: sanitizedContentClone.innerHTML, // Get the sanitized HTML string
        url: window.location.pathname + window.location.search, // Include query parameters
      };
    } catch (e) {
      console.error("Sterad: Error preparing content for caching:", e);
      return null;
    }
  }

  function captureAndSend(isManual = false) {
    try {
      const contentToCache = getMainContent();
      if (!contentToCache || !contentToCache.content) {
        return Promise.reject(new Error("No content to cache"));
      }

      return fetch("/__sterad_capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: contentToCache.url,
          title: contentToCache.title,
          content: contentToCache.content,
          manual: isManual,
        }),
        credentials: "same-origin", // Send cookies if on the same origin
      })
        .then((response) => {
          if (!response.ok) {
            console.error(
              "Sterad: Failed to cache page. Server responded with status:",
              response.status,
              response.statusText
            );
            throw new Error(
              `Cache failed: ${response.status} ${response.statusText}`
            );
          } else {
            console.log(
              "Sterad: Page content successfully cached by the server."
            );
          }
          return response.json().catch(() => ({}));
        })
        .catch((error) => {
          console.error(
            "Sterad: Network error during page caching attempt:",
            error
          );
          throw error;
        });
    } catch (e) {
      console.error("Sterad: Unexpected error in captureAndSend:", e);
      return Promise.reject(e);
    }
  }

  function init() {
    // Only auto-capture if not manually triggered
    // @ts-ignore
    if (!window.Sterad || !window.Sterad._manualCacheTriggered) {
      setTimeout(() => captureAndSend(false), 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Detect hard reload (not SPA navigation)
  window.addEventListener("beforeunload", function (e) {
    if (
      performance &&
      // @ts-expect-error
      performance.getEntriesByType("navigation")[0]?.type === "reload"
    ) {
      // Send DELETE to server to clear cache for this path
      fetch("/__sterad_capture", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname + window.location.search,
        }),
        credentials: "same-origin",
      });
    }
  });
})();
