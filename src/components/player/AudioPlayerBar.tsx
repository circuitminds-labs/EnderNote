import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Bookmark, 
  Volume2, 
  X, 
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration } from '../../services/audioUtils';

interface AudioPlayerBarProps {
  sidebarOpen?: boolean;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({ sidebarOpen = false }) => {
  const { 
    player, 
    togglePlayPause, 
    seekTo, 
    skipSeconds, 
    setSpeed, 
    stopAudio,
    bookmarks,
    addBookmark,
    deleteBookmark,
    showCapsule,
    notes,
    setActiveView,
    setSelectedNoteId
  } = useApp();

  const [bookmarkInputOpen, setBookmarkInputOpen] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState('');

  const currentRec = player.currentRecording;

  // Safe numerical duration and playback position
  const safeDuration = Number.isFinite(player.duration) && player.duration > 0
    ? player.duration
    : (currentRec && Number.isFinite(currentRec.durationSeconds) && currentRec.durationSeconds > 0
        ? currentRec.durationSeconds
        : 1);

  const safeCurrentTime = Number.isFinite(player.currentTime) && player.currentTime >= 0
    ? Math.min(player.currentTime, safeDuration)
    : 0;

  // Use refs for shortcuts so we never re-attach event listeners 4 times a second
  const currentTimeRef = useRef(safeCurrentTime);
  currentTimeRef.current = safeCurrentTime;
  const currentRecRef = useRef(currentRec);
  currentRecRef.current = currentRec;
  const isPlayingRef = useRef(player.isPlaying);
  isPlayingRef.current = player.isPlaying;

  // Keyboard shortcut listener attached cleanly once
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentRecRef.current) return;

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipSeconds(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipSeconds(5);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setBookmarkInputOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, skipSeconds]);

  if (!currentRec) return null;

  // Filter bookmarks for current recording safely
  const recBookmarks = (bookmarks || []).filter(b => b.recordingId === currentRec.id);
  const associatedNote = (notes || []).find(n => n.recordingId === currentRec.id);

  const handleAddQuickBookmark = async () => {
    const nowSec = currentTimeRef.current;
    const ms = Math.round(nowSec * 1000);
    const label = bookmarkLabel.trim() || `Bookmark at ${formatDuration(nowSec)}`;
    await addBookmark(currentRec.id, ms, label, 'highlight');
    setBookmarkLabel('');
    setBookmarkInputOpen(false);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (Number.isFinite(val)) {
      seekTo(val);
    }
  };

  const speedOptions = [0.75, 1, 1.25, 1.5, 2];

  const handleCycleSpeed = () => {
    const nextIdx = (speedOptions.indexOf(player.playbackRate) + 1) % speedOptions.length;
    setSpeed(speedOptions[nextIdx]);
  };

  return (
    <div 
      className={`fixed right-0 z-35 bg-stone-900/98 text-stone-100 border-t border-stone-800 backdrop-blur-md px-3 sm:px-6 py-2 shadow-2xl transition-[left,bottom] duration-200 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 ${
        sidebarOpen ? 'lg:left-64 left-0' : 'left-0'
      }`}
      role="region"
      aria-label="Audio Playback Bar"
    >
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-1.5 sm:gap-2">
        {/* Row 1: Balanced horizontal layout for Note Info, Playback Controls, and Speed/Close */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
          
          {/* Region 1: Note Title & Audio Filename (Left) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[130px] xs:max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-stone-800 border border-stone-700/80 flex items-center justify-center shrink-0 text-amber-400 shadow-xs">
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 flex-1">
              {associatedNote ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNoteId(associatedNote.id);
                      setActiveView('note_detail');
                    }}
                    className="text-xs sm:text-sm font-semibold text-stone-100 hover:text-amber-300 transition-colors flex items-center gap-1 truncate max-w-full cursor-pointer text-left"
                    title={associatedNote.title}
                  >
                    <span className="truncate">{associatedNote.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 text-stone-400 hover:text-amber-300" />
                  </button>
                  <div className="text-[10px] sm:text-[11px] text-stone-400 font-mono truncate" title={currentRec.filename}>
                    {currentRec.filename || 'Audio Recording'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs sm:text-sm font-semibold text-stone-100 truncate" title={currentRec.filename}>
                    {currentRec.filename || 'Voice Recording'}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-stone-400 truncate">Audio Playback</div>
                </>
              )}
            </div>
          </div>

          {/* Region 2 & 3: Playback Controls & Bookmark Indicator (Center) */}
          <div className="flex items-center justify-center gap-1 sm:gap-2.5 shrink-0">
            {/* Previous / Skip -10s */}
            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              className="p-1 sm:p-2 text-stone-400 hover:text-stone-100 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              title="Skip -10s (Left Arrow)"
              aria-label="Skip backwards 10 seconds"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Play / Pause Primary Button */}
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-stone-100 text-stone-900 flex items-center justify-center hover:bg-amber-400 transition-colors shadow-sm cursor-pointer"
              title="Play / Pause (Space)"
              aria-label={player.isPlaying ? "Pause playback" : "Start playback"}
            >
              {player.isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Next / Skip +10s */}
            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="p-1 sm:p-2 text-stone-400 hover:text-stone-100 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
              title="Skip +10s (Right Arrow)"
              aria-label="Skip forward 10 seconds"
            >
              <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Region 3: Bookmark Indicator & Quick Toggle */}
            {(() => {
              const currentMs = Math.round(safeCurrentTime * 1000);
              const matchingBm = recBookmarks.find(bm => Math.abs(bm.timestampMs - currentMs) <= 1500);
              const isBookmarkedHere = Boolean(matchingBm);

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (matchingBm) {
                      deleteBookmark(matchingBm.id);
                    } else {
                      setBookmarkInputOpen(!bookmarkInputOpen);
                    }
                  }}
                  className={`p-1 sm:p-2 transition-colors flex items-center gap-1 text-xs cursor-pointer rounded-lg ${
                    isBookmarkedHere
                      ? 'text-amber-400 bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/30'
                      : 'text-amber-400 hover:text-amber-300 hover:bg-white/5 border border-transparent'
                  }`}
                  title={isBookmarkedHere ? "Remove Bookmark at Current Position (B)" : "Add Bookmark at Current Position (B)"}
                  aria-label={isBookmarkedHere ? "Remove Bookmark" : "Add Bookmark"}
                >
                  <Bookmark 
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-current ${isBookmarkedHere ? 'fill-current' : 'fill-transparent'}`} 
                    strokeWidth={2}
                  />
                  {recBookmarks.length > 0 && (
                    <span className="text-[10px] sm:text-[11px] font-mono font-medium">
                      {recBookmarks.length}
                    </span>
                  )}
                </button>
              );
            })()}
          </div>

          {/* Region 4 & 5: Playback Speed Selector & Close Player (Right) */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0">
            {/* Speed: Single tap cycle on mobile (< sm) */}
            <button
              type="button"
              onClick={handleCycleSpeed}
              className="sm:hidden px-2 py-1 text-[10px] font-mono font-bold rounded-lg bg-stone-800 text-amber-400 border border-stone-700 hover:bg-stone-700 transition-colors"
              title="Tap to cycle playback speed"
            >
              {player.playbackRate}x
            </button>

            {/* Speed: Multi-pills on sm+ */}
            <div className="hidden sm:flex items-center gap-0.5 sm:gap-1 bg-stone-800/80 p-0.5 rounded-lg border border-stone-700/60">
              {speedOptions.map(rate => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setSpeed(rate)}
                  className={`px-1.5 py-0.5 text-[10px] sm:text-[11px] font-medium rounded transition-colors cursor-pointer ${
                    player.playbackRate === rate
                      ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                  title={`Set speed ${rate}x`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Region 5: Close / Hide Player Control */}
            <button
              type="button"
              onClick={stopAudio}
              className="p-1 sm:p-2 text-stone-400 hover:text-stone-100 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Close Audio Player"
              aria-label="Close audio player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Inline bookmark prompt popover if open */}
        {bookmarkInputOpen && (
          <div className="w-full flex items-center gap-2 bg-stone-800 p-2 rounded-lg border border-stone-700 text-xs animate-in fade-in">
            <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0 fill-current" />
            <span className="text-stone-400 font-mono text-[10px] shrink-0">
              {formatDuration(safeCurrentTime)}
            </span>
            <input
              type="text"
              value={bookmarkLabel}
              onChange={(e) => setBookmarkLabel(e.target.value)}
              placeholder="Label bookmark (e.g. key point, question)..."
              className="flex-1 bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-hidden focus:border-amber-400"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddQuickBookmark();
                if (e.key === 'Escape') setBookmarkInputOpen(false);
              }}
            />
            <button
              type="button"
              onClick={handleAddQuickBookmark}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded text-xs transition-colors cursor-pointer shrink-0"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setBookmarkInputOpen(false)}
              className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer shrink-0"
              aria-label="Cancel bookmark"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Region 6: Dedicated Progress Bar Row (Elapsed Time, Seek Bar with Bookmark Markers, Total Duration) */}
        <div className="w-full flex items-center gap-2.5 sm:gap-3">
          <span className="text-[11px] font-mono text-stone-400 w-11 text-right shrink-0">
            {formatDuration(safeCurrentTime)}
          </span>

          <div className="relative flex-1 flex items-center h-4">
            <input
              type="range"
              min={0}
              max={safeDuration}
              step={0.1}
              value={safeCurrentTime}
              onChange={handleSeekChange}
              className="w-full h-1.5 bg-stone-700 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-hidden"
              aria-label="Seek audio playback"
            />

            {/* Bookmark markers along timeline */}
            {recBookmarks.map(bm => {
              const bmSec = (bm.timestampMs || 0) / 1000;
              const percent = safeDuration > 0 
                ? Math.min(100, Math.max(0, (bmSec / safeDuration) * 100))
                : 0;

              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => {
                    seekTo(bmSec);
                    showCapsule({
                      type: 'bookmark',
                      title: bm.label || 'Bookmark Jump',
                      subtitle: `${formatDuration(bmSec)} timestamp`,
                    });
                  }}
                  title={`Jump to: ${bm.label} (${formatDuration(bmSec)})`}
                  style={{ left: `${percent}%` }}
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-3.5 bg-amber-400 hover:bg-amber-300 hover:scale-125 transition-transform rounded-xs shadow-xs z-10 cursor-pointer"
                  aria-label={`Jump to bookmark: ${bm.label}`}
                />
              );
            })}
          </div>

          <span className="text-[11px] font-mono text-stone-400 w-11 shrink-0">
            {formatDuration(safeDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};
