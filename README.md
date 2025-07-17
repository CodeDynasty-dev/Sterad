<br/>
<p align="center">
  <a href="https://github.com/codedynasty-dev/sterad">
    <img src="https://raw.githubusercontent.com/CodeDynasty-dev/sterad/main/sterad.png" alt="Logo" width="280" height="280">
  </a>
</p>

**Sterad** - "_Host your SPAs with SSR experience, no extra work, gain SEO and Fast Content delivery._"

Sterad is an innovative server solution that brings SEO-friendly server-side rendering capabilities to single-page applications without requiring complex SSR infrastructure. By implementing a unique client-server caching mechanism, Sterad captures rendered SPA content and serves it as static HTML to search engines and subsequent visitors.

## 🌟 Features

- **SEO Optimization**: Serve fully-rendered HTML to crawlers
- **Progressive Caching**: Builds cache organically as users visit pages
- **Hybrid Caching**: Memory + disk cache with LRU eviction
- **Zero Framework Lock-in**: Works with React, Vue, Angular, and other SPAs
- **Minimal Configuration**: Simple TOML-based setup
- **Lightweight**: <5KB client script with no dependencies
- **Security Focused**: HTML sanitization and bot detection

## 🚀 Why Sterad?

Traditional SPAs face critical SEO challenges due to their client-rendered nature. While solutions exist, they come with tradeoffs:

| Solution                   | Pros                          | Cons                                  |
| -------------------------- | ----------------------------- | ------------------------------------- |
| **Static Site Generation** | Fast, SEO-friendly            | Requires rebuilds for content changes |
| **Server-Side Rendering**  | Dynamic, SEO-friendly         | Complex setup, high server load       |
| **Client-Side Rendering**  | Simple, dynamic               | Poor SEO, slow initial load           |
| **Sterad**                 | Dynamic, SEO-friendly, simple | Requires user traffic to build cache  |

Sterad bridges the gap by providing near-SSR quality for search engines while maintaining the development simplicity of pure client-side SPAs.

## ⚙️ How It Works

### Architecture Overview

```mermaid
sequenceDiagram
    participant Client as User/Bot Browser
    participant Sterad as Sterad Server
    participant Cache as Sterad Cache (Memory & Disk)
    participant SPA as SPA Dist Files

    Client->>Sterad: 1. Requests Resource (GET /path)

    Sterad->>Cache: 2. Check Memory Cache
    alt Cache Hit
        Cache-->>Sterad: 3a. Return Cached Content
        Sterad-->>Client: 4a. Serve Cached Content
    else Cache Miss
        Sterad->>Sterad: 3b. Is it a Static Asset?
        alt Yes, Static Asset
            Sterad->>SPA: 4b. Read Static File
            alt File Exists
                SPA-->>Sterad: 5b. Static Content
                Sterad->>Cache: 6b. Add to Memory Cache
                Sterad-->>Client: 7b. Serve Static Content
            else File Not Found
                Sterad-->>Client: 5c. 404 Not Found
            end
        else No, Not Static Asset
            Sterad->>Sterad: 4c. Should Path Be Cached?
            alt Yes, Cacheable
                Sterad->>Cache: 5c. Check Disk Cache
                alt Disk Cache Hit
                    Cache-->>Sterad: 6c. Return Cached HTML
                    Sterad->>Cache: 7c. Add to Memory Cache
                    Sterad-->>Client: 8c. Serve Cached HTML
                else Disk Cache Miss
                    Sterad-->>Client: 6d. Serve SPA Shell + Inject Script
                    Client->>Sterad: 7d. POST Rendered HTML to /__sterad_capture
                    Sterad->>Sterad: 8d. Sanitize HTML
                    Sterad->>Cache: 9d. Write to Disk Cache
                    Sterad-->>Client: 10d. Confirmation
                end
            else No, Not Cacheable
                Sterad-->>Client: 5d. Serve SPA Shell (No Inject)
            end
        end
    end

    Client->>Sterad: Hard Reload (DELETE /__sterad_capture)
    Sterad->>Cache: Clear Cache for Path
    Sterad-->>Client: Confirmation
```

### Core Components

1. **Client-Side Script**:

   - Injected into uncached SPA responses
   - Captures rendered DOM after 1 second
   - Sanitizes content by removing scripts and event handlers
   - Sends sanitized HTML to server via POST

2. **Sterad Server**:

   - Bun.js-based HTTP server
   - Hybrid caching system (memory + disk)
   - Route-based caching rules
   - HTML sanitization pipeline
   - SPA shell injection

3. **Configuration**:
   - TOML-based config file
   - Route pattern matching
   - Cache management settings

## 📦 Installation

### Prerequisites

- Bun v1.0.0 or newer
- Built SPA (production build)

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

## 🔧 Configuration

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

## 🛡️ Security Model

Sterad implements multiple security layers to prevent XSS and malicious content injection:

1. **Client-Side Sanitization**:
   - Removes all `<script>` tags
   - Removes event handlers (`onclick`, `onload`, etc.)
   - Disables `javascript:` URIs
2. **Server-Side Sanitization**:
   - Removes all `<script>` and `<style>` tags
   - Removes event handlers (`onclick`, `onload`, etc.)
   - Disables `javascript:` URIs

### Upcoming Security Fixes

1. Implement DOMPurify for HTML sanitization
2. Add path normalization with traversal protection
3. Implement HMAC content signing
4. Add security headers to all responses
5. Implement server-side bot detection
6. Add rate limiting to POST/DELETE endpoints

Without these fixes, Sterad **should not be deployed** in any public-facing environment due to high risk of XSS compromises and cache poisoning attacks.

## 📊 Performance

Sterad is optimized for high performance with:

- **Hybrid Caching**:

  - Hot-requests served from memory
  - Warm storage on disk
  - LRU eviction policy
  - Non-Blocking I/O:

## 🌐 Deployment

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

## 🚨 Current Limitations

1. **Initial Cache Population**:

   - Requires real user traffic to build cache
   - First crawler visit might receive unstyled content

2. **Dynamic Content**:

   - Time-sensitive content may become stale

3. **Framework Constraints**:

   - Requires specific root element selectors
   - Invalidates automatically when cached page is reloaded

4. **Security Model**:
   - Not suitable for user-generated content
   - Limited tests for protection against advanced XSS vectors

## 🛠 Troubleshooting

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

## 🚧 Contributing

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
```

For support, contact hello@codedynasty.dev.

## 📞 Support

For information, visit [Codedynasty](https://codedynasty.dev) or email hello@codedynasty.dev.

---

**Codedynasty** © 2022-present, Codedynasty Contributors.
