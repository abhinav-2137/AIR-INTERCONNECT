import React from "react";
import { Minus, Square, X } from "lucide-react";

export const TitleBar: React.FC = () => {
  const isElectron = !!(window as any).electron;

  const handleMinimize = () => {
    if (isElectron) (window as any).electron.minimize();
  };

  const handleMaximize = () => {
    if (isElectron) (window as any).electron.maximize();
  };

  const handleClose = () => {
    if (isElectron) (window as any).electron.close();
  };

  return (
    <div className="h-8 bg-primary dark:bg-primary-container text-on-primary select-none drag flex items-center justify-between px-4 z-[100] relative border-b border-primary-container/10 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-label-caps tracking-widest uppercase text-primary-fixed-dim opacity-70">
          Bureau Ledger Shell
        </span>
      </div>
      
      {isElectron && (
        <div className="flex items-center h-full no-drag">
          <button
            onClick={handleMinimize}
            className="h-full px-3.5 hover:bg-primary-container/50 text-on-primary/80 hover:text-white transition-colors flex items-center"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={handleMaximize}
            className="h-full px-3.5 hover:bg-primary-container/50 text-on-primary/80 hover:text-white transition-colors flex items-center"
          >
            <Square size={9} />
          </button>
          <button
            onClick={handleClose}
            className="h-full px-3.5 hover:bg-error hover:text-white text-on-primary/80 transition-colors flex items-center"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
export default TitleBar;
