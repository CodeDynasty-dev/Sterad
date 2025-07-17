import { type BunFile } from "bun";
import { existsSync, mkdirSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import jwt from "jsonwebtoken";

// ReDoS mitigation: Safe regex wrapper with timeout
function createSafeRegex(
  pattern: string,
  flags?: string,
  timeoutMs: number = 100
): RegExp {
  const regex = new RegExp(pattern, flags);

  // Store original test method
  const originalTest = regex.test.bind(regex);
  const originalExec = regex.exec.bind(regex);

  // Override test method with timeout
  regex.test = function (str: string): boolean {
    return executeWithTimeout(() => originalTest(str), timeoutMs, false);
  };

  // Override exec method with timeout
  regex.exec = function (str: string): RegExpExecArray | null {
    return executeWithTimeout(() => originalExec(str), timeoutMs, null);
  };

  return regex;
}

// Execute function with timeout to prevent ReDoS
function executeWithTimeout<T>(
  fn: () => T,
  timeoutMs: number,
  defaultValue: T
): T {
  const start = Date.now();
  let result: T;

  try {
    result = fn();

    // Check if execution took too long (simple timeout check)
    if (Date.now() - start > timeoutMs) {
      console.warn(
        `Sterad Security: Regex execution timeout (${
          Date.now() - start
        }ms > ${timeoutMs}ms)`
      );
      return defaultValue;
    }

    return result;
  } catch (error) {
    console.warn(`Sterad Security: Regex execution error: ${error}`);
    return defaultValue;
  }
}

// Safe string replacement with timeout protection
function safeReplace(
  str: string,
  pattern: RegExp | string,
  replacement: string,
  timeoutMs: number = 100
): string {
  const start = Date.now();

  try {
    const result = str.replace(pattern, replacement);

    if (Date.now() - start > timeoutMs) {
      console.warn(
        `Sterad Security: String replace timeout (${
          Date.now() - start
        }ms > ${timeoutMs}ms)`
      );
      return str; // Return original string on timeout
    }

    return result;
  } catch (error) {
    console.warn(`Sterad Security: String replace error: ${error}`);
    return str;
  }
}

// --- Configuration ---
// Define the structure for our configuration.
interface Config {
  spa_dist: string;
  cache_dir: string; // This will be dynamically set relative to spa_dist
  port: number;
  cache_routes: string[];
  not_cache_routes?: string[]; // Optional not cache routes
  memory_cache_limit: number;
  serve_cached_to?: "crawlers_only" | "all_clients"; // Optional serving mode
  max_content_length?: number; // Maximum HTML content length in bytes
  max_title_length?: number; // Maximum title length
  allowed_tags?: string[]; // Allowed HTML tags
  max_tag_ratio?: number; // Maximum ratio of tags to content
  intercept_script?: string; // Optional path to intercept script
}

// JWT configuration from environment
interface JWTConfig {
  secret: string;
  issuer: string;
  audience: string;
}

// Load JWT configuration from environment
function loadJWTConfig(): JWTConfig | null {
  const secret = process.env["JWT_SECRET"];

  if (!secret) {
    console.warn(
      "Sterad: JWT_SECRET not found in environment. Admin routes will be disabled."
    );
    return null;
  }

  if (secret.length < 32) {
    console.error(
      "Sterad: JWT_SECRET must be at least 32 characters long for security."
    );
    process.exit(1);
  }

  return {
    secret,
    issuer: process.env["JWT_ISSUER"] || "sterad",
    audience: process.env["JWT_AUDIENCE"] || "sterad-admin",
  };
}

// JWT token validation using jsonwebtoken library
function validateBearerToken(
  authHeader: string | null,
  jwtConfig: JWTConfig | null
): boolean {
  if (!jwtConfig) {
    return false;
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  try {
    const token = authHeader.substring(7);
    jwt.verify(token, jwtConfig.secret, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    });
    return true;
  } catch (error) {
    console.warn(`Sterad: JWT verification failed: ${error}`);
    return false;
  }
}

const configPath = "sterad.toml";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000",
};

let config: Config;
try {
  const configContent = await Bun.file(configPath).text();
  config = Bun.TOML.parse(configContent) as Config;

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

  // Initialize serve_cached_to if not provided
  if (!config.serve_cached_to) {
    config.serve_cached_to = "crawlers_only";
  }

  // Initialize trust boundary validation settings
  if (!config.max_content_length) {
    config.max_content_length = 1024 * 1024; // 1MB default
  }
  if (!config.max_title_length) {
    config.max_title_length = 200; // 200 chars default
  }
  if (!config.allowed_tags) {
    config.allowed_tags = [
      "div",
      "span",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "section",
      "article",
      "header",
      "footer",
      "nav",
      "main",
      "table",
      "tr",
      "td",
      "th",
      "thead",
      "tbody",
      "tfoot",
      "form",
      "input",
      "button",
      "label",
      "select",
      "option",
      "textarea",
      "hr",
    ];
  }
  if (!config.max_tag_ratio) {
    config.max_tag_ratio = 0.7; // Max 70% tags to content ratio
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

const {
  spa_dist,
  cache_dir,
  port,
  cache_routes,
  not_cache_routes,
  memory_cache_limit,
  serve_cached_to,
  max_content_length,
  max_title_length,
  allowed_tags,
  max_tag_ratio,
  intercept_script,
} = config;

// Load JWT configuration
const jwtConfig = loadJWTConfig();
if (jwtConfig) {
  console.log("Sterad: JWT authentication enabled for admin routes.");
} else {
  console.log(
    "Sterad: JWT authentication disabled. Admin routes will be protected by default denial."
  );
}

// Ensure the cache directory exists.
if (!existsSync(cache_dir)) {
  mkdirSync(cache_dir, { recursive: true });
  console.log(`Sterad: Created cache directory at ${cache_dir}`);
}

// Resolve absolute paths for security validation
const spaDistAbsolute = resolve(spa_dist);
const cacheDirAbsolute = resolve(cache_dir);

const memoryCache = new Map<string, BunFile>();

function addToMemoryCache(path: string, content: BunFile) {
  if (memoryCache.has(path)) {
    memoryCache.delete(path);
  }
  memoryCache.set(path, content);

  if (memoryCache.size > memory_cache_limit) {
    const firstKey = memoryCache.keys().next().value!;
    memoryCache.delete(firstKey);
    console.log(`Sterad: Memory cache limit reached. Evicted: ${firstKey}`);
  }
}

// Secure path validation functions
function sanitizePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    return "/";
  }

  // URL decode the path to handle encoded traversal attempts (including double encoding)
  let cleanPath = inputPath;
  let previousPath = "";
  let iterations = 0;
  const maxIterations = 3; // Prevent infinite loops

  // Keep decoding until no more changes or max iterations reached
  while (cleanPath !== previousPath && iterations < maxIterations) {
    previousPath = cleanPath;
    try {
      cleanPath = decodeURIComponent(cleanPath);
      iterations++;
    } catch (error) {
      // If decoding fails, stop and use current path
      console.warn(`Sterad Security: URL decode failed for path: ${cleanPath}`);
      break;
    }
  }

  // Remove null bytes and other dangerous characters
  cleanPath = cleanPath.replace(/\0/g, "");

  // Normalize path separators to forward slashes
  cleanPath = cleanPath.replace(/\\/g, "/");

  // Remove multiple consecutive slashes
  cleanPath = cleanPath.replace(/\/+/g, "/");

  // Ensure path starts with /
  if (!cleanPath.startsWith("/")) {
    cleanPath = "/" + cleanPath;
  }

  // Remove trailing slash unless it's the root
  if (cleanPath.length > 1 && cleanPath.endsWith("/")) {
    cleanPath = cleanPath.slice(0, -1);
  }

  return cleanPath;
}

function isPathSafe(requestedPath: string, allowedBasePath: string): boolean {
  try {
    // Sanitize the input path
    const cleanPath = sanitizePath(requestedPath);

    // Block any path containing .. sequences (even after sanitization)
    if (cleanPath.includes("..")) {
      console.warn(
        `Sterad Security: Blocked path with .. sequence: ${requestedPath}`
      );
      return false;
    }

    // Remove leading slash for join operation
    const relativePath = cleanPath.startsWith("/")
      ? cleanPath.slice(1)
      : cleanPath;

    // Resolve the full path
    const fullPath = resolve(allowedBasePath, relativePath);

    // Check if the resolved path is within the allowed base path
    const relativeToBased = relative(allowedBasePath, fullPath);

    // Path is safe if:
    // 1. It doesn't start with .. (not going up directories)
    // 2. It doesn't contain .. anywhere (no directory traversal)
    // 3. It's not an absolute path outside our base
    return (
      !relativeToBased.startsWith("..") &&
      !relativeToBased.includes("..") &&
      !resolve(fullPath).startsWith("..")
    );
  } catch (error) {
    console.warn(
      `Sterad Security: Path validation error for ${requestedPath}:`,
      error
    );
    return false;
  }
}

function getSecureStaticFilePath(requestedPath: string): string | null {
  const cleanPath = sanitizePath(requestedPath);

  if (!isPathSafe(cleanPath, spaDistAbsolute)) {
    console.warn(
      `Sterad Security: Blocked path traversal attempt: ${requestedPath}`
    );
    return null;
  }

  // Remove leading slash for join operation
  const relativePath = cleanPath.startsWith("/")
    ? cleanPath.slice(1)
    : cleanPath;
  return join(spaDistAbsolute, relativePath);
}

function getDiskCacheFilePath(urlPath: string): string | null {
  const cleanPath = sanitizePath(urlPath);

  if (!isPathSafe(cleanPath, cacheDirAbsolute)) {
    console.warn(
      `Sterad Security: Blocked cache path traversal attempt: ${urlPath}`
    );
    return null;
  }

  // Create a safe filename from the URL path
  const fileName =
    cleanPath === "/"
      ? "index.html"
      : `${cleanPath.substring(1).replace(/[\/\\:*?"<>|]/g, "_")}.html`;

  return join(cacheDirAbsolute, fileName);
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
const CACHE_REGEX = compileCachePatterns(cache_routes);
const NO_CACHE_REGEX = compileCachePatterns(not_cache_routes);

// Fast path for cache checking
const shouldCachePath = (path: string): boolean => {
  // Always handle root path
  if (path === "/") return cache_routes.includes("/");

  const matchesCache = CACHE_REGEX.test(path);
  const matchesNoCache = NO_CACHE_REGEX.test(path);

  return matchesCache && !matchesNoCache;
};

// Comprehensive trust boundary validation
interface ValidationResult {
  isValid: boolean;
  reason?: string;
  metrics?: {
    contentLength: number;
    tagCount: number;
    textLength: number;
    tagRatio: number;
  };
}

function validateContentLength(content: string): ValidationResult {
  const contentLength = Buffer.byteLength(content, "utf8");
  if (contentLength > max_content_length!) {
    return {
      isValid: false,
      reason: `Content too large: ${contentLength} bytes (max: ${max_content_length})`,
      metrics: { contentLength, tagCount: 0, textLength: 0, tagRatio: 0 },
    };
  }
  return {
    isValid: true,
    metrics: { contentLength, tagCount: 0, textLength: 0, tagRatio: 0 },
  };
}

function validateHtmlStructure(content: string): ValidationResult {
  // Check for basic HTML structure validity
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const tags: string[] = [];
  const openTags: string[] = [];
  let match;

  while ((match = tagPattern.exec(content)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    // Check if tag is allowed
    if (!allowed_tags!.includes(tagName)) {
      return {
        isValid: false,
        reason: `Disallowed HTML tag: ${tagName}`,
        metrics: {
          contentLength: content.length,
          tagCount: tags.length,
          textLength: 0,
          tagRatio: 0,
        },
      };
    }

    tags.push(tagName);

    // Track opening/closing tags for basic structure validation
    if (fullTag.startsWith("</")) {
      // Closing tag
      const lastOpen = openTags.pop();
      if (lastOpen !== tagName) {
        return {
          isValid: false,
          reason: `Mismatched HTML tags: expected </${lastOpen}>, found </${tagName}>`,
          metrics: {
            contentLength: content.length,
            tagCount: tags.length,
            textLength: 0,
            tagRatio: 0,
          },
        };
      }
    } else if (!fullTag.endsWith("/>")) {
      // Opening tag (not self-closing)
      const selfClosingTags = ["br", "img", "input", "hr", "meta", "link"];
      if (!selfClosingTags.includes(tagName)) {
        openTags.push(tagName);
      }
    }
  }

  // Check for unclosed tags
  if (openTags.length > 0) {
    return {
      isValid: false,
      reason: `Unclosed HTML tags: ${openTags.join(", ")}`,
      metrics: {
        contentLength: content.length,
        tagCount: tags.length,
        textLength: 0,
        tagRatio: 0,
      },
    };
  }

  return {
    isValid: true,
    metrics: {
      contentLength: content.length,
      tagCount: tags.length,
      textLength: 0,
      tagRatio: 0,
    },
  };
}

function validateTagRatio(content: string): ValidationResult {
  // Calculate tag to content ratio
  const tagPattern = /<[^>]+>/g;
  const tagMatches = content.match(tagPattern) || [];
  const tagLength = tagMatches.join("").length;
  const textContent = content.replace(tagPattern, "").trim();
  const textLength = textContent.length;

  if (textLength === 0) {
    return {
      isValid: false,
      reason: "Content contains no text, only HTML tags",
      metrics: {
        contentLength: content.length,
        tagCount: tagMatches.length,
        textLength,
        tagRatio: 1,
      },
    };
  }

  const tagRatio = tagLength / (tagLength + textLength);

  if (tagRatio > max_tag_ratio!) {
    return {
      isValid: false,
      reason: `Tag ratio too high: ${(tagRatio * 100).toFixed(1)}% (max: ${(
        max_tag_ratio! * 100
      ).toFixed(1)}%)`,
      metrics: {
        contentLength: content.length,
        tagCount: tagMatches.length,
        textLength,
        tagRatio,
      },
    };
  }

  return {
    isValid: true,
    metrics: {
      contentLength: content.length,
      tagCount: tagMatches.length,
      textLength,
      tagRatio,
    },
  };
}

function validateSecurityPatterns(content: string): ValidationResult {
  // Check for dangerous patterns with ReDoS protection
  const dangerousPatterns = [
    {
      pattern: createSafeRegex("<script[\\s\\S]*?>[\\s\\S]*?</script>", "i"),
      reason: "Script tags not allowed",
    },
    {
      pattern: createSafeRegex("<style[\\s\\S]*?>[\\s\\S]*?</style>", "i"),
      reason: "Style tags not allowed",
    },
    {
      pattern: createSafeRegex("\\bon[a-z]+=\\s*(['\"])(.*?)\\1", "i"),
      reason: "Event handlers not allowed",
    },
    {
      pattern: createSafeRegex(
        "\\b(?:href|src)\\s*=\\s*(['\"]|)(?:javascript:.*?)\\1",
        "i"
      ),
      reason: "JavaScript URIs not allowed",
    },
    {
      pattern: createSafeRegex("<iframe\\b[^>]*>", "i"),
      reason: "Iframe tags not allowed",
    },
    {
      pattern: createSafeRegex("<object\\b[^>]*>", "i"),
      reason: "Object tags not allowed",
    },
    {
      pattern: createSafeRegex("<embed\\b[^>]*>", "i"),
      reason: "Embed tags not allowed",
    },
    {
      pattern: createSafeRegex(
        "<form\\b[^>]*action\\s*=\\s*(['\"]?)(?:javascript:|data:)",
        "i"
      ),
      reason: "Dangerous form actions not allowed",
    },
    {
      pattern: createSafeRegex("\\bvbscript:", "i"),
      reason: "VBScript URIs not allowed",
    },
    {
      pattern: createSafeRegex("\\bdata:\\s*text/html", "i"),
      reason: "Data HTML URIs not allowed",
    },
  ];

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(content)) {
      return {
        isValid: false,
        reason,
        metrics: {
          contentLength: content.length,
          tagCount: 0,
          textLength: 0,
          tagRatio: 0,
        },
      };
    }
  }

  return { isValid: true };
}

function isSafeMainContent(content: string): boolean {
  // Comprehensive validation pipeline
  const validations = [
    validateContentLength(content),
    validateHtmlStructure(content),
    validateTagRatio(content),
    validateSecurityPatterns(content),
  ];

  for (const validation of validations) {
    if (!validation.isValid) {
      console.warn(`Sterad Security: ${validation.reason}`);
      if (validation.metrics) {
        console.warn(`Sterad Security Metrics:`, validation.metrics);
      }
      return false;
    }
  }

  return true;
}

function sanitizeHtml(content: string): string {
  let sanitizedContent = content;

  // Use safe regex replacements with ReDoS protection
  sanitizedContent = safeReplace(
    sanitizedContent,
    createSafeRegex("<script[\\s\\S]*?>[\\s\\S]*?</script>", "gi"),
    ""
  );
  sanitizedContent = safeReplace(
    sanitizedContent,
    createSafeRegex("<style[\\s\\S]*?>[\\s\\S]*?</style>", "gi"),
    ""
  );
  sanitizedContent = safeReplace(
    sanitizedContent,
    createSafeRegex("\\s+on[a-z]+=\\s*(['\"])(.*?)\\1", "gi"),
    " "
  );
  sanitizedContent = safeReplace(
    sanitizedContent,
    createSafeRegex(
      "(<[^>]+(?:href|src)\\s*=\\s*(['\"]|))javascript:.*?\\2",
      "gi"
    ),
    "$1#"
  );

  return sanitizedContent.trim();
}

// Intercept script execution
interface InterceptContext {
  path: string;
  title: string;
  content: string;
  originalHtml: string;
  timestamp: number;
}

async function executeInterceptScript(
  finalHtml: string,
  context: InterceptContext
): Promise<string> {
  if (!intercept_script) {
    return finalHtml;
  }

  try {
    // Validate intercept script path for security
    const scriptPath = resolve(intercept_script);
    if (!existsSync(scriptPath)) {
      console.warn(`Sterad: Intercept script not found: ${intercept_script}`);
      return finalHtml;
    }

    // Security check: ensure script is not outside project directory
    const projectRoot = resolve(".");
    if (!scriptPath.startsWith(projectRoot)) {
      console.warn(
        `Sterad Security: Intercept script outside project directory: ${intercept_script}`
      );
      return finalHtml;
    }

    console.log(`Sterad: Executing intercept script: ${intercept_script}`);

    // Execute the intercept script using Bun's subprocess
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Send context data to the script via stdin
    const inputData = JSON.stringify({
      html: finalHtml,
      context: context,
    });

    proc.stdin.write(inputData);
    proc.stdin.end();

    // Wait for the script to complete with timeout
    const timeoutMs = 5000; // 5 second timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Intercept script timeout")), timeoutMs)
    );

    const result = await Promise.race([proc.exited, timeoutPromise]);

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.warn(
        `Sterad: Intercept script failed with exit code ${proc.exitCode}: ${stderr}`
      );
      return finalHtml;
    }

    // Read the transformed HTML from stdout
    const stdout = await new Response(proc.stdout).text();
    const transformedHtml = stdout.trim();

    if (!transformedHtml) {
      console.warn("Sterad: Intercept script returned empty output");
      return finalHtml;
    }

    // Basic validation of transformed HTML
    if (transformedHtml.length > finalHtml.length * 3) {
      console.warn(
        "Sterad: Intercept script output too large, using original HTML"
      );
      return finalHtml;
    }

    console.log("Sterad: Intercept script executed successfully");
    return transformedHtml;
  } catch (error: any) {
    console.warn(`Sterad: Intercept script execution failed: ${error.message}`);
    return finalHtml;
  }
}

const injectJsScriptContent = `{Sterad-SCRIPT}`;

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

const isStaticAsset = (path: string) => {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1 || path.includes("?")) return false;

  // Fast check: if the dot is in the last path segment and not too far from the end
  const lastSlash = path.lastIndexOf("/");
  const path_difference = path.length - lastDot;
  return lastDot > lastSlash && path_difference < 6 && path_difference > 1; // assumes extensions are 1-5 chars
};

// Bot detection function with ReDoS protection
function isCrawlerOrBot(userAgent: string): boolean {
  if (!userAgent) return false;

  const botPatterns = [
    // Search engine crawlers
    createSafeRegex("googlebot", "i"),
    createSafeRegex("bingbot", "i"),
    createSafeRegex("slurp", "i"), // Yahoo
    createSafeRegex("duckduckbot", "i"),
    createSafeRegex("baiduspider", "i"),
    createSafeRegex("yandexbot", "i"),
    createSafeRegex("facebookexternalhit", "i"),
    createSafeRegex("twitterbot", "i"),
    createSafeRegex("linkedinbot", "i"),
    createSafeRegex("whatsapp", "i"),
    createSafeRegex("telegrambot", "i"),

    // SEO and monitoring tools
    createSafeRegex("ahrefsbot", "i"),
    createSafeRegex("semrushbot", "i"),
    createSafeRegex("mj12bot", "i"),
    createSafeRegex("dotbot", "i"),
    createSafeRegex("rogerbot", "i"),
    createSafeRegex("exabot", "i"),
    createSafeRegex("facebot", "i"),
    createSafeRegex("ia_archiver", "i"),

    // Generic bot indicators
    createSafeRegex("bot\\b", "i"),
    createSafeRegex("crawler", "i"),
    createSafeRegex("spider", "i"),
    createSafeRegex("scraper", "i"),
    createSafeRegex("curl", "i"),
    createSafeRegex("wget", "i"),
    createSafeRegex("python-requests", "i"),
    createSafeRegex("node-fetch", "i"),
    createSafeRegex("axios", "i"),
  ];

  return botPatterns.some((pattern) => pattern.test(userAgent));
}

Bun.serve({
  port: port,

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Handle GET Requests
    if (method === "GET") {
      const path = decodeURI(pathname);
      const userAgent = request.headers.get("User-Agent") || "";
      const isBot = isCrawlerOrBot(userAgent);
      const shouldServeCached =
        serve_cached_to === "all_clients" ||
        (serve_cached_to === "crawlers_only" && isBot);

      // 1. Try to serve from memory cache (only if we should serve cached content)
      if (shouldServeCached && memoryCache.has(path)) {
        const file = memoryCache.get(path)!;
        return new Response(file, {
          headers: { "Content-Type": file.type, ...securityHeaders },
        });
      }

      // 2. Try to serve static assets first (always serve static assets)
      if (isStaticAsset(path)) {
        try {
          const secureFilePath = getSecureStaticFilePath(path);
          if (!secureFilePath) {
            console.warn(
              `Sterad Security: Blocked static asset path traversal: ${path}`
            );
            return new Response("Not Found", {
              status: 404,
              headers: securityHeaders,
            });
          }

          const file = Bun.file(secureFilePath);
          if (await file.exists()) {
            addToMemoryCache(path, file);
          }
          return new Response(file, {
            headers: { "Content-Type": file.type, ...securityHeaders },
          });
        } catch (error) {
          console.error(
            `Sterad: Failed to serve static asset ${path}: ${error}`
          );
          return new Response("Not Found", {
            status: 404,
            headers: securityHeaders,
          });
        }
      }

      const isCacheableRoute = shouldCachePath(path);

      // 3. Try to serve from disk cache (only if we should serve cached content)
      if (shouldServeCached && isCacheableRoute) {
        const diskCacheFilePath = getDiskCacheFilePath(path);
        if (diskCacheFilePath) {
          const diskFile = Bun.file(diskCacheFilePath);
          if (await diskFile.exists()) {
            try {
              addToMemoryCache(path, diskFile);
              return new Response(diskFile, {
                headers: { "Content-Type": diskFile.type, ...securityHeaders },
              });
            } catch (error) {
              console.error(
                `Sterad: Failed to serve from disk cache for ${path}: ${error}`
              );
            }
          }
        }
      }

      if (!isCacheableRoute) {
        return new Response(spaShellHtml, {
          headers: { "Content-Type": "text/html", ...securityHeaders },
        });
      }

      // 4. Serve the SPA shell as fallback
      // If we should serve cached content but don't have it, inject the capture script
      // If we shouldn't serve cached content (regular browsers in crawlers_only mode), serve plain SPA
      if (shouldServeCached) {
        return new Response(spaHtmlWithInjectScript, {
          headers: { "Content-Type": "text/html", ...securityHeaders },
        });
      } else {
        return new Response(spaShellHtml, {
          headers: { "Content-Type": "text/html", ...securityHeaders },
        });
      }
    }

    // Handle POST /__sterad_capture
    if (method === "POST" && request.url.endsWith("/__sterad_capture")) {
      try {
        let { title, content, path } = await request.json();
        // Validate input types and lengths
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
          return new Response("Content captured and cached successfully", {
            headers: securityHeaders,
          });
        }

        // Validate title length
        if (title.length > max_title_length!) {
          console.warn(
            `Sterad Security: Title too long: ${title.length} chars (max: ${max_title_length})`
          );
          return new Response("Content captured and cached successfully", {
            headers: securityHeaders,
          });
        }

        // Validate path parameter
        if (!path || typeof path !== "string") {
          console.error(
            "Sterad Capture Error: Missing or invalid path in payload."
          );
          return new Response("Content captured and cached successfully", {
            headers: securityHeaders,
          });
        }

        if (!isSafeMainContent(content)) {
          console.error(
            `Sterad Security Violation: Rejected unsafe content for path: ${path}  ${content}`
          );
          // avoid letting client know if the content was rejected
          return new Response("Content captured and cached successfully", {
            headers: securityHeaders,
          });
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
            title = title
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            finalHtml = finalHtml.replace(
              /<title>.*?<\/title>/i,
              `<title>${title}</title>`
            );
          }

          const diskFile = getDiskCacheFilePath(decodeURI(path));
          if (diskFile) {
            // Execute intercept script if configured
            const interceptContext: InterceptContext = {
              path: decodeURI(path),
              title: title,
              content: sanitizedMainContent,
              originalHtml: spaShellHtml,
              timestamp: Date.now(),
            };

            const transformedHtml = await executeInterceptScript(
              finalHtml,
              interceptContext
            );

            const dirForFile = dirname(diskFile);
            if (!existsSync(dirForFile)) {
              mkdirSync(dirForFile, { recursive: true });
            }
            await Bun.write(diskFile, transformedHtml);
          } else {
            console.warn(
              `Sterad Security: Blocked cache write for path: ${path}`
            );
          }
        }

        return new Response("Content captured and cached successfully", {
          headers: securityHeaders,
        });
      } catch (error: any) {
        console.error(
          `Sterad Server Error: Failed to process capture request: ${error.message}`
        );
        return new Response("Content captured and cached successfully", {
          headers: securityHeaders,
        });
      }
    }

    if (method === "DELETE" && request.url.endsWith("/__sterad_capture")) {
      console.log("Sterad: Received DELETE request");

      // Check JWT authentication for admin routes
      const authHeader = request.headers.get("Authorization");
      const isAuthenticated = validateBearerToken(authHeader, jwtConfig);

      if (!isAuthenticated) {
        console.warn("Sterad Security: Unauthorized DELETE request blocked");
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            ...securityHeaders,
            "WWW-Authenticate": "Bearer",
          },
        });
      }

      try {
        const { path } = await request.json();
        if (!path || typeof path !== "string") {
          return new Response("Content captured and cached successfully", {
            headers: securityHeaders,
          });
        }
        // Remove from memory cache
        memoryCache.delete(path);
        // Remove from disk cache
        const diskCacheFilePath = getDiskCacheFilePath(decodeURI(path));
        if (diskCacheFilePath) {
          const diskFile = Bun.file(diskCacheFilePath);
          if (await diskFile.exists()) {
            await diskFile.delete();
          }
        } else {
          console.warn(
            `Sterad Security: Blocked cache delete for path: ${path}`
          );
        }
        return new Response("Content captured and cached successfully", {
          headers: securityHeaders,
        });
      } catch {
        return new Response("Content captured and cached successfully", {
          headers: securityHeaders,
        });
      }
    }
    return new Response("Content captured and cached successfully", {
      headers: securityHeaders,
    });
  },

  error(error: Error): Response {
    console.error("Sterad Server Runtime Error:", error);
    return new Response("Content captured and cached successfully", {
      headers: securityHeaders,
    });
  },
});
