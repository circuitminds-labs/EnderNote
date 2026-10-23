import React, { useEffect } from 'react';
import { 
  Home, 
  Inbox, 
  FileText, 
  FolderKanban, 
  CheckSquare, 
  Music2, 
  Network, 
  Archive, 
  Cpu, 
  Settings, 
  HardDrive, 
  Moon, 
  Sun,
  Wifi,
  WifiOff,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ActiveView } from '../../types';
import { formatBytes } from '../../services/audioUtils';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRecordModal?: () => void;
  onOpenAbout?: () => void;
  aboutTriggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onOpenRecordModal,
  onOpenAbout,
  aboutTriggerRef
}) => {
  const { 
    activeView, 
    setActiveView, 
    notes, 
    tasks, 
    jobs, 
    isOnline, 
    storageStats, 
    settings, 
    toggleTheme 
  } = useApp();

  // Escape key closes the sidebar when open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const inboxCount = notes.filter(n => n.status === 'ready_for_review' || n.status === 'awaiting_transcription' || n.status === 'transcribing' || n.status === 'awaiting_organization').length;
  const pendingTasksCount = tasks.filter(t => !t.completed).length;
  const activeJobsCount = jobs.filter(j => j.status === 'processing' || j.status === 'pending').length;

  const navItems: { id: ActiveView; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    { id: 'home', label: 'Overview', icon: <Home className="w-4 h-4" /> },
    { 
      id: 'inbox', 
      label: 'Inbox', 
      icon: <Inbox className="w-4 h-4" />, 
      badge: inboxCount, 
      badgeColor: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30' 
    },
    { id: 'notes', label: 'All Notes', icon: <FileText className="w-4 h-4" /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
    { 
      id: 'tasks', 
      label: 'Tasks & Reminders', 
      icon: <CheckSquare className="w-4 h-4" />, 
      badge: pendingTasksCount, 
      badgeColor: 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30' 
    },
    { id: 'audio_library', label: 'Audio Library', icon: <Music2 className="w-4 h-4" /> },
    { id: 'knowledge_graph', label: 'Related Notes', icon: <Network className="w-4 h-4" /> },
    { id: 'archive', label: 'Archive', icon: <Archive className="w-4 h-4" /> },
    { 
      id: 'device_sync', 
      label: 'Device & Sync', 
      icon: <Cpu className="w-4 h-4" />,
      badge: activeJobsCount > 0 ? activeJobsCount : undefined,
      badgeColor: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30 animate-pulse'
    },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile/Tablet Backdrop overlay: clicking outside closes the sidebar */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-40 lg:hidden cursor-pointer"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Panel */}
      <aside 
        className={`
          fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-64 max-w-[85vw] bg-stone-100/95 dark:bg-stone-900/95 border-r border-stone-200/80 dark:border-stone-800/80 
          backdrop-blur-md flex flex-col transition-transform duration-200 ease-in-out shadow-2xl lg:shadow-none
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}
        `}
        aria-label="Navigation Sidebar"
      >
        {/* App Brand Header with permanently accessible Close Button */}
        <div className="h-16 px-4 border-b border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between shrink-0 bg-stone-100/95 dark:bg-stone-900/95">
          {/* Interactive branding trigger */}
          <button
            type="button"
            ref={aboutTriggerRef}
            onClick={() => {
              if (onOpenAbout) onOpenAbout();
            }}
            className="flex items-center gap-2.5 min-w-0 pr-2 py-1 px-1.5 -ml-1.5 rounded-xl text-left hover:bg-stone-200/70 dark:hover:bg-stone-800/70 active:scale-[0.98] transition-all cursor-pointer group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/70 dark:focus-visible:ring-amber-400/70"
            title="About AuraNote"
            aria-label="About AuraNote - Click for app information and features"
          >
            <div className="w-8 h-8 rounded-lg bg-stone-900 dark:bg-stone-100 flex items-center justify-center text-stone-100 dark:text-stone-900 shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <span className="font-bold text-sm tracking-tight">AN</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm tracking-tight text-stone-900 dark:text-stone-100 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                AuraNote
              </div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                ESP32 Local Companion
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {/* Status indicator */}
            <div 
              title={isOnline ? 'Online (Groq Connected)' : 'Offline Mode (Local Storage & Local Organizer)'} 
              className="flex items-center p-1"
            >
              {isOnline ? (
                <span className="flex items-center text-emerald-600 dark:text-emerald-400" title="Online">
                  <Wifi className="w-3.5 h-3.5" />
                </span>
              ) : (
                <span className="flex items-center text-amber-600 dark:text-amber-400" title="Offline">
                  <WifiOff className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            {/* Clearly visible Close Button at top-right corner of sidebar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-800/80 transition-colors cursor-pointer"
              title="Close sidebar (Esc)"
              aria-label="Close navigation sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Independently Scrollable Navigation & Local Storage Section */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
          {navItems.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`
                  w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[44px]
                  ${isActive 
                    ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-950 dark:text-stone-50 font-semibold shadow-xs' 
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                  }
                `}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Local Storage & Theme Info placed after Settings at the bottom of the scrollable content */}
          <div className="pt-3 pb-3 space-y-2">
            <div className="border-t border-stone-200/70 dark:border-stone-800/70 my-2" />

            {/* Local Storage Card (accessible only by scrolling down) */}
            <div className="px-2.5 py-2 rounded-xl bg-stone-200/40 dark:bg-stone-800/40 text-[11px] space-y-1.5 border border-stone-300/40 dark:border-stone-800/60">
              <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <HardDrive className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>Local Storage</span>
                </span>
                <span className="font-mono text-[10px] font-semibold text-stone-700 dark:text-stone-300">
                  {formatBytes(storageStats.usageBytes)}
                </span>
              </div>
              <div className="w-full bg-stone-300/60 dark:bg-stone-700/60 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-600 dark:bg-amber-400 h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, Math.max(4, storageStats.quotaBytes ? (storageStats.usageBytes / storageStats.quotaBytes) * 100 : 8))}%` 
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400">
                <span>IndexedDB Blobs</span>
                <span className="font-medium text-stone-600 dark:text-stone-300">
                  {storageStats.isPersisted ? 'Persisted' : 'Transient'}
                </span>
              </div>
            </div>

            {/* Theme & Version Controls */}
            <div className="flex items-center justify-between px-2 pt-1 text-xs text-stone-500 dark:text-stone-400">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-1.5 hover:text-stone-900 dark:hover:text-stone-100 transition-colors py-1 cursor-pointer"
                title="Toggle Theme"
              >
                {settings.theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>

              <span className="text-[10px] text-stone-400 font-mono">v1.2.0</span>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
};
