import React, { useEffect, useRef, useState } from 'react';
import { 
  Bookmark, 
  Archive, 
  Trash2, 
  Star, 
  Check, 
  Mic, 
  Sun, 
  Moon 
} from 'lucide-react';
import { useApp, CapsuleData } from '../../context/AppContext';

export const MiniCapsule: React.FC = () => {
  const { 
    activeCapsule, 
    dismissCapsule, 
    settings, 
    toggleTheme, 
    player 
  } = useApp();

  const [currentCapsule, setCurrentCapsule] = useState<CapsuleData | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const autoDismissTimerRef = useRef<number | null>(null);
  const exitAnimationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeCapsule) {
      // Clear any pending timers from previous notifications
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
      if (exitAnimationTimerRef.current) {
        clearTimeout(exitAnimationTimerRef.current);
        exitAnimationTimerRef.current = null;
      }

      setCurrentCapsule(activeCapsule);
      setIsExiting(false);

      // Auto-dismiss exactly 2 seconds (2000 ms) after it appears
      autoDismissTimerRef.current = window.setTimeout(() => {
        setIsExiting(true);
        // Play exit animation (280ms) before completely unmounting
        exitAnimationTimerRef.current = window.setTimeout(() => {
          setCurrentCapsule(null);
          setIsExiting(false);
          dismissCapsule();
        }, 280);
      }, 2000);
    } else {
      if (!isExiting) {
        setCurrentCapsule(null);
      }
    }

    return () => {
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
      if (exitAnimationTimerRef.current) clearTimeout(exitAnimationTimerRef.current);
    };
  }, [activeCapsule?.id, dismissCapsule]);

  if (!currentCapsule) return null;

  // Position above audio player bar if active, otherwise near bottom
  const bottomPositionClass = player.currentRecording
    ? 'bottom-24 sm:bottom-22'
    : 'bottom-6 sm:bottom-8';

  const animationClass = isExiting ? 'capsule-exit' : 'capsule-enter';

  const handleActionClick = () => {
    currentCapsule.onAction?.();
    setIsExiting(true);
    if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
    exitAnimationTimerRef.current = window.setTimeout(() => {
      setCurrentCapsule(null);
      setIsExiting(false);
      dismissCapsule();
    }, 280);
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed z-50 left-1/2 ${bottomPositionClass} ${animationClass} pointer-events-auto select-none`}
    >
      <div className="bg-[#121316]/95 text-stone-100 border border-white/10 rounded-full shadow-[0_12px_40px_-6px_rgba(0,0,0,0.7)] backdrop-blur-xl p-1 flex items-center gap-0">
        {currentCapsule.type === 'theme' ? (
          // Direct Theme Toggle pill mimicking user mockup
          <button
            type="button"
            onClick={() => {
              toggleTheme();
              // Reset 2-second timer when clicked to keep it visible for 2 seconds
              if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current);
              if (exitAnimationTimerRef.current) clearTimeout(exitAnimationTimerRef.current);
              setIsExiting(false);
              autoDismissTimerRef.current = window.setTimeout(() => {
                setIsExiting(true);
                exitAnimationTimerRef.current = window.setTimeout(() => {
                  setCurrentCapsule(null);
                  setIsExiting(false);
                  dismissCapsule();
                }, 280);
              }, 2000);
            }}
            className="bg-[#1f2127]/90 hover:bg-[#252830] border border-white/5 rounded-full px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-colors shadow-inner group"
            title={`Toggle Theme (Current: ${settings.theme === 'dark' ? 'Dark' : 'Light'})`}
          >
            <Moon 
              className={`w-3.5 h-3.5 transition-colors ${
                settings.theme === 'dark' ? 'text-white' : 'text-stone-400 group-hover:text-stone-200'
              }`} 
            />

            {/* Sliding white knob indicator */}
            <div className="relative flex items-center justify-center w-7 h-3.5 bg-black/40 rounded-full p-0.5 border border-white/5">
              <div 
                className={`w-3 h-3 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                  settings.theme === 'dark' ? '-translate-x-1.5' : 'translate-x-1.5'
                }`}
              />
            </div>

            <Sun 
              className={`w-3.5 h-3.5 transition-colors ${
                settings.theme === 'light' ? 'text-amber-300' : 'text-stone-400 group-hover:text-stone-200'
              }`} 
            />
          </button>
        ) : (
          // Notification Capsules: Bookmark / Archive / Record / Delete / Star / Copy
          <div className="bg-[#1f2127]/90 border border-white/5 rounded-full px-3.5 py-1.5 flex items-center gap-2.5">
            {currentCapsule.type === 'bookmark' && (
              <Bookmark 
                className="w-3.5 h-3.5 text-amber-400 stroke-amber-400 fill-amber-400 shrink-0" 
                strokeWidth={2}
              />
            )}
            {currentCapsule.type === 'archive' && (
              <Archive className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            )}
            {currentCapsule.type === 'record' && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <Mic className="w-3.5 h-3.5 text-rose-400" />
              </div>
            )}
            {currentCapsule.type === 'delete' && (
              <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            {currentCapsule.type === 'star' && (
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
            )}
            {currentCapsule.type === 'copy' && (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}

            <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-stone-100">
              <span>{currentCapsule.title}</span>
              {currentCapsule.subtitle && (
                <span className="text-[11px] text-stone-400 font-normal max-w-[170px] truncate hidden xs:inline">
                  · {currentCapsule.subtitle}
                </span>
              )}
            </div>

            {/* Optional action button (e.g. Undo for delete), without close or gear icons */}
            {currentCapsule.actionLabel && currentCapsule.onAction && (
              <>
                <div className="h-3 w-[1px] bg-stone-700/80 mx-1" />
                <button
                  type="button"
                  onClick={handleActionClick}
                  className="px-2 py-0.5 rounded-full text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {currentCapsule.actionLabel}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
