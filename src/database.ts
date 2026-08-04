import { createClient, SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

const SUPABASE_URL = "https://REDACTED_PROJECT_REF.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "REDACTED_SUPABASE_SERVICE_ROLE_KEY";
const SUPABASE_ANON_KEY = "REDACTED_SUPABASE_ANON_KEY";

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


export { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY };


