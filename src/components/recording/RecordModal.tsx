import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Minus,
  Mic, 
  Square, 
  Pause, 
  Play, 
  Bookmark, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RotateCw,
  ArrowRight,
  Sparkles,
  Globe,
  Trash2,
  Maximize2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration, getSupportedRecordingMimeType } from '../../services/audioUtils';
import { LiveAudioVisualizer } from './LiveAudioVisualizer';
import { TranscriptionLanguage } from '../../types';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPlayerActive?: boolean;
  isMinimized?: boolean;
  onToggleMinimize?: (minimized: boolean) => void;
  onRecordingStateChange?: (state: 'idle' | 'recording' | 'paused' | 'processing' | 'done') => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({ 
  isOpen, 
  onClose,
  isPlayerActive = false,
  isMinimized: controlledMinimized,
  onToggleMinimize,
  onRecordingStateChange,
}) => {
  const { 
    importAudioFile, 
    addBookmark, 
    showCapsule,
    projects, 
    notes,
    deleteNote,
    deleteRecording,
    setSelectedNoteId, 
    setActiveView,
    settings,
  } = useApp();

  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'processing' | 'done'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [liveBookmarks, setLiveBookmarks] = useState<{ timestampMs: number; label: string }[]>([]);
  const [bookmarkInput, setBookmarkInput] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<TranscriptionLanguage>(() => {
    return settings.transcriptionLanguage === 'hi' ? 'hi' : 'en';
  });
  const [processingStep, setProcessingStep] = useState<string>('');
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  
  // Minimization and discard confirmation state
  const [internalMinimized, setInternalMinimized] = useState(false);
  const isMinimized = controlledMinimized !== undefined ? controlledMinimized : internalMinimized;

  const setIsMinimized = (val: boolean) => {
    setInternalMinimized(val);
    onToggleMinimize?.(val);
  };

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Audio recording and Web Audio API references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Synchronization and anti-race condition flags
  const isDiscardedRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Exact timing and format refs
  const recordingStartTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedDurationRef = useRef<number>(0);
  const selectedMimeTypeRef = useRef<string>('');

  // Notify parent of recording state changes
  const updateRecordingState = (newState: 'idle' | 'recording' | 'paused' | 'processing' | 'done') => {
    setRecordingState(newState);
    onRecordingStateChange?.(newState);
  };

  // Handle open & close lifecycle
  useEffect(() => {
    if (isOpen) {
      // If already recording in minimized mode and re-opened, just expand
      if (recordingState === 'recording' || recordingState === 'paused') {
        setIsMinimized(false);
        return;
      }
      // If completed or idle, start fresh session
      if (recordingState === 'idle') {
        isDiscardedRef.current = false;
        isProcessingRef.current = false;
        setIsMinimized(false);
        setShowDiscardConfirm(false);
        setElapsedSeconds(0);
        setLiveBookmarks([]);
        setBookmarkInput('');
        setNoteTitle('');
        setSelectedProjectId('');
        setSelectedLanguage(settings.transcriptionLanguage === 'hi' ? 'hi' : 'en');
        setProcessingStep('');
        setCreatedNoteId(null);
        setErrorMessage(null);
        setLiveTranscript('');
        setInterimTranscript('');
        startRecordingSession();
      }
    } else {
      // Only clean up audio if we were not actively recording
      if (recordingState === 'idle' || recordingState === 'done') {
        cleanupAudio();
        setIsMinimized(false);
        setShowDiscardConfirm(false);
      }
    }
  }, [isOpen]);

  const cleanupAudio = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.onerror = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const startRecordingSession = async () => {
    setErrorMessage(null);
    isDiscardedRef.current = false;
    isProcessingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        }
      });

      if (isDiscardedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      // Setup Web Audio Analyser for real-time live visualizer
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      // Connect microphone stream ONLY to analyser (never to audioCtx.destination to prevent feedback loops)
      source.connect(analyser);

      // Setup browser live SpeechRecognition if available
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = selectedLanguage === 'hi' ? 'hi-IN' : 'en-US';

          recognition.onresult = (event: any) => {
            if (isDiscardedRef.current) return;
            let finalStr = '';
            let interimStr = '';
            for (let i = 0; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalStr += event.results[i][0].transcript + ' ';
              } else {
                interimStr += event.results[i][0].transcript;
              }
            }
            if (finalStr) setLiveTranscript(finalStr.trim());
            setInterimTranscript(interimStr);
          };

          recognition.onerror = (e: any) => {
            console.warn('SpeechRecognition warning:', e.error);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn('SpeechRecognition initialization error:', e);
        }
      }

      // Setup MediaRecorder with dynamic MIME detection
      audioChunksRef.current = [];
      const supportedMime = getSupportedRecordingMimeType();
      selectedMimeTypeRef.current = supportedMime;

      let recorder: MediaRecorder;
      try {
        recorder = supportedMime 
          ? new MediaRecorder(stream, { mimeType: supportedMime }) 
          : new MediaRecorder(stream);
      } catch (err) {
        console.warn('MediaRecorder init with mimeType failed, falling back to default:', err);
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (!isDiscardedRef.current && event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Reset timestamps
      recordingStartTimeRef.current = performance.now();
      pausedAtRef.current = null;
      totalPausedDurationRef.current = 0;

      recorder.start(250);
      updateRecordingState('recording');

      showCapsule({
        type: 'record',
        title: 'Voice Studio Active',
        subtitle: 'Microphone capturing live audio...',
      });

      // Start duration timer
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Microphone access error:', err);
      setErrorMessage(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser address bar to record voice notes.'
          : `Failed to access microphone: ${err.message || 'Device unavailable'}`
      );
      updateRecordingState('idle');
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;

    if (recordingState === 'recording') {
      mediaRecorderRef.current.pause();
      pausedAtRef.current = performance.now();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      updateRecordingState('paused');
    } else if (recordingState === 'paused') {
      if (pausedAtRef.current) {
        totalPausedDurationRef.current += (performance.now() - pausedAtRef.current);
        pausedAtRef.current = null;
      }
      mediaRecorderRef.current.resume();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
      updateRecordingState('recording');
    }
  };

  // Add in-flight live bookmark while talking
  const handleAddLiveBookmark = () => {
    const currentMs = elapsedSeconds * 1000;
    const label = bookmarkInput.trim() || `Bookmark at ${formatDuration(elapsedSeconds)}`;
    setLiveBookmarks(prev => [...prev, { timestampMs: currentMs, label }]);
    setBookmarkInput('');

    showCapsule({
      type: 'bookmark',
      title: 'Bookmark Saved',
      subtitle: `${formatDuration(elapsedSeconds)} · ${label}`,
    });
  };

  const handleRemoveBookmark = (index: number) => {
    setLiveBookmarks(prev => prev.filter((_, idx) => idx !== index));
  };

  // Stop recording and trigger instant Cloud / Groq processing pipeline
  const handleStopAndProcess = async () => {
    if (!mediaRecorderRef.current || isDiscardedRef.current) return;

    isProcessingRef.current = true;
    updateRecordingState('processing');
    setProcessingStep('Finalizing audio stream & preparing binary...');

    // Stop duration timer, speech recognition
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    // Capture exact wall-clock recording duration in seconds before shutting down
    const now = performance.now();
    const finalPauseOffset = pausedAtRef.current ? (now - pausedAtRef.current) : 0;
    const effectiveElapsedMs = now - recordingStartTimeRef.current - totalPausedDurationRef.current - finalPauseOffset;
    const measuredDurationSeconds = Math.max(1, Math.round((effectiveElapsedMs / 1000) * 10) / 10);

    const recorder = mediaRecorderRef.current;

    // Gracefully await the recorder's onstop event to ensure all buffers are flushed
    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        resolve();
      };
      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch (e) {
        console.warn('requestData error:', e);
      }
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          resolve();
        }
      } catch (e) {
        console.warn('recorder.stop error:', e);
        resolve();
      }
    });

    if (isDiscardedRef.current) {
      return;
    }

    // Shut down microphone stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      setProcessingStep('Saving durable audio file to IndexedDB...');

      const mime = recorder.mimeType || selectedMimeTypeRef.current || 'audio/webm';
      const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'wav';
      const finalBlob = new Blob(audioChunksRef.current, { type: mime });

      if (isDiscardedRef.current) {
        return;
      }

      if (finalBlob.size === 0) {
        throw new Error('Recorded audio file is empty. Please check your microphone connection and try again.');
      }

      const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = noteTitle.trim() 
        ? `${noteTitle.trim().replace(/\s+/g, '_')}_${dateTag}.${ext}`
        : `Direct_Voice_Note_${dateTag}.${ext}`;

      const file = new File([finalBlob], filename, { type: mime });

      // Import file through AppContext pipeline with measuredDurationSeconds passed explicitly
      const { recording: rec, note: finishedNote } = await importAudioFile(file, {
        title: noteTitle.trim() || undefined,
        projectId: selectedProjectId || undefined,
        source: 'browser_mic',
        awaitCompletion: true,
        durationSeconds: measuredDurationSeconds,
        fallbackTranscript: liveTranscript.trim() || undefined,
        language: selectedLanguage,
        onProgress: (stepText) => {
          if (!isDiscardedRef.current) setProcessingStep(stepText);
        },
      });

      if (isDiscardedRef.current) {
        // Rollback if discard happened while importAudioFile was running
        if (finishedNote?.id) {
          await deleteNote(finishedNote.id);
          if (rec?.id) await deleteRecording(rec.id);
        }
        return;
      }

      // Attach live bookmarks recorded during speaking session
      for (const bm of liveBookmarks) {
        if (isDiscardedRef.current) break;
        await addBookmark(rec.id, bm.timestampMs, bm.label, 'highlight');
      }

      setCreatedNoteId(finishedNote.id);
      setProcessingStep('Complete! Voice note organized and cataloged.');
      updateRecordingState('done');
      isProcessingRef.current = false;

    } catch (err: any) {
      if (isDiscardedRef.current) return;
      console.error('Recording processing error:', err);
      setErrorMessage(`Processing error: ${err.message || 'Unknown issue'}`);
      updateRecordingState('idle');
      isProcessingRef.current = false;
    }
  };

  const handleOpenFinishedNote = () => {
    if (createdNoteId) {
      setSelectedNoteId(createdNoteId);
      setActiveView('note_detail');
      onClose();
    } else {
      setActiveView('inbox');
      onClose();
    }
  };

  const handleRequestClose = () => {
    if (recordingState === 'recording' || recordingState === 'paused' || recordingState === 'processing') {
      setShowDiscardConfirm(true);
    } else if (recordingState === 'done') {
      // Completed note can simply be closed or discarded
      cleanupAudio();
      onClose();
    } else {
      cleanupAudio();
      onClose();
    }
  };

  // Robust, Anti-Race Discard Implementation
  const handleConfirmDiscard = async () => {
    try {
      // 1. Mark discard active immediately to abort any pending callbacks or async pipelines
      isDiscardedRef.current = true;
      setShowDiscardConfirm(false);

      // 2. Safely stop & detach MediaRecorder listeners
      if (mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.onerror = null;
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (e) {
          console.warn('MediaRecorder stop on discard warning:', e);
        }
        mediaRecorderRef.current = null;
      }

      // 3. Stop all media tracks
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(t => t.stop());
        } catch (e) {
          console.warn('Stream tracks stop warning:', e);
        }
        streamRef.current = null;
      }

      // 4. Close AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          await audioContextRef.current.close();
        } catch (e) {
          console.warn('AudioContext close warning:', e);
        }
        audioContextRef.current = null;
      }
      analyserRef.current = null;

      // 5. Clear timers and speech recognition
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }

      // 6. If a note was already created in database (e.g. discarding from 'done' state)
      if (createdNoteId) {
        try {
          const noteToDelete = notes.find(n => n.id === createdNoteId);
          const recId = noteToDelete?.recordingId;
          await deleteNote(createdNoteId);
          if (recId) {
            await deleteRecording(recId);
          }
        } catch (delErr) {
          console.warn('Error deleting discarded note:', delErr);
        }
      }

      // 7. Clear all temporary data and reset UI
      audioChunksRef.current = [];
      setLiveBookmarks([]);
      setBookmarkInput('');
      setLiveTranscript('');
      setInterimTranscript('');
      setNoteTitle('');
      setSelectedProjectId('');
      setElapsedSeconds(0);
      setCreatedNoteId(null);
      setProcessingStep('');
      setErrorMessage(null);
      setIsMinimized(false);
      updateRecordingState('idle');

      // 8. Provide immediate user confirmation
      showCapsule({
        type: 'delete',
        title: 'Recording Discarded',
        subtitle: 'Audio capture cancelled and temporary data cleared.',
      });

      // 9. Close panel
      onClose();
    } catch (err: any) {
      console.error('Error during discard:', err);
      setErrorMessage(`Failed to discard recording: ${err.message || 'Unknown error'}`);
    }
  };

  if (!isOpen) return null;

  // Minimized Capsule Bar: Centered at the bottom of the viewport (Issue 2)
  if (isMinimized && (recordingState === 'recording' || recordingState === 'paused' || recordingState === 'processing')) {
    return (
      <>
        <div
          className={`fixed z-40 transition-all duration-200 pointer-events-auto left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] select-none ${
            isPlayerActive 
              ? 'bottom-24 sm:bottom-22' 
              : 'bottom-20 sm:bottom-6'
          }`}
          role="region"
          aria-label="Minimized Voice Studio recording"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl bg-white/95 dark:bg-stone-900/95 border border-stone-200 dark:border-stone-800 shadow-2xl shadow-stone-950/25 dark:shadow-black/70 backdrop-blur-md text-xs font-semibold text-stone-800 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Clickable body to restore/expand Voice Studio */}
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer group"
              title="Click to restore Voice Studio"
              aria-label="Restore Voice Studio"
            >
              <span className={`w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 ${recordingState === 'recording' ? 'animate-ping' : ''}`} />
              <Mic className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <span className="font-semibold text-xs tracking-tight">
                {recordingState === 'recording' ? 'Recording' : recordingState === 'paused' ? 'Paused' : 'Voice Studio'}
              </span>
              <span className="font-mono font-bold text-xs text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded-md border border-stone-200/60 dark:border-stone-700/60">
                {formatDuration(elapsedSeconds)}
              </span>
              {liveBookmarks.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono">
                  {liveBookmarks.length} bm
                </span>
              )}
              <Maximize2 className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-200 transition-colors shrink-0 ml-0.5" />
            </button>

            {/* Vertical divider */}
            <div className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5 shrink-0" />

            {/* Discard button directly on the capsule */}
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              className="p-1 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
              title="Discard Recording"
              aria-label="Discard Recording"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Discard Confirmation Dialog (rendered over minimized capsule too!) */}
        {showDiscardConfirm && (
          <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Discard active recording?
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                  You have an active recording of {formatDuration(elapsedSeconds)}. If you discard, this audio session will be discarded.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Keep Recording
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-md transition-colors cursor-pointer"
                >
                  Discard Audio
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className="fixed inset-0 bg-stone-950/40 dark:bg-stone-950/70 backdrop-blur-2xs z-40 sm:hidden cursor-pointer"
        onClick={handleRequestClose}
        aria-hidden="true"
      />

      {/* Right-Side Docked Panel: Perfectly matching AskNotesChatbot positioning and geometry */}
      <div
        className={`fixed z-40 transition-all duration-200 pointer-events-auto 
          inset-x-0 bottom-0 top-12 sm:top-auto sm:inset-x-auto sm:right-6 
          ${isPlayerActive ? 'sm:bottom-22' : 'sm:bottom-6'}
        `}
        role="region"
        aria-label="In-App Voice Studio"
      >
        <div className="w-full sm:w-[420px] md:w-[450px] max-w-full sm:max-w-[460px] h-full sm:h-[680px] sm:max-h-[calc(100vh-4.5rem)] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl shadow-stone-950/20 dark:shadow-black/70 overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] sm:pb-0">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/95 dark:bg-stone-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-rose-600 dark:text-rose-400 shadow-inner">
                <Mic className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                    In-App Voice Studio
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-200/80 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-300/60 dark:border-stone-700/60">
                    {settings.groqApiKey ? 'Groq Whisper' : 'Local AI'}
                  </span>
                </div>
                <p className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                  Direct browser recording & AI transcription
                </p>
              </div>
            </div>

            {/* Header Controls: Minimize and Close buttons (min 44px touch targets) */}
            <div className="flex items-center gap-1 shrink-0 text-stone-500 dark:text-stone-400">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 transition-colors cursor-pointer"
                title="Minimize panel"
                aria-label="Minimize panel"
              >
                <Minus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleRequestClose}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 transition-colors cursor-pointer"
                title="Close Voice Studio"
                aria-label="Close Voice Studio"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Panel Body: Clear Hierarchy & Seamless Vertical Scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text bg-white dark:bg-stone-900">
            
            {/* Error Message if Mic not permitted */}
            {errorMessage && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-3 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
                <div className="flex-1 space-y-1">
                  <div className="font-semibold">Microphone Access Error</div>
                  <div className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">{errorMessage}</div>
                  <button
                    type="button"
                    onClick={startRecordingSession}
                    className="text-[11px] font-semibold underline hover:opacity-80 mt-1.5 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Retry Microphone Permission</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1. Active Recording & Paused State */}
            {(recordingState === 'recording' || recordingState === 'paused' || recordingState === 'idle') && (
              <div className="space-y-4">
                
                {/* Status Indicator & Monospace Counter */}
                <div className="flex flex-col items-center justify-center space-y-1.5 pt-1 pb-0.5">
                  <div className="flex items-center gap-2">
                    <span 
                      className={`w-2.5 h-2.5 rounded-full ${
                        recordingState === 'recording' 
                          ? 'bg-rose-500 animate-ping' 
                          : recordingState === 'paused' 
                          ? 'bg-amber-500' 
                          : 'bg-stone-400'
                      }`} 
                    />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      {recordingState === 'recording' 
                        ? 'Recording Live Audio...' 
                        : recordingState === 'paused' 
                        ? 'Recording Paused' 
                        : 'Ready to Record'}
                    </span>
                  </div>

                  <div className="text-4xl sm:text-5xl font-extrabold font-mono text-stone-900 dark:text-stone-100 tracking-tight">
                    {formatDuration(elapsedSeconds)}
                  </div>
                </div>

                {/* 2. Real-Time Web Audio Frequency Visualizer */}
                <LiveAudioVisualizer
                  analyser={analyserRef.current}
                  isRecording={recordingState === 'recording'}
                  isPaused={recordingState === 'paused'}
                  className="h-24 sm:h-28"
                />

                {/* 3. Recording Primary Controls (Accessible 44px+ touch targets) */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  {recordingState === 'idle' ? (
                    <button
                      type="button"
                      onClick={startRecordingSession}
                      className="w-full min-h-[46px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold shadow-md hover:shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                    >
                      <Mic className="w-4 h-4 animate-pulse" />
                      <span>Start Recording</span>
                    </button>
                  ) : (
                    <>
                      {/* Explicit Discard button in the recording controls bar */}
                      <button
                        type="button"
                        onClick={() => setShowDiscardConfirm(true)}
                        className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-rose-500/40 hover:bg-rose-500/10 text-stone-600 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition-colors cursor-pointer"
                        title="Discard Recording"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden xs:inline">Discard</span>
                      </button>

                      {/* Pause / Resume button */}
                      <button
                        type="button"
                        onClick={handlePauseResume}
                        className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold transition-colors cursor-pointer border border-stone-200/80 dark:border-stone-700/80"
                      >
                        {recordingState === 'recording' ? (
                          <>
                            <Pause className="w-4 h-4 text-stone-600 dark:text-stone-300" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current text-amber-500" />
                            <span>Resume</span>
                          </>
                        )}
                      </button>

                      {/* Stop & Transcribe button */}
                      <button
                        type="button"
                        onClick={handleStopAndProcess}
                        disabled={elapsedSeconds < 1}
                        className="flex-[2] min-h-[44px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold shadow-md hover:shadow-lg shadow-rose-600/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop & Transcribe</span>
                      </button>
                    </>
                  )}
                </div>

                {/* 4. Live Speech Recognition Transcript Preview */}
                {(liveTranscript || interimTranscript) && (
                  <div className="p-3 rounded-xl bg-stone-100/90 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-1 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Live Speech Recognition</span>
                    </div>
                    <p className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed font-sans select-text">
                      {liveTranscript}
                      <span className="text-stone-400 italic"> {interimTranscript}</span>
                    </p>
                  </div>
                )}

                {/* 5. Note Details: Title & Project Assignment */}
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                      Note Title <span className="font-normal text-stone-400">(Optional - AI will auto-generate if blank)</span>
                    </label>
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="e.g. Sprint Planning Ideas"
                      className="w-full min-h-[42px] px-3.5 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                        Assign Project <span className="font-normal text-stone-400">(Optional)</span>
                      </label>
                      <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
                      >
                        <option value="">Auto-Detect / Inbox</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-stone-400" />
                        <span>Transcription Language</span>
                      </label>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value as TranscriptionLanguage)}
                        className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
                      >
                        <option value="en">English (en)</option>
                        <option value="hi">Hindi (hi)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 6. Audio Bookmarks (In-Flight Timestamping) */}
                <div className="p-3.5 rounded-2xl bg-stone-100/70 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/60 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-amber-500 stroke-amber-500" strokeWidth={2} />
                      <span>Audio Bookmarks ({liveBookmarks.length})</span>
                    </span>
                    <span className="text-[10px] text-stone-400">
                      Timestamp key points while talking
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bookmarkInput}
                      onChange={(e) => setBookmarkInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLiveBookmark())}
                      placeholder="Bookmark note label (optional)..."
                      className="flex-1 min-h-[44px] px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddLiveBookmark}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 text-stone-950 text-xs font-semibold hover:bg-amber-400 active:bg-amber-600 transition-colors shrink-0 cursor-pointer shadow-xs"
                    >
                      + Add Bookmark
                    </button>
                  </div>

                  {liveBookmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {liveBookmarks.map((bm, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 shadow-2xs"
                        >
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            {formatDuration(bm.timestampMs / 1000)}
                          </span>
                          <span className="text-stone-400">·</span>
                          <span className="truncate max-w-[150px]">{bm.label}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBookmark(i)}
                            className="ml-1 text-stone-400 hover:text-rose-500 cursor-pointer"
                            title="Remove bookmark"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* 7. Processing / Transcribing State */}
            {recordingState === 'processing' && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-200">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center animate-spin shadow-inner">
                  <RotateCw className="w-7 h-7" />
                </div>

                <div className="space-y-1.5 px-4">
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Processing & Transcribing Recording
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-300 max-w-sm leading-relaxed">
                    {processingStep || 'Running AI transcription and structured note synthesis...'}
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-mono text-stone-600 dark:text-stone-300">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  <span>Duration: {formatDuration(elapsedSeconds)}</span>
                  <span>·</span>
                  <span>{liveBookmarks.length} Bookmark{liveBookmarks.length === 1 ? '' : 's'}</span>
                </div>
              </div>
            )}

            {/* 8. Done State */}
            {recordingState === 'done' && (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-200">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                  <CheckCircle2 className="w-7 h-7" />
                </div>

                <div className="space-y-1.5 px-4">
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Voice Note Processed Successfully!
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-300 max-w-sm leading-relaxed">
                    Your recording was transcribed, summarized, organized, and securely stored in your local library.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2.5 pt-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={handleOpenFinishedNote}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold shadow-md transition-colors cursor-pointer"
                  >
                    <span>Open Full Note & Audio</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => setShowDiscardConfirm(true)}
                      className="flex-1 min-h-[42px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800/70 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors cursor-pointer"
                      title="Discard this newly created note from library"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard Note</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 min-h-[42px] flex items-center justify-center px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Discard Confirmation Dialog Overlay (in expanded panel) */}
          {showDiscardConfirm && (
            <div className="absolute inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
              <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    {recordingState === 'done' ? 'Discard this voice note?' : 'Discard active recording?'}
                  </h4>
                  <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                    {recordingState === 'done'
                      ? 'The saved audio recording, transcript, and note will be permanently removed from your library.'
                      : `You have an active recording of ${formatDuration(elapsedSeconds)}. If you discard, this audio session will be discarded.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    {recordingState === 'done' ? 'Keep Note' : 'Keep Recording'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDiscard}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {recordingState === 'done' ? 'Discard Note' : 'Discard Audio'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};
