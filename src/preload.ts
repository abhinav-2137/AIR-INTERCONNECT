import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  showOsNotification: (data: {
    title: string;
    body: string;
    chatId?: string;
    page?: string;
    subtitle?: string;
    tag?: string;
  }) => ipcRenderer.send("show-os-notification", data),
  updateUnreadCount: (count: number) => ipcRenderer.send("update-unread-count", count),
  onOpenChat: (callback: (chatId: string) => void) => {
    ipcRenderer.on("open-chat", (_event, chatId) => callback(chatId));
  },
  onNavigatePage: (callback: (page: string, chatId?: string | null) => void) => {
    ipcRenderer.on("navigate-page", (_event, data) => callback(data.page, data.chatId));
  }
});
