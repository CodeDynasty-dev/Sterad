#!/usr/bin/env bun
/**
 * Example Intercept Script for Sterad
 *
 * This script demonstrates how to transform HTML before it's cached.
 * It receives JSON data via stdin and outputs transformed HTML to stdout.
 *
 * Input format:
 * {
 *   html: string,           // The complete HTML to be cached
 *   context: {
 *     path: string,         // The URL path being cached
 *     title: string,        // The page title
 *     content: string,      // The sanitized main content
 *     originalHtml: string, // The original SPA shell HTML
 *     timestamp: number     // Unix timestamp
 *   }
 * }
 *
 * Output: Transformed HTML string
 */

// Read input from stdin
const input = await new Response(process.stdin).text();

try {
  const { html, context } = JSON.parse(input);

  // Example transformations:
  let transformedHtml = html;

  // 1. Add meta tags for SEO
  const metaTags = `
    <meta name="description" content="Cached page for ${context.path}">
    <meta name="generator" content="Sterad SSR Cache">
    <meta name="cache-timestamp" content="${new Date(
      context.timestamp
    ).toISOString()}">
    <meta property="og:title" content="${context.title}">
    <meta property="og:type" content="website">
  `;

  transformedHtml = transformedHtml.replace("</head>", `${metaTags}\n</head>`);

  // 2. Add cache info comment
  const cacheComment = `<!-- Cached by Sterad at ${new Date(
    context.timestamp
  ).toISOString()} for path: ${context.path} -->`;
  transformedHtml = transformedHtml.replace("<html", `${cacheComment}\n<html`);

  // 3. Add structured data for better SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: context.title,
    url: context.path,
    dateModified: new Date(context.timestamp).toISOString(),
  };

  const structuredDataScript = `
    <script type="application/ld+json">
      ${JSON.stringify(structuredData, null, 2)}
    </script>
  `;

  transformedHtml = transformedHtml.replace(
    "</head>",
    `${structuredDataScript}\n</head>`
  );

  // 4. Add performance hints
  const performanceHints = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="dns-prefetch" href="//cdn.example.com">
  `;

  transformedHtml = transformedHtml.replace(
    "</head>",
    `${performanceHints}\n</head>`
  );

  // 5. Minify HTML (basic example)
  transformedHtml = transformedHtml
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .trim();

  // Output the transformed HTML
  console.log(transformedHtml);
} catch (error) {
  // On error, output the original HTML
  console.error(`Intercept script error: ${error.message}`, {
    file: process.stderr,
  });

  // Try to extract original HTML from input
  try {
    const { html } = JSON.parse(input);
    console.log(html);
  } catch {
    console.log(""); // Empty output on complete failure
  }
}
