import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  Search, 
  Plus, 
  Upload, 
  Cpu, 
  X, 
  Square,
  FileText,
  Clock,
  ArrowRight,
  Sun,
  Moon
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration } from '../../services/audioUtils';

interface HeaderProps {
  sidebarOpen?: boolean;
  onToggleSidebar: () => void;
  onOpenAskNotes?: () => void;
  onOpenRecordModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  sidebarOpen = true, 
  onToggleSidebar, 
  onOpenAskNotes, 
  onOpenRecordModal 
}) => {
  const { 
    notes, 
    projects, 
    tasks, 
    activeView,
    setActiveView, 
    setSelectedNoteId, 
    createManualNote, 
    importAudioFile,
    isOnline,
    settings,
    toggleTheme
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Search filter
  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { notes: [], projects: [], tasks: [] };

    const matchedNotes = notes.filter(n => 
      (n.title || '').toLowerCase().includes(q) ||
      (n.summary || '').toLowerCase().includes(q) ||
      (n.fullTranscript && n.fullTranscript.toLowerCase().includes(q)) ||
      (n.tags || []).some(t => typeof t === 'string' && t.toLowerCase().includes(q))
    ).slice(0, 5);

    const matchedProjects = projects.filter(p =>
      p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    ).slice(0, 3);

    const matchedTasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q)
    ).slice(0, 3);

    return { notes: matchedNotes, projects: matchedProjects, tasks: matchedTasks };
  }, [searchQuery, notes, projects, tasks]);

  const hasAnyResults = 
    searchResults.notes?.length > 0 || 
    searchResults.projects?.length > 0 || 
    searchResults.tasks?.length > 0;

  // Audio file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await importAudioFile(files[i]);
      }
      setActiveView('inbox');
    }
    if (e.target) e.target.value = '';
  };

  const handleSelectNoteResult = (noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveView('note_detail');
    setSearchQuery('');
    setSearchFocused(false);
  };

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when mobile search is toggled open
  useEffect(() => {
    if (isMobileSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isMobileSearchOpen]);

  const viewTitles: Record<string, string> = {
    home: 'Overview',
    inbox: 'Inbox',
    notes: 'All Notes',
    note_detail: 'Note Detail',
    projects: 'Projects',
    tasks: 'Tasks',
    audio_library: 'Audio Library',
    knowledge_graph: 'Related Notes',
    archive: 'Archive',
    device_sync: 'ESP32 Sync',
    settings: 'Settings',
  };

  const currentTitle = viewTitles[activeView] || 'AuraNote';

  return (
    <header className="h-14 sm:h-16 px-3 sm:px-6 lg:px-8 border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur-md flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 pt-[env(safe-area-inset-top)] select-none">
      {/* Mobile Full-Width Search Mode */}
      {isMobileSearchOpen ? (
        <div className="flex items-center gap-2 w-full animate-in fade-in duration-150">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search notes, transcripts, tags..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-stone-200/60 dark:bg-stone-900 border border-stone-300/80 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500/80 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 cursor-pointer"
                aria-label="Clear search text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsMobileSearchOpen(false);
              setSearchFocused(false);
              setSearchQuery('');
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>

          {/* Search Dropdown Modal for Mobile */}
          {searchFocused && searchQuery.trim() && (
            <>
              <div 
                className="fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-2xs" 
                onClick={() => setSearchFocused(false)} 
              />
              <div className="absolute top-full left-3 right-3 mt-2 bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 z-50 p-2 max-h-[70vh] overflow-y-auto">
                {!hasAnyResults ? (
                  <div className="py-6 text-center text-xs text-stone-400">
                    No results found for "{searchQuery}"
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Notes results */}
                    {searchResults.notes.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                          Notes & Transcripts
                        </div>
                        {searchResults.notes.map(n => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              handleSelectNoteResult(n.id);
                              setIsMobileSearchOpen(false);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800/80 transition-colors flex items-start justify-between group cursor-pointer"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                                {n.title}
                              </div>
                              <div className="text-[11px] text-stone-500 truncate">
                                {n.summary || n.fullTranscript?.slice(0, 80)}
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Projects results */}
                    {searchResults.projects.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                          Projects
                        </div>
                        {searchResults.projects.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setActiveView('projects');
                              setSearchFocused(false);
                              setIsMobileSearchOpen(false);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800/80 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span className="text-xs font-medium text-stone-900 dark:text-stone-100">
                              {p.name}
                            </span>
                            <span className="text-[10px] text-stone-400">Project</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Normal Header Mode (Mobile & Desktop) */
        <>
          {/* Left: Navigation Trigger + Mobile View Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {(!sidebarOpen || typeof window !== 'undefined') && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className={`p-2 -ml-1.5 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 transition-colors cursor-pointer shrink-0 ${
                  sidebarOpen ? 'lg:hidden inline-flex' : 'inline-flex'
                }`}
                aria-label="Open navigation menu"
                title="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            {/* Mobile View Title: Visible only on < sm */}
            <div className="sm:hidden flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-xs text-stone-900 dark:text-stone-100 truncate">
                {currentTitle}
              </span>
            </div>

            {/* Desktop / Tablet Global Search Bar */}
            <div className="hidden sm:block relative w-48 sm:w-64 md:w-80 lg:w-96">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search notes, transcripts, tags..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl bg-stone-200/50 dark:bg-stone-900 border border-stone-300/60 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500/80 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Search Dropdown Modal for Desktop/Tablet */}
              {searchFocused && searchQuery.trim() && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setSearchFocused(false)} 
                  />
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-stone-900 rounded-xl shadow-xl border border-stone-200 dark:border-stone-800 z-50 p-2 max-h-96 overflow-y-auto">
                    {!hasAnyResults ? (
                      <div className="py-6 text-center text-xs text-stone-400">
                        No results found for "{searchQuery}"
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Notes results */}
                        {searchResults.notes.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                              Notes & Transcripts
                            </div>
                            {searchResults.notes.map(n => (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => handleSelectNoteResult(n.id)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/80 transition-colors flex items-start justify-between group cursor-pointer"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                                    {n.title}
                                  </div>
                                  <div className="text-[11px] text-stone-500 truncate">
                                    {n.summary || n.fullTranscript?.slice(0, 80)}
                                  </div>
                                </div>
                                <ArrowRight className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Projects results */}
                        {searchResults.projects.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                              Projects
                            </div>
                            {searchResults.projects.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setActiveView('projects');
                                  setSearchFocused(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/80 transition-colors flex items-center justify-between cursor-pointer"
                              >
                                <span className="text-xs font-medium text-stone-900 dark:text-stone-100">
                                  {p.name}
                                </span>
                                <span className="text-[10px] text-stone-400">Project</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Action triggers */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Mobile Search Icon Button: visible only on < sm */}
            <button
              type="button"
              onClick={() => setIsMobileSearchOpen(true)}
              className="sm:hidden p-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 rounded-xl transition-colors cursor-pointer"
              title="Search notes"
              aria-label="Search notes"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* ESP32 Sync */}
            <button
              type="button"
              onClick={() => setActiveView('device_sync')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer shrink-0 ${
                activeView === 'device_sync'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-semibold shadow-2xs'
                  : 'bg-stone-200/70 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200'
              }`}
              title="ESP32 Sync: connect and transfer voice recordings"
              aria-label="Open ESP32 hardware device sync"
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">ESP32 Sync</span>
            </button>

            {/* Audio File Picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="hidden md:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-xl bg-stone-200/70 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 transition-colors cursor-pointer shrink-0"
              title="Import audio file (.wav, .mp3)"
              aria-label="Import audio file"
            >
              <Upload className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Import</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 text-xs font-medium rounded-xl bg-stone-200/70 hover:bg-stone-200 dark:bg-stone-800/80 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 transition-colors cursor-pointer shrink-0"
              title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle dark and light theme"
            >
              {settings.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-stone-700" />
              )}
            </button>

            {/* Manual Note Button */}
            <button
              type="button"
              onClick={() => createManualNote()}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 transition-colors shadow-xs cursor-pointer shrink-0"
              title="Create a text note without audio"
              aria-label="Create a new text note"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">New Note</span>
            </button>
          </div>
        </>
      )}
    </header>
  );
};
