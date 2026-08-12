/**
 * scripts/generate-env.js
 *
 * Runs during `npm run build`, writes `build/env.generated.json` from
 * environment variables (local .env in dev, GitHub Actions secrets in CI).
 * This file is shipped inside the packaged app as an extraResource.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load local .env if present
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!SUPABASE_URL) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)");

if (missing.length > 0) {
  console.error("❌ [generate-env] Missing required environment variables:");
  for (const m of missing) {
    console.error(`   - ${m}`);
  }
  console.error("Make sure they are set in your local .env or CI repository secrets.");
  process.exit(1);
}

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
