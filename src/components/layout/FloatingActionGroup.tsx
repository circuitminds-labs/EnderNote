import React from 'react';
import { Mic, Sparkles } from 'lucide-react';

interface FloatingActionButtonProps {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  title: string;
  ariaLabel: string;
  variant: 'primary' | 'secondary';
  textClassName?: string;
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onClick,
  label,
  icon,
  title,
  ariaLabel,
  variant,
  textClassName = '',
}) => {
  const variantStyles =
    variant === 'primary'
      ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white border border-transparent shadow-lg hover:shadow-xl shadow-rose-600/35 hover:shadow-rose-600/45 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950'
      : 'bg-white/95 dark:bg-stone-900/95 text-stone-800 dark:text-stone-100 border border-stone-200/90 dark:border-stone-700/80 hover:border-stone-300 dark:hover:border-stone-600 hover:bg-stone-100/90 dark:hover:bg-stone-800/90 active:bg-stone-200/90 dark:active:bg-stone-800/90 backdrop-blur-md shadow-lg hover:shadow-xl focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fab-button group relative inline-flex items-center justify-center sm:justify-end h-11 w-11 sm:h-12 sm:w-auto min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px] rounded-full p-0 cursor-pointer select-none active:scale-[0.95] focus-visible:outline-hidden touch-manipulation ${variantStyles}`}
      title={title}
      aria-label={ariaLabel}
    >
      {/* Expanding Label Container: emerges smoothly on desktop hover/focus, hidden on touch screens */}
      <span className="fab-label-wrapper" aria-hidden="true">
        <span className="fab-label-content">
          <span className={`fab-label-text ${textClassName}`}>
            {label}
          </span>
        </span>
      </span>

      {/* Stationary Icon Container: centered 44x44px circular touch target on mobile, 48x48px on desktop */}
      <span className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0">
        {icon}
      </span>
    </button>
  );
};

interface FloatingActionGroupProps {
  onOpenAskNotes: () => void;
  onOpenRecordModal: () => void;
  isPlayerActive: boolean;
  isModalOpen?: boolean;
  isChatOpen?: boolean;
}

export const FloatingActionGroup: React.FC<FloatingActionGroupProps> = ({
  onOpenAskNotes,
  onOpenRecordModal,
  isPlayerActive,
  isModalOpen = false,
  isChatOpen = false,
}) => {
  if (isChatOpen) {
    // When the chat window is expanded, the Ask My Notes launcher is replaced by the floating chat interface.
    // On desktop, shift Record Voice to the left of the chat window (right: 444px).
    // On mobile, keep Record Voice accessible if the chat is minimized or closing.
    return (
      <div
        className={`fab-group ${isPlayerActive ? 'fab-group-player' : ''} transition-[bottom,right,transform,opacity] duration-300 pointer-events-auto select-none sm:!right-[444px] ${
          isModalOpen ? 'opacity-30 pointer-events-none' : 'opacity-100'
        }`}
        role="region"
        aria-label="Quick voice recording action"
      >
        <FloatingActionButton
          onClick={onOpenRecordModal}
          label="Record Voice"
          ariaLabel="Record Voice"
          title="Record Voice: live transcription and automatic summarization"
          variant="primary"
          textClassName="font-semibold text-xs sm:text-sm text-white"
          icon={
            <Mic className="w-5 h-5 shrink-0 animate-pulse group-hover:scale-110 group-focus-visible:scale-110 transition-transform text-white" />
          }
        />
      </div>
    );
  }

  return (
    <div
      className={`fab-group ${isPlayerActive ? 'fab-group-player' : ''} flex items-center gap-2 sm:gap-3 transition-[bottom,right,transform,opacity] duration-300 pointer-events-auto select-none ${
        isModalOpen ? 'opacity-30 pointer-events-none' : 'opacity-100'
      }`}
      role="region"
      aria-label="Quick voice recording and AI assistance actions"
    >
      {/* 1. Record Voice Button (Primary action - on the left) */}
      <FloatingActionButton
        onClick={onOpenRecordModal}
        label="Record Voice"
        ariaLabel="Record Voice"
        title="Record Voice: live transcription and automatic summarization"
        variant="primary"
        textClassName="font-semibold text-xs sm:text-sm text-white"
        icon={
          <Mic className="w-5 h-5 shrink-0 animate-pulse group-hover:scale-110 group-focus-visible:scale-110 transition-transform text-white" />
        }
      />

      {/* 2. Ask My Notes Button (Secondary action - on the right) */}
      <FloatingActionButton
        onClick={onOpenAskNotes}
        label="Ask My Notes"
        ariaLabel="Ask My Notes"
        title="Ask My Notes: synthesize answers across your voice library"
        variant="secondary"
        textClassName="font-medium text-xs sm:text-sm text-stone-800 dark:text-stone-100"
        icon={
          <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 group-hover:scale-110 group-focus-visible:scale-110 transition-transform" />
        }
      />
    </div>
  );
};

