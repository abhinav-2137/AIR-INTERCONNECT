import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useSocket } from "./SocketContext";

export interface NotificationLog {
  id: string;
  userId: string;
  senderName: string;
  senderAvatar?: string | null;
  chatName: string | null;
  messagePreview: string;
  timestamp: string;
  isRead: boolean;
  chatId: string;
  type?: "message" | "broadcast" | "calendar" | "image" | "pdf" | "file";
  fileName?: string | null;
  eventTitle?: string;
  startTime?: string;
  endTime?: string;
}

export interface ToastItem {
  id: string;
  senderName: string;
  senderAvatar?: string | null;
  chatName: string | null;
  messagePreview: string;
  chatId: string;
  timestamp: string;
  isFadingOut: boolean;
  type?: "message" | "broadcast" | "calendar" | "image" | "pdf" | "file";
  fileName?: string | null;
  eventTitle?: string;
  startTime?: string;
  endTime?: string;
  eventDescription?: string;
}

export interface CalendarEventData {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
}

interface NotificationContextType {
  notifications: NotificationLog[];
  toasts: ToastItem[];
  unreadCount: number;
  mutedChats: string[];
  isAppMuted: boolean;
  isGlobalDnd: boolean;
  isWindowFocused: boolean;
  activePage: string;
  activeChatId: string | null;
  setActiveLocation: (page: string, chatId: string | null) => void;
  toggleMuteChat: (chatId: string) => void;
  toggleAppMute: () => void;
  toggleGlobalDnd: () => void;
  triggerNotification: (
    senderName: string,
    chatName: string | null,
    text: string,
    chatId: string,
    type?: "message" | "broadcast" | "image" | "pdf" | "file"
  ) => Promise<void>;
  triggerCalendarNotification: (event: CalendarEventData) => void;
  markAllAsRead: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Web OS Native Desktop Push Notification Helper
export const triggerOsNotification = (
  title: string,
  body: string,
  chatId?: string,
  page?: string,
  subtitle?: string,
  tag?: string
) => {
  try {
    if ((window as any).electron?.showOsNotification) {
      (window as any).electron.showOsNotification({
        title,
        body,
        chatId,
        page,
        subtitle,
        tag
      });
    } else if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          tag
        });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            new Notification(title, {
              body,
              tag
            });
          }
        });
      }
    }
  } catch (e) {
    console.error("OS desktop notification error:", e);
  }
};

// Web Audio API Synth Chime
// Web Audio API Synth Chime
export const playNotificationChime = (isMuted: boolean = false, isUrgent: boolean = false) => {
  if (isMuted) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();

    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    if (isUrgent) {
      // Urgent triple-bell alarm for calendar
      [0, 0.22, 0.44].forEach((offset) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + offset);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + offset + 0.3);
        osc.start(audioCtx.currentTime + offset);
        osc.stop(audioCtx.currentTime + offset + 0.3);
      });
    } else {
      // Pleasant bright 3-note ascending notification chime (C5 -> E5 -> G5)
      const notes = [
        { freq: 523.25, time: 0, duration: 0.25, vol: 0.18 },    // C5
        { freq: 659.25, time: 0.1, duration: 0.25, vol: 0.18 },  // E5
        { freq: 783.99, time: 0.2, duration: 0.35, vol: 0.22 }   // G5
      ];

      notes.forEach(({ freq, time, duration, vol }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + time);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + time + duration);
        osc.start(audioCtx.currentTime + time);
        osc.stop(audioCtx.currentTime + time + duration);
      });
    }
  } catch (error) {
    console.error("Web Audio chime failed to play:", error);
  }
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, serverUrl, updateStatus } = useAuth();
  const { socket } = useSocket();

  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mutedChats, setMutedChats] = useState<string[]>([]);
  const [isAppMuted, setIsAppMuted] = useState<boolean>(false);
  const [isGlobalDnd, setIsGlobalDnd] = useState<boolean>(false);
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(document.hasFocus());
  const [activePage, setActivePage] = useState<string>("chat");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Request browser Notification permissions proactively on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Track window focus/blur
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const setActiveLocation = useCallback((page: string, chatId: string | null) => {
    setActivePage(page);
    setActiveChatId(chatId);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/notifications?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error("Failed to load notifications history:", e);
    }
  };

  useEffect(() => {
    if (!user) return;

    loadNotifications();

    // Load muted chats list
    const savedMutes = localStorage.getItem(`muted_chats_${user.id}`);
    if (savedMutes) {
      try {
        setMutedChats(JSON.parse(savedMutes));
      } catch (e) {}
    }

    // Load app sound mute preference
    const savedAppMute = localStorage.getItem(`app_muted_${user.id}`);
    if (savedAppMute !== null) {
      setIsAppMuted(savedAppMute === "true");
    }

    // Load global DND preference
    const savedDnd = localStorage.getItem(`global_dnd_${user.id}`);
    if (savedDnd !== null) {
      setIsGlobalDnd(savedDnd === "true" || user.status === "dnd");
    } else {
      setIsGlobalDnd(user.status === "dnd");
    }
  }, [user]);

  // Global 30-minute calendar event reminder polling
  const [dismissedCalendarAlerts, setDismissedCalendarAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const checkUpcomingEvents = async () => {
      try {
        const response = await fetch(`${serverUrl}/api/calendar`);
        if (response.ok) {
          const eventsList = await response.json();
          const now = new Date();
          for (const evt of eventsList) {
            if (dismissedCalendarAlerts.has(evt.id)) continue;
            const startTime = new Date(evt.startTime);
            const diffMs = startTime.getTime() - now.getTime();
            const diffMin = diffMs / (1000 * 60);
            if (diffMin > 0 && diffMin <= 30) {
              setDismissedCalendarAlerts((prev) => new Set(prev).add(evt.id));
              triggerCalendarNotification({
                id: evt.id,
                title: evt.title,
                description: evt.description,
                startTime: evt.startTime,
                endTime: evt.endTime
              });
            }
          }
        }
      } catch (e) {
        console.error("Global calendar check error:", e);
      }
    };

    checkUpcomingEvents();
    const interval = setInterval(checkUpcomingEvents, 30000);
    return () => clearInterval(interval);
  }, [user, serverUrl, dismissedCalendarAlerts]);

  const toggleMuteChat = (chatId: string) => {
    if (!user) return;
    setMutedChats((prev) => {
      const updated = prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId];
      localStorage.setItem(`muted_chats_${user.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const toggleAppMute = () => {
    if (!user) return;
    setIsAppMuted((prev) => {
      const next = !prev;
      localStorage.setItem(`app_muted_${user.id}`, String(next));
      return next;
    });
  };

  const toggleGlobalDnd = () => {
    if (!user) return;
    setIsGlobalDnd((prev) => {
      const next = !prev;
      localStorage.setItem(`global_dnd_${user.id}`, String(next));
      updateStatus(next ? "dnd" : "online").catch(() => {});
      return next;
    });
  };

  const fadeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isFadingOut: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 350); // duration of fade-out animation
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const recentFingerprintsRef = React.useRef<Map<string, number>>(new Map());

  const isDuplicateNotification = useCallback((chatId: string, senderName: string, preview: string): boolean => {
    const now = Date.now();
    recentFingerprintsRef.current.forEach((time, fp) => {
      if (now - time > 8000) {
        recentFingerprintsRef.current.delete(fp);
      }
    });

    const fingerprint = `${chatId}_${senderName}_${preview}`;
    if (recentFingerprintsRef.current.has(fingerprint)) {
      const lastTime = recentFingerprintsRef.current.get(fingerprint)!;
      if (now - lastTime < 4000) {
        return true;
      }
    }

    recentFingerprintsRef.current.set(fingerprint, now);
    return false;
  }, []);

  // Process incoming notification log or socket message
  const handleIncomingNotification = useCallback(
    (notif: NotificationLog) => {
      // 1. Log notification into Notification Center history (silently if muted/DND)
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });

      // Fingerprint deduplication: prevent duplicate popups from dual socket events for 1 message
      if (isDuplicateNotification(notif.chatId, notif.senderName, notif.messagePreview)) {
        return;
      }

      // 2. Check DND status (global DND toggle or user status === "dnd")
      const isDnd = isGlobalDnd || user?.status === "dnd";
      const isChatMuted = mutedChats.includes(notif.chatId);

      if (isDnd || isChatMuted) {
        // Suppressed! Do not show toast, do not play sound, do not fire native notification.
        return;
      }

      const isBroadcast = notif.messagePreview?.startsWith("[Broadcast]") || notif.type === "broadcast";

      // 3. Play notification sound (regular chime or prominent broadcast chime)
      playNotificationChime(isAppMuted, Boolean(isBroadcast));

      // 4. Check if chat is currently open and window is focused
      const isChatOpenAndFocused =
        isWindowFocused && activePage === "chat" && activeChatId === notif.chatId;

      if (isChatOpenAndFocused) {
        // User is actively looking at this conversation right now — sound plays, no toast popup needed.
        return;
      }

      // 5. Trigger In-App Toast
      const notifType = isBroadcast ? "broadcast" : (notif.type || "message");

      const newToast: ToastItem = {
        id: notif.id,
        senderName: notif.senderName,
        senderAvatar: notif.senderAvatar || null,
        chatName: notif.chatName,
        messagePreview: notif.messagePreview,
        chatId: notif.chatId,
        timestamp: notif.timestamp || new Date().toISOString(),
        type: notifType,
        fileName: notif.fileName || null,
        isFadingOut: false
      };

      setToasts((prev) => {
        if (prev.some((t) => t.id === notif.id)) return prev;
        return [...prev, newToast];
      });

      // Schedule auto-dismiss after 20 seconds (19.65s + 0.35s fadeout)
      setTimeout(() => {
        fadeToast(notif.id);
      }, 19650);

      // 6. Native OS desktop notification
      const notifTitle = isBroadcast
        ? `Broadcast from ${notif.senderName}`
        : notif.senderName;
      const notifSubtitle = notif.chatName || (isBroadcast ? "Broadcast Channel" : "Direct Message");

      triggerOsNotification(
        notifTitle,
        notif.messagePreview,
        notif.chatId,
        "chat",
        notifSubtitle,
        notif.chatId // tag for OS notification grouping per conversation
      );
    },
    [isDuplicateNotification, isGlobalDnd, user, mutedChats, isWindowFocused, activePage, activeChatId, isAppMuted, fadeToast]
  );

  // Handle incoming notification socket events
  useEffect(() => {
    if (!socket || !user) return;

    const handleLogged = (notif: NotificationLog) => {
      handleIncomingNotification(notif);
    };

    const handleMessageReceived = (msg: any) => {
      // Only process messages sent by others
      if (msg.senderId === user.id) return;

      const isBroadcastText = msg.isBroadcast ? "[Broadcast] " : "";
      let previewText = msg.content || "";
      if (msg.type === "image") previewText = "[Image] " + (msg.fileName || "Attachment");
      if (msg.type === "pdf") previewText = "[PDF] " + (msg.fileName || "Attachment");
      if (msg.type === "file") previewText = "[File] " + (msg.fileName || "Attachment");

      const notif: NotificationLog = {
        id: msg.id,
        userId: user.id,
        senderName: msg.senderName || "Unknown",
        senderAvatar: msg.senderAvatar || null,
        chatName: msg.chatName || null,
        messagePreview: isBroadcastText + previewText,
        timestamp: msg.timestamp || new Date().toISOString(),
        isRead: false,
        chatId: msg.chatId,
        type: msg.type || "message",
        fileName: msg.fileName || null
      };

      handleIncomingNotification(notif);
    };

    socket.on("notification_logged", handleLogged);
    socket.on("message_received", handleMessageReceived);

    return () => {
      socket.off("notification_logged", handleLogged);
      socket.off("message_received", handleMessageReceived);
    };
  }, [socket, user, handleIncomingNotification]);

  const triggerNotification = async (
    senderName: string,
    chatName: string | null,
    text: string,
    chatId: string,
    type: "message" | "broadcast" | "image" | "pdf" | "file" = "message"
  ) => {
    if (!user) return;
    try {
      await fetch(`${serverUrl}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          senderName,
          chatName,
          messagePreview: text,
          chatId,
          type
        })
      });
    } catch (e) {
      console.error("Failed to create log for notification", e);
    }
  };

  const triggerCalendarNotification = (event: CalendarEventData) => {
    if (!user) return;
    const isDnd = isGlobalDnd || user.status === "dnd";
    const notifId = `cal_${event.id}_${Date.now()}`;
    const formattedStartTime = new Date(event.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const formattedEndTime = new Date(event.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newNotifLog: NotificationLog = {
      id: notifId,
      userId: user.id,
      senderName: "Office Calendar",
      chatName: "Calendar Event",
      messagePreview: `Upcoming Event: ${event.title} (${formattedStartTime} - ${formattedEndTime})`,
      timestamp: new Date().toISOString(),
      isRead: false,
      chatId: "calendar_event",
      type: "calendar",
      eventTitle: event.title,
      startTime: event.startTime,
      endTime: event.endTime
    };

    // Log to backend DB
    triggerNotification(
      "Office Calendar",
      "Calendar Event",
      `Upcoming Event: ${event.title} (${formattedStartTime} - ${formattedEndTime})`,
      "calendar_event"
    );

    // Save in local state
    setNotifications((prev) => [newNotifLog, ...prev]);

    if (!isDnd) {
      // Play alarm chime
      playNotificationChime(isAppMuted, true);

      // Trigger OS Desktop Push Notification if unfocused
      if (!isWindowFocused) {
        triggerOsNotification(
          `Upcoming Event: ${event.title}`,
          `Starts at ${formattedStartTime} - ${formattedEndTime}`,
          undefined,
          "calendar"
        );
      }

      // Show bottom-right popup toast (20-second timer)
      const newToast: ToastItem = {
        id: notifId,
        senderName: "Office Calendar",
        chatName: "Calendar Event",
        messagePreview: `Event starts in < 30 mins: ${event.title}`,
        chatId: "calendar_event",
        timestamp: new Date().toISOString(),
        type: "calendar",
        eventTitle: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        eventDescription: event.description || undefined,
        isFadingOut: false
      };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        fadeToast(notifId);
      }, 19650);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await fetch(`${serverUrl}/api/notifications/read`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.error("Failed to mark notifications as read", e);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if ((window as any).electron?.updateUnreadCount) {
      (window as any).electron.updateUnreadCount(unreadCount);
    }
  }, [unreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        toasts,
        unreadCount,
        mutedChats,
        isAppMuted,
        isGlobalDnd,
        isWindowFocused,
        activePage,
        activeChatId,
        setActiveLocation,
        toggleMuteChat,
        toggleAppMute,
        toggleGlobalDnd,
        triggerNotification,
        triggerCalendarNotification,
        markAllAsRead,
        loadNotifications,
        dismissToast
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};

export default NotificationContext;
