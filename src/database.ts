import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import path from "path";
import fs from "fs";

/**
 * Load Supabase credentials using a dual-mode strategy:
 * 
 * 1. DEV MODE: dotenv reads .env from the project root (standard dev workflow)
 * 2. PACKAGED MODE: reads dist/env-config.json generated at build time
 *    (the .env file is intentionally excluded from packaged builds)
 * 
 * Falls back gracefully: tries dotenv first, then env-config.json,
 * then checks process.env (for CI or manual injection).
 */
function loadConfig(): { url: string; serviceRoleKey: string; anonKey: string } {
  // Strategy 1: Try dotenv (works in dev, no-op in packaged app)
  try {
    const dotenv = require("dotenv");
    dotenv.config();
  } catch {
    // dotenv may not be available in some environments — that's fine
  }

  // Strategy 2: If env vars are still missing, try env-config.json
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const configPaths = [
      path.join(__dirname, "env-config.json"),              // dist/env-config.json (packaged)
      path.join(process.resourcesPath || "", "app.asar", "dist", "env-config.json"), // inside asar
      path.join(__dirname, "..", "dist", "env-config.json") // dev fallback
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          // Only set vars that aren't already defined (env takes precedence)
          if (config.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
            process.env.VITE_SUPABASE_URL = config.VITE_SUPABASE_URL;
          }
          if (config.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY) {
            process.env.VITE_SUPABASE_ANON_KEY = config.VITE_SUPABASE_ANON_KEY;
          }
          if (config.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            process.env.SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY;
          }
          console.log(`[database] Loaded config from: ${configPath}`);
          break;
        }
      } catch (err) {
        // Continue to next path
      }
    }
  }

  // Validate: all required vars must be defined
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("VITE_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!anonKey) missing.push("VITE_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    const msg = [
      `[database] ❌ Missing required Supabase configuration: ${missing.join(", ")}`,
      ``,
      `  In development: ensure .env exists in the project root with these variables.`,
      `  In production:  ensure 'npm run build' was run (generates dist/env-config.json).`,
      `  In CI:          set these as environment variables / GitHub secrets.`,
      ``,
      `  See .env.example for the expected format.`
    ].join("\n");
    throw new Error(msg);
  }

  return { url: url!, serviceRoleKey: serviceRoleKey!, anonKey: anonKey! };
}

// --- Initialize ---

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

const { url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY, anonKey: SUPABASE_ANON_KEY } = loadConfig();

// Service-role client bypasses Row Level Security — use only server-side
export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  realtime: {
    transport: WebSocket as any
  }
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
