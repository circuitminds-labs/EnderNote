import React, { useState } from 'react';
import { 
  Play, 
  Inbox, 
  CheckSquare, 
  Clock, 
  FolderKanban, 
  HardDrive, 
  Cpu, 
  Bookmark, 
  Sparkles, 
  ArrowRight, 
  Plus, 
  Upload, 
  AlertCircle, 
  RefreshCw,
  FileText,
  Volume2,
  Mic,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration, formatBytes } from '../../services/audioUtils';
import { ReviewModal } from './ReviewModal';
import { Note } from '../../types';

interface DashboardViewProps {
  onOpenAskNotes: () => void;
  onOpenRecordModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenAskNotes, onOpenRecordModal }) => {
  const { 
    notes, 
    recordings, 
    projects, 
    tasks, 
    bookmarks, 
    jobs, 
    syncLogs, 
    storageStats, 
    playRecording, 
    showCapsule,
    setActiveView, 
    setSelectedNoteId, 
    toggleTask, 
    retryJob,
    deleteBookmark,
    createManualNote 
  } = useApp();

  const [reviewingNote, setReviewingNote] = useState<Note | null>(null);

  // Demo banner dismissed state stored separately in localStorage
  const DEMO_BANNER_STORAGE_KEY = 'auranote_demo_banner_dismissed';
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(DEMO_BANNER_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismissBanner = () => {
    setIsDismissing(true);
    setTimeout(() => {
      setIsBannerDismissed(true);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEMO_BANNER_STORAGE_KEY, 'true');
      }
    }, 200);
  };

  // Metrics
  const notesAwaitingReview = notes.filter(n => n.status === 'ready_for_review');
  const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const failedJobs = jobs.filter(j => j.status === 'failed');
  const openTasks = tasks.filter(t => !t.completed).slice(0, 5);
  const recentRecordings = recordings.slice(0, 4);
  const recentBookmarks = bookmarks.slice(-4).reverse();
  const lastSync = syncLogs[0];

  const hasSampleData = recordings.some(r => r.source === 'sample');
  const showDemoBanner = hasSampleData && !isBannerDismissed;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Sample Demo Library Active banner with hover-visible close button */}
      {showDemoBanner && (
        <div 
          className={`group p-3 rounded-xl bg-stone-200/50 dark:bg-stone-900 border border-stone-300/60 dark:border-stone-800 flex items-center justify-between gap-3 text-xs transition-all duration-200 ${
            isDismissing ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate sm:whitespace-normal">
              <strong className="text-stone-800 dark:text-stone-200">Sample Demo Library Active:</strong> Initial recordings and transcripts loaded for testing. You can clear or keep them anytime in Settings.
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('settings')}
              className="text-[11px] font-medium text-stone-900 dark:text-stone-100 underline hover:opacity-80 transition-opacity cursor-pointer shrink-0"
            >
              Manage Data
            </button>
            <button
              type="button"
              onClick={handleDismissBanner}
              className="p-1 rounded-md text-stone-400 hover:text-stone-900 dark:text-stone-500 dark:hover:text-stone-100 hover:bg-stone-300/60 dark:hover:bg-stone-800 focus:outline-hidden focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-600 transition-all duration-200 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 cursor-pointer shrink-0"
              aria-label="Dismiss demo library banner"
              title="Dismiss demo library banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Alert Cards: Awaiting Review or Failed Jobs */}
      {(notesAwaitingReview.length > 0 || failedJobs.length > 0) && (
        <div className={`grid gap-3 sm:gap-4 ${notesAwaitingReview.length > 0 && failedJobs.length > 0 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {notesAwaitingReview.length > 0 && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <Inbox className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                    {notesAwaitingReview.length} Note{notesAwaitingReview.length > 1 ? 's' : ''} Awaiting Review
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 leading-normal">
                    Newly transcribed voice notes have project, tag, and task suggestions ready.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveView('inbox')}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-amber-500 text-stone-950 text-xs font-semibold hover:bg-amber-400 transition-colors shrink-0 text-center cursor-pointer min-h-[38px] flex items-center justify-center"
              >
                Review Inbox
              </button>
            </div>
          )}

          {failedJobs.length > 0 && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-rose-900 dark:text-rose-100">
                    {failedJobs.length} Processing Job{failedJobs.length > 1 ? 's' : ''} Interrupted
                  </div>
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 leading-normal">
                    Preserved safely in local queue. Ready to retry.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveView('device_sync')}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition-colors shrink-0 text-center cursor-pointer min-h-[38px] flex items-center justify-center"
              >
                Inspect Queue
              </button>
            </div>
          )}
        </div>
      )}

      {/* Primary 4-card Quick Overview Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Notes */}
        <div 
          onClick={() => setActiveView('notes')}
          className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 cursor-pointer hover:border-stone-300 dark:hover:border-stone-700 transition-all group"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-medium">All Notes</span>
            <FileText className="w-4 h-4 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2 font-mono">
            {notes.length}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {notes.filter(n => !n.isArchived).length} active · {notes.filter(n => n.isArchived).length} archived
          </div>
        </div>

        {/* Audio Recordings */}
        <div 
          onClick={() => setActiveView('audio_library')}
          className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 cursor-pointer hover:border-stone-300 dark:hover:border-stone-700 transition-all group"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-medium">Recordings</span>
            <Volume2 className="w-4 h-4 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2 font-mono">
            {recordings.length}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {formatDuration(recordings.reduce((sum, r) => sum + r.durationSeconds, 0))} total audio
          </div>
        </div>

        {/* Open Tasks */}
        <div 
          onClick={() => setActiveView('tasks')}
          className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 cursor-pointer hover:border-stone-300 dark:hover:border-stone-700 transition-all group"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-medium">Action Items</span>
            <CheckSquare className="w-4 h-4 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2 font-mono">
            {tasks.filter(t => !t.completed).length}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {tasks.filter(t => t.completed).length} completed tasks
          </div>
        </div>

        {/* Storage & Hardware */}
        <div 
          onClick={() => setActiveView('device_sync')}
          className="p-4 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 cursor-pointer hover:border-stone-300 dark:hover:border-stone-700 transition-all group"
        >
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-medium">Local Storage</span>
            <HardDrive className="w-4 h-4 group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors" />
          </div>
          <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-2 font-mono">
            {formatBytes(storageStats.usageBytes)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            {storageStats.isPersisted ? 'Persistent Quota' : 'Browser Cached'}
          </div>
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Recent Recordings & Notes for Review */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes Awaiting Review Carousel / List */}
          {notesAwaitingReview.length > 0 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    Awaiting Organization Review
                  </h2>
                  <p className="text-[11px] text-stone-400">Transcribed recordings ready for classification</p>
                </div>
                <button
                  onClick={() => setActiveView('inbox')}
                  className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>See all in Inbox</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {notesAwaitingReview.slice(0, 3).map(n => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/60 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono capitalize">
                          · {n.noteType}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                        {n.summary}
                      </p>
                    </div>

                    <button
                      onClick={() => setReviewingNote(n)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 hover:opacity-90 shrink-0"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Recordings */}
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Recent Voice Recordings
                </h2>
                <p className="text-[11px] text-stone-400">Directly playable from local IndexedDB storage</p>
              </div>
              <button
                onClick={() => setActiveView('audio_library')}
                className="text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 font-medium"
              >
                <span>View Library</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {recentRecordings.map(rec => {
                const linkedNote = notes.find(n => n.recordingId === rec.id);
                const recBm = bookmarks.filter(b => b.recordingId === rec.id);

                return (
                  <div
                    key={rec.id}
                    className="py-3 flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => playRecording(rec, 0)}
                        className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 flex items-center justify-center hover:bg-amber-400 hover:text-stone-950 transition-colors shrink-0 shadow-xs"
                        title="Play audio"
                      >
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </button>

                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                          {linkedNote ? linkedNote.title : rec.filename}
                        </div>
                        <div className="text-[11px] text-stone-400 flex items-center gap-2 font-mono mt-0.5">
                          <span>{formatDuration(rec.durationSeconds)}</span>
                          <span>·</span>
                          <span>{formatBytes(rec.fileSizeBytes)}</span>
                          {recBm.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-500 flex items-center gap-0.5 font-sans">
                                <Bookmark className="w-2.5 h-2.5 fill-current" />
                                {recBm.length} bookmark{recBm.length > 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {linkedNote ? (
                      <button
                        onClick={() => {
                          setSelectedNoteId(linkedNote.id);
                          setActiveView('note_detail');
                        }}
                        className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 px-2.5 py-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
                      >
                        Open Note
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveView('inbox')}
                        className="text-xs text-amber-600 dark:text-amber-400 hover:underline px-2 py-1 shrink-0"
                      >
                        Awaiting Sync
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Open Tasks & Quick Stats */}
        <div className="space-y-6">
          {/* Action Items Widget */}
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Open Action Items
                </h2>
                <p className="text-[11px] text-stone-400">Extracted from meetings & lectures</p>
              </div>
              <button
                onClick={() => setActiveView('tasks')}
                className="text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-1 font-medium"
              >
                <span>All Tasks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {openTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-400">
                All action items completed.
              </div>
            ) : (
              <div className="space-y-2">
                {openTasks.map(t => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 flex items-start gap-2.5 text-xs"
                  >
                    <button
                      onClick={() => toggleTask(t.id)}
                      className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                        t.completed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-stone-400 dark:border-stone-600 hover:border-stone-900'
                      }`}
                    >
                      {t.completed && <CheckSquare className="w-3 h-3" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="text-stone-800 dark:text-stone-200 font-medium leading-tight">
                        {t.title}
                      </div>
                      {t.dueDate && (
                        <div className="text-[10px] text-stone-400 flex items-center gap-1 font-mono mt-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Due {t.dueDate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Audio Bookmarks Widget */}
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Recent Bookmarks
                </h2>
                <p className="text-[11px] text-stone-400">Hardware & web marker points</p>
              </div>
              <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500 stroke-amber-500" strokeWidth={2} />
            </div>

            {recentBookmarks.length === 0 ? (
              <div className="py-4 text-center text-xs text-stone-400">
                No bookmarks created yet. Press physical button on device or tap 'B' during playback.
              </div>
            ) : (
              <div className="space-y-2">
                {recentBookmarks.map(bm => {
                  const rec = recordings.find(r => r.id === bm.recordingId);
                  return (
                    <div
                      key={bm.id}
                      onClick={() => {
                        if (rec) {
                          playRecording(rec, bm.timestampMs / 1000);
                          showCapsule({
                            type: 'bookmark',
                            title: bm.label || 'Bookmark Jump',
                            subtitle: `${formatDuration(bm.timestampMs / 1000)} playback`,
                          });
                        }
                      }}
                      className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between cursor-pointer hover:border-amber-400/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBookmark(bm.id);
                          }}
                          className="p-1 rounded text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 transition-colors shrink-0"
                          title="Remove bookmark"
                          aria-label="Remove bookmark"
                        >
                          <Bookmark className="w-3.5 h-3.5 fill-current stroke-current" strokeWidth={2} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-stone-900 dark:text-stone-100 truncate">
                            {bm.label}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            {formatDuration(bm.timestampMs / 1000)} · Source: {bm.source}
                          </div>
                        </div>
                      </div>
                      <Play className="w-3.5 h-3.5 text-stone-400 shrink-0 group-hover:text-amber-500 transition-colors" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Projects Widget */}
          <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Active Projects ({projects.length})
              </h2>
              <button
                onClick={() => setActiveView('projects')}
                className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 font-medium"
              >
                Manage
              </button>
            </div>

            <div className="space-y-2">
              {projects.map(p => {
                const count = notes.filter(n => n.projectId === p.id).length;
                return (
                  <div
                    key={p.id}
                    onClick={() => setActiveView('projects')}
                    className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-xs font-medium text-stone-800 dark:text-stone-200">
                        {p.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-400 font-mono">
                      {count} note{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Review Modal popup */}
      {reviewingNote && (
        <ReviewModal
          note={reviewingNote}
          onClose={() => setReviewingNote(null)}
        />
      )}
    </div>
  );
};
