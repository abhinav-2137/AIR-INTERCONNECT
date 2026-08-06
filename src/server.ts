import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { supabaseAdmin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./database";
import { createClient } from "@supabase/supabase-js";

// Multer memory storage configuration (storing images directly in DB as base64 Data URLs)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

export function startServer(port: number): Promise<{ server: http.Server; io: SocketIOServer }> {
  return new Promise(async (resolve, reject) => {
    try {
      const app = express();
      app.use(cors());
      app.use(express.json({ limit: "50mb" }));
      app.use(express.urlencoded({ limit: "50mb", extended: true }));

      // Serve compiled frontend files if they exist
      const clientBuildPath = path.join(process.cwd(), "dist", "client");
      if (fs.existsSync(clientBuildPath)) {
        app.use(express.static(clientBuildPath));
        app.get("*", (req, res, next) => {
          if (req.path.startsWith("/api")) return next();
          res.sendFile(path.join(clientBuildPath, "index.html"));
        });
      }

      const server = http.createServer(app);
      const io = new SocketIOServer(server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      // Socket user presence maps
      const activeConnections = new Map<string, string>(); // socketId -> userId
      const userSockets = new Map<string, string[]>(); // userId -> socketIds[]

      // Helpers for presence
      const updateUserStatus = async (userId: string, status: string) => {
        const lastSeen = new Date().toISOString();
        await supabaseAdmin
          .from("profiles")
          .update({ status, last_seen: lastSeen })
          .eq("id", userId);
        io.emit("status_change", { userId, status, lastSeen });
      };

      // Realtime connections handler
      io.on("connection", (socket) => {
        console.log("Socket client connected:", socket.id);

        socket.on("register", async ({ userId }) => {
          activeConnections.set(socket.id, userId);
          const currentSockets = userSockets.get(userId) || [];
          currentSockets.push(socket.id);
          userSockets.set(userId, currentSockets);

          socket.join(`user_${userId}`);
          console.log(`User ${userId} registered socket ${socket.id}`);

          // Mark user as online
          await updateUserStatus(userId, "online");

          // Join current user chats
          const { data: userChats } = await supabaseAdmin
            .from("chat_members")
            .select("chat_id")
            .eq("user_id", userId);

          if (userChats) {
            userChats.forEach((uc) => {
              socket.join(`chat_${uc.chat_id}`);
            });
          }
        });

        socket.on("join_chat", ({ chatId }) => {
          socket.join(`chat_${chatId}`);
        });

        socket.on("leave_chat", ({ chatId }) => {
          socket.leave(`chat_${chatId}`);
        });

        socket.on("typing", ({ chatId, userId, username, isTyping }) => {
          socket.to(`chat_${chatId}`).emit("typing_status", { chatId, userId, username, isTyping });
        });

        socket.on("disconnect", async () => {
          const userId = activeConnections.get(socket.id);
          if (userId) {
            activeConnections.delete(socket.id);
            const currentSockets = userSockets.get(userId) || [];
            const filtered = currentSockets.filter((id) => id !== socket.id);
            if (filtered.length > 0) {
              userSockets.set(userId, filtered);
            } else {
              userSockets.delete(userId);
              await updateUserStatus(userId, "offline");
            }
          }
          console.log("Socket client disconnected:", socket.id);
        });
      });

      // System Status: Check if an Admin account exists
      app.get("/api/auth/system-status", async (req, res) => {
        try {
          const { data: adminUser, error } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("role", "admin")
            .limit(1)
            .maybeSingle();

          if (error && (error.code === "PGRST205" || error.message?.includes("profiles") || error.message?.includes("schema cache"))) {
            return res.json({ hasAdmin: false, needsSchema: true });
          }

          res.json({ hasAdmin: !!adminUser, needsSchema: false });
        } catch (err: any) {
          if (err.message?.includes("profiles") || err.message?.includes("schema cache")) {
            return res.json({ hasAdmin: false, needsSchema: true });
          }
          res.status(500).json({ error: err.message });
        }
      });


      // Master Admin Setup (only allowed if no admin exists yet)
      app.post("/api/auth/setup-admin", async (req, res) => {
        const { email, username, password, displayName, avatarUrl, post } = req.body;
        if (!email || !username || !password || !displayName) {
          return res.status(400).json({ error: "Email, username, password and display name are required" });
        }

        try {
          const { data: existingAdmin } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("role", "admin")
            .limit(1)
            .maybeSingle();

          if (existingAdmin) {
            return res.status(403).json({ error: "A Master Admin has already been provisioned." });
          }

          // Create Auth User
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true
          });

          if (authError || !authData.user) {
            return res.status(400).json({ error: authError?.message || "Failed to create Master Admin account" });
          }

          // Create Master Admin Profile
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .insert({
              id: authData.user.id,
              username: username.toLowerCase(),
              display_name: displayName,
              email,
              avatar_url: avatarUrl || null,
              post: post || "System Administrator",
              role: "admin",
              can_edit_calendar: true,
              status: "offline"
            });

          if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: profileError.message });
          }

          res.json({ success: true, message: "Master Admin setup complete. You may now log in." });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 1. Auth: Sign Up (Regular Coworkers — strictly role: "user")
      app.post("/api/auth/signup", async (req, res) => {
        const { email, username, password, displayName, post } = req.body;
        if (!email || !username || !password || !displayName) {
          return res.status(400).json({ error: "All fields are required" });
        }

        try {
          // Check if username already exists
          const { data: existingUser } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", username.toLowerCase())
            .maybeSingle();

          if (existingUser) {
            return res.status(400).json({ error: "Username already taken" });
          }

          // Create auth user in Supabase
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true
          });

          if (authError || !authData.user) {
            return res.status(400).json({ error: authError?.message || "Failed to create account" });
          }

          // Create profile row (strictly role: "user")
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .insert({
              id: authData.user.id,
              username: username.toLowerCase(),
              display_name: displayName,
              email,
              post: post || "Team Member",
              role: "user",
              can_edit_calendar: false,
              status: "offline"
            });

          if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: profileError.message });
          }

          res.json({ success: true, message: "Account created. You can now log in." });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 1b. Auth: Login (via username+password)

      app.post("/api/auth/login", async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
          return res.status(400).json({ error: "Username and password required" });
        }
        try {
          // Look up email from profiles by username
          const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("username", username.toLowerCase())
            .maybeSingle();

          if (!profile || profileError) {
            return res.status(401).json({ error: "Invalid username" });
          }
          if (profile.is_disabled) {
            return res.status(401).json({ error: "Account is disabled" });
          }

          // Sign in via Supabase Auth using the email
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: profile.email
          });

          // Since we can't directly verify password with admin API,
          // create a temporary client with anon key to verify password
          const tempClient = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );

          const { data: signInData, error: signInError } = await tempClient.auth.signInWithPassword({
            email: profile.email,
            password
          });

          if (signInError || !signInData.user) {
            return res.status(401).json({ error: "Invalid password" });
          }

          res.json({
            id: profile.id,
            username: profile.username,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            post: profile.post,
            role: profile.role,
            canEditCalendar: profile.can_edit_calendar,
            status: profile.status,
            accessToken: signInData.session?.access_token,
            refreshToken: signInData.session?.refresh_token
          });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 2. Fetch Users
      app.get("/api/users", async (req, res) => {
        try {
          const { data: users, error } = await supabaseAdmin
            .from("profiles")
            .select("id, username, display_name, avatar_url, post, role, can_edit_calendar, status, last_seen, is_disabled");

          if (error) return res.status(500).json({ error: error.message });

          const mapped = (users || []).map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            avatarUrl: u.avatar_url,
            post: u.post,
            role: u.role,
            canEditCalendar: u.can_edit_calendar,
            status: u.status,
            lastSeen: u.last_seen,
            isDisabled: u.is_disabled
          }));
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Update Profile
      // Update Profile
      app.put("/api/users/profile", async (req, res) => {
        const { userId, displayName, avatarUrl, post } = req.body;
        if (!userId || !displayName) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        try {
          const updates: any = { display_name: displayName, avatar_url: avatarUrl || null };
          if (post !== undefined) updates.post = post;

          await supabaseAdmin
            .from("profiles")
            .update(updates)
            .eq("id", userId);
          io.emit("profile_change", { userId, displayName, avatarUrl, post });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Update User Status
      app.put("/api/users/status", async (req, res) => {
        const { userId, status } = req.body;
        if (!userId || !status) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        try {
          await updateUserStatus(userId, status);
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 3. Admin endpoints
      const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const adminId = req.headers["x-admin-id"] as string;
        if (!adminId) return res.status(403).json({ error: "Admin authorization required" });
        const { data: user } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", adminId)
          .maybeSingle();
        if (!user || user.role !== "admin") {
          return res.status(403).json({ error: "Access denied. Admin role required." });
        }
        next();
      };

      app.post("/api/admin/users", verifyAdmin, async (req, res) => {
        let { email, username, password, displayName, avatarUrl, post, role, canEditCalendar } = req.body;
        if (!username || !password || !displayName) {
          return res.status(400).json({ error: "Username, password and display name are required" });
        }
        if (!email) {
          email = `${username.toLowerCase()}@office.local`;
        }
        try {
          const { data: exists } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", username.toLowerCase())
            .maybeSingle();
          if (exists) {
            return res.status(400).json({ error: "Username already exists" });
          }

          // Create Supabase auth user
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true
          });

          if (authError || !authData.user) {
            return res.status(400).json({ error: authError?.message || "Failed to create user" });
          }

          // Create profile
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .insert({
              id: authData.user.id,
              username: username.toLowerCase(),
              display_name: displayName,
              email,
              avatar_url: avatarUrl || null,
              post: post || (role === "admin" ? "Administrator" : "Team Member"),
              role: role || "user",
              can_edit_calendar: canEditCalendar || false,
              status: "offline"
            });

          if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: profileError.message });
          }

          res.json({ success: true, userId: authData.user.id });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.put("/api/admin/users/:userId", verifyAdmin, async (req, res) => {
        const { userId } = req.params;
        const { username, password, displayName, avatarUrl, post, role, canEditCalendar, isDisabled } = req.body;
        try {
          const { data: user } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

          if (!user) return res.status(404).json({ error: "User not found" });

          const updates: any = {
            username: username || user.username,
            display_name: displayName || user.display_name,
            avatar_url: avatarUrl !== undefined ? avatarUrl : user.avatar_url,
            post: post !== undefined ? post : user.post,
            role: role || user.role,
            can_edit_calendar: canEditCalendar !== undefined ? canEditCalendar : user.can_edit_calendar,
            is_disabled: isDisabled !== undefined ? isDisabled : user.is_disabled
          };

          await supabaseAdmin.from("profiles").update(updates).eq("id", userId);

          if (password) {
            await supabaseAdmin.auth.admin.updateUserById(userId, { password });
          }

          io.emit("user_profile_updated", { userId });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.delete("/api/admin/users/:userId", verifyAdmin, async (req, res) => {
        const { userId } = req.params;
        try {
          const { data: user } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

          if (user && user.role === "admin") {
            return res.status(400).json({ error: "Cannot delete the administrator account" });
          }

          await supabaseAdmin.from("profiles").delete().eq("id", userId);
          await supabaseAdmin.auth.admin.deleteUser(userId);
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.post("/api/admin/clear-database", verifyAdmin, async (req, res) => {
        try {
          // Erase all application content from Supabase tables
          await supabaseAdmin.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabaseAdmin.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabaseAdmin.from("calendar_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabaseAdmin.from("archive_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabaseAdmin.from("chat_members").delete().neq("chat_id", "00000000-0000-0000-0000-000000000000");
          await supabaseAdmin.from("chats").delete().neq("id", "00000000-0000-0000-0000-000000000000");

          io.emit("database_cleared", { timestamp: new Date().toISOString() });

          res.json({ success: true, message: "All application data from Supabase database has been successfully erased." });
        } catch (err: any) {
          console.error("Error clearing database data:", err);
          res.status(500).json({ error: err.message || "Failed to clear database data." });
        }
      });

      // 4. Chat Endpoints
      app.get("/api/chats", async (req, res) => {
        const userId = req.query.userId as string;
        if (!userId) return res.status(400).json({ error: "userId required" });
        try {
          // Get chat IDs this user belongs to
          const { data: memberships } = await supabaseAdmin
            .from("chat_members")
            .select("chat_id, role")
            .eq("user_id", userId);

          if (!memberships || memberships.length === 0) {
            return res.json([]);
          }

          const chatIds = memberships.map((m) => m.chat_id);

          // Get chat details
          const { data: chats } = await supabaseAdmin
            .from("chats")
            .select("*")
            .in("id", chatIds);

          const fullChats = [];
          for (const chat of chats || []) {
            // Fetch participants
            const { data: memberRows } = await supabaseAdmin
              .from("chat_members")
              .select("user_id")
              .eq("chat_id", chat.id);

            const memberIds = (memberRows || []).map((m) => m.user_id);
            const { data: members } = await supabaseAdmin
              .from("profiles")
              .select("id, username, display_name, avatar_url, status, last_seen")
              .in("id", memberIds);

            // Fetch last message
            const { data: lastMsgArr } = await supabaseAdmin
              .from("messages")
              .select("*")
              .eq("chat_id", chat.id)
              .order("timestamp", { ascending: false })
              .limit(1);

            const lastMsg = lastMsgArr && lastMsgArr.length > 0 ? lastMsgArr[0] : null;
            const memberRole = memberships.find((m) => m.chat_id === chat.id)?.role || "member";

            fullChats.push({
              id: chat.id,
              name: chat.name,
              type: chat.type,
              avatarUrl: chat.avatar_url,
              createdAt: chat.created_at,
              memberRole,
              members: (members || []).map((m) => ({
                id: m.id,
                username: m.username,
                displayName: m.display_name,
                avatarUrl: m.avatar_url,
                status: m.status,
                lastSeen: m.last_seen
              })),
              lastMessage: lastMsg
                ? {
                    id: lastMsg.id,
                    content: lastMsg.content,
                    type: lastMsg.type,
                    senderId: lastMsg.sender_id,
                    timestamp: lastMsg.timestamp,
                    fileName: lastMsg.file_name,
                    fileSize: lastMsg.file_size
                  }
                : null
            });
          }
          res.json(fullChats);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Create Chat
      app.post("/api/chats", async (req, res) => {
        const { name, type, members, creatorId, avatarUrl } = req.body;
        if (!type || !members || !Array.isArray(members) || members.length === 0 || !creatorId) {
          return res.status(400).json({ error: "Missing type, members, or creatorId" });
        }

        try {
          // Only Admins can create Group chats
          if (type === "group") {
            const { data: creator } = await supabaseAdmin
              .from("profiles")
              .select("role")
              .eq("id", creatorId)
              .maybeSingle();

            if (!creator || creator.role !== "admin") {
              return res.status(403).json({ error: "Access denied. Only administrators can create new group channels." });
            }
          }

          // Direct chats should be unique between 2 users
          if (type === "direct" && members.length === 2) {
            const u1 = members[0];
            const u2 = members[1];

            const { data: cm1 } = await supabaseAdmin
              .from("chat_members")
              .select("chat_id")
              .eq("user_id", u1);

            const { data: cm2 } = await supabaseAdmin
              .from("chat_members")
              .select("chat_id")
              .eq("user_id", u2);

            if (cm1 && cm2) {
              const chatIds1 = cm1.map((c) => c.chat_id);
              const chatIds2 = cm2.map((c) => c.chat_id);
              const commonChatIds = chatIds1.filter((id) => chatIds2.includes(id));

              if (commonChatIds.length > 0) {
                const { data: existingDirectChat } = await supabaseAdmin
                  .from("chats")
                  .select("*")
                  .in("id", commonChatIds)
                  .eq("type", "direct")
                  .maybeSingle();

                if (existingDirectChat) {
                  // Fetch participants
                  const { data: memberRows } = await supabaseAdmin
                    .from("chat_members")
                    .select("user_id")
                    .eq("chat_id", existingDirectChat.id);

                  const memberIds = (memberRows || []).map((m) => m.user_id);
                  const { data: members } = await supabaseAdmin
                    .from("profiles")
                    .select("id, username, display_name, avatar_url, status, last_seen")
                    .in("id", memberIds);

                  // Fetch last message
                  const { data: lastMsgArr } = await supabaseAdmin
                    .from("messages")
                    .select("*")
                    .eq("chat_id", existingDirectChat.id)
                    .order("timestamp", { ascending: false })
                    .limit(1);

                  const lastMsg = lastMsgArr && lastMsgArr.length > 0 ? lastMsgArr[0] : null;

                  const fullDirectChat = {
                    id: existingDirectChat.id,
                    name: existingDirectChat.name,
                    type: existingDirectChat.type,
                    avatarUrl: existingDirectChat.avatar_url,
                    createdAt: existingDirectChat.created_at,
                    members: (members || []).map((m) => ({
                      id: m.id,
                      username: m.username,
                      displayName: m.display_name,
                      avatarUrl: m.avatar_url,
                      status: m.status,
                      lastSeen: m.last_seen
                    })),
                    lastMessage: lastMsg
                      ? {
                          id: lastMsg.id,
                          content: lastMsg.content,
                          type: lastMsg.type,
                          senderId: lastMsg.sender_id,
                          timestamp: lastMsg.timestamp,
                          fileName: lastMsg.file_name,
                          fileSize: lastMsg.file_size
                        }
                      : null
                  };

                  return res.json(fullDirectChat);
                }
              }
            }
          }

          // Create chat
          const { data: newChatRow, error: chatError } = await supabaseAdmin
            .from("chats")
            .insert({ name: name || null, type, avatar_url: avatarUrl || null })
            .select()
            .single();

          if (chatError || !newChatRow) {
            return res.status(500).json({ error: chatError?.message || "Failed to create chat" });
          }

          const chatId = newChatRow.id;

          // Add members
          for (const memberId of members) {
            const role = memberId === creatorId ? "admin" : "member";
            await supabaseAdmin
              .from("chat_members")
              .insert({ chat_id: chatId, user_id: memberId, role });
          }

          // Get members for response
          const { data: memberProfiles } = await supabaseAdmin
            .from("profiles")
            .select("id, username, display_name, avatar_url, status")
            .in("id", members);

          const newChat = {
            id: chatId,
            name: name || null,
            type,
            avatarUrl: avatarUrl || null,
            createdAt: newChatRow.created_at,
            members: (memberProfiles || []).map((m) => ({
              id: m.id,
              username: m.username,
              displayName: m.display_name,
              avatarUrl: m.avatar_url,
              status: m.status
            })),
            lastMessage: null
          };

          members.forEach((memberId: string) => {
            io.to(`user_${memberId}`).emit("chat_created", newChat);
          });

          res.json(newChat);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Manage Group Members
      app.post("/api/chats/:chatId/members", async (req, res) => {
        const { chatId } = req.params;
        const { userId, action, targetUserId } = req.body;
        try {
          const { data: memberRow } = await supabaseAdmin
            .from("chat_members")
            .select("role")
            .eq("chat_id", chatId)
            .eq("user_id", userId)
            .maybeSingle();

          if (!memberRow || memberRow.role !== "admin") {
            return res.status(403).json({ error: "Only group admins can manage members" });
          }

          if (action === "add") {
            await supabaseAdmin
              .from("chat_members")
              .upsert({ chat_id: chatId, user_id: targetUserId, role: "member" });
            io.to(`user_${targetUserId}`).emit("added_to_group", { chatId });
          } else if (action === "remove") {
            await supabaseAdmin
              .from("chat_members")
              .delete()
              .eq("chat_id", chatId)
              .eq("user_id", targetUserId);
            io.to(`user_${targetUserId}`).emit("removed_from_group", { chatId });
          }

          // Broadcast updated member list
          const { data: memberRows } = await supabaseAdmin
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", chatId);

          const memberIds = (memberRows || []).map((m) => m.user_id);
          const { data: memberProfiles } = await supabaseAdmin
            .from("profiles")
            .select("id, username, display_name, avatar_url, status")
            .in("id", memberIds);

          const membersOut = (memberProfiles || []).map((m) => ({
            id: m.id,
            username: m.username,
            displayName: m.display_name,
            avatarUrl: m.avatar_url,
            status: m.status
          }));

          io.to(`chat_${chatId}`).emit("members_updated", { chatId, members: membersOut });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Rename Group
      app.put("/api/chats/:chatId", async (req, res) => {
        const { chatId } = req.params;
        const { name, avatarUrl } = req.body;
        try {
          const updates: any = {};
          if (name !== undefined) updates.name = name;
          if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
          await supabaseAdmin.from("chats").update(updates).eq("id", chatId);
          io.to(`chat_${chatId}`).emit("chat_details_updated", { chatId, name, avatarUrl });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Fetch Messages in a Chat
      app.get("/api/chats/:chatId/messages", async (req, res) => {
        const { chatId } = req.params;
        try {
          const { data: msgs, error } = await supabaseAdmin
            .from("messages")
            .select("*, profiles!sender_id(display_name)")
            .eq("chat_id", chatId)
            .order("timestamp", { ascending: true });

          if (error) return res.status(500).json({ error: error.message });

          const mapped = (msgs || []).map((m: any) => ({
            id: m.id,
            chatId: m.chat_id,
            senderId: m.sender_id,
            senderName: m.profiles?.display_name || "Unknown",
            content: m.content,
            type: m.type,
            filePath: m.file_path,
            fileName: m.file_name,
            fileSize: m.file_size,
            timestamp: m.timestamp,
            isBroadcast: m.is_broadcast,
            isEdited: m.is_edited
          }));
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Send Message
      app.post("/api/messages", async (req, res) => {
        const { chatId, senderId, content, type, filePath, fileName, fileSize, isBroadcast } = req.body;
        if (!chatId || !senderId) {
          return res.status(400).json({ error: "Missing chatId or senderId" });
        }
        try {
          const { data: newMsg, error } = await supabaseAdmin
            .from("messages")
            .insert({
              chat_id: chatId,
              sender_id: senderId,
              content: content || null,
              type: type || "text",
              file_path: filePath || null,
              file_name: fileName || null,
              file_size: fileSize || null,
              is_broadcast: isBroadcast || false,
              is_edited: false
            })
            .select()
            .single();

          if (error || !newMsg) {
            return res.status(500).json({ error: error?.message || "Failed to send message" });
          }

          const { data: sender } = await supabaseAdmin
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", senderId)
            .maybeSingle();

          const savedMessage = {
            id: newMsg.id,
            chatId: newMsg.chat_id,
            senderId: newMsg.sender_id,
            senderName: sender?.display_name || "Unknown",
            senderAvatar: sender?.avatar_url || null,
            content: newMsg.content,
            type: newMsg.type,
            filePath: newMsg.file_path,
            fileName: newMsg.file_name,
            fileSize: newMsg.file_size,
            timestamp: newMsg.timestamp,
            isBroadcast: newMsg.is_broadcast,
            isEdited: false
          };

          io.to(`chat_${chatId}`).emit("message_received", savedMessage);

          // Generate notification entries for chat members (except sender)
          try {
            const { data: members } = await supabaseAdmin
              .from("chat_members")
              .select("user_id")
              .eq("chat_id", chatId);

            const { data: chatData } = await supabaseAdmin
              .from("chats")
              .select("name, type")
              .eq("id", chatId)
              .maybeSingle();

            if (members && members.length > 0) {
              let previewText = content || "";
              if (type === "image") previewText = "[Image] " + (fileName || "Attachment");
              else if (type === "pdf") previewText = "[PDF] " + (fileName || "Attachment");
              else if (type === "file") previewText = "[File] " + (fileName || "Attachment");

              for (const member of members) {
                if (member.user_id !== senderId) {
                  const { data: newNotif } = await supabaseAdmin
                    .from("notifications")
                    .insert({
                      user_id: member.user_id,
                      sender_name: savedMessage.senderName,
                      chat_name: chatData?.name || null,
                      message_preview: previewText,
                      is_read: false,
                      chat_id: chatId
                    })
                    .select()
                    .single();

                  if (newNotif) {
                    const mapped = {
                      id: newNotif.id,
                      userId: newNotif.user_id,
                      senderName: newNotif.sender_name,
                      senderAvatar: sender?.avatar_url || null,
                      chatName: newNotif.chat_name,
                      messagePreview: newNotif.message_preview,
                      timestamp: newNotif.timestamp,
                      isRead: false,
                      chatId: newNotif.chat_id,
                      type: type || "message",
                      fileName: fileName || null
                    };
                    io.to(`user_${member.user_id}`).emit("notification_logged", mapped);
                  }
                }
              }
            }
          } catch (notifErr) {
            console.error("Failed to generate notifications for message recipients:", notifErr);
          }

          res.json(savedMessage);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Edit Message
      app.put("/api/messages/:messageId", async (req, res) => {
        const { messageId } = req.params;
        const { userId, content } = req.body;
        if (!userId || !content) {
          return res.status(400).json({ error: "Missing userId or content" });
        }
        try {
          const { data: msg } = await supabaseAdmin
            .from("messages")
            .select("sender_id, chat_id")
            .eq("id", messageId)
            .maybeSingle();

          if (!msg) return res.status(404).json({ error: "Message not found" });
          if (msg.sender_id !== userId) {
            return res.status(403).json({ error: "Only the author can edit this message" });
          }

          await supabaseAdmin
            .from("messages")
            .update({ content: content.trim(), is_edited: true })
            .eq("id", messageId);

          const { data: updated } = await supabaseAdmin
            .from("messages")
            .select("*, profiles!sender_id(display_name)")
            .eq("id", messageId)
            .single();

          const mappedUpdated = {
            id: updated.id,
            chatId: updated.chat_id,
            senderId: updated.sender_id,
            senderName: updated.profiles?.display_name || "Unknown",
            content: updated.content,
            type: updated.type,
            filePath: updated.file_path,
            fileName: updated.file_name,
            fileSize: updated.file_size,
            timestamp: updated.timestamp,
            isBroadcast: updated.is_broadcast,
            isEdited: updated.is_edited
          };

          io.to(`chat_${msg.chat_id}`).emit("message_updated", mappedUpdated);
          res.json(mappedUpdated);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Delete Message
      app.delete("/api/messages/:messageId", async (req, res) => {
        const { messageId } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "Missing userId" });
        try {
          const { data: msg } = await supabaseAdmin
            .from("messages")
            .select("sender_id, chat_id")
            .eq("id", messageId)
            .maybeSingle();

          if (!msg) return res.status(404).json({ error: "Message not found" });

          const { data: userObj } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

          if (msg.sender_id !== userId && userObj?.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
          }

          await supabaseAdmin.from("messages").delete().eq("id", messageId);
          io.to(`chat_${msg.chat_id}`).emit("message_deleted", { messageId, chatId: msg.chat_id });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // Clear All Chat Messages for a Chat
      app.delete("/api/chats/:chatId/messages", async (req, res) => {
        const { chatId } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "Missing userId" });
        try {
          // Verify user membership in chat
          const { data: member } = await supabaseAdmin
            .from("chat_members")
            .select("user_id")
            .eq("chat_id", chatId)
            .eq("user_id", userId)
            .maybeSingle();

          if (!member) {
            return res.status(403).json({ error: "Access denied. User is not a member of this chat." });
          }

          // Delete all messages in this chat from database
          const { error: deleteError } = await supabaseAdmin
            .from("messages")
            .delete()
            .eq("chat_id", chatId);

          if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
          }

          io.to(`chat_${chatId}`).emit("chat_cleared", { chatId });
          res.json({ success: true, message: "Chat messages cleared successfully" });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 5. File upload Endpoint (converts file buffer to Data URL to save directly in DB)
      app.post("/api/upload", upload.fields([{ name: "file", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), async (req, res) => {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        if (!files || !files.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const uploadedFile = files.file[0];
        const base64Data = uploadedFile.buffer.toString("base64");
        const fileUrl = `data:${uploadedFile.mimetype};base64,${base64Data}`;

        let thumbnailUrl = null;
        if (files.thumbnail && files.thumbnail[0]) {
          const thumbnailFile = files.thumbnail[0];
          const thumbBase64 = thumbnailFile.buffer.toString("base64");
          thumbnailUrl = `data:${thumbnailFile.mimetype};base64,${thumbBase64}`;
        }

        res.json({
          url: fileUrl,
          thumbnailUrl,
          fileName: uploadedFile.originalname,
          fileSize: uploadedFile.size,
          mimeType: uploadedFile.mimetype
        });
      });

      // 6. Broadcast endpoint
      app.post("/api/broadcasts", async (req, res) => {
        const { senderId, recipientIds, content, type, filePath, fileName, fileSize } = req.body;
        if (!senderId || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
          return res.status(400).json({ error: "Missing senderId or recipientIds" });
        }

        try {
          const { data: sender } = await supabaseAdmin
            .from("profiles")
            .select("display_name")
            .eq("id", senderId)
            .maybeSingle();

          const results = [];

          for (const recipientId of recipientIds) {
            // Find existing direct chat
            const { data: cm1 } = await supabaseAdmin
              .from("chat_members")
              .select("chat_id")
              .eq("user_id", senderId);
            const { data: cm2 } = await supabaseAdmin
              .from("chat_members")
              .select("chat_id")
              .eq("user_id", recipientId);

            let chatId: string | null = null;

            if (cm1 && cm2) {
              const ids1 = cm1.map((c) => c.chat_id);
              const ids2 = cm2.map((c) => c.chat_id);
              const common = ids1.filter((id) => ids2.includes(id));
              if (common.length > 0) {
                const { data: directChat } = await supabaseAdmin
                  .from("chats")
                  .select("id")
                  .in("id", common)
                  .eq("type", "direct")
                  .maybeSingle();
                if (directChat) chatId = directChat.id;
              }
            }

            if (!chatId) {
              const { data: newChat } = await supabaseAdmin
                .from("chats")
                .insert({ type: "direct" })
                .select()
                .single();

              if (newChat) {
                chatId = newChat.id;
                await supabaseAdmin.from("chat_members").insert([
                  { chat_id: chatId, user_id: senderId, role: "admin" },
                  { chat_id: chatId, user_id: recipientId, role: "member" }
                ]);

                const { data: memberProfiles } = await supabaseAdmin
                  .from("profiles")
                  .select("id, username, display_name, avatar_url, status")
                  .in("id", [senderId, recipientId]);

                const chatDetails = {
                  id: chatId,
                  name: null,
                  type: "direct",
                  avatarUrl: null,
                  createdAt: newChat.created_at,
                  members: (memberProfiles || []).map((m) => ({
                    id: m.id,
                    username: m.username,
                    displayName: m.display_name,
                    avatarUrl: m.avatar_url,
                    status: m.status
                  })),
                  lastMessage: null
                };
                io.to(`user_${recipientId}`).emit("chat_created", chatDetails);
                io.to(`user_${senderId}`).emit("chat_created", chatDetails);
              }
            }

            if (!chatId) continue;

            const { data: newMsg } = await supabaseAdmin
              .from("messages")
              .insert({
                chat_id: chatId,
                sender_id: senderId,
                content: content || null,
                type: type || "text",
                file_path: filePath || null,
                file_name: fileName || null,
                file_size: fileSize || null,
                is_broadcast: true
              })
              .select()
              .single();

            if (newMsg) {
              const savedMessage = {
                id: newMsg.id,
                chatId: newMsg.chat_id,
                senderId,
                senderName: sender?.display_name || "Unknown",
                content: newMsg.content,
                type: newMsg.type,
                filePath: newMsg.file_path,
                fileName: newMsg.file_name,
                fileSize: newMsg.file_size,
                timestamp: newMsg.timestamp,
                isBroadcast: true
              };
              io.to(`chat_${chatId}`).emit("message_received", savedMessage);
              io.to(`user_${recipientId}`).emit("message_received", savedMessage);

              const previewText = "[Broadcast] " + (newMsg.content || (newMsg.type === "image" ? "[Image]" : newMsg.type === "pdf" ? "[PDF]" : "[File]"));

              const { data: notifRow } = await supabaseAdmin
                .from("notifications")
                .insert({
                  user_id: recipientId,
                  sender_name: sender?.display_name || "Bureau Admin",
                  chat_name: "Broadcast Channel",
                  message_preview: previewText,
                  chat_id: chatId,
                  is_read: false
                })
                .select()
                .single();

              if (notifRow) {
                const notifLog = {
                  id: notifRow.id,
                  userId: recipientId,
                  senderName: sender?.display_name || "Bureau Admin",
                  chatName: "Broadcast Channel",
                  messagePreview: previewText,
                  timestamp: notifRow.timestamp,
                  isRead: false,
                  chatId: chatId,
                  type: "broadcast",
                  fileName: newMsg.file_name || null
                };
                io.to(`user_${recipientId}`).emit("notification_logged", notifLog);
              }

              results.push(savedMessage);
            }
          }

          res.json({ success: true, messages: results });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 7. Calendar Endpoints
      app.get("/api/calendar", async (req, res) => {
        try {
          const { data: events, error } = await supabaseAdmin
            .from("calendar_events")
            .select("*");

          if (error) return res.status(500).json({ error: error.message });

          const mapped = (events || []).map((ev) => ({
            id: ev.id,
            title: ev.title,
            description: ev.description,
            startTime: ev.start_time,
            endTime: ev.end_time,
            creatorId: ev.creator_id,
            attendees: ev.attendees || [],
            color: ev.color
          }));
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.post("/api/calendar", async (req, res) => {
        const { title, description, startTime, endTime, creatorId, attendees, color } = req.body;
        if (!title || !startTime || !endTime || !creatorId) {
          return res.status(400).json({ error: "Missing title, start, end, or creatorId" });
        }

        const { data: user } = await supabaseAdmin
          .from("profiles")
          .select("role, can_edit_calendar")
          .eq("id", creatorId)
          .maybeSingle();
        if (!user || (user.role !== "admin" && !user.can_edit_calendar)) {
          return res.status(403).json({ error: "Access denied." });
        }

        try {
          const { data: newEvent, error } = await supabaseAdmin
            .from("calendar_events")
            .insert({
              title,
              description: description || null,
              start_time: startTime,
              end_time: endTime,
              creator_id: creatorId,
              attendees: attendees || [],
              color: color || "#4f73ff"
            })
            .select()
            .single();

          if (error || !newEvent) {
            return res.status(500).json({ error: error?.message || "Failed to create event" });
          }

          const mapped = {
            id: newEvent.id,
            title: newEvent.title,
            description: newEvent.description,
            startTime: newEvent.start_time,
            endTime: newEvent.end_time,
            creatorId: newEvent.creator_id,
            attendees: newEvent.attendees || [],
            color: newEvent.color
          };

          io.emit("calendar_event_created", mapped);
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.put("/api/calendar/:eventId", async (req, res) => {
        const { eventId } = req.params;
        const { title, description, startTime, endTime, userId, attendees, color } = req.body;

        const { data: user } = await supabaseAdmin
          .from("profiles")
          .select("role, can_edit_calendar")
          .eq("id", userId)
          .maybeSingle();
        if (!user || (user.role !== "admin" && !user.can_edit_calendar)) {
          return res.status(403).json({ error: "Access denied." });
        }

        try {
          const { data: updatedRow, error } = await supabaseAdmin
            .from("calendar_events")
            .update({
              title,
              description: description || null,
              start_time: startTime,
              end_time: endTime,
              attendees: attendees || [],
              color: color || "#4f73ff"
            })
            .eq("id", eventId)
            .select()
            .single();

          if (error || !updatedRow) {
            return res.status(500).json({ error: error?.message || "Failed to update calendar event" });
          }

          const updatedEvent = {
            id: updatedRow.id,
            title: updatedRow.title,
            description: updatedRow.description,
            startTime: updatedRow.start_time,
            endTime: updatedRow.end_time,
            creatorId: updatedRow.creator_id,
            attendees: updatedRow.attendees || [],
            color: updatedRow.color
          };

          io.emit("calendar_event_updated", updatedEvent);
          res.json(updatedEvent);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.delete("/api/calendar/:eventId", async (req, res) => {
        const { eventId } = req.params;
        const { userId } = req.body;

        const { data: user } = await supabaseAdmin
          .from("profiles")
          .select("role, can_edit_calendar")
          .eq("id", userId)
          .maybeSingle();
        if (!user || (user.role !== "admin" && !user.can_edit_calendar)) {
          return res.status(403).json({ error: "Access denied." });
        }

        try {
          await supabaseAdmin.from("calendar_events").delete().eq("id", eventId);
          io.emit("calendar_event_deleted", { eventId });
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 8. Notifications
      app.get("/api/notifications", async (req, res) => {
        const userId = req.query.userId as string;
        if (!userId) return res.status(400).json({ error: "userId required" });
        try {
          const { data, error } = await supabaseAdmin
            .from("notifications")
            .select("*")
            .eq("user_id", userId)
            .order("timestamp", { ascending: false })
            .limit(100);

          if (error) return res.status(500).json({ error: error.message });

          const mapped = (data || []).map((n) => ({
            id: n.id,
            userId: n.user_id,
            senderName: n.sender_name,
            chatName: n.chat_name,
            messagePreview: n.message_preview,
            timestamp: n.timestamp,
            isRead: n.is_read,
            chatId: n.chat_id
          }));
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.post("/api/notifications", async (req, res) => {
        const { userId, senderName, chatName, messagePreview, chatId } = req.body;
        if (!userId || !senderName || !messagePreview || !chatId) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        try {
          const { data: newNotif, error } = await supabaseAdmin
            .from("notifications")
            .insert({
              user_id: userId,
              sender_name: senderName,
              chat_name: chatName || null,
              message_preview: messagePreview,
              is_read: false,
              chat_id: chatId
            })
            .select()
            .single();

          if (error || !newNotif) {
            return res.status(500).json({ error: error?.message || "Failed to create notification" });
          }

          const mapped = {
            id: newNotif.id,
            userId: newNotif.user_id,
            senderName: newNotif.sender_name,
            chatName: newNotif.chat_name,
            messagePreview: newNotif.message_preview,
            timestamp: newNotif.timestamp,
            isRead: false,
            chatId: newNotif.chat_id
          };

          io.to(`user_${userId}`).emit("notification_logged", mapped);
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.put("/api/notifications/read", async (req, res) => {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "userId required" });
        try {
          await supabaseAdmin
            .from("notifications")
            .update({ is_read: true })
            .eq("user_id", userId);
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      // 9. Archive Endpoints (NEW)
      app.get("/api/archive", async (req, res) => {
        const userId = req.query.userId as string;
        if (!userId) return res.status(400).json({ error: "userId required" });
        try {
          const { data: userProfile } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

          let query = supabaseAdmin
            .from("archive_items")
            .select("*, profiles!user_id(display_name, username)")
            .order("created_at", { ascending: false });

          // Non-admins only see their own items
          if (userProfile?.role !== "admin") {
            query = query.eq("user_id", userId);
          }

          const { data, error } = await query;
          if (error) return res.status(500).json({ error: error.message });

          const mapped = (data || []).map((item: any) => ({
            id: item.id,
            userId: item.user_id,
            userName: item.profiles?.display_name || item.profiles?.username || "Unknown",
            title: item.title,
            description: item.description,
            category: item.category,
            filePath: item.file_path,
            fileName: item.file_name,
            fileSize: item.file_size,
            createdAt: item.created_at,
            updatedAt: item.updated_at
          }));
          res.json(mapped);
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.post("/api/archive", async (req, res) => {
        const { userId, title, description, category, filePath, fileName, fileSize } = req.body;
        if (!userId || !title) {
          return res.status(400).json({ error: "userId and title required" });
        }
        try {
          const { data: newItem, error } = await supabaseAdmin
            .from("archive_items")
            .insert({
              user_id: userId,
              title,
              description: description || null,
              category: category || "general",
              file_path: filePath || null,
              file_name: fileName || null,
              file_size: fileSize || null
            })
            .select("*, profiles!user_id(display_name, username)")
            .single();

          if (error || !newItem) {
            return res.status(500).json({ error: error?.message || "Failed to create archive item" });
          }

          res.json({
            id: newItem.id,
            userId: newItem.user_id,
            userName: newItem.profiles?.display_name || "Unknown",
            title: newItem.title,
            description: newItem.description,
            category: newItem.category,
            filePath: newItem.file_path,
            fileName: newItem.file_name,
            fileSize: newItem.file_size,
            createdAt: newItem.created_at,
            updatedAt: newItem.updated_at
          });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      app.delete("/api/archive/:itemId", async (req, res) => {
        const { itemId } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: "userId required" });
        try {
          const { data: item } = await supabaseAdmin
            .from("archive_items")
            .select("user_id")
            .eq("id", itemId)
            .maybeSingle();

          if (!item) return res.status(404).json({ error: "Item not found" });

          const { data: userProfile } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", userId)
            .maybeSingle();

          if (item.user_id !== userId && userProfile?.role !== "admin") {
            return res.status(403).json({ error: "Access denied" });
          }

          await supabaseAdmin.from("archive_items").delete().eq("id", itemId);
          res.json({ success: true });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      });

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`Port ${port} is already in use by an active server. Proceeding with existing server instance.`);
          resolve({ server, io });
        } else {
          reject(err);
        }
      });

      server.listen(port, () => {
        console.log(`Server is listening on port ${port}`);
        resolve({ server, io });
      });
    } catch (err) {
      reject(err);
    }
  });

}
