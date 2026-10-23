import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, 
  Mic, 
  FileText, 
  Sparkles, 
  Bookmark, 
  CheckSquare, 
  HardDrive, 
  Cpu, 
  ShieldCheck,
  Check
} from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, triggerRef }) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isAnimatingIn, setIsAnimatingIn] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const exitTimerRef = useRef<number | null>(null);

  // Smooth dismissal with exit animation
  const handleDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    // Respect reduced motion
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : 260;

    exitTimerRef.current = window.setTimeout(() => {
      setIsExiting(false);
      setIsRendered(false);
      onClose();
      // Restore focus to trigger
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    }, duration);
  }, [isExiting, onClose, triggerRef]);

  // Open & Close cycle
  useEffect(() => {
    if (isOpen) {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setIsRendered(true);
      setIsExiting(false);
      // Trigger entrance transition in next tick
      const frame = requestAnimationFrame(() => {
        setIsAnimatingIn(true);
        // Focus the modal or close button for accessibility
        setTimeout(() => {
          closeButtonRef.current?.focus();
        }, 50);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setIsAnimatingIn(false);
      setIsRendered(false);
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isRendered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRendered, handleDismiss]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  if (!isRendered) return null;

  const features = [
    {
      title: 'Voice Recording',
      description: 'Capture voice notes and manage audio recordings directly within the application.',
      icon: Mic,
      color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    },
    {
      title: 'Synchronized Transcripts',
      description: 'Navigate through audio recordings with clickable, time-aligned transcripts.',
      icon: FileText,
      color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
    },
    {
      title: 'AI-Powered Note Assistance',
      description: 'Automatically generate summaries, key takeaways, and structured insights from recorded speech.',
      icon: Sparkles,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    },
    {
      title: 'Bookmarks & Knowledge Organization',
      description: 'Pin critical moments, categorize ideas with tags and projects, and connect related thoughts.',
      icon: Bookmark,
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    },
    {
      title: 'Tasks & Action Items',
      description: 'Extract and track actionable items identified across meetings and voice memos.',
      icon: CheckSquare,
      color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
    },
    {
      title: 'Local-First Storage',
      description: 'Keep your audio recordings, transcripts, and metadata stored safely on your device using IndexedDB.',
      icon: HardDrive,
      color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
    },
    {
      title: 'ESP32 Integration',
      description: 'Synchronize voice notes captured on dedicated ESP32 hardware devices seamlessly into your personal knowledge base.',
      icon: Cpu,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
    }
  ];

  const isVisible = isAnimatingIn && !isExiting;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      aria-describedby="about-dialog-description"
    >
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-stone-950/65 backdrop-blur-xs transition-opacity duration-300 ease-out cursor-pointer ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Dialog Surface */}
      <div 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
        }}
        className={`
          relative w-full max-w-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 
          rounded-2xl shadow-2xl overflow-hidden my-auto z-10 
          transition-all duration-300 motion-reduce:transition-none motion-reduce:transform-none
          ${isVisible 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 translate-y-3.5'
          }
        `}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-stone-200/80 dark:border-stone-800/80 flex items-center justify-between bg-stone-50/70 dark:bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-900 dark:bg-stone-100 flex items-center justify-center text-stone-100 dark:text-stone-900 shadow-xs shrink-0">
              <span className="font-bold text-sm tracking-tight">EN</span>
            </div>
            <div>
              <h2 id="about-dialog-title" className="text-base font-semibold text-stone-900 dark:text-stone-100 leading-tight">
                About EnderNote
              </h2>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                Your voice, your knowledge, your workspace.
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-200/60 dark:hover:bg-stone-800/60 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
            title="Close dialog (Esc)"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* Introduction Paragraph */}
          <div className="bg-stone-50 dark:bg-stone-800/40 border border-stone-200/70 dark:border-stone-800/70 rounded-xl p-4">
            <p id="about-dialog-description" className="text-xs sm:text-[13px] text-stone-600 dark:text-stone-300 leading-relaxed">
              EnderNote is a local-first voice notes and knowledge management application designed to turn audio recordings into searchable, organized, and actionable knowledge. Built with ESP32 integration in mind, EnderNote brings voice capture, synchronized transcripts, and knowledge organization together in one workspace.
            </p>
          </div>

          {/* Core Features Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-stone-800 dark:text-stone-200 tracking-wide uppercase text-[11px]">
                Core Features & Capabilities
              </h3>
              <span className="text-[11px] text-stone-400 font-mono">
                7 Integrated Modules
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {features.map((feature, idx) => {
                const IconComponent = feature.icon;
                const isFullSpan = idx === features.length - 1; // 7th item on ESP32 spans 2 columns on sm+
                return (
                  <div
                    key={feature.title}
                    className={`p-3 rounded-xl bg-stone-50/60 dark:bg-stone-800/30 border border-stone-200/60 dark:border-stone-800/60 hover:border-stone-300 dark:hover:border-stone-700 transition-colors flex items-start gap-3 ${
                      isFullSpan ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <div className={`p-2 rounded-lg border shrink-0 ${feature.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 mb-0.5">
                        {feature.title}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-normal">
                        {feature.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Closing Statement Callout */}
          <div className="py-3 px-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-center">
            <p className="text-xs text-amber-800 dark:text-amber-200 italic font-medium">
              &ldquo;Designed to help turn conversations and recordings into knowledge you can use.&rdquo;
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200/80 dark:border-stone-800/80 bg-stone-50/70 dark:bg-stone-950/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              EnderNote v1.2.0
            </span>
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">Local-First Architecture</span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="px-3.5 py-1.5 rounded-lg bg-stone-200/80 hover:bg-stone-300/80 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
