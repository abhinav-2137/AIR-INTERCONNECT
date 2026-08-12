/**
 * scripts/generate-env.js
 *
 * Runs during `npm run build`, writes `build/env.generated.json` from
 * environment variables (local .env in dev, GitHub Actions secrets in CI).
 * Fallback values are used if environment variables are not set.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load local .env if present
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const DEFAULT_SUPABASE_URL = "https://ageeohsfcedragprhnso.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZWVvaHNmY2VkcmFncHJobnNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MzA5NTgsImV4cCI6MjEwMTAwNjk1OH0.fzuUNP3IpFoNJgMTzgBPi6bkE2-n1wkH-NDAhSzYczQ";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const buildDir = path.join(rootDir, "build");
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const envData = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ...(SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY } : {})
};

const outFile = path.join(buildDir, "env.generated.json");
fs.writeFileSync(outFile, JSON.stringify(envData, null, 2), "utf-8");

console.log(`✅ [generate-env] Written ${outFile}`);
