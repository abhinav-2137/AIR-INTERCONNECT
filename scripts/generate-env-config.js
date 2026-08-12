/**
 * generate-env-config.js
 * 
 * Build-time script that reads .env and writes dist/env-config.json.
 * This allows the packaged Electron main process to access Supabase
 * credentials without relying on dotenv (which can't find .env inside app.asar).
 *
 * Usage: node scripts/generate-env-config.js
 * Called automatically by: npm run build:electron
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load .env from project root
const envPath = path.resolve(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`[generate-env-config] ❌ Failed to load .env from: ${envPath}`);
  console.error(`[generate-env-config]    ${result.error.message}`);
  console.error(`[generate-env-config]    Make sure .env exists in the project root.`);
  process.exit(1);
}

// Required environment variables for the main process
const REQUIRED_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];

const config = {};
const missing = [];

for (const key of REQUIRED_VARS) {
  const value = process.env[key];
  if (!value) {
    missing.push(key);
  } else {
    config[key] = value;
  }
}

if (missing.length > 0) {
  console.error(`[generate-env-config] ❌ Missing required environment variables:`);
  for (const key of missing) {
    console.error(`[generate-env-config]    - ${key}`);
  }
  console.error(`[generate-env-config]    Add them to .env or set them in your environment.`);
  process.exit(1);
}

// Ensure dist/ directory exists
const distDir = path.resolve(__dirname, "..", "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write config
const outPath = path.join(distDir, "env-config.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), "utf-8");

console.log(`[generate-env-config] ✅ Generated ${outPath}`);
console.log(`[generate-env-config]    VITE_SUPABASE_URL = ${config.VITE_SUPABASE_URL}`);
console.log(`[generate-env-config]    VITE_SUPABASE_ANON_KEY = ${config.VITE_SUPABASE_ANON_KEY.slice(0, 20)}...`);
console.log(`[generate-env-config]    SUPABASE_SERVICE_ROLE_KEY = ${config.SUPABASE_SERVICE_ROLE_KEY.slice(0, 20)}...`);
