import React, { useState } from 'react';
import { 
  Archive, 
  RotateCcw, 
  Trash2, 
  Search, 
  FileText, 
  ExternalLink 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ArchiveView: React.FC = () => {
  const { notes, archiveNote, deleteNote, setSelectedNoteId, setActiveView } = useApp();
  const [search, setSearch] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<typeof notes[0] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const archivedNotes = notes.filter(n => n.isArchived && (
    !search.trim() ||
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.summary.toLowerCase().includes(search.toLowerCase())
  ));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Archived Notes
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
            {archivedNotes.length}
          </span>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
          Inactive or completed notes hidden from active views but fully searchable and retrievable
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search archived notes..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500 shadow-xs"
        />
      </div>

      {/* List */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-xs">
        {archivedNotes.length === 0 ? (
          <div className="py-12 text-center text-xs text-stone-400 space-y-2">
            <Archive className="w-8 h-8 text-stone-300 dark:text-stone-700 mx-auto" />
            <div>No archived notes found</div>
          </div>
        ) : (
          archivedNotes.map(n => (
            <div
              key={n.id}
              className="p-4 flex items-center justify-between gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                    {n.title}
                  </h3>
                  <span className="text-[10px] text-stone-400 font-mono capitalize">
                    · {n.noteType}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                  {n.summary}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => archiveNote(n.id, false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-medium text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
                  title="Restore note to active library"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNoteToDelete(n)}
                  className="p-1.5 text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Permanently Delete Note"
                  aria-label={`Permanently delete "${n.title}"`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

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
                  Are you sure you want to permanently delete <span className="font-semibold text-stone-800 dark:text-stone-200">"{noteToDelete.title}"</span>? This action cannot be undone.
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
                    <span>Delete Permanently</span>
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
