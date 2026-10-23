import React, { useState, useRef, useEffect } from 'react';
import { 
  Inbox, 
  RotateCw, 
  CheckCheck, 
  FolderKanban, 
  Tag, 
  Archive, 
  Play, 
  AlertCircle, 
  Clock, 
  Sparkles, 
  Trash2,
  CheckSquare,
  Square,
  Filter,
  ChevronDown
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Note, NoteStatus } from '../../types';
import { formatDuration } from '../../services/audioUtils';
import { ReviewModal } from './ReviewModal';

export const InboxView: React.FC = () => {
  const { 
    notes, 
    recordings, 
    projects, 
    updateNote, 
    deleteNote, 
    archiveNote, 
    reprocessNote, 
    playRecording,
    setSelectedNoteId,
    setActiveView 
  } = useApp();

  const [reviewingNote, setReviewingNote] = useState<Note | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready_for_review' | 'in_progress' | 'failed' | 'no_project'>('all');
  const [isAssignProjectOpen, setIsAssignProjectOpen] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAssignProjectOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setIsAssignProjectOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAssignProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isAssignProjectOpen]);

  const handleDropdownMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsAssignProjectOpen(true);
  };

  const handleDropdownMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsAssignProjectOpen(false);
    }, 250);
  };

  // Filter notes that are unfiled or in inbox
  const inboxNotes = notes.filter(n => {
    if (n.isArchived) return false;
    if (statusFilter === 'ready_for_review') return n.status === 'ready_for_review';
    if (statusFilter === 'in_progress') return n.status === 'transcribing' || n.status === 'awaiting_transcription' || n.status === 'awaiting_organization';
    if (statusFilter === 'failed') return n.status === 'failed';
    if (statusFilter === 'no_project') return !n.projectId;
    // 'all' inbox: anything not filed or explicitly awaiting review or without project
    return n.status !== 'filed' || !n.projectId;
  });

  const toggleSelectNote = (id: string) => {
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedNoteIds.length === inboxNotes.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(inboxNotes.map(n => n.id));
    }
  };

  // Bulk actions
  const handleBulkMarkFiled = async () => {
    for (const id of selectedNoteIds) {
      const n = notes.find(item => item.id === id);
      if (n) {
        await updateNote({ ...n, status: 'filed' });
      }
    }
    setSelectedNoteIds([]);
  };

  const handleBulkAssignProject = async (projectId: string) => {
    for (const id of selectedNoteIds) {
      const n = notes.find(item => item.id === id);
      if (n) {
        await updateNote({ ...n, projectId, status: 'filed' });
      }
    }
    setSelectedNoteIds([]);
  };

  const handleBulkArchive = async () => {
    for (const id of selectedNoteIds) {
      await archiveNote(id, true);
    }
    setSelectedNoteIds([]);
  };

  const handleBulkRetry = async () => {
    for (const id of selectedNoteIds) {
      await reprocessNote(id);
    }
    setSelectedNoteIds([]);
  };

  const getStatusBadge = (status: NoteStatus) => {
    switch (status) {
      case 'ready_for_review':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            Ready for Review
          </span>
        );
      case 'transcribing':
      case 'awaiting_organization':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 animate-pulse">
            Processing...
          </span>
        );
      case 'awaiting_transcription':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-300/50 dark:bg-stone-700/50 text-stone-600 dark:text-stone-400">
            Queued
          </span>
        );
      case 'failed':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            Failed
          </span>
        );
      case 'filed':
        return (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
            No Project
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Smart Inbox
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
              {inboxNotes.length}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Incoming recordings, unreviewed AI suggestions, and unassigned notes
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-xl text-xs overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'all', label: 'All Inbox' },
            { id: 'ready_for_review', label: 'Ready for Review' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'failed', label: 'Failed' },
            { id: 'no_project', label: 'Unassigned' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 whitespace-nowrap cursor-pointer min-h-[34px] ${
                statusFilter === f.id
                  ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-stone-50 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedNoteIds.length > 0 && (
        <div className="p-3 rounded-xl bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>{selectedNoteIds.length} item{selectedNoteIds.length > 1 ? 's' : ''} selected</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleBulkMarkFiled}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
              <span>Mark Filed</span>
            </button>

            {/* Quick Assign Project Dropdown */}
            <div
              ref={assignDropdownRef}
              className="relative"
              onMouseEnter={handleDropdownMouseEnter}
              onMouseLeave={handleDropdownMouseLeave}
            >
              <button
                type="button"
                onClick={() => setIsAssignProjectOpen(prev => !prev)}
                aria-expanded={isAssignProjectOpen}
                aria-haspopup="true"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                  isAssignProjectOpen
                    ? 'bg-stone-700 text-stone-100 dark:bg-stone-300 dark:text-stone-900 ring-2 ring-amber-500/50'
                    : 'bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-[0.98]'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
                <span>Assign Project</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isAssignProjectOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAssignProjectOpen && (
                <div
                  className="absolute right-0 top-full pt-1.5 z-50 w-52 animate-in fade-in zoom-in-95 duration-150"
                  role="menu"
                >
                  <div className="bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 rounded-xl shadow-2xl border border-stone-200/90 dark:border-stone-800/90 p-1.5 space-y-0.5">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-800 mb-1">
                      Assign to Project
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleBulkAssignProject('');
                        setIsAssignProjectOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-xs flex items-center gap-2 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
                      role="menuitem"
                    >
                      <span className="w-2.5 h-2.5 rounded-full border border-stone-400 dark:border-stone-600 bg-transparent shrink-0" />
                      <span className="truncate">No Project (Inbox)</span>
                    </button>

                    {projects.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          handleBulkAssignProject(p.id);
                          setIsAssignProjectOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-xs flex items-center gap-2 text-stone-800 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100 transition-colors cursor-pointer"
                        role="menuitem"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: p.color }} />
                        <span className="truncate font-medium">{p.name}</span>
                      </button>
                    ))}

                    {projects.length === 0 && (
                      <div className="px-2.5 py-2 text-xs text-stone-400 dark:text-stone-500 italic">
                        No projects created yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleBulkRetry}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer font-medium"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>

            <button
              type="button"
              onClick={handleBulkArchive}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer font-medium"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          </div>
        </div>
      )}

      {/* Inbox List */}
      {inboxNotes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
          <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto text-stone-400">
            <Inbox className="w-6 h-6" />
          </div>
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Inbox is clear
          </div>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            All voice recordings have been transcribed, reviewed, and filed into projects.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-xs">
          {/* Select all header */}
          <div className="px-4 py-3 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between text-xs text-stone-500">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 font-medium hover:text-stone-900 dark:hover:text-stone-100"
            >
              {selectedNoteIds.length === inboxNotes.length && inboxNotes.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-stone-900 dark:text-stone-100" />
              ) : (
                <Square className="w-4 h-4 text-stone-400" />
              )}
              <span>Select All</span>
            </button>

            <span>{inboxNotes.length} unfiled / pending item{inboxNotes.length !== 1 ? 's' : ''}</span>
          </div>

          {inboxNotes.map(note => {
            const isSelected = selectedNoteIds.includes(note.id);
            const rec = recordings.find(r => r.id === note.recordingId);

            return (
              <div
                key={note.id}
                className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                  isSelected ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'hover:bg-stone-50/80 dark:hover:bg-stone-800/40'
                }`}
              >
                {/* Checkbox & Details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => toggleSelectNote(note.id)}
                    className="mt-1 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-stone-900 dark:text-stone-100" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {note.title}
                      </span>
                      {getStatusBadge(note.status)}
                      <span className="text-[10px] text-stone-400 font-mono capitalize">
                        · {note.noteType}
                      </span>
                      {rec && (
                        <span className="text-[10px] text-stone-400 font-mono">
                          · {formatDuration(rec.durationSeconds)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed">
                      {note.summary || note.fullTranscript || 'Awaiting transcription and summary extraction...'}
                    </p>

                    {/* Metadata & suggestions */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-stone-400">
                      {note.suggestedProjectId && (
                        <button
                          type="button"
                          onClick={async () => {
                            await updateNote({ ...note, projectId: note.suggestedProjectId, status: 'filed' });
                          }}
                          className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer font-medium"
                          title="Click to immediately accept suggested project and file note"
                        >
                          <FolderKanban className="w-3 h-3" />
                          <span>Suggested: {projects.find(p => p.id === note.suggestedProjectId)?.name} (Accept)</span>
                        </button>
                      )}

                      {note.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-stone-400" />
                          <span>{note.tags.join(', ')}</span>
                        </div>
                      )}

                      <span className="font-mono text-[10px]">
                        {new Date(note.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row Action triggers */}
                <div className="flex items-center gap-2 shrink-0">
                  {rec && (
                    <button
                      type="button"
                      onClick={() => playRecording(rec, 0)}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                      title="Play Recording"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}

                  {note.status === 'ready_for_review' ? (
                    <button
                      type="button"
                      onClick={() => setReviewingNote(note)}
                      className="px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-amber-500" />
                      <span>Review</span>
                    </button>
                  ) : note.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => reprocessNote(note.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteId(note.id);
                        setActiveView('note_detail');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                    >
                      Open Note
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewingNote && (
        <ReviewModal
          note={reviewingNote}
          onClose={() => setReviewingNote(null)}
        />
      )}
    </div>
  );
};
