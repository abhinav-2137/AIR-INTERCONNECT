/**
 * Centralized runtime config loader.
 *
 * Problem this solves:
 *   - In dev, dotenv reads .env from the project root -> works fine.
 *   - In a packaged app, .env is intentionally excluded from the asar
 *     (never ship secrets inside a distributable binary), so
 *     process.env.SUPABASE_URL is undefined at runtime -> crash.
 *
 * Fix:
 *   - In dev: load .env normally via dotenv.
 *   - In packaged builds: scripts/generate-env.js runs during `npm run build`
 *     (before electron-builder packages the app) and writes
 *     build/env.generated.json from CI secrets. electron-builder ships that
 *     file as an extraResource. At runtime we read it from
 *     process.resourcesPath — never from a .env file, which won't exist in
 *     the packaged app.
 */

import { app } from "electron";
import path from "path";
import fs from "fs";

const isPackaged = app?.isPackaged ?? false;

function loadEnv(): { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY?: string } {
  if (isPackaged) {
    const envPath = path.join(process.resourcesPath, "env.generated.json");
    if (!fs.existsSync(envPath)) {
      throw new Error(
        `Missing ${envPath}. This file is generated at build time by ` +
          "scripts/generate-env.js and shipped via electron-builder's " +
          '"extraResources" config. If it is missing, the build step did ' +
          "not run correctly or the required secrets were not set in CI."
      );
    }
    const data = JSON.parse(fs.readFileSync(envPath, "utf-8"));
    return {
      SUPABASE_URL: data.SUPABASE_URL || data.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: data.SUPABASE_ANON_KEY || data.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: data.SUPABASE_SERVICE_ROLE_KEY
    };
  }

  // Dev mode: load .env from project root
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Check your .env file in the project root."
    );
  }
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = loadEnv();
export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
