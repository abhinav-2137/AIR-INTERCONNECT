import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import {
  UserPlus,
  ShieldAlert,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  CheckCircle,
  X,
  Search,
  Eye,
  EyeOff
} from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  post?: string | null;
  role: "admin" | "user";
  canEditCalendar: boolean | number;
  status: string;
  lastSeen: string | null;
  isDisabled: boolean | number;
}

export const AdminPage: React.FC = () => {
  const { user, serverUrl } = useAuth();
  const { socket } = useSocket();

  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal / Form fields
  const [showUserModal, setShowUserModal] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null); // null = add mode
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [post, setPost] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [canEditCalendar, setCanEditCalendar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");

  const loadUsersList = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  useEffect(() => {
    loadUsersList();

    if (socket) {
      socket.on("user_status_change", loadUsersList);
      socket.on("profile_change", loadUsersList);
    }

    return () => {
      if (socket) {
        socket.off("user_status_change", loadUsersList);
        socket.off("profile_change", loadUsersList);
      }
    };
  }, [socket, serverUrl]);

  // Open modal for Adding User
  const handleOpenAddModal = () => {
    setSelectedUser(null);
    setDisplayName("");
    setUsername("");
    setPassword("");
    setPost("");
    setRole("user");
    setCanEditCalendar(false);
    setAvatarUrl("");
    setShowPassword(false);
    setShowUserModal(true);
  };

  // Open modal for Editing User
  const handleOpenEditModal = (user: AdminUser) => {
    setSelectedUser(user);
    setDisplayName(user.displayName);
    setUsername(user.username);
    setPassword(""); // leave blank unless modifying password
    setPost(user.post || "");
    setRole(user.role);
    setCanEditCalendar(Boolean(user.canEditCalendar));
    setAvatarUrl(user.avatarUrl || "");
    setShowPassword(false);
    setShowUserModal(true);
  };

  // Submit handler (Add or Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== "admin") return;

    setSuccessMessage(null);
    setErrorMessage(null);

    const payload = {
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      post: post.trim() || null,
      role,
      canEditCalendar,
      avatarUrl: avatarUrl.trim() || null,
      password: password ? password : undefined
    };

    try {
      let url = `${serverUrl}/api/admin/users`;
      let method = "POST";

      if (selectedUser) {
        url = `${serverUrl}/api/admin/users/${selectedUser.id}`;
        method = "PUT";
      } else {
        if (!password) {
          setErrorMessage("Password is required for new accounts.");
          return;
        }
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": user.id // authenticate as admin
        },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        setErrorMessage(responseData.error || "Operation failed");
      } else {
        setSuccessMessage(
          selectedUser
            ? `Successfully updated account settings for ${displayName}.`
            : `Successfully created user account for ${displayName}.`
        );
        setShowUserModal(false);
        loadUsersList();
      }
    } catch (e) {
      setErrorMessage("Network error, could not complete action.");
    }
  };

  // Delete User account
  const handleDeleteUser = async (targetUser: AdminUser) => {
    if (targetUser.role === "admin") {
      setErrorMessage("Cannot delete the main system administrator account.");
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the account of ${targetUser.displayName}? This action is irreversible.`)) {
      return;
    }

    try {
      const response = await fetch(`${serverUrl}/api/admin/users/${targetUser.id}`, {
        method: "DELETE",
        headers: {
          "X-Admin-Id": user!.id
        }
      });

      if (response.ok) {
        setSuccessMessage(`Successfully deleted account of ${targetUser.displayName}.`);
        loadUsersList();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.error || "Failed to delete user");
      }
    } catch (e) {
      setErrorMessage("Failed to delete user account.");
    }
  };

  // Toggle user Lock/Disable status
  const handleToggleLockUser = async (targetUser: AdminUser) => {
    if (targetUser.role === "admin") return;

    const isCurrentlyDisabled = Boolean(targetUser.isDisabled);

    try {
      const response = await fetch(`${serverUrl}/api/admin/users/${targetUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": user!.id
        },
        body: JSON.stringify({ isDisabled: !isCurrentlyDisabled })
      });

      if (response.ok) {
        setSuccessMessage(
          isCurrentlyDisabled
            ? `Unlocked account for ${targetUser.displayName}.`
            : `Suspended/Locked account for ${targetUser.displayName}.`
        );
        loadUsersList();
      }
    } catch (e) {
      setErrorMessage("Failed to change account status.");
    }
  };

  // Clear Database Data handler
  const handleClearDatabase = async () => {
    if (!user || user.role !== "admin") return;
    setIsClearing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${serverUrl}/api/admin/clear-database`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": user.id
        }
      });

      const responseData = await response.json();

      if (!response.ok) {
        setErrorMessage(responseData.error || "Failed to erase database data.");
      } else {
        setSuccessMessage(responseData.message || "All application data has been successfully erased from the database.");
        setShowClearConfirmModal(false);
        loadUsersList();
      }
    } catch (e) {
      setErrorMessage("Network error while communicating with server.");
    } finally {
      setIsClearing(false);
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-success-moss";
      case "away":
        return "bg-amber-500";
      case "dnd":
        return "bg-rose-500";
      default:
        return "border border-success-moss";
    }
  };

  const formatLastSeen = (isoString: string | null) => {
    if (!isoString) return "Never";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "Unknown";
    }
  };

  const filteredUsers = usersList.filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-paper text-ink h-full">
      {/* 2. THE CHANNEL SIDEBAR (260px) */}
      <aside className="w-[260px] flex flex-col bg-sidebar-bone border-r border-line-hairline shrink-0 h-full">
        <div className="h-16 flex items-center px-6 border-b border-line-hairline shrink-0">
          <div>
            <h1 className="font-header-title text-header-title text-primary italic">Bureau Ledger</h1>
            <p className="font-label-caps text-[9px] text-ink-muted uppercase tracking-widest leading-none mt-1">
              Admin Directory
            </p>
          </div>
        </div>

        <div className="p-4 border-b border-line-hairline">
          <button
            onClick={handleOpenAddModal}
            className="w-full py-3 px-4 bg-primary text-on-primary font-ui-label text-ui-label rounded hover:bg-primary-container transition-colors text-left flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span>New Coworker</span>
            </span>
            <span className="material-symbols-outlined text-sm">add</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          <div className="bg-white border border-line-hairline rounded p-4 flex flex-col gap-2">
            <span className="font-label-caps text-[9px] text-ink-muted uppercase tracking-wider">
              Total Database Registers
            </span>
            <span className="font-header-title text-2xl italic text-primary">{usersList.length} Accounts</span>
          </div>

          <div className="bg-white border border-line-hairline rounded p-4 flex flex-col gap-2">
            <span className="font-label-caps text-[9px] text-ink-muted uppercase tracking-wider">
              Currently Online
            </span>
            <span className="font-header-title text-2xl italic text-primary">
              {usersList.filter((u) => u.status === "online").length} active
            </span>
          </div>

          <div className="bg-rose-500/10 border border-rose-500/20 rounded p-4 flex flex-col gap-2 mt-4">
            <span className="font-label-caps text-[9px] text-rose-700 uppercase tracking-wider font-bold flex items-center gap-1">
              <ShieldAlert size={12} />
              Danger Zone
            </span>
            <p className="text-[11px] text-rose-800 leading-snug">
              Erase all app messages, chats, events & archives from Supabase.
            </p>
            <button
              onClick={() => setShowClearConfirmModal(true)}
              className="mt-1 w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-ui-label text-xs rounded transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Trash2 size={13} />
              <span>Clear Database Data</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full bg-paper min-w-0">
        {/* TOP APP BAR */}
        <header className="h-16 flex justify-between items-center px-gutter border-b border-line-hairline bg-paper shrink-0 z-35">
          <div className="flex items-center gap-4">
            <h2 className="font-header-title text-header-title italic text-ink">User Directory Registry</h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Find coworker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-sidebar-bone/50 border border-line-hairline rounded font-ui-label text-ui-label focus:outline-none placeholder-ink-muted/50 text-ink"
              />
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-6 select-text">
          {successMessage && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-700 p-4 rounded-xl text-xs font-semibold max-w-3xl mx-auto">
              <CheckCircle size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-700 p-4 rounded-xl text-xs font-semibold max-w-3xl mx-auto">
              <ShieldAlert size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="max-w-4xl mx-auto border border-line-hairline rounded-xl bg-white shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-sidebar-bone/30 border-b border-line-hairline text-[10px] font-black uppercase text-ink-muted tracking-wider">
                  <th className="p-4 font-black">Display Name</th>
                  <th className="p-4 font-black">Username</th>
                  <th className="p-4 font-black">Role</th>
                  <th className="p-4 font-black">Calendar Permissions</th>
                  <th className="p-4 font-black">Last Sync</th>
                  <th className="p-4 font-black text-center">Status</th>
                  <th className="p-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                  {filteredUsers.map((u) => {
                    const disabled = Boolean(u.isDisabled);
                    const canEdit = u.role === "admin" || Boolean(u.canEditCalendar);

                    return (
                      <tr
                        key={u.id}
                        className={`border-b border-line-hairline/60 hover:bg-sidebar-bone/10 transition-colors ${
                          disabled ? "opacity-50 bg-slate-50" : ""
                        }`}
                      >
                        <td className="p-4 font-bold text-ink flex items-center gap-2.5">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} className="w-8 h-8 rounded object-cover border border-line-hairline" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-primary/5 text-primary border border-line-hairline flex items-center justify-center font-bold text-xs shrink-0">
                              {u.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="truncate">{u.displayName}</span>
                        </td>
                        <td className="p-4 font-mono font-semibold text-ink-muted">{u.username}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              u.role === "admin" ? "bg-rose-500/10 text-rose-600" : "bg-primary/5 text-primary"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4">
                          {canEdit ? (
                            <span className="text-success-moss font-bold">Write Access</span>
                          ) : (
                            <span className="text-ink-muted/60">Read Only</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-ink-muted">{formatLastSeen(u.lastSeen)}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusDotColor(u.status)}`}></span>
                            <span className="capitalize text-[10px] text-ink-muted">{u.status}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right flex items-center justify-end gap-1.5 h-16">
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-2 hover:bg-primary/5 rounded text-ink-muted hover:text-primary transition-colors"
                            title="Edit Account Details"
                          >
                            <Edit2 size={13} />
                          </button>

                          {u.role !== "admin" ? (
                            <>
                              <button
                                onClick={() => handleToggleLockUser(u)}
                                className={`p-2 rounded transition-colors ${
                                  disabled
                                    ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                                    : "hover:bg-primary/5 text-ink-muted hover:text-amber-500"
                                }`}
                                title={disabled ? "Unlock Account" : "Suspend Account"}
                              >
                                {disabled ? <Lock size={13} /> : <Unlock size={13} />}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-2 hover:bg-red-500/10 rounded text-ink-muted hover:text-red-500 transition-colors"
                                title="Delete Account"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <div className="w-14"></div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* USER EDIT / CREATE MODAL */}
      {showUserModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setShowUserModal(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-full bg-paper border border-line-hairline shadow-2xl rounded-xl overflow-hidden z-50 animate-slide-in">
            <div className="bg-sidebar-bone p-5 border-b border-line-hairline flex justify-between items-start">
              <div>
                <p className="font-label-caps text-caption text-ink-muted uppercase tracking-widest mb-1">
                  Directory Actions
                </p>
                <h3 className="font-header-title text-display-xl serif-title text-primary italic">
                  {selectedUser ? "Modify Coworker" : "Create Account"}
                </h3>
              </div>
              <button
                type="button"
                className="text-ink-muted hover:text-ink"
                onClick={() => setShowUserModal(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">
                  Password {selectedUser && <span className="text-[10px] text-ink-muted font-normal">(Leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required={!selectedUser}
                    placeholder={selectedUser ? "••••••••" : "Enter password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 bg-paper border border-line-hairline rounded font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Avatar URL</label>
                <input
                  type="url"
                  placeholder="Link to avatar image..."
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Post / Position / Role Title</label>
                <input
                  type="text"
                  placeholder="e.g. Lead Designer / Financial Analyst"
                  value={post}
                  onChange={(e) => setPost(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>


              {selectedUser?.role !== "admin" && (
                <div className="grid grid-cols-2 gap-4 bg-sidebar-bone/45 p-3 rounded border border-line-hairline">
                  <div className="space-y-1.5">
                    <label className="font-ui-label text-[10px] text-ink-muted">Account Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as "admin" | "user")}
                      className="w-full p-2 bg-paper border border-line-hairline rounded text-xs focus:ring-1 focus:ring-primary focus:border-primary text-ink"
                    >
                      <option value="user">User</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pb-2 text-ink">
                      <input
                        type="checkbox"
                        checked={canEditCalendar}
                        onChange={(e) => setCanEditCalendar(e.target.checked)}
                        className="rounded text-primary focus:ring-primary h-4 w-4 border-line-hairline"
                      />
                      <span>Write Calendar</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-5 py-2 border border-line-hairline rounded font-ui-label text-ui-label text-ink hover:bg-sidebar-bone transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-on-primary rounded font-ui-label text-ui-label hover:bg-primary-container transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* CLEAR DATABASE CONFIRMATION MODAL */}
      {showClearConfirmModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => !isClearing && setShowClearConfirmModal(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md w-full bg-paper border border-rose-200 shadow-2xl rounded-xl overflow-hidden z-50 animate-slide-in">
            <div className="bg-rose-500/10 p-5 border-b border-rose-200 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-600 flex items-center justify-center shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <p className="font-label-caps text-caption text-rose-700 uppercase tracking-widest mb-0.5">
                    System Maintenance
                  </p>
                  <h3 className="font-header-title text-xl text-rose-800 font-bold">
                    Clear Database Data?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                disabled={isClearing}
                className="text-ink-muted hover:text-ink disabled:opacity-50"
                onClick={() => setShowClearConfirmModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-ink-muted leading-relaxed">
                This action will <strong className="text-rose-600">permanently erase all application data</strong> stored in the Supabase database, including:
              </p>
              <ul className="text-xs text-ink space-y-1 list-disc pl-5 font-medium">
                <li>All chat messages & conversation histories</li>
                <li>All chat rooms and group memberships</li>
                <li>All calendar events</li>
                <li>All system notifications</li>
                <li>All stored archive items</li>
              </ul>
              <p className="text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/20 p-3 rounded font-semibold">
                ⚠️ User accounts and login credentials will be retained so administrators and team members can continue using the application.
              </p>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => setShowClearConfirmModal(false)}
                  className="px-4 py-2 border border-line-hairline rounded font-ui-label text-xs text-ink hover:bg-sidebar-bone transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={handleClearDatabase}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded font-ui-label text-xs font-semibold transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent animate-spin rounded-full"></span>
                      <span>Erasing Database...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Yes, Erase All Data</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
export default AdminPage;
