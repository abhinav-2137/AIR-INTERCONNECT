import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing required Vite environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY must be provided at build time."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabaseUrl as SUPABASE_URL, supabaseAnonKey as SUPABASE_ANON_KEY };

