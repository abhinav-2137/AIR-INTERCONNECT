import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Plus,
  Archive,
  FileText,
  Image,
  File,
  Trash2,
  Search,
  Loader2,
  X,
  Upload,
  Tag,
  Clock,
  User
} from "lucide-react";

interface ArchiveItem {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description: string | null;
  category: string;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_OPTIONS = [
  { value: "general", label: "General", color: "bg-slate-500" },
  { value: "report", label: "Report", color: "bg-blue-500" },
  { value: "document", label: "Document", color: "bg-emerald-500" },
  { value: "media", label: "Media", color: "bg-purple-500" },
  { value: "reference", label: "Reference", color: "bg-amber-500" },
  { value: "other", label: "Other", color: "bg-rose-500" }
];

export const ArchivePage: React.FC = () => {
  const { user, serverUrl } = useAuth();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadArchive = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/archive?userId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (e) {
      console.error("Failed to load archive:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadArchive();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formTitle.trim()) return;

    setIsSubmitting(true);
    try {
      let filePath = null;
      let fileName = null;
      let fileSize = null;

      // Upload file first if one is selected
      if (formFile) {
        const formData = new FormData();
        formData.append("file", formFile);
        const uploadRes = await fetch(`${serverUrl}/api/upload`, { method: "POST", body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          filePath = uploadData.url;
          fileName = uploadData.fileName;
          fileSize = uploadData.fileSize;
        }
      }

      const response = await fetch(`${serverUrl}/api/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          category: formCategory,
          filePath,
          fileName,
          fileSize
        })
      });

      if (response.ok) {
        const newItem = await response.json();
        setItems((prev) => [newItem, ...prev]);
        setShowAddModal(false);
        setFormTitle("");
        setFormDescription("");
        setFormCategory("general");
        setFormFile(null);
      }
    } catch (e) {
      console.error("Failed to create archive item:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    try {
      const response = await fetch(`${serverUrl}/api/archive/${itemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });
      if (response.ok) {
        setItems((prev) => prev.filter((item) => item.id !== itemId));
      }
    } catch (e) {
      console.error("Failed to delete archive item:", e);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.userName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryConfig = (cat: string) => {
    return CATEGORY_OPTIONS.find((c) => c.value === cat) || CATEGORY_OPTIONS[0];
  };

  const getFileIcon = (fileName: string | null) => {
    if (!fileName) return <File size={16} />;
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) return <Image size={16} />;
    if (["pdf", "doc", "docx", "txt"].includes(ext || "")) return <FileText size={16} />;
    return <File size={16} />;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-line-hairline bg-paper-alt/50 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <Archive size={20} className="text-amber-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">Archive</h1>
              <p className="text-xs text-ink-muted">
                {user?.role === "admin" ? "All submissions from the team" : "Your archived submissions"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all active:scale-95 shadow-md"
          >
            <Plus size={16} />
            <span>Add Item</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search archive..."
              className="w-full pl-10 pr-4 py-2.5 bg-paper border border-line-hairline rounded-xl text-sm text-ink focus:outline-none focus:border-brand-500 transition-all"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 bg-paper border border-line-hairline rounded-xl text-sm text-ink focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Items Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-muted">
            <Loader2 size={32} className="animate-spin mb-3" />
            <p className="text-sm">Loading archive...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-ink-muted">
            <Archive size={48} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No archive items found</p>
            <p className="text-xs mt-1">Click "Add Item" to start archiving data</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const catConfig = getCategoryConfig(item.category);
              return (
                <div
                  key={item.id}
                  className="bg-paper border border-line-hairline rounded-2xl p-5 hover:shadow-md hover:border-brand-500/20 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white ${catConfig.color}`}>
                      <Tag size={10} />
                      {catConfig.label}
                    </span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg text-ink-muted hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-ink mb-1.5 line-clamp-2">{item.title}</h3>
                  {item.description && (
                    <p className="text-xs text-ink-muted line-clamp-3 mb-3">{item.description}</p>
                  )}

                  {item.fileName && (
                    <a
                      href={item.filePath?.startsWith("data:") || item.filePath?.startsWith("http:") || item.filePath?.startsWith("https:") ? item.filePath : `${serverUrl}${item.filePath}`}
                      download={item.fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-paper-alt rounded-lg text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all mb-3"
                    >
                      {getFileIcon(item.fileName)}
                      <span className="truncate flex-1">{item.fileName}</span>
                      {item.fileSize && <span className="text-ink-muted shrink-0">{formatFileSize(item.fileSize)}</span>}
                    </a>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-ink-muted pt-2 border-t border-line-hairline">
                    <span className="flex items-center gap-1">
                      <User size={10} />
                      {item.userName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-paper rounded-3xl border border-line-hairline shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-6 pb-0">
              <h2 className="text-lg font-bold text-ink">Add Archive Item</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl hover:bg-paper-alt text-ink-muted transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wider">Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-paper-alt border border-line-hairline rounded-xl text-sm text-ink focus:outline-none focus:border-brand-500 transition-all"
                  placeholder="Item title"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wider">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-paper-alt border border-line-hairline rounded-xl text-sm text-ink focus:outline-none focus:border-brand-500 transition-all resize-none"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wider">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormCategory(c.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        formCategory === c.value
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-line-hairline text-ink-muted hover:border-brand-500/30"
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${c.color}`} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wider">Attachment</label>
                <label className="flex flex-col items-center justify-center w-full h-24 bg-paper-alt border-2 border-dashed border-line-hairline rounded-xl cursor-pointer hover:border-brand-500/50 transition-all">
                  {formFile ? (
                    <div className="flex items-center gap-2 text-sm text-ink">
                      {getFileIcon(formFile.name)}
                      <span className="truncate max-w-[200px]">{formFile.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setFormFile(null); }}
                        className="p-1 rounded hover:bg-red-500/10 text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-ink-muted">
                      <Upload size={20} className="mb-1" />
                      <span className="text-xs">Click to upload a file</span>
                    </div>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-paper-alt border border-line-hairline text-ink rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <span>Upload Item</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivePage;
