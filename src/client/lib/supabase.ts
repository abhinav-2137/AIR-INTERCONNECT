import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://ageeohsfcedragprhnso.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZWVvaHNmY2VkcmFncHJobnNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MzA5NTgsImV4cCI6MjEwMTAwNjk1OH0.fzuUNP3IpFoNJgMTzgBPi6bkE2-n1wkH-NDAhSzYczQ";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabaseUrl as SUPABASE_URL, supabaseAnonKey as SUPABASE_ANON_KEY };

