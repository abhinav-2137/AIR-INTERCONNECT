import React from "react";
import { useNotifications, ToastItem } from "../context/NotificationContext";
import { X, Image, FileText, Bell, Radio, Calendar, Clock, AlertTriangle, Paperclip } from "lucide-react";

interface ToastContainerProps {
  setPage: (page: string) => void;
  setSelectedChatId: (id: string | null) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ setPage, setSelectedChatId }) => {
  const { toasts, dismissToast } = useNotifications();

  // Max 3 visible toasts, most recent on top
  const maxVisible = 3;
  const reversedToasts = [...toasts].reverse();
  const visibleToasts = reversedToasts.slice(0, maxVisible);
  const hiddenCount = reversedToasts.length - maxVisible;

  const handleToastClick = (toast: ToastItem) => {
    if (toast.type === "calendar") {
      setPage("calendar");
      setSelectedChatId(null);
    } else {
      setPage("chat");
      setSelectedChatId(toast.chatId);
    }
    dismissToast(toast.id);
  };

  const isAttachmentMessage = (toast: ToastItem) => {
    const text = toast.messagePreview.toLowerCase();
    return (
      toast.type === "image" ||
      toast.type === "pdf" ||
      toast.type === "file" ||
      text.includes("[image]") ||
      text.includes("[pdf]") ||
      text.includes("[file]")
    );
  };

  const getAttachmentIcon = (toast: ToastItem) => {
    const text = toast.messagePreview.toLowerCase();
    if (toast.type === "image" || text.includes("[image]")) {
      return <Image size={15} className="text-primary shrink-0" />;
    }
    if (toast.type === "pdf" || text.includes("[pdf]")) {
      return <FileText size={15} className="text-rose-600 shrink-0" />;
    }
    return <Paperclip size={15} className="text-amber-700 shrink-0" />;
  };

  const getCleanAttachmentName = (toast: ToastItem) => {
    if (toast.fileName) return toast.fileName;
    const text = toast.messagePreview;
    return text.replace(/^\[(Image|PDF|File)\]\s*/i, "") || "Attachment";
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  const truncateText = (str: string, maxLen: number = 80) => {
    if (!str) return "";
    return str.length > maxLen ? str.slice(0, maxLen).trim() + "…" : str;
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end gap-3 max-w-sm w-full no-drag pointer-events-none select-none">
      {/* +N More summary pill if more than 3 active toasts */}
      {hiddenCount > 0 && (
        <div
          onClick={() => setPage("chat")}
          className="pointer-events-auto cursor-pointer bg-paper border border-line-hairline shadow-lg rounded-full px-3.5 py-1.5 flex items-center gap-2 text-ink hover:bg-sidebar-bone transition-all animate-slide-in"
        >
          <Bell size={13} className="text-primary" />
          <span className="font-['Helvetica',sans-serif] text-xs font-bold text-primary">
            +{hiddenCount} more notification{hiddenCount > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Render up to 3 visible toasts */}
      {visibleToasts.map((toast) => {
        const isCalendar = toast.type === "calendar";
        const isBroadcast = toast.type === "broadcast";
        const isAttachment = isAttachmentMessage(toast);

        if (isCalendar) {
          return (
            <div
              key={toast.id}
              className={`w-full bg-paper border border-line-hairline text-ink shadow-2xl rounded-xl p-4 flex flex-col relative overflow-hidden pointer-events-auto cursor-pointer transition-all duration-200 hover:shadow-primary/10 ${
                toast.isFadingOut ? "animate-fade-out" : "animate-slide-in"
              }`}
              onClick={() => handleToastClick(toast)}
            >
              {/* Calendar Toast Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 font-bold flex items-center justify-center shrink-0">
                    <Calendar size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-['Helvetica',sans-serif] text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-800 border border-rose-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                        <AlertTriangle size={9} /> Calendar Event
                      </span>
                    </div>

                    <h4 className="font-['EB_Garamond',serif] italic text-base font-semibold text-ink truncate leading-tight">
                      {toast.eventTitle || toast.messagePreview}
                    </h4>

                    <div className="flex items-center gap-1.5 mt-1 font-['Helvetica',sans-serif] text-xs text-ink-muted">
                      <Clock size={13} className="text-rose-600 shrink-0" />
                      <span>
                        {formatTime(toast.startTime)} - {formatTime(toast.endTime)}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(toast.id);
                  }}
                  className="text-ink-muted hover:text-ink p-1 rounded hover:bg-sidebar-bone transition-colors shrink-0"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex items-center justify-between font-['Helvetica',sans-serif] text-[10px] text-ink-muted mt-2.5 pt-1.5 border-t border-line-hairline/60">
                <span className="flex items-center gap-1 text-rose-700 font-medium">
                  <Bell size={10} />
                  Click to open Office Calendar
                </span>
                <span>20s</span>
              </div>

              {/* Animated 20-Second Progress Indicator Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-line-hairline/30 overflow-hidden">
                <div
                  className="h-full bg-rose-600 animate-[shrink_20s_linear_forwards]"
                  style={{ animation: "shrink 20s linear forwards" }}
                />
              </div>
            </div>
          );
        }

        return (
          <div
            key={toast.id}
            className={`w-full bg-paper border border-line-hairline text-ink shadow-xl rounded-xl p-4 flex flex-col relative overflow-hidden pointer-events-auto cursor-pointer transition-all duration-200 hover:shadow-2xl hover:border-primary/40 ${
              toast.isFadingOut ? "animate-fade-out" : "animate-slide-in"
            }`}
            onClick={() => handleToastClick(toast)}
          >
            {/* Standard / Broadcast Toast Content */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Sender Avatar */}
                <div className="w-10 h-10 rounded-full border border-line-hairline bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden font-bold text-sm shadow-sm">
                  {toast.senderAvatar ? (
                    <img src={toast.senderAvatar} alt={toast.senderName} className="w-full h-full object-cover" />
                  ) : isBroadcast ? (
                    <Radio size={18} className="text-purple-700" />
                  ) : (
                    <span>{toast.senderName.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Sender Name in EB Garamond italic & Timestamp in Helvetica */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-['EB_Garamond',serif] italic text-base font-semibold text-ink truncate leading-tight">
                      {toast.senderName}
                    </p>
                    <span className="font-['Helvetica',sans-serif] text-[10px] text-ink-muted shrink-0">
                      {formatTime(toast.timestamp)}
                    </span>
                  </div>

                  {/* Chat / Broadcast label */}
                  {isBroadcast ? (
                    <span className="inline-block mt-0.5 font-['Helvetica',sans-serif] text-[9px] font-bold bg-purple-500/10 text-purple-800 border border-purple-500/20 px-1.5 py-0.2 rounded">
                      Broadcast
                    </span>
                  ) : (
                    toast.chatName && (
                      <p className="font-['Helvetica',sans-serif] text-[10px] uppercase font-bold tracking-wider text-primary truncate mt-0.5">
                        {toast.chatName}
                      </p>
                    )
                  )}

                  {/* Preview text in Times New Roman (or attachment icon) */}
                  <div className="mt-1">
                    {isAttachment ? (
                      <div className="flex items-center gap-1.5 bg-sidebar-bone/60 border border-line-hairline/60 px-2 py-1 rounded">
                        {getAttachmentIcon(toast)}
                        <span className="font-['Times_New_Roman',serif] text-xs font-semibold text-ink truncate">
                          {getCleanAttachmentName(toast)}
                        </span>
                      </div>
                    ) : (
                      <p className="font-['Times_New_Roman',serif] text-sm text-ink/90 line-clamp-2 leading-snug">
                        {truncateText(toast.messagePreview, 80)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Dismiss button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.id);
                }}
                className="text-ink-muted hover:text-ink p-1 rounded hover:bg-sidebar-bone transition-colors shrink-0"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>

            {/* Footer caption in Helvetica */}
            <div className="flex items-center justify-between font-['Helvetica',sans-serif] text-[10px] text-ink-muted mt-2.5 pt-1.5 border-t border-line-hairline/50">
              <span className="flex items-center gap-1 text-primary font-medium">
                <Bell size={10} />
                Click to open conversation
              </span>
              <span>20s</span>
            </div>

            {/* Animated 20-Second Progress Indicator Bar along bottom edge */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-line-hairline/30 overflow-hidden">
              <div
                className={`h-full ${
                  isBroadcast ? "bg-purple-600" : "bg-primary"
                } animate-[shrink_20s_linear_forwards]`}
                style={{ animation: "shrink 20s linear forwards" }}
              />
            </div>
          </div>
        );
      })}

      {/* Animation keyframes */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

export default ToastContainer;
