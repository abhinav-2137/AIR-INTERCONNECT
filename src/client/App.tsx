import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { NotificationProvider, useNotifications } from "./context/NotificationContext";
import TitleBar from "./components/TitleBar";
import Login from "./pages/Login";
import ChatPage from "./pages/ChatPage";
import CalendarPage from "./pages/CalendarPage";
import ArchivePage from "./pages/ArchivePage";
import AdminPage from "./pages/AdminPage";
import BroadcastPage from "./pages/BroadcastPage";
import NotificationBell from "./pages/NotificationBell";
import OnboardingModal from "./components/OnboardingModal";
import ToastContainer from "./components/Toast";

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { unreadCount, setActiveLocation } = useNotifications();
  const [page, setPage] = useState<string>("chat");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  useEffect(() => {
    setActiveLocation(page, selectedChatId);
  }, [page, selectedChatId, setActiveLocation]);

  useEffect(() => {
    if ((window as any).electron?.onOpenChat) {
      (window as any).electron.onOpenChat((chatId: string) => {
        setPage("chat");
        setSelectedChatId(chatId);
      });
    }
    if ((window as any).electron?.onNavigatePage) {
      (window as any).electron.onNavigatePage((targetPage: string, chatId?: string | null) => {
        setPage(targetPage);
        if (chatId) setSelectedChatId(chatId);
      });
    }
  }, []);


  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-paper flex flex-col items-center justify-center text-primary">
        <div className="w-10 h-10 border-4 border-line-hairline border-t-primary animate-spin rounded-full"></div>
        <p className="mt-4 text-[10px] font-label-caps uppercase tracking-wider text-ink-muted">
          Loading Ledger...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TitleBar />
        <Login />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-paper text-ink overflow-hidden font-sans">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden relative">
        {/* Workspace Rail (56px width) */}
        <nav className="h-full w-[56px] flex flex-col items-center py-4 z-50 bg-primary dark:bg-primary-container border-r border-line-hairline text-on-primary select-none shrink-0 no-drag">
          <div className="mb-8 cursor-pointer group flex flex-col items-center" onClick={() => setPage("chat")}>
            <span className="material-symbols-outlined text-3xl opacity-90 group-hover:opacity-100 transition-opacity">
              workspaces
            </span>
          </div>

          <div className="flex flex-col gap-5 items-center flex-1 w-full">
            {/* Chats tab */}
            <button
              onClick={() => setPage("chat")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                page === "chat"
                  ? "bg-primary-container text-on-primary-container shadow"
                  : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
              }`}
              title="Chats & Groups"
            >
              <span className="material-symbols-outlined block">chat_bubble</span>
            </button>

            {/* Broadcast tab */}
            <button
              onClick={() => setPage("broadcast")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                page === "broadcast"
                  ? "bg-primary-container text-on-primary-container shadow"
                  : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
              }`}
              title="Broadcasts"
            >
              <span className="material-symbols-outlined block">campaign</span>
            </button>

            {/* Calendar tab */}
            <button
              onClick={() => setPage("calendar")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                page === "calendar"
                  ? "bg-primary-container text-on-primary-container shadow"
                  : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
              }`}
              title="Calendar"
            >
              <span className="material-symbols-outlined block">calendar_month</span>
            </button>

            {/* Archive tab */}
            <button
              onClick={() => setPage("archive")}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                page === "archive"
                  ? "bg-primary-container text-on-primary-container shadow"
                  : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
              }`}
              title="Archive"
            >
              <span className="material-symbols-outlined block">inventory_2</span>
            </button>

            {/* Admin tab (Admin Only) */}
            {user.role === "admin" && (
              <button
                onClick={() => setPage("admin")}
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  page === "admin"
                    ? "bg-primary-container text-on-primary-container shadow"
                    : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
                }`}
                title="Admin Settings"
              >
                <span className="material-symbols-outlined block">shield</span>
              </button>
            )}
          </div>

          {/* Bottom Rail Actions */}
          <div className="mt-auto flex flex-col gap-4 items-center">
            {/* Notification Drawer Trigger */}
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`p-2 rounded-xl transition-all relative ${
                isNotificationsOpen
                  ? "bg-primary-container text-on-primary-container"
                  : "text-on-primary/70 hover:bg-primary-container/30 hover:text-white"
              }`}
              title="Notifications Drawer"
            >
              <span className="material-symbols-outlined block">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-primary"></span>
              )}
            </button>

            {/* Profile Avatar Trigger (Opens Account Onboarding / Settings) */}
            <button
              onClick={() => setShowOnboardingModal(true)}
              className="w-8 h-8 rounded-lg border border-on-primary/20 overflow-hidden ring-2 ring-primary-fixed-dim/20 hover:scale-105 transition-transform duration-200 cursor-pointer"
              title="Setup Profile & Credentials"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary-container text-on-primary-container font-black text-xs flex items-center justify-center">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </nav>

        {/* Main Pages Panel */}
        <div className="flex-1 flex overflow-hidden relative">
          {page === "chat" && (
            <ChatPage selectedChatId={selectedChatId} setSelectedChatId={setSelectedChatId} />
          )}
          {page === "broadcast" && <BroadcastPage />}
          {page === "calendar" && <CalendarPage />}
          {page === "archive" && <ArchivePage />}
          {page === "admin" && user.role === "admin" && <AdminPage />}
        </div>

        {/* Notifications Slider Drawer (Right side overlay) */}
        <NotificationBell
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          setPage={setPage}
          setSelectedChatId={setSelectedChatId}
        />

        {/* Account Onboarding Modal */}
        <OnboardingModal
          isOpen={showOnboardingModal}
          onClose={() => setShowOnboardingModal(false)}
        />

        {/* Floating Toast Notification Layer */}
        <ToastContainer setPage={setPage} setSelectedChatId={setSelectedChatId} />
      </div>
    </div>
  );

};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
