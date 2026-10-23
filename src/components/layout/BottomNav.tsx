import React from 'react';
import { 
  Home, 
  FileText, 
  Inbox, 
  CheckSquare, 
  Menu
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ActiveView } from '../../types';

interface BottomNavProps {
  onOpenSidebar: () => void;
  isPlayerActive?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ 
  onOpenSidebar,
  isPlayerActive = false
}) => {
  const { activeView, setActiveView, notes, tasks } = useApp();

  const inboxCount = notes.filter(n => 
    n.status === 'ready_for_review' || 
    n.status === 'awaiting_transcription' || 
    n.status === 'transcribing' || 
    n.status === 'awaiting_organization'
  ).length;

  const pendingTasksCount = tasks.filter(t => !t.completed).length;

  const navButtons: {
    id: ActiveView;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: 'home',
      label: 'Overview',
      icon: <Home className="w-5 h-5" />,
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: <FileText className="w-5 h-5" />,
    },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: <Inbox className="w-5 h-5" />,
      badge: inboxCount,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <CheckSquare className="w-5 h-5" />,
      badge: pendingTasksCount,
    },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-stone-100/95 dark:bg-stone-900/95 backdrop-blur-lg border-t border-stone-200/90 dark:border-stone-800/90 shadow-lg pb-[env(safe-area-inset-bottom,0px)] select-none"
      aria-label="Mobile Bottom Navigation"
    >
      <div className="flex items-center justify-around h-14 sm:h-16 px-1 max-w-lg mx-auto">
        {navButtons.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`flex-1 flex flex-col items-center justify-center min-w-0 py-1 px-1 rounded-xl transition-all relative group cursor-pointer ${
                isActive 
                  ? 'text-amber-600 dark:text-amber-400 font-semibold' 
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 active:scale-95'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                <span className={`p-1 rounded-lg transition-colors ${
                  isActive ? 'bg-amber-500/15 dark:bg-amber-400/15' : 'group-hover:bg-stone-200/50 dark:group-hover:bg-stone-800/50'
                }`}>
                  {item.icon}
                </span>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 text-[10px] font-bold font-mono rounded-full bg-amber-500 text-stone-950 shadow-xs border border-stone-100 dark:border-stone-900 animate-in fade-in zoom-in-75">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px] truncate tracking-tight mt-0.5 max-w-[64px]">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More / All Sections Trigger */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex-1 flex flex-col items-center justify-center min-w-0 py-1 px-1 rounded-xl text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 active:scale-95 transition-all group cursor-pointer"
          title="Open complete navigation menu"
          aria-label="Open complete navigation menu"
        >
          <div className="relative flex items-center justify-center">
            <span className="p-1 rounded-lg group-hover:bg-stone-200/50 dark:group-hover:bg-stone-800/50 transition-colors">
              <Menu className="w-5 h-5" />
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] truncate tracking-tight mt-0.5 max-w-[64px]">
            More
          </span>
        </button>
      </div>
    </nav>
  );
};
