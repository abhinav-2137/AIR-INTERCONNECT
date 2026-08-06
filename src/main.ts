import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { startServer } from "./server";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function getAppIcon(): Electron.NativeImage {
  const possiblePaths = [
    path.join(process.cwd(), "public", "logo.png"),
    path.join(__dirname, "..", "public", "logo.png"),
    path.join(__dirname, "client", "logo.png"),
    path.join(__dirname, "logo.png")
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return nativeImage.createFromPath(p);
    }
  }
  return nativeImage.createEmpty();
}

function createTray() {
  if (tray) return;

  const appIcon = getAppIcon();
  const trayIcon = !appIcon.isEmpty()
    ? appIcon.resize({ width: 16, height: 16 })
    : nativeImage.createFromNamedImage("NSImageNameStatusAvailable", [16, 16]);

  tray = new Tray(trayIcon);
  tray.setToolTip("CONNEXT — Active in Background (Receiving Desktop Notifications)");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "CONNEXT",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Open Application",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: "🟢 Active in Background (Notifications ON)",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Quit CONNEXT",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function ensureIsolatedUserDataPath() {
  const userDataPath = app.getPath("userData");
  console.log("[First-Run Setup] Isolated Platform User Data Path:", userDataPath);
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
    console.log("[First-Run Setup] Created fresh isolated userData directory:", userDataPath);
  }
  return userDataPath;
}

async function createWindow() {
  const isDev = !app.isPackaged;
  const serverPort = 5001;

  // Verify and resolve platform userData path (%APPDATA% on Win, ~/Library/Application Support on macOS)
  ensureIsolatedUserDataPath();

  // Set macOS dock icon
  const appIcon = getAppIcon();
  if (process.platform === "darwin" && !appIcon.isEmpty() && app.dock) {
    app.dock.setIcon(appIcon);
  }

  // Start Express/Socket.io backend server
  try {
    await startServer(serverPort);
    console.log("Embedded server started on port", serverPort);
  } catch (err) {
    console.error("Failed to start embedded server:", err);
  }

  // Create client window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // frameless custom title bar
    icon: !appIcon.isEmpty() ? appIcon : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
    mainWindow.loadURL(devUrl).catch((err) => {
      console.warn("Dev server URL load failed, serving static client files:", err);
      if (mainWindow) {
        mainWindow.loadFile(path.join(__dirname, "client", "index.html"));
      }
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "client", "index.html"));
  }

  // Intercept window close to keep application running in background tray
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  createTray();
}

// Window control IPC channels
ipcMain.on("window-minimize", () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// Closing window hides it to background system tray so notifications continue working
ipcMain.on("window-close", () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

// Explicit quit channel from app UI
ipcMain.on("app-quit", () => {
  isQuitting = true;
  app.quit();
});

function createBadgeOverlayIcon(count: number): Electron.NativeImage | null {
  if (count <= 0) return null;
  const badgeText = count > 99 ? "99+" : count.toString();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
    <text x="16" y="21" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${badgeText}</text>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return nativeImage.createFromDataURL(dataUrl);
}

// Native OS Desktop Notification IPC channel
ipcMain.on(
  "show-os-notification",
  (
    _event,
    data: {
      title?: string;
      body?: string;
      chatId?: string;
      page?: string;
      subtitle?: string;
      tag?: string;
    }
  ) => {
    try {
      // Avoid firing native popup if the app window is actively focused and visible
      if (mainWindow && mainWindow.isFocused() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
        return;
      }

      if (Notification.isSupported()) {
        const notifOptions: Electron.NotificationConstructorOptions = {
          title: data.title || "CONNEXT",
          body: data.body || "New Message",
          silent: false
        };

        if (data.subtitle) notifOptions.subtitle = data.subtitle;
        if (data.tag) (notifOptions as any).tag = data.tag;

        const notification = new Notification(notifOptions);

        notification.on("click", () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            if (data.page) {
              mainWindow.webContents.send("navigate-page", { page: data.page, chatId: data.chatId || null });
            } else if (data.chatId) {
              mainWindow.webContents.send("open-chat", data.chatId);
            }
          }
        });

        notification.show();
      }
    } catch (err) {
      console.error("Native OS notification failed:", err);
    }
  }
);

// Unread Badge Count IPC channel for Dock, Taskbar, and System Tray
ipcMain.on("update-unread-count", (_event, count: number) => {
  const safeCount = Math.max(0, count || 0);

  // 1. macOS & Linux dock badge count
  if (typeof app.setBadgeCount === "function") {
    app.setBadgeCount(safeCount);
  }

  // 2. Windows taskbar overlay icon
  if (process.platform === "win32" && mainWindow) {
    if (safeCount > 0) {
      const overlay = createBadgeOverlayIcon(safeCount);
      if (overlay) {
        mainWindow.setOverlayIcon(overlay, `${safeCount} unread message${safeCount > 1 ? "s" : ""}`);
      }
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  // 3. System Tray tooltip & menu bar title
  if (tray) {
    if (safeCount > 0) {
      tray.setToolTip(`CONNEXT — ${safeCount} unread notification${safeCount > 1 ? "s" : ""}`);
      if (process.platform === "darwin") {
        tray.setTitle(` ${safeCount}`);
      }
    } else {
      tray.setToolTip("CONNEXT — Active in Background (Receiving Desktop Notifications)");
      if (process.platform === "darwin") {
        tray.setTitle("");
      }
    }
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Do not quit app on window close — keep running in background tray
});
