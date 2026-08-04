import React from "react";
import { useNotifications, NotificationLog } from "../context/NotificationContext";
import { X, CheckCheck, Bell, BellOff, Volume2, VolumeX, MessageSquare, Image, FileText, Calendar, Radio } from "lucide-react";

interface NotificationBellProps {
  isOpen: boolean;
  onClose: () => void;
  setPage: (page: string) => void;
  setSelectedChatId: (id: string | null) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  isOpen,
  onClose,
  setPage,
  setSelectedChatId
}) => {
  const {
    notifications,
    markAllAsRead,
    unreadCount,
    isGlobalDnd,
    toggleGlobalDnd,
    isAppMuted,
    toggleAppMute
  } = useNotifications();

  if (!isOpen) return null;

  const handleNotificationClick = (notif: NotificationLog) => {
    if (notif.type === "calendar" || notif.chatId === "calendar_event") {
      setPage("calendar");
      setSelectedChatId(null);
    } else {
      setPage("chat");
      setSelectedChatId(notif.chatId);
    }
    onClose();
  };

  const getPreviewIcon = (notif: NotificationLog) => {
    const text = notif.messagePreview;
    if (notif.type === "calendar" || notif.chatId === "calendar_event") {
      return <Calendar size={13} className="text-rose-600 shrink-0" />;
    }
    if (text.startsWith("[Broadcast]")) {
      return <Radio size={13} className="text-purple-600 shrink-0" />;
    }
    if (text.toLowerCase().includes("[image]")) {
      return <Image size={13} className="text-primary shrink-0" />;
    }
    if (text.toLowerCase().includes("[pdf]")) {
      return <FileText size={13} className="text-rose-600 shrink-0" />;
    }
    if (text.toLowerCase().includes("[file]")) {
      return <FileText size={13} className="text-amber-700 shrink-0" />;
    }
    return <MessageSquare size={13} className="text-primary shrink-0" />;
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm no-drag"
        onClick={onClose}
      />

      {/* Notification Center Drawer */}
      <div className="fixed top-10 bottom-0 left-64 w-88 bg-paper border-r border-line-hairline shadow-2xl z-50 flex flex-col no-drag animate-slide-in font-sans">
        {/* Header */}
        <div className="p-4 border-b border-line-hairline flex flex-col gap-3 bg-sidebar-bone">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h2 className="font-header-title text-base font-bold text-ink">Notification Center</h2>
              {unreadCount > 0 && (
                <span className="bg-rose-500 text-white font-['Helvetica',sans-serif] text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 hover:bg-paper rounded text-ink-muted hover:text-primary transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck size={16} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-paper rounded text-ink-muted hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Controls Bar: Global DND & App Mute */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-hairline/60">
            {/* Global DND Toggle */}
            <button
              onClick={toggleGlobalDnd}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded font-['Helvetica',sans-serif] text-xs font-semibold border transition-all ${
                isGlobalDnd
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-700"
                  : "bg-paper border-line-hairline text-ink-muted hover:text-ink hover:bg-paper"
              }`}
              title="Global Do Not Disturb (Suppresses Sound, Toast, Native Notifications)"
            >
              {isGlobalDnd ? <BellOff size={13} className="text-rose-600" /> : <Bell size={13} />}
              <span>DND: {isGlobalDnd ? "ON" : "OFF"}</span>
            </button>

            {/* App Sound Mute Toggle */}
            <button
              onClick={toggleAppMute}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded font-['Helvetica',sans-serif] text-xs font-semibold border transition-all ${
                isAppMuted
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-800"
                  : "bg-paper border-line-hairline text-ink-muted hover:text-ink hover:bg-paper"
              }`}
              title="Toggle App Notification Sound"
            >
              {isAppMuted ? <VolumeX size={13} className="text-amber-700" /> : <Volume2 size={13} />}
              <span>Sound: {isAppMuted ? "MUTED" : "ON"}</span>
            </button>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-muted">
              <Bell size={40} className="mb-2 stroke-1 opacity-40" />
              <p className="font-['Helvetica',sans-serif] text-xs font-medium">No notifications logged</p>
            </div>
          ) : (
            notifications.map((notif) => {
              const isCalendar = notif.type === "calendar" || notif.chatId === "calendar_event";
              const isBroadcast = notif.messagePreview?.startsWith("[Broadcast]");

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                    notif.isRead
                      ? "bg-paper border-line-hairline/60 opacity-80 hover:opacity-100"
                      : isCalendar
                      ? "bg-rose-50 border-rose-200 shadow-sm"
                      : isBroadcast
                      ? "bg-purple-50 border-purple-200 shadow-sm"
                      : "bg-sidebar-bone border-line-hairline shadow-sm"
                  }`}
                >
                  {/* Sender Avatar / Icon */}
                  <div className="w-8 h-8 rounded-full border border-line-hairline bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 overflow-hidden mt-0.5">
                    {notif.senderAvatar ? (
                      <img src={notif.senderAvatar} alt={notif.senderName} className="w-full h-full object-cover" />
                    ) : isCalendar ? (
                      <Calendar size={14} className="text-rose-600" />
                    ) : isBroadcast ? (
                      <Radio size={14} className="text-purple-700" />
                    ) : (
                      <span>{notif.senderName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="font-['EB_Garamond',serif] italic text-sm font-bold text-ink truncate">
                        {notif.senderName}
                      </p>
                      <span className="font-['Helvetica',sans-serif] text-[9px] text-ink-muted shrink-0">
                        {formatTime(notif.timestamp)}
                      </span>
                    </div>

                    {notif.chatName && (
                      <p
                        className={`font-['Helvetica',sans-serif] text-[10px] font-bold uppercase tracking-wider truncate mt-0.5 ${
                          isCalendar
                            ? "text-rose-700"
                            : isBroadcast
                            ? "text-purple-700"
                            : "text-primary"
                        }`}
                      >
                        {notif.chatName}
                      </p>
                    )}

                    <div className="flex items-center gap-1 mt-1 font-['Times_New_Roman',serif] text-xs text-ink/90">
                      {getPreviewIcon(notif)}
                      <span className="truncate">{notif.messagePreview}</span>
                    </div>
                  </div>

                  {/* Unread indicator dot */}
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default NotificationBell;
