// server.ts
// Sterad: Secure, SSR-style HTML Caching Server for SPAs using Bun.js

import { BunFile } from "bun";
import { existsSync, mkdirSync } from "fs"; // Added statSync
import { join, dirname } from "path"; // Import extname for file extension handling

// --- Configuration ---
// Define the structure for our configuration.
interface Config {
  spa_dist: string;
  cache_dir: string; // This will be dynamically set relative to spa_dist
  port: number;
  cache_routes: string[];
  not_cache_routes?: string[]; // Optional not cache routes
  memory_cache_limit: number;
}

// Load and parse sterad.toml using Bun's native TOML parser.
const configPath = "sterad.toml"; // Changed to sterad.toml
let config: Config;
try {
  const configContent = await Bun.file(configPath).text(); // Reverted to .text()
  config = Bun.TOML.parse(configContent) as Config; // Reverted to Bun.TOML.parse()

  // Set the cache_dir relative to spa_dist as requested.
  config.cache_dir = join(config.spa_dist, ".sterad__cache");

  // Basic validation
  if (!config.spa_dist || !config.port || !Array.isArray(config.cache_routes)) {
    throw new Error("Missing essential configuration in sterad.toml");
  }

  // Initialize not_cache_routes if not provided
  if (!config.not_cache_routes) {
    config.not_cache_routes = [];
  }
  if (
    typeof config.port !== "number" ||
    config.port <= 0 ||
    config.port > 65535
  ) {
    throw new Error(
      'Invalid "port" in sterad.toml. Must be a positive number (1-65535).'
    );
  }
  if (
    typeof config.memory_cache_limit !== "number" ||
    config.memory_cache_limit <= 0
  ) {
    config.memory_cache_limit = 100; // Default if not valid
    console.warn(
      'Invalid "memory_cache_limit" in sterad.toml. Defaulting to 100.'
    );
  }

  console.log("Sterad: Configuration loaded successfully.");
} catch (error: any) {
  console.error(
    `Sterad Error: Failed to load or parse sterad.toml: ${error.message}`
  );
  process.exit(1); // Exit if config is critical
}

const { spa_dist, cache_dir, port, cache_routes, memory_cache_limit } = config;

// Ensure the cache directory exists.
if (!existsSync(cache_dir)) {
  mkdirSync(cache_dir, { recursive: true });
  console.log(`Sterad: Created cache directory at ${cache_dir}`);
}

// --- In-Memory Cache ---
const memoryCache = new Map<string, BunFile>(); // path -> HTML content

function addToMemoryCache(path: string, content: BunFile) {
  if (memoryCache.has(path)) {
    memoryCache.delete(path); // Move to end (most recently used)
  }
  memoryCache.set(path, content);

  if (memoryCache.size > memory_cache_limit) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
    console.log(`Sterad: Memory cache limit reached. Evicted: ${firstKey}`);
  }
}

function getDiskCacheFilePath(urlPath: string): string {
  const fileName =
    urlPath === "/"
      ? "index.html"
      : `${urlPath.substring(1).replace(/\//g, "_")}.html`;
  return join(cache_dir, fileName);
}

function compileCachePatterns(patterns: string[]): RegExp {
  if (patterns.length === 0) {
    return /^$^/;
  }
  const regexParts = patterns.map((pattern) => {
    // Handle exact matches (paths without wildcards)
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
    }
    // Escape special regex characters except * and ?
    let regexStr = pattern
      .replace(/[.+${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*") // Convert * to .*
      .replace(/\?/g, "."); // Convert ? to .
    if (!regexStr.startsWith("^")) regexStr = "^" + regexStr;
    if (!regexStr.endsWith("$")) regexStr = regexStr + "$";
    return regexStr;
  });
  return new RegExp(regexParts.join("|"), "i");
}

// Compile cache patterns at startup
const CACHE_REGEX = compileCachePatterns(config.cache_routes);
const NO_CACHE_REGEX = compileCachePatterns(config.not_cache_routes);

// Fast path for cache checking
const shouldCachePath = (path: string): boolean => {
  // Always handle root path
  if (path === "/") return config.cache_routes.includes("/");

  const matchesCache = CACHE_REGEX.test(path);
  const matchesNoCache = NO_CACHE_REGEX.test(path);

  return matchesCache && !matchesNoCache;
};

// --- Security Functions ---
function isSafeMainContent(content: string): boolean {
  if (/<script[\s\S]*?>[\s\S]*?<\/script>/i.test(content)) {
    console.warn("Sterad Security: Rejected content due to <script> tags.");
    return false;
  }
  if (/<style[\s\S]*?>[\s\S]*?<\/style>/i.test(content)) {
    console.warn("Sterad Security: Rejected content due to <style> tags.");
    return false;
  }
  if (/\bon[a-z]+=\s*(['"])(.*?)\1/i.test(content)) {
    console.warn(
      "Sterad Security: Rejected content due to on* event handlers."
    );
    return false;
  }
  if (/\b(?:href|src)\s*=\s*(['"]|)(?:javascript:.*?)\1/i.test(content)) {
    console.warn("Sterad Security: Rejected content due to javascript: URIs.");
    return false;
  }
  return true;
}

function sanitizeHtml(content: string): string {
  let sanitizedContent = content;
  sanitizedContent = sanitizedContent.replace(
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    ""
  );
  sanitizedContent = sanitizedContent.replace(
    /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
    ""
  );
  sanitizedContent = sanitizedContent.replace(
    /\s+on[a-z]+=\s*(['"])(.*?)\1/gi,
    " "
  );
  sanitizedContent = sanitizedContent.replace(
    /(<[^>]+(?:href|src)\s*=\s*(['"]|))javascript:.*?\2/gi,
    "$1#"
  );
  return sanitizedContent.trim();
}

const injectJsScriptContent = await Bun.file("src/inject.js").text();

// --- Load SPA Shell ---
let spaShellHtml: string;
let spaHtmlWithInjectScript: string;
try {
  spaShellHtml = await Bun.file(join(spa_dist, "index.html")).text();
  spaHtmlWithInjectScript = spaShellHtml.replace(
    "</body>",
    `<script>${injectJsScriptContent}</script>\n</body>`
  );
  spaShellHtml = spaShellHtml.replace(
    "</body>",
    `<script>
    // Detect hard reload (not SPA navigation)
window.addEventListener("beforeunload", function (e) {
  if (performance && performance.getEntriesByType("navigation")[0]?.type === "reload") {
    // Send DELETE to server to clear cache for this path
    fetch("/__sterad_capture", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname + window.location.search }),
      credentials: "same-origin",
    });
  }
});
    </script>\n</body>`
  );
} catch (error: any) {
  console.error(
    `Sterad Error: Failed to load SPA shell (index.html) from ${spa_dist}. Error: ${error.message}`
  );
  process.exit(1);
}
const serverRootSelectors = [
  'id="root"',
  'id="app"',
  'id="__next"',
  'data-wrapper="app"',
  'role="main"',
];
function findSpaRootElementRegex(htmlContent: string): RegExp | null {
  // Try specific ID/data-attribute selectors first
  for (const selector of serverRootSelectors) {
    const regex = new RegExp(
      `<(\\w+)[^>]*?${selector}[^>]*?>[\\s\\S]*?<\\/\\1>`,
      "i"
    );
    if (regex.test(htmlContent)) {
      return regex;
    }
  }
  console.warn(
    "Sterad: No specific SPA root element found (e.g., #root, #app). Falling back to <body> replacement."
  );
  return /<body[^>]*?>[\s\S]*?<\/body>/i;
}

// Fast path for static assets
const isStaticAsset = (path: string) => {
  // Fast check: if no dot or has query params, not a static file
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1 || path.includes("?")) return false;

  // Fast check: if the dot is in the last path segment and not too far from the end
  const lastSlash = path.lastIndexOf("/");
  const path_difference = path.length - lastDot;
  return lastDot > lastSlash && path_difference < 6 && path_difference > 1; // assumes extensions are 1-5 chars
};

// --- Bun HTTP Server ---
Bun.serve({
  port: port,

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Handle GET Requests
    if (method === "GET") {
      const path = decodeURI(pathname);
      // 1. Try to serve from memory cache
      if (memoryCache.has(path)) {
        const file = memoryCache.get(path)!;
        return new Response(file, {
          headers: { "Content-Type": file.type },
        });
      }

      // 2. Try to serve static assets first
      if (isStaticAsset(path)) {
        try {
          const file = Bun.file(join(spa_dist, path));
          if (await file.exists()) {
            addToMemoryCache(path, file);
          }
          return new Response(file, {
            headers: { "Content-Type": file.type },
          });
        } catch (error) {
          console.error(
            `Sterad: Failed to serve static asset ${path}: ${error.message}`
          );
          return new Response("Not Found", { status: 404 });
        }
      }

      const isCacheableRoute = shouldCachePath(path);
      // 3. Try to serve from disk cache
      const diskFile = Bun.file(getDiskCacheFilePath(path));
      if (isCacheableRoute && (await diskFile.exists())) {
        try {
          addToMemoryCache(path, diskFile);
          return new Response(diskFile, {
            headers: { "Content-Type": diskFile.type },
          });
        } catch (error) {
          console.error(
            `Sterad: Failed to serve from disk cache for ${path}: ${error.message}`
          );
        }
      }

      if (!isCacheableRoute) {
        return new Response(spaShellHtml, {
          headers: { "Content-Type": "text/html" },
        });
      }
      // 4. Serve the SPA shell as fallback
      return new Response(spaHtmlWithInjectScript, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Handle POST /__sterad_capture
    if (method === "POST" && request.url.endsWith("/__sterad_capture")) {
      try {
        const { title, content, path } = await request.json();
        if (
          typeof title !== "string" ||
          !content ||
          typeof content !== "string"
        ) {
          console.error(
            "Sterad Capture Error: Missing path or content in payload.",
            {
              content,
              title,
            }
          );
          return new Response("Content captured and cached successfully");
        }

        if (!isSafeMainContent(content)) {
          console.error(
            `Sterad Security Violation: Rejected unsafe content for path: ${path}  ${content}`
          );
          // avoid letting client know if the content was rejected
          return new Response("Content captured and cached successfully");
        }
        // ? extra sanitization
        const sanitizedMainContent = sanitizeHtml(content);

        let finalHtml = spaShellHtml;
        // Inject sanitized content into the #root div
        // Dynamically find the correct root element regex based on the loaded SPA shell
        const rootElementRegex = findSpaRootElementRegex(finalHtml);

        if (rootElementRegex) {
          // Replace the content within the identified root element
          // We use a replacer function to preserve the opening and closing tags
          finalHtml = finalHtml.replace(rootElementRegex, (match, tagName) => {
            // Reconstruct the opening tag to ensure all original attributes are kept
            const openingTagMatch = match.match(
              new RegExp(`<${tagName}[^>]*?>`, "i")
            );
            const openingTag = openingTagMatch
              ? openingTagMatch[0]
              : `<${tagName}>`; // Fallback if regex fails to capture full opening tag (unlikely with current regex)
            return `${openingTag}${sanitizedMainContent}</${tagName}>`;
          });
          // Update title if provided
          if (title && typeof title === "string") {
            finalHtml = finalHtml.replace(
              /<title>.*?<\/title>/i,
              `<title>${title}</title>`
            );
          }

          const diskFile = getDiskCacheFilePath(decodeURI(path));
          const dirForFile = dirname(diskFile);
          if (!existsSync(dirForFile)) {
            mkdirSync(dirForFile, { recursive: true });
          }
          await Bun.write(diskFile, finalHtml);
        }

        return new Response("Content captured and cached successfully");
      } catch (error: any) {
        console.error(
          `Sterad Server Error: Failed to process capture request: ${error.message}`
        );
        return new Response("Content captured and cached successfully");
      }
    }

    if (method === "DELETE" && request.url.endsWith("/__sterad_capture")) {
      console.log("Sterad: Received DELETE request");
      try {
        const { path } = await request.json();
        if (!path || typeof path !== "string") {
          return new Response("Content captured and cached successfully");
        }
        // Remove from memory cache
        memoryCache.delete(path);
        // Remove from disk cache
        const diskFile = Bun.file(getDiskCacheFilePath(decodeURI(path)));
        if (await diskFile.exists()) {
          await diskFile.delete();
        }
        return new Response("Content captured and cached successfully");
      } catch {
        return new Response("Content captured and cached successfully");
      }
    }
    return new Response("Content captured and cached successfully");
  },

  error(error: Error): Response {
    console.error("Sterad Server Runtime Error:", error);
    return new Response("Content captured and cached successfully");
  },
});
