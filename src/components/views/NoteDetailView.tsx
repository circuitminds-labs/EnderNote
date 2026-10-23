import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Bookmark, 
  Clock, 
  FolderKanban, 
  Tag, 
  CheckSquare, 
  Copy, 
  Download, 
  Sparkles, 
  RotateCw, 
  Trash2, 
  Archive, 
  Star,
  Plus, 
  ExternalLink, 
  Check, 
  ListOrdered,
  BookOpen,
  Volume2,
  Share2,
  FileText
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Note, TranscriptSegment, AudioBookmark, TaskItem } from '../../types';
import { formatDuration, formatBytes, downloadBlob } from '../../services/audioUtils';
import { groqService } from '../../services/groqService';
import { dbService } from '../../services/db';

export const NoteDetailView: React.FC = () => {
  const { 
    selectedNoteId, 
    notes, 
    recordings, 
    projects, 
    tasks, 
    bookmarks, 
    updateNote, 
    deleteNote, 
    archiveNote, 
    reprocessNote, 
    player, 
    playRecording, 
    seekTo, 
    addBookmark, 
    deleteBookmark, 
    toggleBookmark,
    toggleFavoriteNote,
    copyNoteText,
    showCapsule,
    createTask, 
    toggleTask, 
    deleteTask,
    setSelectedNoteId, 
    setActiveView,
    settings 
  } = useApp();

  const note = notes.find(n => n.id === selectedNoteId);
  const recording = note?.recordingId ? recordings.find(r => r.id === note.recordingId) : undefined;
  const project = note?.projectId ? projects.find(p => p.id === note.projectId) : undefined;
  const noteBookmarks = recording ? bookmarks.filter(b => b.recordingId === recording.id) : [];
  const noteTasks = tasks.filter(t => t.noteId === note?.id);

  // Generic tags that should never be used as sole reason for related note link
  const genericTags = useMemo(() => new Set(['note', 'notes', 'voice-note', 'audio', 'recording', 'voice-memo']), []);

  const relatedNotes = useMemo(() => {
    if (!note) return [];
    const noteTags = new Set(
      (note.tags || [])
        .map(t => (t || '').toLowerCase())
        .filter(t => t.length > 2 && !genericTags.has(t))
    );

    return notes
      .filter(n => n.id !== note.id && !n.isArchived)
      .map(n => {
        const isExplicit = (note.relatedNoteIds || []).includes(n.id) || (n.relatedNoteIds || []).includes(note.id);
        const sharedTags = (n.tags || [])
          .map(t => (t || '').toLowerCase())
          .filter(t => noteTags.has(t));
        const sameProject = note.projectId && n.projectId && note.projectId === n.projectId;
        
        let relationRationale = '';
        if (sharedTags.length > 0) {
          relationRationale = `Shared topic: #${sharedTags.join(', #')}`;
        } else if (sameProject && project) {
          relationRationale = `Same project: ${project.name}`;
        } else if (isExplicit) {
          relationRationale = `Direct thematic connection`;
        }

        // Clean contextual summary strictly from the note's actual content
        const cleanSummary = (n.summary || n.fullTranscript || '').replace(/^#+\s+/gm, '').trim();
        const contextualDescription = cleanSummary 
          ? (cleanSummary.length > 110 ? `${cleanSummary.slice(0, 105)}...` : cleanSummary)
          : 'No detailed summary recorded for this note.';

        return {
          ...n,
          isExplicit,
          sharedTags,
          relationRationale,
          contextualDescription
        };
      })
      .filter(n => n.isExplicit || n.sharedTags.length > 0)
      .slice(0, 5);
  }, [note, notes, project, genericTags]);

  // Local editable states
  const [title, setTitle] = useState(note?.title || '');
  const [summary, setSummary] = useState(note?.summary || '');
  const [newTagInput, setNewTagInput] = useState('');
  const [newTaskInput, setNewTaskInput] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isGeneratingStyle, setIsGeneratingStyle] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'keypoints' | 'tasks'>('transcript');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Track note ID to prevent debounce from writing old note's title to newly selected note
  const currentNoteIdRef = useRef<string | null>(note?.id || null);

  // Sync state if selected note changes
  useEffect(() => {
    if (note && note.id !== currentNoteIdRef.current) {
      currentNoteIdRef.current = note.id;
      setTitle(note.title || '');
      setSummary(note.summary || '');
    }
  }, [note?.id, note?.title, note?.summary]);

  // Autosave title & summary on change debounce - strictly verifying the matching note
  useEffect(() => {
    if (!note || note.id !== currentNoteIdRef.current) return;
    const timer = setTimeout(() => {
      if ((title !== note.title || summary !== note.summary) && (title.trim() !== '' || summary.trim() !== '')) {
        updateNote({ ...note, title, summary });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, summary, note?.id]);

  if (!note) {
    return (
      <div className="p-12 text-center text-xs text-stone-400 space-y-3">
        <div>Note not found or deleted.</div>
        <button
          onClick={() => setActiveView('notes')}
          className="text-stone-900 dark:text-stone-100 font-semibold underline"
        >
          Back to All Notes
        </button>
      </div>
    );
  }

  // Active playing segment detection for highlight
  const isCurrentlyPlayingThisAudio = player.currentRecording?.id === recording?.id && player.isPlaying;
  const segmentsList = note.segments || [];
  const activeSegmentIndex = segmentsList.findIndex(
    seg => player.currentTime >= seg.start && player.currentTime <= seg.end
  );

  const handleSeekSegment = (seg: TranscriptSegment) => {
    if (recording) {
      if (player.currentRecording?.id !== recording.id) {
        playRecording(recording, seg.start);
      } else {
        seekTo(seg.start);
      }
    }
  };

  const handleAddTag = () => {
    const trimmed = newTagInput.trim().toLowerCase();
    if (trimmed && !note.tags.includes(trimmed)) {
      updateNote({ ...note, tags: [...note.tags, trimmed] });
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    updateNote({ ...note, tags: note.tags.filter(t => t !== tag) });
  };

  const handleAddTask = async () => {
    if (!newTaskInput.trim()) return;
    await createTask({
      noteId: note.id,
      recordingId: recording?.id,
      title: newTaskInput.trim(),
      completed: false,
      priority: 'medium',
      projectId: note.projectId,
    });
    setNewTaskInput('');
  };

  // Copy helpers
  const handleCopy = (text: string) => {
    copyNoteText(text, note.title);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Export Markdown
  const handleExportMarkdown = () => {
    let md = `# ${note.title}\n\n`;
    md += `**Date:** ${new Date(note.createdAt).toLocaleString()}\n`;
    md += `**Project:** ${project?.name || 'Unassigned'}\n`;
    md += `**Tags:** ${note.tags.join(', ') || 'None'}\n\n`;
    md += `## Summary\n${note.summary}\n\n`;

    if (note.keyPoints.length > 0) {
      md += `## Key Points\n`;
      note.keyPoints.forEach(kp => {
        md += `- ${kp}\n`;
      });
      md += `\n`;
    }

    if (noteTasks.length > 0) {
      md += `## Action Items\n`;
      noteTasks.forEach(t => {
        md += `- [${t.completed ? 'x' : ' '}] ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ''}\n`;
      });
      md += `\n`;
    }

    if (note.fullTranscript) {
      md += `## Full Transcript\n${note.fullTranscript}\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    downloadBlob(blob, `${note.title.replace(/\s+/g, '_')}.md`);
  };

  // Export Audio WAV
  const handleExportAudio = () => {
    if (recording && recording.audioBlob) {
      downloadBlob(recording.audioBlob, recording.filename);
    }
  };

  // Alternate Style generation
  const handleGenerateAlternateStyle = async (
    style: 'meeting_minutes' | 'study_notes' | 'executive_summary' | 'structured_outline'
  ) => {
    if (!note.fullTranscript) return;
    setIsGeneratingStyle(true);
    try {
      const result = await groqService.generateAlternateStyle(
        note.fullTranscript,
        style,
        settings.groqApiKey,
        settings.summarizationModel
      );
      setSummary(result);
      await updateNote({ ...note, summary: result });
    } finally {
      setIsGeneratingStyle(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80 dark:border-stone-800/80">
        <button
          onClick={() => setActiveView('notes')}
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Notes</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Audio Play Trigger */}
          {recording && (
            <button
              onClick={() => {
                if (player.currentRecording?.id === recording.id && player.isPlaying) {
                  player.audioElement?.pause();
                } else {
                  playRecording(recording, 0);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold transition-colors shadow-xs"
            >
              {player.currentRecording?.id === recording.id && player.isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause Audio</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play Recording ({formatDuration(recording.durationSeconds)})</span>
                </>
              )}
            </button>
          )}

          {/* Copy */}
          <button
            onClick={() => handleCopy(note.fullTranscript || note.summary)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
            title="Copy Transcript & Summary"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCopied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Export Markdown */}
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
            title="Download as Markdown file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export .MD</span>
          </button>

          {/* Export Audio */}
          {recording && recording.audioBlob && (
            <button
              onClick={handleExportAudio}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
              title="Download original WAV audio file"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Audio</span>
            </button>
          )}

          {/* Reprocess */}
          {recording && (
            <button
              type="button"
              onClick={() => reprocessNote(note.id)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              title="Re-run transcription and organization"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

          {/* Star / Favorite */}
          <button
            type="button"
            onClick={() => toggleFavoriteNote(note.id)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-stone-200/60 dark:hover:bg-stone-800 ${
              note.isFavorite 
                ? 'text-amber-500 hover:text-amber-400' 
                : 'text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
            title={note.isFavorite ? 'Remove from Starred' : 'Star Note'}
          >
            <Star className={`w-4 h-4 ${note.isFavorite ? 'fill-current' : ''}`} />
          </button>

          {/* Archive / Restore */}
          <button
            type="button"
            onClick={() => archiveNote(note.id, !note.isArchived)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={note.isArchived ? 'Restore Note' : 'Archive Note'}
          >
            <Archive className="w-4 h-4" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Delete Note"
            aria-label="Delete Note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Note Header: Title, Project assignment, Tags */}
      <div className="space-y-4">
        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-b border-transparent hover:border-stone-300 dark:hover:border-stone-700 focus:border-amber-500 focus:outline-hidden text-stone-900 dark:text-stone-100 py-1 transition-colors"
        />

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 dark:text-stone-400">
          {/* Project selector */}
          <div className="flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <select
              value={note.projectId || ''}
              onChange={(e) => updateNote({ ...note, projectId: e.target.value || undefined })}
              className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 hover:border-stone-300 dark:hover:border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-800 dark:text-stone-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 shadow-2xs transition-colors cursor-pointer"
            >
              <option value="">No Project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <span className="text-stone-300 dark:text-stone-700">·</span>

          {/* Note Type */}
          <select
            value={note.noteType}
            onChange={(e) => updateNote({ ...note, noteType: e.target.value as any })}
            className="bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800/90 hover:border-stone-300 dark:hover:border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-800 dark:text-stone-200 capitalize focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 shadow-2xs transition-colors cursor-pointer"
          >
            {['meeting', 'lecture', 'idea', 'reminder', 'personal', 'journal', 'interview'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <span className="text-stone-300 dark:text-stone-700">·</span>

          {/* Date created */}
          <span className="font-mono text-[11px]">
            {new Date(note.createdAt).toLocaleDateString()} at {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          {recording && (
            <>
              <span className="text-stone-300 dark:text-stone-700">·</span>
              <span className="font-mono text-[11px] text-stone-400">
                {recording.filename} ({formatBytes(recording.fileSizeBytes)})
              </span>
            </>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(note.tags || []).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300"
            >
              <span>#{tag}</span>
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-rose-500"
              >
                ×
              </button>
            </span>
          ))}

          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              placeholder="+ add tag"
              className="px-2 py-0.5 text-xs rounded-md bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 focus:outline-hidden w-20"
            />
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 text-xs overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 min-w-max">
          {[
            { id: 'transcript', label: 'Synchronized Transcript', count: (note.segments || []).length },
            { id: 'summary', label: 'Summary & Synthesis' },
            { id: 'keypoints', label: 'Key Points', count: (note.keyPoints || []).length },
            { id: 'tasks', label: 'Action Items', count: noteTasks.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-2.5 font-medium border-b-2 transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer min-h-[42px] ${
                activeTab === tab.id
                  ? 'border-amber-500 text-stone-900 dark:text-stone-100 font-semibold'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] font-mono text-stone-400">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Synchronized Transcript with Click-To-Seek */}
      {activeTab === 'transcript' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-stone-100/70 dark:bg-stone-900/60 border border-stone-200/60 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              <span>Click any timestamped sentence to jump audio playback directly to that position.</span>
            </span>

            {recording && (
              <span className="font-mono text-[11px]">
                {(note.segments || []).length} segments · 16kHz Mono PCM
              </span>
            )}
          </div>

          {(note.segments || []).length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-400 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
              {note.fullTranscript || 'No transcript text available yet.'}
            </div>
          ) : (
            <div className="space-y-2">
              {(note.segments || []).map((seg, idx) => {
                const isActive = isCurrentlyPlayingThisAudio && activeSegmentIndex === idx;
                const recId = recording?.id || note.recordingId || note.id;
                const isBookmarked = bookmarks.some(bm => 
                  (seg.id && bm.transcriptSegmentId === seg.id) ||
                  (bm.recordingId === recId && Math.abs(bm.timestampMs - Math.round(seg.start * 1000)) <= 1500)
                );

                return (
                  <div
                    key={seg.id || idx}
                    onClick={() => handleSeekSegment(seg)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 text-xs leading-relaxed ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/50 shadow-xs'
                        : 'bg-white dark:bg-stone-900/90 border-stone-200/70 dark:border-stone-800/80 hover:border-stone-300 dark:hover:border-stone-700'
                    }`}
                  >
                    <button
                      type="button"
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${
                        isActive
                          ? 'bg-amber-500 text-stone-950 font-bold'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors'
                      }`}
                      title="Seek to this moment"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{formatDuration(seg.start)}</span>
                    </button>

                    <div className="flex-1 text-stone-800 dark:text-stone-200">
                      {seg.text}
                    </div>

                    {/* Bookmark toggle for this segment */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(
                          recId,
                          Math.round(seg.start * 1000),
                          seg.text.slice(0, 35),
                          'highlight',
                          seg.id
                        );
                      }}
                      className={`p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                        isBookmarked
                          ? 'text-amber-500 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-400/15 hover:bg-amber-500/20'
                          : 'text-stone-400 dark:text-stone-600 hover:text-amber-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                      title={isBookmarked ? 'Remove Bookmark from this segment' : 'Bookmark this segment'}
                      aria-label={isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
                    >
                      <Bookmark 
                        className={`w-4 h-4 stroke-current ${isBookmarked ? 'fill-current' : 'fill-transparent'}`} 
                        strokeWidth={2}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Summary & Synthesis with Alternate Styles */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Quick Alternate Styles toolbar */}
          <div className="p-3 rounded-xl bg-stone-100/70 dark:bg-stone-900/60 border border-stone-200/60 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-stone-700 dark:text-stone-300">
              Summary Perspective:
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'meeting_minutes', label: 'Meeting Minutes' },
                { id: 'study_notes', label: 'Technical Notes' },
                { id: 'executive_summary', label: 'Executive Brief' },
                { id: 'structured_outline', label: 'Outline' },
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => handleGenerateAlternateStyle(s.id as any)}
                  disabled={isGeneratingStyle}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 transition-colors font-medium text-[11px]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
              Editable Summary (Markdown Supported)
            </label>
            <textarea
              rows={12}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Detailed synthesis of discussed points, conclusions, and next steps..."
              className="w-full p-4 text-xs font-sans rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 leading-relaxed focus:outline-hidden focus:border-amber-500 shadow-xs resize-y"
            />
          </div>
        </div>
      )}

      {/* Tab 3: Key Points */}
      {activeTab === 'keypoints' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Core Takeaways
            </h3>

            {(note.keyPoints || []).length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-400">
                No key points extracted yet.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {(note.keyPoints || []).map((kp, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-stone-800 dark:text-stone-200 leading-relaxed"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                    <span>{kp}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Action Items */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Action Items ({noteTasks.length})
              </h3>
            </div>

            {/* Quick Add Task */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder="Add new action item for this note..."
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
              />
              <button
                onClick={handleAddTask}
                className="px-3 py-2 rounded-lg bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 text-xs font-medium hover:opacity-90"
              >
                Add
              </button>
            </div>

            <div className="space-y-2">
              {noteTasks.map(task => (
                <div
                  key={task.id}
                  className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        task.completed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-stone-400 hover:border-stone-900'
                      }`}
                    >
                      {task.completed && <Check className="w-3 h-3" />}
                    </button>
                    <span className={`text-stone-800 dark:text-stone-200 ${task.completed ? 'line-through text-stone-400' : ''}`}>
                      {task.title}
                    </span>
                  </div>

                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-stone-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks & Related Notes Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-stone-200 dark:border-stone-800">
        {/* Bookmarks */}
        <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-amber-500" />
              <span>Audio Bookmarks ({noteBookmarks.length})</span>
            </h3>
          </div>

          {noteBookmarks.length === 0 ? (
            <div className="py-4 text-center text-xs text-stone-400">
              No bookmarks for this recording yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {noteBookmarks.map(bm => (
                <div
                  key={bm.id}
                  className="p-2 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between text-xs"
                >
                  <button
                    onClick={() => {
                      if (recording) playRecording(recording, bm.timestampMs / 1000);
                    }}
                    className="flex items-center gap-2 hover:text-amber-500 transition-colors text-left"
                  >
                    <Play className="w-3 h-3 fill-current text-amber-500" />
                    <span className="font-mono text-[10px] text-stone-400">
                      {formatDuration(bm.timestampMs / 1000)}
                    </span>
                    <span className="text-stone-800 dark:text-stone-200 font-medium truncate">
                      {bm.label}
                    </span>
                  </button>

                  <button
                    onClick={() => deleteBookmark(bm.id)}
                    className="text-stone-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related Notes */}
        <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-sky-500" />
            <span>Connected & Related Notes ({relatedNotes.length})</span>
          </h3>

          {relatedNotes.length === 0 ? (
            <div className="py-4 text-center text-xs text-stone-400">
              No direct semantic connections detected yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {relatedNotes.map(rn => (
                <button
                  key={rn.id}
                  onClick={() => setSelectedNoteId(rn.id)}
                  className="w-full text-left p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 hover:border-sky-500/50 transition-colors flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 pr-2 space-y-0.5">
                    <div className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                      {rn.title}
                    </div>
                    {rn.relationRationale && (
                      <div className="text-[10px] text-sky-600 dark:text-sky-400 font-mono">
                        {rn.relationRationale}
                      </div>
                    )}
                    <div className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2">
                      {rn.contextualDescription}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* In-App Delete Confirmation Modal */}
      {showDeleteModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="note-delete-title"
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
                <h3 id="note-delete-title" className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Permanently delete this note?
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-stone-800 dark:text-stone-200">"{note?.title || 'Untitled Note'}"</span>? This will remove the note, summaries, and action items. The original voice recording in your Audio Library will remain preserved.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (isDeleting || !note) return;
                  setIsDeleting(true);
                  try {
                    await deleteNote(note.id);
                    setSelectedNoteId(null);
                    setActiveView('notes');
                  } catch (err) {
                    console.error('Failed to delete note:', err);
                  } finally {
                    setIsDeleting(false);
                    setShowDeleteModal(false);
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
