import React from "react";
import { X, Download, FileText } from "lucide-react";

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: "image" | "pdf";
  serverUrl: string;
}

export const Lightbox: React.FC<LightboxProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
  serverUrl
}) => {
  if (!isOpen) return null;

  const fullUrl = fileUrl.startsWith("data:") || fileUrl.startsWith("http:") || fileUrl.startsWith("https:") ? fileUrl : `${serverUrl}${fileUrl}`;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement("a");
    link.href = fullUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none no-drag"
      onClick={onClose}
    >
      {/* Header controls */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-50">
        <p className="text-sm font-semibold text-slate-200 truncate max-w-[80%]">{fileName}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold"
            title="Download original file"
          >
            <Download size={16} />
            <span>Download</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Viewer content */}
      <div className="w-full max-w-5xl max-h-[85vh] flex items-center justify-center relative mt-12">
        {fileType === "image" ? (
          <img
            src={fullUrl}
            alt={fileName}
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="w-full h-[80vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={fullUrl}
              title={fileName}
              className="w-full h-full border-none bg-slate-900"
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default Lightbox;
