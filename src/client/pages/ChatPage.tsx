import React, { useState, useEffect, useRef } from "react";
import { useAuth, User } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useNotifications } from "../context/NotificationContext";
import { Lightbox } from "../components/Lightbox";
import * as pdfjsLib from "pdfjs-dist";
import {
  MoreVertical,
  Volume2,
  VolumeX,
  Loader2,
  Trash2,
  UserPlus
} from "lucide-react";

// Safe PDF.js Bundler resolution for both dev and production targets
const pdfjs = (pdfjsLib as any).GlobalWorkerOptions ? pdfjsLib : (pdfjsLib as any).default || pdfjsLib;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface ChatMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: "online" | "away" | "dnd" | "offline";
  lastSeen?: string;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  content: string | null;
  type: "text" | "image" | "pdf" | "file";
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  timestamp: string;
  isBroadcast: boolean | number;
  isEdited?: boolean | number;
}

interface Chat {
  id: string;
  name: string | null;
  type: "direct" | "group" | "broadcast";
  avatarUrl: string | null;
  createdAt: string;
  members: ChatMember[];
  lastMessage: {
    id: string;
    content: string | null;
    type: "text" | "image" | "pdf" | "file";
    senderId: string;
    timestamp: string;
    fileName: string | null;
    fileSize: number | null;
  } | null;
}

interface ChatPageProps {
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
}

export const ChatPage: React.FC<ChatPageProps> = ({ selectedChatId, setSelectedChatId }) => {
  const { user, serverUrl } = useAuth();
  const { socket } = useSocket();
  const { mutedChats, toggleMuteChat, triggerNotification } = useNotifications();

  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [chatSearch, setChatSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);

  // Message compose & edit
  const [messageText, setMessageText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [username: string]: boolean }>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // UI Modals / Toggles
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedGroupUsers, setSelectedGroupUsers] = useState<string[]>([]);

  // Add/Remove members state
  const [showAddMember, setShowAddMember] = useState(false);

  // File preview lightbox
  const [lightboxData, setLightboxData] = useState<{
    isOpen: boolean;
    fileUrl: string;
    fileName: string;
    fileType: "image" | "pdf";
  }>({ isOpen: false, fileUrl: "", fileName: "", fileType: "image" });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all chats
  const loadChats = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/chats?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        // filter out broadcast chats and invalid direct chats without a valid recipient
        const chatList = data.filter((c: Chat) => {
          if (c.type === "broadcast") return false;
          if (c.type === "direct") {
            const otherMember = c.members.find((m) => m.id !== user.id);
            if (!otherMember) return false;
          }
          return true;
        });
        setChats(chatList);
      }
    } catch (e) {
      console.error("Failed to load chats:", e);
    }
  };


  // Fetch users list for group creation
  const loadUsers = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.filter((u: any) => u.id !== user?.id && u.isDisabled !== 1));
      }
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  };

  // Load chat messages
  const loadMessages = async (chatId: string) => {
    try {
      const response = await fetch(`${serverUrl}/api/chats/${chatId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  };

  useEffect(() => {
    loadChats();
    loadUsers();
  }, [user]);

  // Load messages when selectedChatId changes
  useEffect(() => {
    if (selectedChatId) {
      const chat = chats.find((c) => c.id === selectedChatId);
      if (chat) {
        setActiveChat(chat);
        loadMessages(chat.id);
        if (socket) {
          socket.emit("join_chat", { chatId: chat.id });
        }
      } else {
        // Chat not in local state yet — fetch its metadata from the server
        // so the panel can render (activeChat must be set for the right panel to show)
        const fetchAndActivateChat = async () => {
          try {
            const res = await fetch(`${serverUrl}/api/chats?userId=${user?.id}`);
            if (res.ok) {
              const allChats: Chat[] = await res.json();
              const found = allChats.find((c) => c.id === selectedChatId);
              if (found) {
                setChats((prev) => {
                  if (prev.some((c) => c.id === found.id)) return prev;
                  return [...prev, found];
                });
                setActiveChat(found);
              }
            }
          } catch (e) {
            console.error("Failed to fetch chat metadata for selectedChatId:", selectedChatId, e);
          }
          loadMessages(selectedChatId);
          if (socket) {
            socket.emit("join_chat", { chatId: selectedChatId });
          }
        };
        fetchAndActivateChat();
      }
    } else {
      setActiveChat(null);
      setMessages([]);
    }
  }, [selectedChatId, chats]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket listeners for message handling
  useEffect(() => {
    if (!socket || !user) return;

    const handleMessageReceived = (msg: Message) => {
      if (activeChat && msg.chatId === activeChat.id) {
        setMessages((prev) => [...prev, msg]);
        setChats((prev) =>
          prev.map((c) =>
            c.id === msg.chatId
              ? {
                  ...c,
                  lastMessage: {
                    id: msg.id,
                    content: msg.content,
                    type: msg.type,
                    senderId: msg.senderId,
                    timestamp: msg.timestamp,
                    fileName: msg.fileName,
                    fileSize: msg.fileSize
                  }
                }
              : c
          )
        );
      } else {
        loadChats();
      }
    };

    const handleTypingStatus = ({ chatId, username, isTyping }: any) => {
      if (activeChat && chatId === activeChat.id && username !== user.username) {
        setTypingUsers((prev) => ({ ...prev, [username]: isTyping }));
      }
    };

    const handleChatCreated = (newChat: Chat) => {
      setChats((prev) => [newChat, ...prev]);
    };

    const handleMembersUpdated = ({ chatId, members }: any) => {
      if (activeChat && chatId === activeChat.id) {
        setActiveChat((prev) => (prev ? { ...prev, members } : null));
      }
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, members } : c)));
    };

    const handleChatDetailsUpdated = ({ chatId, name, avatarUrl }: any) => {
      if (activeChat && chatId === activeChat.id) {
        setActiveChat((prev) => (prev ? { ...prev, name, avatarUrl } : null));
      }
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, name, avatarUrl } : c))
      );
    };

    const handleStatusChange = ({ userId, status }: any) => {
      setChats((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((m) => (m.id === userId ? { ...m, status } : m))
        }))
      );
      if (activeChat) {
        setActiveChat((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.map((m) => (m.id === userId ? { ...m, status } : m))
              }
            : null
        );
      }
    };

    const handleMessageUpdated = (updatedMsg: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
      loadChats();
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      loadChats();
    };

    const handleChatCleared = ({ chatId }: { chatId: string }) => {
      if (activeChat && activeChat.id === chatId) {
        setMessages([]);
      }
      loadChats();
    };

    socket.on("message_received", handleMessageReceived);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("chat_cleared", handleChatCleared);
    socket.on("typing_status", handleTypingStatus);
    socket.on("chat_created", handleChatCreated);
    socket.on("members_updated", handleMembersUpdated);
    socket.on("chat_details_updated", handleChatDetailsUpdated);
    socket.on("status_change", handleStatusChange);

    return () => {
      socket.off("message_received", handleMessageReceived);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("chat_cleared", handleChatCleared);
      socket.off("typing_status", handleTypingStatus);
      socket.off("chat_created", handleChatCreated);
      socket.off("members_updated", handleMembersUpdated);
      socket.off("chat_details_updated", handleChatDetailsUpdated);
      socket.off("status_change", handleStatusChange);
    };
  }, [socket, activeChat, chats, user]);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);

    if (!socket || !activeChat || !user) return;

    socket.emit("typing", {
      chatId: activeChat.id,
      userId: user.id,
      username: user.displayName,
      isTyping: true
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        chatId: activeChat.id,
        userId: user.id,
        username: user.displayName,
        isTyping: false
      });
    }, 1500);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !activeChat || !user) return;

    try {
      const text = messageText.trim();
      setMessageText("");
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket?.emit("typing", {
        chatId: activeChat.id,
        userId: user.id,
        username: user.displayName,
        isTyping: false
      });

      await fetch(`${serverUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChat.id,
          senderId: user.id,
          content: text,
          type: "text"
        })
      });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const generateImageThumbnail = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 250;
          const MAX_HEIGHT = 180;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Image thumbnail generation failed"));
            },
            "image/jpeg",
            0.7
          );
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const generatePdfThumbnail = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 0.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context extraction failed");

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("PDF thumbnail generation failed"));
        },
        "image/jpeg",
        0.75
      );
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !user) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      let msgType: Message["type"] = "file";
      if (file.type.startsWith("image/")) {
        msgType = "image";
        try {
          const thumbBlob = await generateImageThumbnail(file);
          formData.append("thumbnail", thumbBlob, "thumbnail.jpg");
        } catch (e) {
          console.error("Failed to generate image preview, uploading default", e);
        }
      } else if (file.type === "application/pdf") {
        msgType = "pdf";
        try {
          const thumbBlob = await generatePdfThumbnail(file);
          formData.append("thumbnail", thumbBlob, "thumbnail.jpg");
        } catch (e) {
          console.error("Failed to generate PDF preview, uploading default", e);
        }
      }

      const response = await fetch(`${serverUrl}/api/upload`, {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        const fileData = await response.json();
        await fetch(`${serverUrl}/api/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: activeChat.id,
            senderId: user.id,
            type: msgType,
            filePath: fileData.url,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize
          })
        });
      }
    } catch (error) {
      console.error("File upload error:", error);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedGroupUsers.length === 0 || !user) return;

    try {
      const memberList = [user.id, ...selectedGroupUsers];
      const response = await fetch(`${serverUrl}/api/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          type: "group",
          members: memberList,
          creatorId: user.id
        })
      });

      if (response.ok) {
        const newGroup = await response.json();
        setGroupName("");
        setSelectedGroupUsers([]);
        setShowCreateGroup(false);
        setSelectedChatId(newGroup.id);
      }
    } catch (e) {
      console.error("Group creation failed:", e);
    }
  };

  const toggleGroupUserSelection = (userId: string) => {
    setSelectedGroupUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const startDirectChat = async (targetUser: User) => {
    if (!user) return;

    // Check if chat already exists in local state
    const existing = chats.find(
      (c) => c.type === "direct" && c.members.some((m) => m.id === targetUser.id)
    );
    if (existing) {
      setSelectedChatId(existing.id);
      setActiveChat(existing);
      loadMessages(existing.id);
      if (socket) {
        socket.emit("join_chat", { chatId: existing.id });
      }
      return;
    }

    try {
      const response = await fetch(`${serverUrl}/api/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "direct",
          members: [user.id, targetUser.id],
          creatorId: user.id
        })
      });
      if (response.ok) {
        const chat = await response.json();
        setChats((prev) => {
          if (prev.some((c) => c.id === chat.id)) return prev;
          return [...prev, chat];
        });
        setSelectedChatId(chat.id);
        setActiveChat(chat);
        loadMessages(chat.id);
        if (socket) {
          socket.emit("join_chat", { chatId: chat.id });
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error("startDirectChat: server returned error", response.status, errData);
      }
    } catch (e) {
      console.error("Direct chat initiation failed:", e);
    }
  };

  const handleAddMemberToGroup = async (targetUserId: string) => {
    if (!activeChat || !user) return;
    try {
      const response = await fetch(`${serverUrl}/api/chats/${activeChat.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "add",
          targetUserId
        })
      });
      if (response.ok) {
        setShowAddMember(false);
        loadChats();
      }
    } catch (e) {
      console.error("Failed to add user to group:", e);
    }
  };

  const handleClearChat = async () => {
    if (!activeChat || !user) return;
    const confirmed = window.confirm("Are you sure you want to clear all messages in this chat? All messages will be permanently deleted from the database.");
    if (!confirmed) return;

    try {
      const res = await fetch(`${serverUrl}/api/chats/${activeChat.id}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });

      if (res.ok) {
        setMessages([]);
        loadChats();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to clear chat");
      }
    } catch (err) {
      console.error("Failed to clear chat:", err);
    }
  };

  const handleRemoveMemberFromGroup = async (targetUserId: string) => {
    if (!activeChat || !user) return;
    try {
      const response = await fetch(`${serverUrl}/api/chats/${activeChat.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          action: "remove",
          targetUserId
        })
      });
      if (response.ok) {
        loadChats();
      }
    } catch (e) {
      console.error("Failed to remove user from group:", e);
    }
  };

  const handleEditMessage = (msgId: string, content: string) => {
    setEditingMessageId(msgId);
    setEditingText(content);
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editingText.trim() || !user) return;
    try {
      const response = await fetch(`${serverUrl}/api/messages/${msgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          content: editingText.trim()
        })
      });
      if (response.ok) {
        setEditingMessageId(null);
        setEditingText("");
      }
    } catch (e) {
      console.error("Failed to edit message:", e);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to permanently delete this message?")) return;
    try {
      await fetch(`${serverUrl}/api/messages/${msgId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id
        })
      });
    } catch (e) {
      console.error("Failed to delete message:", e);
    }
  };

  const getChatDisplayName = (chat: Chat) => {
    if (chat.type === "group") return chat.name;
    const otherMember = chat.members.find((m) => m.id !== user?.id);
    return otherMember ? otherMember.displayName : "Direct Message";
  };

  const getChatPresence = (chat: Chat) => {
    if (chat.type === "group") return `${chat.members.length} members`;
    const otherMember = chat.members.find((m) => m.id !== user?.id);
    if (!otherMember) return "";
    return otherMember.status === "online"
      ? "Active Now"
      : otherMember.status === "away"
      ? "Away"
      : otherMember.status === "dnd"
      ? "Do Not Disturb"
      : "Offline";
  };

  const getChatAvatarSymbol = (chat: Chat) => {
    if (chat.type === "group") {
      return (
        <span className="material-symbols-outlined text-[18px] text-primary">group</span>
      );
    }
    const otherMember = chat.members.find((m) => m.id !== user?.id);
    return otherMember?.status === "online" ? (
      <span className="w-2.5 h-2.5 rounded-full bg-success-moss shrink-0"></span>
    ) : (
      <span className="w-2.5 h-2.5 rounded-full border border-success-moss shrink-0"></span>
    );
  };

  const getMessageTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const filteredChats = chats.filter((c) =>
    getChatDisplayName(c)?.toLowerCase().includes(chatSearch.toLowerCase())
  );

  const filteredMessages = messages.filter((m) =>
    m.content?.toLowerCase().includes(messageSearch.toLowerCase())
  );

  const showMessagesList = showMsgSearch ? filteredMessages : messages;

  return (
    <div className="flex-1 flex overflow-hidden bg-paper text-ink relative h-full">
      {/* 2. THE CHANNEL SIDEBAR (260px) */}
      <aside className="w-[260px] flex flex-col bg-sidebar-bone border-r border-line-hairline shrink-0 h-full">
        <div className="h-16 flex items-center px-6 border-b border-line-hairline shrink-0">
          <div>
            <h1 className="font-header-title text-header-title text-primary italic">Bureau Ledger</h1>
            <p className="font-label-caps text-[9px] text-ink-muted uppercase tracking-widest leading-none mt-1">
              Correspondence
            </p>
          </div>
        </div>

        <div className="p-4 border-b border-line-hairline">
          <button
            onClick={() => {
              if (user?.role === "admin") {
                setShowCreateGroup(true);
              } else {
                alert("Access Denied: Only Administrators can create new Group channels.");
              }
            }}
            className={`w-full py-2.5 px-3.5 rounded-xl transition-all text-left flex items-center justify-between shadow-sm ${
              user?.role === "admin"
                ? "bg-primary text-on-primary hover:bg-primary-container font-semibold cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-400 cursor-not-allowed opacity-75 border border-line-hairline"
            }`}
            title={user?.role === "admin" ? "Create a new group chat" : "Only Administrators can create group channels"}
          >
            <span className="flex items-center gap-2 font-ui-label text-xs">
              <span className="material-symbols-outlined text-sm">group_add</span>
              <span>New Group</span>
            </span>
            {user?.role === "admin" ? (
              <span className="material-symbols-outlined text-sm">add</span>
            ) : (
              <span className="text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Admin Only
              </span>
            )}
          </button>
        </div>

        {/* Chats lists */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-4 py-4">
          <div>
            <div className="px-4 py-1.5 text-ink-muted font-ui-label text-[10px] uppercase tracking-widest font-black">
              Search Conversations
            </div>
            <div className="px-2 mt-1 mb-2">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-xs">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Find chat or user..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-line-hairline rounded-lg font-ui-label text-xs outline-none focus:ring-1 focus:ring-primary/30 text-ink placeholder-ink-muted/50"
                />
              </div>
            </div>
          </div>

          {/* Group Channels Section */}
          <div className="space-y-1">
            <div className="px-4 py-1.5 text-ink-muted font-ui-label text-[10px] uppercase tracking-widest font-black flex items-center justify-between">
              <span>Group Channels</span>
              <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded-full">
                {filteredChats.filter((c) => c.type === "group").length}
              </span>
            </div>

            {filteredChats
              .filter((c) => c.type === "group")
              .map((chat) => {
                const isSelected = selectedChatId === chat.id;
                const isMuted = mutedChats.includes(chat.id);

                return (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all relative overflow-hidden ${
                      isSelected
                        ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-bold border-l-4 border-emerald-500"
                        : "text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/30 shrink-0">
                      <span className="material-symbols-outlined text-[16px]">groups</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-ui-label text-xs truncate font-semibold">
                          {chat.name || "Group Channel"}
                        </p>
                        <span className="text-[8px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.2 rounded-full shrink-0">
                          Group
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-ink-muted/80 mt-0.5">
                        <span className="truncate max-w-[120px]">
                          {chat.members.length} members
                        </span>
                        {isMuted && (
                          <span className="material-symbols-outlined text-[12px] text-slate-400">volume_off</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

            {filteredChats.filter((c) => c.type === "group").length === 0 && (
              <p className="text-[10px] text-ink-muted/60 px-4 py-2 italic">No group channels created yet</p>
            )}
          </div>

          {/* Real Coworkers Direct Messages Directory */}
          <div className="space-y-1 pt-2">
            <div className="px-4 py-1.5 text-ink-muted font-ui-label text-[10px] uppercase tracking-widest font-black flex items-center justify-between">
              <span>Coworkers & DMs</span>
              <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded-full">
                {availableUsers.length}
              </span>
            </div>

            {availableUsers
              .filter((u) => u.displayName.toLowerCase().includes(chatSearch.toLowerCase()) || (u.post && u.post.toLowerCase().includes(chatSearch.toLowerCase())))
              .map((u) => {
                const directChat = chats.find(
                  (c) => c.type === "direct" && c.members.some((m) => m.id === u.id)
                );
                const isSelected = selectedChatId && directChat && selectedChatId === directChat.id;

                return (
                  <button
                    key={u.id}
                    onClick={() => startDirectChat(u)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all relative overflow-hidden group ${
                      isSelected
                        ? "bg-blue-500/10 text-blue-900 dark:text-blue-200 font-bold border-l-4 border-blue-500"
                        : "text-ink-muted hover:bg-slate-100 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${
                          u.status === "online"
                            ? "bg-emerald-500"
                            : u.status === "away"
                            ? "bg-amber-500"
                            : u.status === "dnd"
                            ? "bg-rose-500"
                            : "bg-slate-400"
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-ui-label text-xs truncate font-semibold group-hover:text-primary transition-colors">
                          {u.displayName}
                        </p>
                        {u.post && (
                          <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.2 rounded shrink-0 truncate max-w-[90px]">
                            {u.post}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-ink-muted/80 mt-0.5">
                        <span className="truncate max-w-[130px]">
                          {directChat?.lastMessage
                            ? directChat.lastMessage.content || "[File Attachment]"
                            : u.status === "online"
                            ? "Active Now"
                            : "Direct Message"}
                        </span>
                        {directChat?.lastMessage && (
                          <span className="text-[9px] text-slate-400 font-mono">
                            {getMessageTime(directChat.lastMessage.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

            {availableUsers.length === 0 && (
              <p className="text-[10px] text-ink-muted/60 px-4 py-2 italic">No registered coworkers</p>
            )}
          </div>

        </nav>
      </aside>


      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full bg-paper min-w-0">
        {activeChat ? (
          <>
            {/* TOP APP BAR */}
            <header className="h-16 flex justify-between items-center px-gutter border-b border-line-hairline bg-paper shrink-0 z-35">
              <div className="flex items-center gap-4 min-w-0">
                <h2 className="font-header-title text-header-title italic text-ink truncate">
                  {activeChat.type === "group" ? "# " : ""}
                  {getChatDisplayName(activeChat)}
                </h2>
                <div className="h-4 w-[1px] bg-line-hairline"></div>
                <span className="font-ui-label text-caption text-ink-muted truncate">
                  {getChatPresence(activeChat)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleMuteChat(activeChat.id)}
                  className={`p-2 rounded hover:bg-surface-container transition-colors ${
                    mutedChats.includes(activeChat.id) ? "text-red-500" : "text-ink-muted"
                  }`}
                  title={mutedChats.includes(activeChat.id) ? "Unmute" : "Mute"}
                >
                  <span className="material-symbols-outlined">
                    {mutedChats.includes(activeChat.id) ? "volume_off" : "volume_up"}
                  </span>
                </button>

                <button
                  onClick={() => setShowMsgSearch(!showMsgSearch)}
                  className={`p-2 rounded hover:bg-surface-container transition-colors ${
                    showMsgSearch ? "text-primary bg-surface-container" : "text-ink-muted"
                  }`}
                  title="Search Messages"
                >
                  <span className="material-symbols-outlined">search</span>
                </button>

                <button
                  onClick={handleClearChat}
                  className="p-2 rounded hover:bg-red-500/10 text-ink-muted hover:text-red-500 transition-colors flex items-center gap-1 text-xs font-semibold"
                  title="Clear Chat"
                >
                  <span className="material-symbols-outlined text-lg">delete_sweep</span>
                </button>

                <button
                  onClick={() => setShowChatInfo(!showChatInfo)}
                  className={`p-2 rounded hover:bg-surface-container transition-colors ${
                    showChatInfo ? "text-primary bg-surface-container" : "text-ink-muted"
                  }`}
                  title="Information"
                >
                  <span className="material-symbols-outlined">info</span>
                </button>
              </div>
            </header>

            {/* Inline message search bar */}
            {showMsgSearch && (
              <div className="p-3 border-b border-line-hairline bg-sidebar-bone/20 flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-ink-muted text-sm">search</span>
                <input
                  type="text"
                  placeholder="Filter messages in this conversation..."
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none text-xs focus:outline-none placeholder-ink-muted/50"
                />
                {messageSearch && (
                  <button
                    onClick={() => setMessageSearch("")}
                    className="text-xs text-ink-muted hover:text-ink font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* CONTENT FEED */}
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-8 select-text">
              <div className="max-w-3xl mx-auto space-y-8">
                {showMessagesList.length === 0 ? (
                  <div className="text-center py-20 text-ink-muted">
                    <span className="material-symbols-outlined text-4xl stroke-1 opacity-50 block mb-2">
                      chat_bubble
                    </span>
                    <p className="font-ui-label text-caption">No messages in this chat yet</p>
                  </div>
                ) : (
                  showMessagesList.map((msg, index) => {
                    const isCurrentUser = msg.senderId === user?.id;
                    const senderObj = availableUsers.find((u) => u.id === msg.senderId);

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2.5 group items-end max-w-full ${
                          isCurrentUser ? "flex-row-reverse self-end" : "flex-row self-start"
                        }`}
                      >
                        {/* Avatar */}
                        {!isCurrentUser && (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center text-xs shrink-0 shadow-sm border border-line-hairline mb-1">
                            {msg.senderName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        {/* Message Bubble Container */}
                        <div className={`flex flex-col max-w-[70%] ${isCurrentUser ? "items-end" : "items-start"}`}>
                          {/* Sender Name & Role Tag (for received messages in group/direct) */}
                          {!isCurrentUser && (
                            <div className="flex items-center gap-1.5 px-1 mb-1">
                              <span className="font-ui-label text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {msg.senderName}
                              </span>
                              {senderObj?.post && (
                                <span className="text-[8px] font-bold bg-primary/10 text-primary px-1.5 py-0.2 rounded uppercase">
                                  {senderObj.post}
                                </span>
                              )}
                            </div>
                          )}

                          {/* WhatsApp Style Bubble */}
                          <div
                            className={`relative px-4 py-2.5 rounded-2xl shadow-sm text-sm ${
                              isCurrentUser
                                ? "bg-primary text-on-primary rounded-br-xs"
                                : "bg-white dark:bg-slate-800 text-ink border border-line-hairline rounded-bl-xs"
                            }`}
                          >
                            {/* Text Message */}
                            {msg.type === "text" && (
                              editingMessageId === msg.id ? (
                                <div className="space-y-2 min-w-[220px]">
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="w-full bg-paper border border-line-hairline rounded p-2 focus:ring-1 focus:ring-primary outline-none text-xs text-ink"
                                    rows={2}
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setEditingMessageId(null)}
                                      className="px-2 py-0.5 text-[10px] border border-line-hairline rounded hover:bg-slate-100 text-ink"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(msg.id)}
                                      className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-semibold"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap select-text leading-relaxed">
                                  {msg.content}
                                  {Boolean(msg.isEdited) && (
                                    <span className="text-[9px] opacity-75 italic ml-1.5 select-none">(edited)</span>
                                  )}
                                </p>
                              )
                            )}

                            {/* Image Attachment */}
                            {msg.type === "image" && msg.filePath && (
                              <div
                                onClick={() =>
                                  setLightboxData({
                                    isOpen: true,
                                    fileUrl: msg.filePath!,
                                    fileName: msg.fileName!,
                                    fileType: "image"
                                  })
                                }
                                className="cursor-pointer"
                              >
                                <img
                                  src={msg.filePath.startsWith("data:") || msg.filePath.startsWith("http:") || msg.filePath.startsWith("https:") ? msg.filePath : `${serverUrl}${msg.filePath}`}
                                  alt={msg.fileName || "Image"}
                                  className="max-w-[260px] max-h-[180px] rounded-xl object-cover shadow-sm hover:opacity-90 transition-opacity"
                                />
                                <div className="text-[10px] opacity-80 mt-1 truncate max-w-[240px]">
                                  {msg.fileName}
                                </div>
                              </div>
                            )}

                            {/* PDF Attachment */}
                            {msg.type === "pdf" && msg.filePath && (
                              <div
                                onClick={() =>
                                  setLightboxData({
                                    isOpen: true,
                                    fileUrl: msg.filePath!,
                                    fileName: msg.fileName!,
                                    fileType: "pdf"
                                  })
                                }
                                className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer ${
                                  isCurrentUser ? "bg-white/10 hover:bg-white/20" : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold truncate">{msg.fileName}</p>
                                  <p className="text-[10px] opacity-75">{msg.fileSize ? formatBytes(msg.fileSize) : ""} • PDF</p>
                                </div>
                              </div>
                            )}

                            {/* File Attachment */}
                            {msg.type === "file" && msg.filePath && (
                              <a
                                href={msg.filePath.startsWith("data:") || msg.filePath.startsWith("http:") || msg.filePath.startsWith("https:") ? msg.filePath : `${serverUrl}${msg.filePath}`}
                                download={msg.fileName || "File"}
                                className={`p-3 rounded-xl flex items-center gap-3 ${
                                  isCurrentUser ? "bg-white/10 hover:bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-ink"
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="material-symbols-outlined text-2xl">download</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold truncate">{msg.fileName}</p>
                                  <p className="text-[10px] opacity-75">{msg.fileSize ? formatBytes(msg.fileSize) : ""} • Attachment</p>
                                </div>
                              </a>
                            )}

                            {/* Time & Action Controls */}
                            <div className="flex items-center justify-end gap-1.5 mt-1 text-[9px] opacity-75 select-none">
                              <span>{getMessageTime(msg.timestamp)}</span>
                              
                              {/* Hover Edit/Delete Action Controls */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-1">
                                {isCurrentUser && msg.type === "text" && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditMessage(msg.id, msg.content || "")}
                                    className="hover:text-amber-300"
                                    title="Edit"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">edit</span>
                                  </button>
                                )}
                                {(isCurrentUser || user?.role === "admin") && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    className="hover:text-rose-400"
                                    title="Delete"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">delete</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />

              </div>
            </div>

            {/* COMPOSER (Redesigned matching User Template) */}
            <footer className="p-6 bg-paper border-t border-line-hairline shrink-0">
              <div className="max-w-3xl mx-auto">
                {Object.keys(typingUsers).length > 0 && (
                  <p className="font-ui-label text-[10px] text-ink-muted italic px-2 mb-2">
                    {Object.keys(typingUsers).join(", ")} is drafting a response...
                  </p>
                )}

                <div className="border border-line-hairline rounded-xl bg-white shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-primary/20">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-line-hairline bg-sidebar-bone/30">
                    <div className="flex items-center gap-2">
                      <button type="button" className="p-1 text-ink-muted hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">format_bold</span>
                      </button>
                      <button type="button" className="p-1 text-ink-muted hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">format_italic</span>
                      </button>
                      <div className="w-[1px] h-4 bg-line-hairline mx-1"></div>
                      <button type="button" className="p-1 text-ink-muted hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">link</span>
                      </button>
                      <button type="button" className="p-1 text-ink-muted hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">list</span>
                      </button>
                    </div>
                    {/* File Attachment loader icon */}
                    <label className="p-1.5 hover:bg-slate-100 hover:text-primary text-ink-muted rounded cursor-pointer transition-all relative shrink-0">
                      {isUploading ? (
                        <Loader2 size={16} className="animate-spin text-primary" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px]">attach_file</span>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>

                  <form onSubmit={handleSendMessage}>
                    <textarea
                      placeholder="Write a response..."
                      value={messageText}
                      onChange={handleMessageChange}
                      disabled={isUploading}
                      className="w-full p-4 font-body-message text-body-message text-ink focus:outline-none resize-none h-24 border-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                    />
                    <div className="flex justify-end items-center px-4 py-2 bg-sidebar-bone/30 border-t border-line-hairline">
                      <button
                        type="submit"
                        disabled={!messageText.trim() || isUploading}
                        className="bg-primary text-on-primary px-5 py-1.5 rounded font-ui-label text-ui-label hover:bg-primary-container disabled:opacity-50 transition-all shadow-sm"
                      >
                        Send Message
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-muted p-8">
            <span className="material-symbols-outlined text-5xl opacity-40 block mb-4">
              menu_book
            </span>
            <h2 className="font-header-title text-header-title italic text-ink">Welcome to Bureau Ledger</h2>
            <p className="font-ui-label text-caption mt-1.5 max-w-sm text-center">
              Select a conversation channel or classmate from the ledger directory to sync correspondence.
            </p>
          </div>
        )}
      </main>

      {/* 3. Right Collapsible Chat Info Pane */}
      {activeChat && showChatInfo && (
        <div className="w-[260px] border-l border-line-hairline bg-sidebar-bone flex flex-col shrink-0 h-full">
          <div className="h-16 flex items-center justify-between px-6 border-b border-line-hairline shrink-0">
            <h3 className="font-header-title text-sm italic text-ink">Ledger Registry</h3>
            <button
              onClick={() => setShowChatInfo(false)}
              className="p-1 hover:bg-surface-container rounded"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-primary/5 text-primary border border-line-hairline rounded-xl flex items-center justify-center font-bold">
                {activeChat.type === "group" ? (
                  <span className="material-symbols-outlined text-2xl">group</span>
                ) : (
                  <span className="material-symbols-outlined text-2xl font-black">person</span>
                )}
              </div>
              <h4 className="font-bold text-xs text-ink mt-3">{getChatDisplayName(activeChat)}</h4>
              <span className="font-label-caps text-[9px] uppercase tracking-wider text-ink-muted mt-1 bg-white border border-line-hairline px-2 py-0.5 rounded mb-3">
                {activeChat.type} chat
              </span>
              <button
                onClick={handleClearChat}
                className="w-full mt-3 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">delete_sweep</span>
                <span>Clear Chat History</span>
              </button>
            </div>

            {activeChat.type === "group" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] text-ink-muted uppercase tracking-wider font-bold">
                    Collaborators ({activeChat.members.length})
                  </span>
                  
                  {activeChat.members.find((m) => m.id === user?.id)?.role === "admin" && (
                    <button
                      onClick={() => setShowAddMember(!showAddMember)}
                      className="text-primary hover:underline font-bold text-[10px] flex items-center gap-0.5"
                    >
                      <span className="material-symbols-outlined text-xs">person_add</span>
                      <span>Invite</span>
                    </button>
                  )}
                </div>

                {showAddMember && (
                  <div className="bg-white p-2.5 rounded border border-line-hairline flex flex-col gap-1.5">
                    <p className="font-label-caps text-[8px] uppercase tracking-wider font-bold text-ink-muted mb-1">
                      Choose Coworker
                    </p>
                    {availableUsers
                      .filter((au) => !activeChat.members.some((m) => m.id === au.id))
                      .map((au) => (
                        <button
                          key={au.id}
                          onClick={() => handleAddMemberToGroup(au.id)}
                          className="w-full flex items-center gap-2 p-1 hover:bg-slate-50 text-left text-xs font-semibold rounded"
                        >
                          <span>{au.displayName}</span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="space-y-2">
                  {activeChat.members.map((member) => {
                    const isSelf = member.id === user?.id;
                    const isGroupAdmin = member.role === "admin";
                    const activeChatAdmin = activeChat.members.find((m) => m.id === user?.id)?.role === "admin";

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-white/50 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              member.status === "online" ? "bg-success-moss" : "border border-success-moss"
                            }`}
                          ></span>
                          <span className="font-ui-label text-slate-800 truncate font-semibold">
                            {member.displayName} {isSelf && "(You)"}
                          </span>
                        </div>

                        {!isSelf && activeChatAdmin && (
                          <button
                            onClick={() => handleRemoveMemberFromGroup(member.id)}
                            className="text-red-500 hover:text-red-600 p-1"
                            title="Remove Member"
                          >
                            <span className="material-symbols-outlined text-sm">person_remove</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group Creation Dialog Modal */}
      {showCreateGroup && (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setShowCreateGroup(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-full bg-paper border border-line-hairline shadow-2xl rounded-xl overflow-hidden z-50 animate-slide-in">
            <div className="bg-sidebar-bone p-5 border-b border-line-hairline flex justify-between items-start">
              <div>
                <p className="font-label-caps text-caption text-ink-muted uppercase tracking-widest mb-1">
                  Ledger Actions
                </p>
                <h3 className="font-header-title text-display-xl serif-title text-primary italic">
                  Create Group Chat
                </h3>
              </div>
              <button
                type="button"
                className="text-ink-muted hover:text-ink"
                onClick={() => setShowCreateGroup(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finance Ledger Sync"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">
                  Select Members ({selectedGroupUsers.length})
                </label>
                <div className="max-h-36 overflow-y-auto p-1.5 border border-line-hairline rounded bg-white flex flex-col gap-1">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleGroupUserSelection(u.id)}
                      className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors ${
                        selectedGroupUsers.includes(u.id) ? "bg-primary/5 text-primary" : "text-ink"
                      }`}
                    >
                      <span>{u.displayName}</span>
                      <input
                        type="checkbox"
                        checked={selectedGroupUsers.includes(u.id)}
                        readOnly
                        className="rounded text-primary focus:ring-primary h-3.5 w-3.5 border-line-hairline pointer-events-none"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setGroupName("");
                    setSelectedGroupUsers([]);
                    setShowCreateGroup(false);
                  }}
                  className="px-5 py-2 border border-line-hairline rounded font-ui-label text-ui-label text-ink hover:bg-sidebar-bone transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={!groupName.trim() || selectedGroupUsers.length === 0}
                  className="px-5 py-2 bg-primary text-on-primary rounded font-ui-label text-ui-label hover:bg-primary-container disabled:opacity-50 transition-colors shadow-sm"
                >
                  Confirm Group
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* In-App Lightbox Overlay */}
      <Lightbox
        isOpen={lightboxData.isOpen}
        onClose={() => setLightboxData((prev) => ({ ...prev, isOpen: false }))}
        fileUrl={lightboxData.fileUrl}
        fileName={lightboxData.fileName}
        fileType={lightboxData.fileType}
        serverUrl={serverUrl}
      />
    </div>
  );
};
export default ChatPage;
