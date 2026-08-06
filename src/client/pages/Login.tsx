import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import logoData from "../assets/logoData";
import {
  Lock,
  User as UserIcon,
  Loader2,
  AlertCircle,
  Mail,
  UserPlus,
  LogIn,
  CheckCircle2,
  ShieldCheck,
  Briefcase,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Sparkles,
  Database,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";


export const Login: React.FC = () => {
  const { login, signUp, hasAdmin, needsSchema, checkSystemStatus, setupMasterAdmin } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [copiedSql, setCopiedSql] = useState(false);

  const rawSqlSchema = `-- AIR INTERCONNECT — Supabase Schema
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  email TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
  can_edit_calendar BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  is_disabled BOOLEAN DEFAULT false,
  post TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  type TEXT CHECK(type IN ('direct', 'group', 'broadcast')) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  type TEXT CHECK(type IN ('text', 'file', 'image', 'pdf')) DEFAULT 'text',
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  is_broadcast BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendees JSONB DEFAULT '[]'::jsonb,
  color TEXT DEFAULT '#4f73ff',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  chat_name TEXT,
  message_preview TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  is_read BOOLEAN DEFAULT false,
  chat_id UUID NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS & Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view member chats" ON chats;
CREATE POLICY "Users view member chats" ON chats FOR SELECT USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Auth users create chats" ON chats;
CREATE POLICY "Auth users create chats" ON chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View chat members" ON chat_members;
CREATE POLICY "View chat members" ON chat_members FOR SELECT USING (EXISTS (SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid()));
DROP POLICY IF EXISTS "Insert chat members" ON chat_members;
CREATE POLICY "Insert chat members" ON chat_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View messages" ON messages;
CREATE POLICY "View messages" ON messages FOR SELECT USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Insert messages" ON messages;
CREATE POLICY "Insert messages" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "Update messages" ON messages;
CREATE POLICY "Update messages" ON messages FOR UPDATE USING (auth.uid() = sender_id);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View calendar events" ON calendar_events;
CREATE POLICY "View calendar events" ON calendar_events FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admins insert events" ON calendar_events;
CREATE POLICY "Admins insert events" ON calendar_events FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.can_edit_calendar = true)));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View notifications" ON notifications;
CREATE POLICY "View notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE archive_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View archive items" ON archive_items;
CREATE POLICY "View archive items" ON archive_items FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
DROP POLICY IF EXISTS "Insert archive items" ON archive_items;
CREATE POLICY "Insert archive items" ON archive_items FOR INSERT WITH CHECK (auth.uid() = user_id);
`;


  const handleCopySql = () => {
    navigator.clipboard.writeText(rawSqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };


  // Master Admin Setup fields
  const [setupEmail, setSetupEmail] = useState("");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupDisplayName, setSetupDisplayName] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupAvatarUrl, setSetupAvatarUrl] = useState("");
  const [setupPost, setSetupPost] = useState("System Administrator");
  const [showSetupPass, setShowSetupPass] = useState(false);

  // Login fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Sign-up fields
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpUsername, setSignUpUsername] = useState("");
  const [signUpDisplayName, setSignUpDisplayName] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [signUpPost, setSignUpPost] = useState("");
  const [showSignUpPass, setShowSignUpPass] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupEmail.trim() || !setupUsername.trim() || !setupPassword.trim() || !setupDisplayName.trim()) {
      setError("All required fields must be filled out.");
      return;
    }
    if (setupPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await setupMasterAdmin(
        setupEmail.trim(),
        setupUsername.trim().toLowerCase(),
        setupPassword,
        setupDisplayName.trim(),
        setupAvatarUrl.trim() || undefined,
        setupPost.trim() || undefined
      );
      setSuccessMessage("Master System Administrator provisioned successfully! You may now sign in.");
      setMode("login");
      setUsername(setupUsername.trim().toLowerCase());
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Master Admin setup failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(username.trim().toLowerCase(), password);
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please check your username and password.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpEmail.trim() || !signUpUsername.trim() || !signUpPassword.trim() || !signUpDisplayName.trim()) {
      setError("All required fields must be filled out.");
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await signUp(
        signUpEmail.trim(),
        signUpUsername.trim().toLowerCase(),
        signUpPassword,
        signUpDisplayName.trim(),
        signUpPost.trim() || undefined
      );
      setSuccessMessage("Account registered successfully! Please log in with your new credentials.");
      setMode("login");
      setUsername(signUpUsername.trim().toLowerCase());
      setPassword("");
      setSignUpEmail("");
      setSignUpUsername("");
      setSignUpDisplayName("");
      setSignUpPassword("");
      setSignUpConfirmPassword("");
      setSignUpPost("");
    } catch (err: any) {
      setError(err.message || "Sign up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-40px)] flex flex-col items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-brand-950 px-4 py-8 relative overflow-hidden select-none no-drag">
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-1/4 -left-28 w-96 h-96 bg-brand-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-28 w-96 h-96 bg-indigo-500/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-2 shadow-2xl shadow-brand-500/40 mb-3">
            <img src={logoData} alt="CONNEXT Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            CONNEXT
            <Sparkles size={18} className="text-brand-400" />
          </h1>
          <p className="text-slate-400 mt-1.5 text-xs font-medium">
            Next-Gen Enterprise Desktop Communication &amp; Collaboration Platform
          </p>
        </div>

        {/* Auth Glassmorphism Container */}
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 shadow-2xl relative overflow-hidden">
          {/* Top Decorative Border Highlight */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-brand-500 to-transparent" />

          {/* DATABASE SCHEMA INITIALIZATION REQUIRED VIEW */}
          {needsSchema ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-300 p-4 rounded-2xl text-xs font-semibold">
                <Database size={24} className="shrink-0 text-rose-400" />
                <div>
                  <p className="font-bold text-rose-200 uppercase tracking-wider text-[11px]">Database Schema Setup Required</p>
                  <p className="text-[11px] text-rose-300/90 font-normal mt-0.5">
                    The Supabase project database tables (<code className="bg-rose-950/60 px-1 py-0.5 rounded text-rose-200 font-mono">public.profiles</code>) have not been created yet.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-white/5 rounded-2xl p-4 space-y-3">
                <p className="text-xs text-slate-300 font-semibold flex items-center justify-between">
                  <span>Step-by-Step Instructions:</span>
                  <span className="text-[10px] text-slate-500">1-click schema script</span>
                </p>
                <ol className="text-[11px] text-slate-400 space-y-2 list-decimal list-inside pl-1">
                  <li>Click <strong>Copy SQL Schema Code</strong> below.</li>
                  <li>Open the Supabase SQL Editor dashboard.</li>
                  <li>Paste the code and click <strong>Run</strong>.</li>
                </ol>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-brand-500/20"
                  >
                    {copiedSql ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copiedSql ? "Copied SQL Code!" : "Copy SQL Schema Code"}</span>
                  </button>

                  <a
                    href="https://supabase.com/dashboard/project/ageeohsfcedragprhnso/sql/new"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-white/10 transition-all flex items-center gap-1.5"
                    title="Open Supabase SQL Editor in Browser"
                  >
                    <span>SQL Editor</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <button
                type="button"
                onClick={() => checkSystemStatus()}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <span>Check Database Status Again</span>
              </button>
            </div>
          ) : !hasAdmin ? (

            <form onSubmit={handleSetupAdmin} className="space-y-4">
              <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/25 text-amber-300 p-3.5 rounded-2xl text-xs font-semibold">
                <ShieldCheck size={22} className="shrink-0 text-amber-400" />
                <div>
                  <p className="font-bold text-amber-200 uppercase tracking-wider text-[10px]">First-Time Setup Required</p>
                  <p className="text-[11px] text-amber-300/90 font-normal mt-0.5">
                    No administrator account exists yet. Create the primary Master Admin account to manage team credentials.
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-200 p-3.5 rounded-xl text-xs">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Master Admin Email *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                      <Mail size={15} />
                    </span>
                    <input
                      type="email"
                      required
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="admin@company.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={setupUsername}
                      onChange={(e) => setSetupUsername(e.target.value)}
                      disabled={isLoading}
                      className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="admin"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Display Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={setupDisplayName}
                      onChange={(e) => setSetupDisplayName(e.target.value)}
                      disabled={isLoading}
                      className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="System Admin"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Job Title / Position
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                      <Briefcase size={15} />
                    </span>
                    <input
                      type="text"
                      value={setupPost}
                      onChange={(e) => setSetupPost(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="e.g. Chief Technical Officer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Avatar Image URL (Optional)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                      <ImageIcon size={15} />
                    </span>
                    <input
                      type="url"
                      value={setupAvatarUrl}
                      onChange={(e) => setSetupAvatarUrl(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Master Admin Password *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                      <Lock size={15} />
                    </span>
                    <input
                      type={showSetupPass ? "text" : "password"}
                      required
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="At least 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPass(!showSetupPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showSetupPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Provisioning Master Admin...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Provision Master Administrator</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <>
              {/* Login / Sign Up Tab Switcher */}
              <div className="flex mb-5 bg-slate-950/60 p-1 rounded-xl border border-white/5">
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    mode === "login"
                      ? "bg-brand-600 text-white shadow-md shadow-brand-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <LogIn size={15} />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); setSuccessMessage(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    mode === "signup"
                      ? "bg-brand-600 text-white shadow-md shadow-brand-500/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <UserPlus size={15} />
                  <span>Sign Up</span>
                </button>
              </div>

              {/* Alert Feedback Messages */}
              {successMessage && (
                <div className="mb-4 flex items-start gap-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 p-3.5 rounded-xl text-xs">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              {error && (
                <div className="mb-4 flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-300 p-3.5 rounded-xl text-xs">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* STANDARD USER LOG IN FORM */}
              {mode === "login" && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                        <UserIcon size={16} />
                      </span>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={isLoading}
                        className="w-full pl-10 pr-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="Enter your username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                        <Lock size={16} />
                      </span>
                      <input
                        type={showLoginPass ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        className="w-full pl-10 pr-10 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass(!showLoginPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showLoginPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-brand-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <LogIn size={16} />
                        <span>Sign In to Workspace</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2 border-t border-white/5">
                    <p className="text-[11px] text-slate-400">
                      Need an account?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("signup")}
                        className="text-brand-400 hover:text-brand-300 font-bold underline underline-offset-2"
                      >
                        Sign up here
                      </button>
                    </p>
                  </div>
                </form>
              )}

              {/* COWORKER SIGN UP FORM */}
              {mode === "signup" && (
                <form onSubmit={handleSignUp} className="space-y-3.5">
                  <div className="bg-brand-500/10 border border-brand-500/20 text-brand-300 px-3 py-2 rounded-xl text-[11px]">
                    💡 <strong>Notice:</strong> Coworker accounts are created as Team Members. Admin privileges are assigned by your Administrator.
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Work Email *
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                        <Mail size={15} />
                      </span>
                      <input
                        type="email"
                        required
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        disabled={isLoading}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="your.email@company.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={signUpUsername}
                        onChange={(e) => setSignUpUsername(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="johndoe"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Display Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={signUpDisplayName}
                        onChange={(e) => setSignUpDisplayName(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="John Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Post / Job Title / Department
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                        <Briefcase size={15} />
                      </span>
                      <input
                        type="text"
                        value={signUpPost}
                        onChange={(e) => setSignUpPost(e.target.value)}
                        disabled={isLoading}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="e.g. Senior Software Engineer / Finance"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showSignUpPass ? "text" : "password"}
                          required
                          value={signUpPassword}
                          onChange={(e) => setSignUpPassword(e.target.value)}
                          disabled={isLoading}
                          className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                          placeholder="Min 6 chars"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignUpPass(!showSignUpPass)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showSignUpPass ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Confirm *
                      </label>
                      <input
                        type={showSignUpPass ? "text" : "password"}
                        required
                        value={signUpConfirmPassword}
                        onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                        disabled={isLoading}
                        className="w-full px-3.5 py-2.5 bg-slate-950/50 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        placeholder="Repeat password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={16} />
                        <span>Create Coworker Account</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2 border-t border-white/5">
                    <p className="text-[11px] text-slate-400">
                      Already registered?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("login")}
                        className="text-brand-400 hover:text-brand-300 font-bold underline underline-offset-2"
                      >
                        Sign in here
                      </button>
                    </p>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
