import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { X, User, Briefcase, Image, CheckCircle, Loader2, LogOut, Bell, BellOff, Volume2, VolumeX } from "lucide-react";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile, logout } = useAuth();
  const { isGlobalDnd, toggleGlobalDnd, isAppMuted, toggleAppMute } = useNotifications();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [post, setPost] = useState(user?.post || "");
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await updateProfile(displayName.trim(), avatarUrl.trim() || null, post.trim() || null);
      setSuccessMsg("Profile settings updated successfully!");
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm no-drag"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md w-full bg-paper border border-line-hairline shadow-2xl rounded-2xl overflow-hidden z-50 no-drag animate-slide-in">
        <div className="bg-sidebar-bone p-6 border-b border-line-hairline flex justify-between items-start">
          <div>
            <p className="font-label-caps text-caption text-ink-muted uppercase tracking-widest mb-1">
              User Credentials & Position
            </p>
            <h3 className="font-header-title text-display-xl serif-title text-primary italic">
              Setup Account Details
            </h3>
          </div>
          <button
            type="button"
            className="text-ink-muted hover:text-ink p-1 rounded-lg transition-colors"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 p-3 rounded-xl text-xs font-semibold">
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-700 p-3 rounded-xl text-xs font-semibold">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Profile Picture Preview */}
          <div className="flex items-center gap-4 bg-sidebar-bone/30 p-3.5 rounded-xl border border-line-hairline">
            <div className="w-14 h-14 rounded-xl overflow-hidden border border-line-hairline shrink-0 bg-primary/5 text-primary flex items-center justify-center font-bold text-lg shadow-inner">
              {avatarUrl.trim() ? (
                <img src={avatarUrl.trim()} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{displayName.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs text-ink truncate">{displayName || user.username}</p>
              <p className="text-[10px] text-ink-muted font-mono truncate">{user.email}</p>
              <span className="inline-block mt-1 font-label-caps text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                {user.role}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-ui-label text-ui-label text-ink-muted flex items-center gap-1.5">
              <User size={14} />
              <span>Display Name</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sarah Connor"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-ui-label text-ui-label text-ink-muted flex items-center gap-1.5">
              <Briefcase size={14} />
              <span>Post / Position / Department</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Lead System Architect / Finance"
              value={post}
              onChange={(e) => setPost(e.target.value)}
              className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-ui-label text-ui-label text-ink-muted flex items-center gap-1.5">
              <Image size={14} />
              <span>Avatar Image URL</span>
            </label>
            <input
              type="url"
              placeholder="https://example.com/avatar.jpg"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {/* Notification Preferences */}
          <div className="pt-2 pb-1 space-y-2 border-t border-line-hairline">
            <p className="font-label-caps text-[9px] text-ink-muted uppercase tracking-widest font-bold">
              Notification Preferences
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleGlobalDnd}
                className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-semibold transition-all ${
                  isGlobalDnd
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-700"
                    : "bg-paper border-line-hairline text-ink hover:bg-sidebar-bone"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isGlobalDnd ? <BellOff size={14} className="text-rose-600" /> : <Bell size={14} />}
                  <span>Do Not Disturb</span>
                </div>
                <span className="text-[10px] uppercase font-bold">{isGlobalDnd ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={toggleAppMute}
                className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-semibold transition-all ${
                  isAppMuted
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800"
                    : "bg-paper border-line-hairline text-ink hover:bg-sidebar-bone"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isAppMuted ? <VolumeX size={14} className="text-amber-700" /> : <Volume2 size={14} />}
                  <span>App Sound</span>
                </div>
                <span className="text-[10px] uppercase font-bold">{isAppMuted ? "MUTED" : "ON"}</span>
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-line-hairline">
            <button
              type="button"
              onClick={() => { onClose(); logout(); }}
              className="px-3.5 py-2 border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded font-ui-label text-caption transition-colors flex items-center gap-1.5"
            >
              <LogOut size={13} />
              <span>Log Out to Auth Page</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-line-hairline rounded font-ui-label text-ui-label text-ink hover:bg-sidebar-bone transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !displayName.trim()}
                className="px-5 py-2 bg-primary text-on-primary rounded font-ui-label text-ui-label hover:bg-primary-container disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
              >
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                <span>Save Settings</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </>
  );
};
export default OnboardingModal;
