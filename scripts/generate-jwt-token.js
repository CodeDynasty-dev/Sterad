#!/usr/bin/env bun
import jwt from "jsonwebtoken";
import { readFileSync } from "fs";

// Load .env file if it exists
function loadEnvFile() {
  try {
    const envContent = readFileSync(".env", "utf8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=");
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (error) {
    // .env file doesn't exist, that's okay
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  subject: "admin",
  expires: "24h",
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case "--subject":
    case "-s":
      options.subject = args[++i];
      break;
    case "--expires":
    case "-e":
      options.expires = args[++i] + "h";
      break;
    case "--help":
    case "-h":
      console.log(`
JWT Token Generator for Sterad Admin Routes

Usage:
  bun run scripts/generate-jwt-token.js [options]

Options:
  --subject, -s    Subject (user identifier) [default: admin]
  --expires, -e    Expiration time in hours [default: 24]
  --help, -h       Show this help

Environment Variables:
  JWT_SECRET       Required. JWT signing secret (min 32 characters)

Examples:
  bun run scripts/generate-jwt-token.js
  bun run scripts/generate-jwt-token.js --subject john.doe --expires 1
`);
      process.exit(0);
  }
}

// Load environment
loadEnvFile();

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("❌ JWT_SECRET environment variable is required");
  console.error("   Set it in your .env file: JWT_SECRET=your-secret-key");
  process.exit(1);
}

if (secret.length < 32) {
  console.error(
    `❌ JWT_SECRET must be at least 32 characters (current: ${secret.length})`
  );
  process.exit(1);
}

// Generate token
const payload = {
  sub: options.subject,
  iss: process.env.JWT_ISSUER || "sterad",
  aud: process.env.JWT_AUDIENCE || "sterad-admin",
};

const token = jwt.sign(payload, secret, { expiresIn: options.expires });

console.log("🎉 JWT Token Generated:");
console.log(token);
console.log("\n🔧 Usage:");
console.log(`curl -X DELETE "http://localhost:9081/__sterad_capture" \\`);
console.log(`  -H "Authorization: Bearer ${token}" \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"path": "/page-to-clear"}'`);
