# Sterad

<p align="center">
  <a href="https://github.com/codedynasty-dev/sterad">
    <img src="https://raw.githubusercontent.com/CodeDynasty-dev/sterad/main/sterad.png" alt="Sterad Logo" width="200" height="200">
  </a>
</p>

<p align="center">
  <strong>SEO-Enabled SPA Server</strong>
</p>

<p align="center">
  Transform your Single Page Application into an SEO-friendly, fast-loading website without changing your development workflow.
</p>

## Features

- **SEO Optimization**: Serve fully-rendered HTML to crawlers
- **Progressive Caching**: Builds cache organically as users visit pages
- **Hybrid Caching**: Memory + disk cache with LRU eviction
- **Zero Framework Lock-in**: Works with React, Vue, Angular, and other SPAs
- **Minimal Configuration**: Simple TOML-based setup
- **Lightweight**: <2KB client script with no dependencies
- **Security Focused**: HTML sanitization and bot detection

## Why Sterad?

Sterad solves the fundamental SEO problem of Single Page Applications by serving pre-rendered HTML to search engines while maintaining the full SPA experience for users.

**Key Benefits:**

- **Zero Development Changes**: Deploy your existing SPA without modifications
- **Progressive Enhancement**: Cache builds organically as users visit pages
- **Selective Serving**: Crawlers get SEO-optimized HTML, users get interactive SPA
- **Production Ready**: Enterprise-grade security, performance, and reliability

## How It Works

Sterad operates through a simple three-step process:

1. **Initial Request**: When a crawler visits your SPA, Sterad serves the standard SPA shell with an injected capture script
2. **Content Capture**: The script waits for your SPA to render, then captures and sanitizes the DOM content
3. **Cache & Serve**: Subsequent requests for the same route receive the pre-rendered HTML directly from cache

**Architecture:**

- **Memory Cache**: Hot content served instantly from RAM
- **Disk Cache**: Persistent storage for all cached pages
- **Smart Routing**: Crawlers get cached HTML, users get interactive SPA
- **Security Layer**: Multi-stage HTML sanitization prevents XSS attacks

## Client API

On the client-side (`window.Sterad`) provides programmatic control over caching:

### Methods

#### `triggerCache()`

Manually trigger caching of the current page.

```javascript
// Trigger manual caching
window.Sterad.triggerCache()
  .then((result) => {
    console.log("Page cached successfully:", result);
  })
  .catch((error) => {
    console.error("Caching failed:", error);
  });
```

#### `getCacheInfo()`

Get detailed cache information for the current page.

```javascript
// Get cache information
window.Sterad.getCacheInfo().then((info) => {
  console.log("Cache info:", info);
  // Returns: { cached: boolean, lastCached: string|null, size?: number, path: string }
});
```

#### `isCached()`

Check if the current page is cached.

```javascript
// Check cache status
window.Sterad.isCached().then((cached) => {
  console.log("Page is cached:", cached);
});
```

#### `getLastCached()`

Get the last cached timestamp as a Date object.

```javascript
// Get last cached time
window.Sterad.getLastCached().then((date) => {
  if (date) {
    console.log("Last cached:", date.toISOString());
  } else {
    console.log("Page not cached");
  }
});
```

### Usage Examples

**Cache Status Indicator:**

```javascript
// Show cache status to users
async function showCacheStatus() {
  const cached = await window.Sterad.isCached();
  const lastCached = await window.Sterad.getLastCached();

  if (cached && lastCached) {
    console.log(`Page cached ${lastCached.toLocaleString()}`);
  } else {
    console.log("Page not cached");
  }
}
```

**Manual Cache Control:**

```javascript
// Cache important pages immediately
if (window.location.pathname === "/important-page") {
  window.Sterad.triggerCache()
    .then(() => console.log("Important page cached"))
    .catch((err) => console.error("Cache failed:", err));
}
```

**Cache Analytics:**

```javascript
// Track cache performance
window.Sterad.getCacheInfo().then((info) => {
  if (info.cached) {
    // Send analytics event
    analytics.track("page_served_from_cache", {
      path: info.path,
      cache_age: Date.now() - new Date(info.lastCached).getTime(),
    });
  }
});
```

### TypeScript Support

Full TypeScript declarations are included:

```typescript
interface SteradAPI {
  triggerCache(): Promise<any>;
  getCacheInfo(): Promise<SteradCacheInfo>;
  isCached(): Promise<boolean>;
  getLastCached(): Promise<Date | null>;
}

interface SteradCacheInfo {
  cached: boolean;
  lastCached: string | null;
  size?: number;
  path: string;
}

declare global {
  interface Window {
    Sterad: SteradAPI;
  }
}
```

## Installation

### Prerequisites

- Bun v1.0.0 or newer

### Setup Process

1. Install Sterad globally:

   ```bash
   bun add sterad
   ```

2. Create configuration file (`sterad.toml`):

   ```toml
   # Required configuration
   spa_dist = "./dist"
   port = 9081
   cache_routes = ["/*"]
   memory_cache_limit = 100

   # Optional configuration
   not_cache_routes = ["/admin/*", "/api/*"]
   serve_cached_to = "crawlers_only"  # or "all_clients"
   ```

3. Add build script to your package.json:

   ```json
   "scripts": {
     "build": "vite build",
     "start": "sterad"
   }
   ```

4. Start the server:
   ```bash
   bun run start
   ```

## Configuration

Sterad uses a TOML configuration file with the following options:

| Key                    | Required | Default                | Description                                                   |
| ---------------------- | -------- | ---------------------- | ------------------------------------------------------------- |
| **spa_dist**           | Yes      | -                      | Path to SPA build directory                                   |
| **port**               | Yes      | -                      | Server port                                                   |
| **cache_routes**       | Yes      | -                      | Route patterns to cache (supports wildcards)                  |
| **memory_cache_limit** | Yes      | -                      | Maximum in-memory cache entries                               |
| **not_cache_routes**   | No       | []                     | Routes to exclude from caching                                |
| **serve_cached_to**    | No       | "crawlers_only"        | Who receives cached content: "crawlers_only" or "all_clients" |
| **max_content_length** | No       | 1048576 (1MB)          | Maximum HTML content length in bytes                          |
| **max_title_length**   | No       | 200                    | Maximum title length in characters                            |
| **max_tag_ratio**      | No       | 0.7 (70%)              | Maximum ratio of HTML tags to content                         |
| **allowed_tags**       | No       | [whitelist]            | Array of allowed HTML tags for security                       |
| **intercept_script**   | No       | -                      | Path to script for HTML transformation before caching         |
| **cache_dir**          | No       | spa_dist/.sterad_cache | Custom cache directory                                        |
| **sanitization_level** | No       | "strict"               | HTML sanitization level                                       |

### Environment Variables

| Variable         | Required | Default        | Description                                        |
| ---------------- | -------- | -------------- | -------------------------------------------------- |
| **JWT_SECRET**   | No       | -              | JWT signing secret for admin routes (min 32 chars) |
| **JWT_ISSUER**   | No       | "sterad"       | JWT token issuer                                   |
| **JWT_AUDIENCE** | No       | "sterad-admin" | JWT token audience                                 |

### Route Pattern Examples

```toml
# Cache all routes
cache_routes = ["/*"]

# Cache only product pages
cache_routes = ["/products/*", "/categories/*"]

# Exclude admin routes
not_cache_routes = ["/admin/*", "/dashboard"]
```

### Cache Serving Modes

The `serve_cached_to` option controls who receives cached content:

**Crawlers Only Mode (Default)**:

```toml
serve_cached_to = "crawlers_only"
```

- Search engines and bots get cached HTML for SEO
- Regular users get the full SPA experience
- Best for maintaining SPA interactivity while optimizing SEO

**All Clients Mode**:

```toml
serve_cached_to = "all_clients"
```

- Both crawlers and regular users get cached HTML
- Faster initial page loads for all visitors
- May reduce SPA interactivity on cached pages

**Detected Bot User Agents**:

- Google Bot, Bing Bot, Yahoo Slurp
- Facebook, Twitter, LinkedIn crawlers
- SEO tools (Ahrefs, SEMrush, etc.)
- Generic patterns: bot, crawler, spider, curl, wget

### HTML Intercept Scripts

Sterad supports custom HTML transformation scripts that run before content is cached:

```toml
# Enable HTML transformation
intercept_script = "./scripts/transform-html.js"
```

**How it works**:

1. After HTML sanitization, Sterad executes your intercept script
2. The script receives JSON data via stdin with the HTML and context
3. Your script can transform the HTML and output the result to stdout
4. The transformed HTML is then cached to disk

**Input Format**:

```json
{
  "html": "string", // Complete HTML to be cached
  "context": {
    "path": "string", // URL path being cached
    "title": "string", // Page title
    "content": "string", // Sanitized main content
    "originalHtml": "string", // Original SPA shell HTML
    "timestamp": "number" // Unix timestamp
  }
}
```

**Example Use Cases**:

- Add SEO meta tags dynamically
- Inject structured data (JSON-LD)
- Add performance optimization hints
- Minify HTML output
- Add analytics or tracking codes
- Transform content for specific routes

**Security Features**:

- Script path validation (must be within project directory)
- 5-second execution timeout
- Output size validation
- Graceful fallback on script failure

See `scripts/example-intercept.js` for a complete example.

### Admin Authentication

Protected admin routes require JWT authentication:

```bash
# Set JWT secret (required, min 32 chars)
export JWT_SECRET="your-super-secure-jwt-secret-key-here"

# Generate admin token
bun run scripts/generate-jwt-token.js

# Clear cache
curl -X DELETE "http://localhost:9081/__sterad_capture" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "/page-to-clear"}'
```

## Security

Sterad implements well researched security measures:

- **Multi-Layer Sanitization**: Client and server-side HTML sanitization
- **Path Traversal Protection**: Secure file system access controls
- **ReDoS Mitigation**: Regex timeout protection against denial-of-service attacks
- **JWT Authentication**: Secure admin route access with configurable tokens
- **Content Validation**: Comprehensive HTML structure and content validation
- **Bot Detection**: Advanced user-agent analysis with caching optimization

## Performance

Sterad delivers enterprise-grade performance through:

- **LRU Memory Cache**: Instant serving of frequently accessed content
- **Persistent Disk Cache**: Reliable storage with fast retrieval
- **Optimized Bot Detection**: Cached user-agent analysis reduces CPU overhead
- **Smart Static Asset Handling**: Pre-compiled extension matching for faster routing
- **Intelligent Cache Headers**: Browser-optimized caching strategies

## Deployment

### Docker Deployment

```dockerfile
FROM oven/bun:1.0

WORKDIR /app
COPY . .
RUN bun install

CMD ["bun", "run", "start"]
```

Build and run:

```bash
docker build -t sterad-app .
docker run -p 9081:9081 sterad-app
```

## Considerations

- **Progressive Cache Building**: Cache populates as real users visit pages
- **Dynamic Content**: Best suited for content that doesn't change frequently
- **Framework Requirements**: Requires standard SPA root elements (`#root`, `#app`, etc.)

## Troubleshooting

### Common Issues

**Cache not updating:**

1. Check hard reload handling

**Content not captured:**

1. Verify root element matches these selectors:
   ```js
   const selectors = [
     '[data-wrapper="app"]',
     "#root",
     "#app",
     "#__next",
     '[role="main"]',
   ];
   ```
2. Check for CSP conflicts

**Performance options:**

1. Adjust memory cache size:
   ```toml
   memory_cache_limit = 200
   ```
2. Exclude static assets:
   ```toml
   not_cache_routes = ["/static/*"]
   ```

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feat/awesome-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m "feat: implement awesome feature"
   ```
4. Push to your branch:
   ```bash
   git push origin feat/awesome-feature
   ```
5. Open a pull request

### Development Setup

```bash
# Clone repository
git clone https://github.com/your/sterad.git

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun run test

# Build with tests
bun bundle.ts

# Skip tests during build
SKIP_TESTS=true bun bundle.ts
```

## Testing

**149 comprehensive tests** ensure production-ready security and reliability:

```bash
# Run all tests (6 test suites)
npm test

# Build with integrated testing
bun bundle.ts

# Skip tests during build
SKIP_TESTS=true bun bundle.ts
```

**Security Coverage:**

- ✅ Bot Detection & User Agent Parsing
- ✅ JWT Authentication & Authorization
- ✅ Path Traversal Protection
- ✅ ReDoS Mitigation & Regex Safety
- ✅ Trust Boundary Validation
- ✅ Intercept Script Security

**Build Integration:** Tests run automatically before every build, preventing deployment of broken code. CI/CD pipeline includes multi-version testing and security audits.

For support, contact hello@codedynasty.dev.

## Support

For information, visit [Codedynasty](https://codedynasty.dev) or email hello@codedynasty.dev.

---

**Codedynasty** © 2022-present, Codedynasty Contributors.
