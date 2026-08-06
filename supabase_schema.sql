-- ============================================================
-- CONNEXT — Complete Database Schema
-- Run this in your Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. CREATE ALL TABLES FIRST (Resolves Table Dependency Order)

-- PROFILES (linked to auth.users)
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

-- CHATS
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  type TEXT CHECK(type IN ('direct', 'group', 'broadcast')) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CHAT MEMBERS
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('admin', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

-- MESSAGES
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

-- CALENDAR EVENTS
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

-- NOTIFICATIONS
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

-- ARCHIVE ITEMS
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

-- ============================================================
-- 2. ROW LEVEL SECURITY & POLICIES (Created after tables exist)
-- ============================================================

-- PROFILES POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- CHATS POLICIES
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view chats they are members of" ON chats;
CREATE POLICY "Users can view chats they are members of" ON chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create chats" ON chats;
CREATE POLICY "Authenticated users can create chats" ON chats FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Chat admins can update chats" ON chats;
CREATE POLICY "Chat admins can update chats" ON chats
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid() AND chat_members.role = 'admin'
    )
  );

-- CHAT MEMBERS POLICIES
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view members of their chats" ON chat_members;
CREATE POLICY "Users can view members of their chats" ON chat_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert chat members" ON chat_members;
CREATE POLICY "Authenticated users can insert chat members" ON chat_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Chat admins can delete members" ON chat_members;
CREATE POLICY "Chat admins can delete members" ON chat_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM chat_members cm WHERE cm.chat_id = chat_members.chat_id AND cm.user_id = auth.uid() AND cm.role = 'admin'
    )
  );

-- MESSAGES POLICIES
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view messages in their chats" ON messages;
CREATE POLICY "Users can view messages in their chats" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Chat members can insert messages" ON messages;
CREATE POLICY "Chat members can insert messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Message authors can update their messages" ON messages;
CREATE POLICY "Message authors can update their messages" ON messages FOR UPDATE USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Message authors and admins can delete messages" ON messages;
CREATE POLICY "Message authors and admins can delete messages" ON messages
  FOR DELETE USING (
    auth.uid() = sender_id OR
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- CALENDAR EVENTS POLICIES
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Calendar events are viewable by everyone" ON calendar_events;
CREATE POLICY "Calendar events are viewable by everyone" ON calendar_events FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can create calendar events" ON calendar_events;
CREATE POLICY "Admins can create calendar events" ON calendar_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.can_edit_calendar = true)
    )
  );

DROP POLICY IF EXISTS "Admins can update calendar events" ON calendar_events;
CREATE POLICY "Admins can update calendar events" ON calendar_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.can_edit_calendar = true)
    )
  );

DROP POLICY IF EXISTS "Admins can delete calendar events" ON calendar_events;
CREATE POLICY "Admins can delete calendar events" ON calendar_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.can_edit_calendar = true)
    )
  );

-- NOTIFICATIONS POLICIES
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;
CREATE POLICY "Authenticated users can insert notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ARCHIVE ITEMS POLICIES
ALTER TABLE archive_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own archive, admins view all" ON archive_items;
CREATE POLICY "Users can view own archive, admins view all" ON archive_items
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS "Authenticated users can insert archive items" ON archive_items;
CREATE POLICY "Authenticated users can insert archive items" ON archive_items FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own archive items" ON archive_items;
CREATE POLICY "Users can update own archive items" ON archive_items FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own, admins delete any" ON archive_items;
CREATE POLICY "Users can delete own, admins delete any" ON archive_items
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );
