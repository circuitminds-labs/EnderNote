import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Play, 
  FolderKanban, 
  Tag, 
  Clock, 
  Plus, 
  Star,
  Trash2,
  LayoutGrid, 
  List,
  Sparkles,
  Bookmark
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Note, NoteType } from '../../types';
import { formatDuration } from '../../services/audioUtils';

interface NotesListViewProps {
  onOpenRecordModal?: () => void;
}

export const NotesListView: React.FC<NotesListViewProps> = ({ onOpenRecordModal }) => {
  const { 
    notes, 
    recordings, 
    projects, 
    bookmarks,
    setSelectedNoteId, 
    setActiveView, 
    playRecording,
    updateNote,
    deleteNote,
    toggleFavoriteNote,
    createManualNote 
  } = useApp();

  const [search, setSearch] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title'>('newest');

  // Collect all available tags across active notes
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => {
      if (!n.isArchived && n.tags) {
        n.tags.forEach(t => {
          if (t) set.add(t);
        });
      }
    });
    return Array.from(set);
  }, [notes]);

  // Filtered & sorted notes
  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => {
        if (n.isArchived) return false;
        if (selectedProjectId !== 'all' && n.projectId !== selectedProjectId) return false;
        if (selectedType !== 'all' && n.noteType !== selectedType) return false;
        if (selectedTag !== 'all' && !(n.tags || []).includes(selectedTag)) return false;

        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = (n.title || '').toLowerCase().includes(q);
          const matchSummary = (n.summary || '').toLowerCase().includes(q);
          const matchTranscript = (n.fullTranscript || '').toLowerCase().includes(q);
          const matchTag = (n.tags || []).some(t => typeof t === 'string' && t.toLowerCase().includes(q));
          if (!matchTitle && !matchSummary && !matchTranscript && !matchTag) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return a.title.localeCompare(b.title);
      });
  }, [notes, selectedProjectId, selectedType, selectedTag, search, sortBy]);

  const handleOpenNote = (id: string) => {
    setSelectedNoteId(id);
    setActiveView('note_detail');
  };

  const toggleFavorite = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    toggleFavoriteNote(note.id);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Notes Library
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
              {filteredNotes.length}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Personal knowledge base synchronized from voice notes and manual entries
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-stone-200/70 dark:bg-stone-800/80 p-0.5 rounded-lg border border-stone-300/50 dark:border-stone-700/50">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs' 
                  : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs' 
                  : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => createManualNote()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Text Search */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by title, content, or tags..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Project Dropdown */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full sm:w-44 px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer min-h-[38px]"
          >
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Note Type Dropdown */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full sm:w-36 px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 capitalize hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer min-h-[38px]"
          >
            <option value="all">All Types</option>
            {['meeting', 'lecture', 'idea', 'reminder', 'personal', 'journal', 'interview'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full sm:w-36 px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer min-h-[38px]"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </div>

        {/* Quick Tag Pills */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-800">
            <span className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider mr-1">
              Tags:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag('all')}
              className={`text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                selectedTag === 'all'
                  ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-semibold shadow-2xs'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-700'
              }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag === selectedTag ? 'all' : tag)}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedTag === tag
                    ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-semibold shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-700'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes Container */}
      {filteredNotes.length === 0 ? (
        <div className="py-16 text-center text-xs text-stone-400 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2">
          <FileText className="w-8 h-8 text-stone-300 dark:text-stone-700 mx-auto" />
          <div className="font-semibold text-stone-700 dark:text-stone-300">No notes match your filters</div>
          <p>Try resetting filters or creating a new voice recording.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredNotes.map(note => {
            const rec = recordings.find(r => r.id === note.recordingId);
            const project = projects.find(p => p.id === note.projectId);
            const bmCount = rec ? bookmarks.filter(b => b.recordingId === rec.id).length : 0;

            return (
              <div
                key={note.id}
                onClick={() => handleOpenNote(note.id)}
                className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700 cursor-pointer transition-all flex flex-col justify-between group shadow-xs hover:shadow-md"
              >
                <div className="space-y-3">
                  {/* Top row: Project color & Favorite */}
                  <div className="flex items-center justify-between text-xs">
                    {project ? (
                      <span className="flex items-center gap-1.5 font-medium text-stone-700 dark:text-stone-300 text-[11px]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="truncate">{project.name}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-400">Unassigned</span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(e, note)}
                        className={`p-1 rounded transition-colors ${note.isFavorite ? 'text-amber-500 fill-amber-500' : 'text-stone-300 dark:text-stone-600 hover:text-stone-500'}`}
                        title={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star className={`w-3.5 h-3.5 ${note.isFavorite ? 'fill-current' : ''}`} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note);
                        }}
                        className="p-1 rounded text-stone-300 dark:text-stone-600 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title="Delete note"
                        aria-label={`Delete note "${note.title}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                    {note.title}
                  </h3>

                  {/* Summary / Transcript Preview */}
                  <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-3 leading-relaxed">
                    {note.summary || note.fullTranscript || 'No summary text available.'}
                  </p>
                </div>

                {/* Footer metadata: Tags, Duration, Date */}
                <div className="pt-4 mt-4 border-t border-stone-100 dark:border-stone-800/80 space-y-2">
                  {/* Tags */}
                  {(note.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(note.tags || []).slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] text-stone-500 dark:text-stone-400">
                          #{t}
                        </span>
                      ))}
                      {(note.tags || []).length > 3 && (
                        <span className="text-[10px] text-stone-400">+{(note.tags || []).length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono">
                    <span className="capitalize">{note.noteType}</span>
                    <div className="flex items-center gap-2">
                      {rec && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playRecording(rec, 0);
                          }}
                          className="flex items-center gap-1 text-stone-600 dark:text-stone-300 hover:text-amber-500 transition-colors"
                          title="Play Audio"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{formatDuration(rec.durationSeconds)}</span>
                        </button>
                      )}
                      <span>·</span>
                      <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-xs">
          {filteredNotes.map(note => {
            const rec = recordings.find(r => r.id === note.recordingId);
            const project = projects.find(p => p.id === note.projectId);

            return (
              <div
                key={note.id}
                onClick={() => handleOpenNote(note.id)}
                className="p-4 flex items-center justify-between gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 cursor-pointer transition-colors group"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {project && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                    )}
                    <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                      {note.title}
                    </h3>
                    <span className="text-[10px] text-stone-400 font-mono capitalize">
                      · {note.noteType}
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                    {note.summary || note.fullTranscript}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono text-stone-400 shrink-0">
                  {rec && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playRecording(rec, 0);
                      }}
                      className="flex items-center gap-1 text-stone-600 dark:text-stone-300 hover:text-amber-500 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>{formatDuration(rec.durationSeconds)}</span>
                    </button>
                  )}
                  <span>{new Date(note.createdAt).toLocaleDateString()}</span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete(note);
                    }}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Delete Note"
                    aria-label={`Delete note "${note.title}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-App Delete Confirmation Modal */}
      {noteToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div 
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Permanently delete this note?
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-stone-800 dark:text-stone-200">"{noteToDelete.title}"</span>? This will permanently remove the note and its summaries. Any linked audio recording in your Audio Library will remain preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setNoteToDelete(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (isDeleting || !noteToDelete) return;
                  setIsDeleting(true);
                  try {
                    await deleteNote(noteToDelete.id);
                  } catch (err) {
                    console.error('Delete error:', err);
                  } finally {
                    setIsDeleting(false);
                    setNoteToDelete(null);
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Note</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
