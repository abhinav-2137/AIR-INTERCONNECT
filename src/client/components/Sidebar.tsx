import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import {
  MessageSquare,
  Radio,
  Calendar as CalendarIcon,
  Shield,
  Bell,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  Volume2,
  VolumeX
} from "lucide-react";

interface SidebarProps {
  currentPage: string;
  setPage: (page: string) => void;
  toggleNotifications: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, setPage, toggleNotifications }) => {
  const { user, logout, updateStatus } = useAuth();
  const { unreadCount } = useNotifications();
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [darkMode, setDarkMode] = useState(true); // default to dark mode

  if (!user) return null;

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  const statusColors = {
    online: "bg-green-500",
    away: "bg-amber-500",
    dnd: "bg-rose-500",
    offline: "bg-slate-400"
  };

  const statusLabels = {
    online: "Available",
    away: "Away",
    dnd: "Do Not Disturb",
    offline: "Offline"
  };

  const handleStatusChange = async (status: keyof typeof statusColors) => {
    try {
      await updateStatus(status);
      setShowStatusDropdown(false);
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 text-slate-300">
      {/* Top Section / Nav */}
      <div className="flex flex-col gap-6 pt-6 px-4">
        {/* Navigation List */}
        <nav className="flex flex-col gap-1.5">
          <button
            onClick={() => setPage("chat")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
              currentPage === "chat"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-500/10"
                : "hover:bg-slate-800/60 hover:text-white text-slate-400"
            }`}
          >
            <MessageSquare size={18} />
            <span>Chats & Groups</span>
          </button>

          <button
            onClick={() => setPage("broadcast")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
              currentPage === "broadcast"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-500/10"
                : "hover:bg-slate-800/60 hover:text-white text-slate-400"
            }`}
          >
            <Radio size={18} />
            <span>Broadcasts</span>
          </button>

          <button
            onClick={() => setPage("calendar")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
              currentPage === "calendar"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-500/10"
                : "hover:bg-slate-800/60 hover:text-white text-slate-400"
            }`}
          >
            <CalendarIcon size={18} />
            <span>Office Calendar</span>
          </button>

          {user.role === "admin" && (
            <button
              onClick={() => setPage("admin")}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                currentPage === "admin"
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-500/10"
                  : "hover:bg-slate-800/60 hover:text-white text-slate-400"
              }`}
            >
              <Shield size={18} />
              <span>Admin Dashboard</span>
            </button>
          )}
        </nav>
      </div>

      {/* Bottom Section - User Profile and Controls */}
      <div className="p-4 border-t border-slate-800 flex flex-col gap-3">
        {/* Quick Utilities: Theme, Notifications Bell */}
        <div className="flex items-center justify-between px-2 text-slate-500">
          <button
            onClick={toggleNotifications}
            className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-all relative"
            title="Notification Center"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={toggleDarkMode}
            className="p-2 hover:bg-slate-800 hover:text-white rounded-lg transition-all"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* User Card */}
        <div className="relative">
          <div className="flex items-center justify-between p-2.5 hover:bg-slate-800/40 rounded-xl transition-all duration-150 border border-transparent hover:border-slate-800">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="flex items-center gap-3 text-left focus:outline-none flex-1 min-w-0"
            >
              <div className="relative shrink-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="w-9 h-9 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 font-bold flex items-center justify-center text-sm">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                    statusColors[user.status]
                  }`}
                ></div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-brand-400 font-medium truncate">
                  {user.post || statusLabels[user.status]}
                </p>
              </div>

              <ChevronDown size={14} className="text-slate-500 shrink-0 ml-1" />
            </button>

            <button
              onClick={logout}
              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all shrink-0 ml-1"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Status Dropdown Menu */}
          {showStatusDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowStatusDropdown(false)}
              ></div>
              <div className="absolute bottom-14 left-0 right-0 z-50 bg-slate-950/95 border border-slate-800 rounded-xl p-1.5 shadow-xl flex flex-col gap-1 animate-slide-in">
                <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500 px-2.5 py-1">
                  Change Status
                </p>
                {(Object.keys(statusColors) as Array<keyof typeof statusColors>).map((st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusChange(st)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800/80 text-left text-slate-300 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full ${statusColors[st]}`}></span>
                    <span>{statusLabels[st]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default Sidebar;
