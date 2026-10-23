import React, { useState } from 'react';
import { 
  X, 
  Check, 
  CheckCheck, 
  Sparkles, 
  FolderKanban, 
  Tag, 
  AlertTriangle, 
  Clock, 
  RotateCw,
  Archive,
  ArrowRight,
  Plus,
  Trash2
} from 'lucide-react';
import { Note, Project, TaskItem } from '../../types';
import { useApp } from '../../context/AppContext';

interface ReviewModalProps {
  note: Note;
  onClose: () => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ note, onClose }) => {
  const { 
    projects, 
    updateNote, 
    notes, 
    tasks, 
    createTask, 
    deleteTask,
    reprocessNote,
    archiveNote,
    setSelectedNoteId,
    setActiveView 
  } = useApp();

  const [title, setTitle] = useState(note.title);
  const [summary, setSummary] = useState(note.summary);
  const [noteType, setNoteType] = useState(note.noteType);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(note.projectId || note.suggestedProjectId || '');
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  
  // Pending tasks extracted from this note
  const noteTasks = tasks.filter(t => t.noteId === note.id);

  const duplicateNote = note.possibleDuplicateOfId 
    ? notes.find(n => n.id === note.possibleDuplicateOfId)
    : undefined;

  const handleAddTag = () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleAcceptAllSafe = async () => {
    const updated: Note = {
      ...note,
      title,
      summary,
      noteType,
      projectId: selectedProjectId || undefined,
      tags,
      status: 'filed',
    };
    await updateNote(updated);
    onClose();
  };

  const handleKeepInInbox = async () => {
    const updated: Note = {
      ...note,
      title,
      summary,
      noteType,
      projectId: selectedProjectId || undefined,
      tags,
      status: 'ready_for_review',
    };
    await updateNote(updated);
    onClose();
  };

  const handleArchive = async () => {
    await archiveNote(note.id, true);
    onClose();
  };

  const handleReprocess = async () => {
    await reprocessNote(note.id);
    onClose();
  };

  const noteTypeOptions: Note['noteType'][] = [
    'meeting', 'lecture', 'idea', 'reminder', 'personal', 'journal', 'interview'
  ];

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[96vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-950/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                Review & Organize Voice Note
              </h2>
              <div className="text-[10px] sm:text-[11px] text-stone-500 truncate">
                Confidence score: {Math.round((note.confidenceScore || 0.85) * 100)}% · Review suggestions
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800/50 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs flex-1">
          {/* Possible Duplicate Warning */}
          {duplicateNote && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div className="flex-1">
                <div className="font-semibold text-xs">Possible Duplicate Content Detected</div>
                <div className="text-[11px] mt-0.5 text-amber-700 dark:text-amber-300">
                  This note shares significant overlap with "{duplicateNote.title}". You can review or keep both separate.
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedNoteId(duplicateNote.id);
                  setActiveView('note_detail');
                  onClose();
                }}
                className="text-[11px] underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
              >
                Inspect Original
              </button>
            </div>
          )}

          {/* Title & Note Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                Note Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                Note Type
              </label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as Note['noteType'])}
                className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 capitalize focus:outline-hidden"
              >
                {noteTypeOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary Preview & Edit */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>Executive Summary</span>
              <span className="text-[10px] text-stone-400">Editable preview</span>
            </label>
            <textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 leading-relaxed focus:outline-hidden focus:border-amber-500 resize-none"
            />
          </div>

          {/* Project Assignment */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-stone-400" />
              <span>Project Assignment</span>
              {note.suggestedProjectId && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1">
                  (Suggested: {projects.find(p => p.id === note.suggestedProjectId)?.name || 'Project'})
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedProjectId('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  !selectedProjectId
                    ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 border-transparent shadow-xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-700'
                }`}
              >
                No Project (Inbox)
              </button>
              {projects.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    selectedProjectId === p.id
                      ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 border-transparent shadow-xs'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200/80 dark:hover:bg-stone-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shadow-2xs" style={{ backgroundColor: p.color }} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-stone-400" />
              <span>Tags</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
                >
                  <span>#{tag}</span>
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag..."
                  className="px-2 py-1 text-xs rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 focus:outline-hidden w-24"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="p-1 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Extracted Tasks for Approval */}
          {noteTasks.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-stone-200 dark:border-stone-800">
              <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400 flex items-center justify-between">
                <span>Extracted Action Items ({noteTasks.length})</span>
                <span className="text-[10px] text-stone-400">Review tasks</span>
              </label>
              <div className="space-y-1.5">
                {noteTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-stone-100/70 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${task.priority === 'high' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                      <span className="text-stone-800 dark:text-stone-200 truncate">{task.title}</span>
                      {task.dueDate && (
                        <span className="text-[10px] text-stone-400 font-mono flex items-center gap-1 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          {task.dueDate}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-stone-400 hover:text-rose-500 p-1 transition-colors"
                      title="Reject Task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uncertainties / Processing Warnings */}
          {note.uncertainties && note.uncertainties.length > 0 && (
            <div className="p-2.5 rounded-lg bg-stone-100 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400">
              <span className="font-semibold text-stone-700 dark:text-stone-300">Ambiguities to note: </span>
              {note.uncertainties.join(' ')}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReprocess}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 transition-colors"
              title="Re-run transcription and organizer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={handleArchive}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleKeepInInbox}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors"
            >
              Keep in Inbox
            </button>
            <button
              type="button"
              onClick={handleAcceptAllSafe}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 transition-colors shadow-xs"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Accept & File Note</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
