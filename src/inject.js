// This script is injected by the server into uncached SPA pages.
// Its primary responsibility is to capture the main content rendered by the SPA
// and send it back to the server for caching.
(function () {
    function findMainContent() {
        // Common SPA container selectors in order of preference (most specific to most general)
        var selectors = [
            '[data-wrapper="app"]',
            "#root",
            "#app",
            "#__next",
            '[role="main"]',
            "body", // Fallback to body as a last resort
        ];
        // Try to find the main content container using the defined selectors
        for (var _i = 0, selectors_1 = selectors; _i < selectors_1.length; _i++) {
            var selector = selectors_1[_i];
            var element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return document.documentElement;
    }
    function getMainContent() {
        try {
            // Find the main content container
            var mainContentElement = findMainContent();
            // Create a sanitized clone of the main content element for processing.
            // Using cloneNode(true) ensures all children are copied.
            var sanitizedContentClone = mainContentElement.cloneNode(true);
            // Remove any script tags from the cloned content.
            // Querying on the cloned node ensures we don't affect the live DOM.
            var scripts = sanitizedContentClone.querySelectorAll("script");
            scripts.forEach(function (script) { return script.remove(); });
            // Remove event handlers and javascript: URIs from all elements within the cloned content.
            // Iterate backwards when removing attributes to avoid issues with collection mutation.
            var allElements = sanitizedContentClone.getElementsByTagName("*");
            for (var i = allElements.length - 1; i >= 0; i--) {
                var el = allElements[i];
                var attrs = Array.from(el.attributes); // Convert to array to iterate safely
                for (var j = attrs.length - 1; j >= 0; j--) {
                    var attr = attrs[j];
                    var attrNameLower = attr.name.toLowerCase();
                    var attrValueLower = typeof attr.value === "string" ? attr.value.toLowerCase() : "";
                    // Check for on* event handler attributes
                    if (attrNameLower.startsWith("on")) {
                        el.removeAttribute(attr.name);
                        continue; // Move to next attribute for this element
                    }
                    // Check for javascript: URIs in href or src attributes
                    if ((attrNameLower === "href" || attrNameLower === "src") &&
                        attrValueLower.startsWith("javascript:")) {
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
        }
        catch (e) {
            console.error("Sterad: Error preparing content for caching:", e);
            return null;
        }
    }
    function captureAndSend() {
        try {
            // Don't capture if this is a bot or crawler user agent.
            if (navigator.webdriver || // Detects headless browsers often used by bots
                /bot|crawler|spider|crawling|googlebot|bingbot|yandexbot|duckduckbot/i.test(navigator.userAgent)) {
                console.log("Sterad: Skipping content capture for detected bot/crawler.");
                return;
            }
            var contentToCache = getMainContent();
            if (!contentToCache || !contentToCache.content) {
                return;
            }
            fetch("/__sterad_capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: contentToCache.url,
                    title: contentToCache.title,
                    content: contentToCache.content,
                }),
                credentials: "same-origin", // Send cookies if on the same origin
            })
                .then(function (response) {
                if (!response.ok) {
                    console.error("Sterad: Failed to cache page. Server responded with status:", response.status, response.statusText);
                }
                else {
                    console.log("Sterad: Page content successfully cached by the server.");
                }
                return response.text();
            })
                .catch(function (error) {
                console.error("Sterad: Network error during page caching attempt:", error);
            });
        }
        catch (e) {
            console.error("Sterad: Unexpected error in captureAndSend:", e);
        }
    }
    function init() {
        setTimeout(captureAndSend, 1000);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    }
    else {
        init();
    }
    // Detect hard reload (not SPA navigation)
    window.addEventListener("beforeunload", function (e) {
        var _a;
        if (performance &&
            // @ts-expect-error
            ((_a = performance.getEntriesByType("navigation")[0]) === null || _a === void 0 ? void 0 : _a.type) === "reload") {
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
