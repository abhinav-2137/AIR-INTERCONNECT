import React, { useState, useEffect } from "react";
import { useAuth, User } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import {
  Send,
  Loader2,
  CheckCircle,
  FileText
} from "lucide-react";

interface SentBroadcast {
  id: string;
  content: string | null;
  type: string;
  fileName: string | null;
  fileSize: number | null;
  filePath: string | null;
  timestamp: string;
  recipients: {
    id: string;
    displayName: string;
  }[];
}

export const BroadcastPage: React.FC = () => {
  const { user, serverUrl } = useAuth();
  const { triggerNotification } = useNotifications();

  // Create Broadcast State
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [broadcastText, setBroadcastText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File Attachments
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);

  // History State
  const [sentBroadcasts, setSentBroadcasts] = useState<SentBroadcast[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Load coworkers list
  const loadUsers = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.filter((u: any) => u.id !== user?.id && u.isDisabled !== 1));
      }
    } catch (e) {
      console.error("Failed to load users for broadcast:", e);
    }
  };

  // Load broadcast campaigns history from the server
  const loadBroadcastHistory = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${serverUrl}/api/chats?userId=${user.id}`);
      if (response.ok) {
        const chats = await response.json();
        const directChats = chats.filter((c: any) => c.type === "direct");
        
        let allBroadcasts: any[] = [];
        for (const chat of directChats) {
          const msgResp = await fetch(`${serverUrl}/api/chats/${chat.id}/messages`);
          if (msgResp.ok) {
            const msgs = await msgResp.json();
            const broadcastsFromMe = msgs.filter((m: any) => m.senderId === user.id && m.isBroadcast === 1);
            
            const otherMember = chat.members.find((m: any) => m.id !== user.id);
            if (otherMember) {
              broadcastsFromMe.forEach((b: any) => {
                allBroadcasts.push({
                  ...b,
                  recipient: { id: otherMember.id, displayName: otherMember.displayName }
                });
              });
            }
          }
        }

        allBroadcasts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        const campaigns: SentBroadcast[] = [];
        allBroadcasts.forEach((b) => {
          const time = new Date(b.timestamp).getTime();
          const match = campaigns.find(
            (c) =>
              Math.abs(new Date(c.timestamp).getTime() - time) < 4000 &&
              c.content === b.content &&
              c.fileName === b.fileName
          );

          if (match) {
            match.recipients.push(b.recipient);
          } else {
            campaigns.push({
              id: b.id,
              content: b.content,
              type: b.type,
              fileName: b.fileName,
              fileSize: b.fileSize,
              filePath: b.filePath,
              timestamp: b.timestamp,
              recipients: [b.recipient]
            });
          }
        });

        setSentBroadcasts(campaigns);
      }
    } catch (e) {
      console.error("Failed to load broadcast history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadBroadcastHistory();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipients.length === 0 || (!broadcastText.trim() && !attachedFile) || !user) return;

    setIsSending(true);
    setSuccessMsg(null);

    try {
      let fileUrl = null;
      let fileName = null;
      let fileSize = null;
      let fileType = "text";

      if (attachedFile) {
        setUploadProgress(true);
        const formData = new FormData();
        formData.append("file", attachedFile);
        
        if (attachedFile.type.startsWith("image/")) fileType = "image";
        else if (attachedFile.type === "application/pdf") fileType = "pdf";
        else fileType = "file";

        const uploadResp = await fetch(`${serverUrl}/api/upload`, {
          method: "POST",
          body: formData
        });

        if (uploadResp.ok) {
          const fileData = await uploadResp.json();
          fileUrl = fileData.url;
          fileName = fileData.fileName;
          fileSize = fileData.fileSize;
        }
        setUploadProgress(false);
      }

      const response = await fetch(`${serverUrl}/api/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          recipientIds: selectedRecipients,
          content: broadcastText.trim() || null,
          type: fileUrl ? fileType : "text",
          filePath: fileUrl,
          fileName,
          fileSize
        })
      });

      if (response.ok) {
        setSuccessMsg(`Broadcast sent successfully to ${selectedRecipients.length} coworkers.`);
        setBroadcastText("");
        setAttachedFile(null);
        setSelectedRecipients([]);
        loadBroadcastHistory();
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch (error) {
      console.error("Failed to transmit broadcast:", error);
    } finally {
      setIsSending(false);
    }
  };

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const selectAll = () => {
    setSelectedRecipients(availableUsers.map((u) => u.id));
  };

  const deselectAll = () => {
    setSelectedRecipients([]);
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  const filteredUsers = availableUsers.filter((u) =>
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-paper text-ink h-full">
      {/* 2. THE CHANNEL SIDEBAR (260px) */}
      <aside className="w-[260px] flex flex-col bg-sidebar-bone border-r border-line-hairline shrink-0 h-full">
        <div className="h-16 flex items-center px-6 border-b border-line-hairline shrink-0">
          <div>
            <h1 className="font-header-title text-header-title text-primary italic">Bureau Ledger</h1>
            <p className="font-label-caps text-[9px] text-ink-muted uppercase tracking-widest leading-none mt-1">
              Broadcast History
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-primary" size={20} />
            </div>
          ) : sentBroadcasts.length === 0 ? (
            <div className="text-center py-10 text-ink-muted">
              <span className="material-symbols-outlined text-3xl opacity-30 block mb-1">
                campaign
              </span>
              <p className="font-ui-label text-caption italic">No campaigns found</p>
            </div>
          ) : (
            sentBroadcasts.map((camp) => (
              <div
                key={camp.id}
                className="p-3 bg-white border border-line-hairline rounded shadow-xs flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono">
                  <span>{formatTime(camp.timestamp)}</span>
                  <span className="bg-primary/5 text-primary px-1.5 py-0.5 rounded font-sans font-bold">
                    {camp.recipients.length} sent
                  </span>
                </div>

                <p className="text-xs text-ink font-semibold select-text line-clamp-3">
                  {camp.content || `📎 File: ${camp.fileName}`}
                </p>

                <div className="border-t border-line-hairline/60 pt-2 text-[10px] text-ink-muted">
                  <span className="font-bold uppercase tracking-wider block mb-0.5">Recipients:</span>
                  <span className="truncate block font-mono">
                    {camp.recipients.map((r) => r.displayName).join(", ")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full bg-paper min-w-0">
        {/* TOP APP BAR */}
        <header className="h-16 flex justify-between items-center px-gutter border-b border-line-hairline bg-paper shrink-0 z-35">
          <div className="flex items-center gap-4">
            <h2 className="font-header-title text-header-title italic text-ink">New Broadcast Campaign</h2>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-8 select-text">
          <div className="max-w-2xl mx-auto space-y-6">
            <p className="font-ui-label text-caption text-ink-muted leading-relaxed">
              Broadcasts allow you to transmit a document, announcement, or attachment to multiple coworkers simultaneously. Each coworker receives the campaign in a private 1-to-1 thread. Replies return privately to you, eliminating massive group notifications.
            </p>

            {successMsg && (
              <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-700 p-4 rounded-xl text-xs font-semibold">
                <CheckCircle size={16} className="shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSendBroadcast} className="space-y-6">
              {/* Recipient Picker */}
              <div className="bg-white border border-line-hairline rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <label className="font-label-caps text-caption text-ink-muted uppercase tracking-wider font-bold">
                    Select Recipients ({selectedRecipients.length})
                  </label>
                  <div className="flex gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-primary hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-line-hairline">|</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-ink-muted hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Find coworkers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-sidebar-bone/50 border border-line-hairline rounded font-ui-label text-ui-label focus:outline-none placeholder-ink-muted/50 text-ink"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 select-none custom-scrollbar">
                  {filteredUsers.map((u) => {
                    const isChecked = selectedRecipients.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleRecipient(u.id)}
                        className={`flex items-center justify-between p-2 rounded border text-left text-xs transition-colors ${
                          isChecked
                            ? "bg-primary/5 border-primary/30 text-primary font-bold"
                            : "bg-paper border-line-hairline text-ink hover:bg-sidebar-bone"
                        }`}
                      >
                        <span className="truncate">{u.displayName}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="rounded text-primary focus:ring-primary h-3.5 w-3.5 border-line-hairline pointer-events-none"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Details */}
              <div className="bg-white border border-line-hairline rounded-xl p-5 shadow-xs space-y-4">
                <div className="space-y-1.5">
                  <label className="font-ui-label text-ui-label text-ink-muted">Announcement Content</label>
                  <textarea
                    rows={4}
                    placeholder="Type broadcast text announcement here..."
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    className="w-full bg-paper border border-line-hairline rounded px-4 py-3 font-body-message text-body-message focus:ring-1 focus:ring-primary outline-none resize-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="px-4 py-2 bg-sidebar-bone border border-line-hairline hover:bg-slate-200 text-ink rounded cursor-pointer transition-colors text-xs font-semibold flex items-center gap-1.5 select-none">
                    <span className="material-symbols-outlined text-[16px]">attach_file</span>
                    <span>{attachedFile ? "Change Attachment" : "Add Attachment"}</span>
                    <input type="file" className="hidden" onChange={handleFileChange} />
                  </label>

                  {attachedFile && (
                    <div className="flex items-center gap-2 bg-sidebar-bone/50 border border-line-hairline px-3 py-1 rounded max-w-[70%]">
                      <FileText size={13} className="text-ink-muted shrink-0" />
                      <span className="text-xs text-ink truncate font-semibold">{attachedFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedFile(null)}
                        className="text-xs text-ink-muted hover:text-red-500 font-bold ml-1"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSending || selectedRecipients.length === 0 || (!broadcastText.trim() && !attachedFile)}
                className="w-full py-4 bg-primary text-on-primary rounded font-ui-label text-ui-label hover:bg-primary-container disabled:opacity-50 transition-colors shadow flex items-center justify-center gap-2 font-bold"
              >
                {isSending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{uploadProgress ? "Uploading attachment..." : "Transmitting Announcements..."}</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Transmit Announcement</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
export default BroadcastPage;
