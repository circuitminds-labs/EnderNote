import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  Square, 
  Pause, 
  Play, 
  Bookmark, 
  FolderKanban, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RotateCw,
  ArrowRight,
  Sparkles,
  Volume2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration, getSupportedRecordingMimeType } from '../../services/audioUtils';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({ isOpen, onClose }) => {
  const { 
    importAudioFile, 
    addBookmark, 
    showCapsule,
    projects, 
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
  const [processingStep, setProcessingStep] = useState<string>('');
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  // Audio recording references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Exact timing and format refs
  const recordingStartTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedDurationRef = useRef<number>(0);
  const selectedMimeTypeRef = useRef<string>('');

  // Reset & start when opened
  useEffect(() => {
    if (isOpen) {
      setRecordingState('idle');
      setElapsedSeconds(0);
      setLiveBookmarks([]);
      setBookmarkInput('');
      setNoteTitle('');
      setSelectedProjectId('');
      setProcessingStep('');
      setCreatedNoteId(null);
      setErrorMessage(null);
      setLiveTranscript('');
      setInterimTranscript('');
      startRecordingSession();
    } else {
      cleanupAudio();
    }
    return () => cleanupAudio();
  }, [isOpen]);

  const cleanupAudio = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
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
  };

  const startRecordingSession = async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        }
      });
      streamRef.current = stream;

      // Setup Web Audio Analyser for live visualizer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start canvas waveform visualizer loop
      drawWaveform();

      // Setup browser live SpeechRecognition if available
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onresult = (event: any) => {
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
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Reset timestamps
      recordingStartTimeRef.current = performance.now();
      pausedAtRef.current = null;
      totalPausedDurationRef.current = 0;

      recorder.start(250);
      setRecordingState('recording');

      showCapsule({
        type: 'record',
        title: 'Recording Started',
        subtitle: 'Microphone active · Capturing voice',
      });

      // Start duration timer
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Microphone error:', err);
      setErrorMessage(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings to record voice notes directly.'
          : `Failed to access microphone: ${err.message || 'Device unavailable'}`
      );
      setRecordingState('idle');
    }
  };

  // Live frequency soundwave visualizer
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const val = dataArray[i];
        const barHeight = Math.max(4, (val / 255) * canvas.height * 0.85);

        // Warm amber gradient for active voice frequencies
        ctx.fillStyle = val > 140 ? '#f59e0b' : val > 60 ? '#fbbf24' : '#78716c';
        ctx.fillRect(x, (canvas.height - barHeight) / 2, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    render();
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;

    if (recordingState === 'recording') {
      mediaRecorderRef.current.pause();
      pausedAtRef.current = performance.now();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setRecordingState('paused');
    } else if (recordingState === 'paused') {
      if (pausedAtRef.current) {
        totalPausedDurationRef.current += (performance.now() - pausedAtRef.current);
        pausedAtRef.current = null;
      }
      mediaRecorderRef.current.resume();
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
      setRecordingState('recording');
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
      title: 'Bookmark Added',
      subtitle: `${formatDuration(elapsedSeconds)} - ${label}`,
    });
  };

  // Stop recording and trigger instant Cloud / Groq processing pipeline
  const handleStopAndProcess = async () => {
    if (!mediaRecorderRef.current) return;

    setRecordingState('processing');
    setProcessingStep('Finalizing audio stream & preparing binary...');

    // Stop duration timer, speech recognition, and visualizer animation
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
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

    // NOW that recorder is completely stopped and dataavailable has fired, shut down stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      setProcessingStep('Saving durable audio file to IndexedDB...');

      const mime = recorder.mimeType || selectedMimeTypeRef.current || 'audio/webm';
      const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'wav';
      const finalBlob = new Blob(audioChunksRef.current, { type: mime });

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
        onProgress: (stepText) => setProcessingStep(stepText),
      });

      // Attach live bookmarks recorded during speaking session
      for (const bm of liveBookmarks) {
        await addBookmark(rec.id, bm.timestampMs, bm.label, 'highlight');
      }

      setCreatedNoteId(finishedNote.id);
      setProcessingStep('Complete! Voice note organized and ready.');
      setRecordingState('done');

    } catch (err: any) {
      console.error('Recording processing error:', err);
      setErrorMessage(`Processing error: ${err.message || 'Unknown issue'}`);
      setRecordingState('idle');
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[96vh] flex flex-col">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-950/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 truncate">
                <span>In-App Voice Studio</span>
                <span className="hidden xs:inline text-[10px] font-normal px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-mono">
                  {settings.groqApiKey ? 'Groq Whisper' : 'Local AI'}
                </span>
              </h2>
              <p className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                Record voice notes directly in browser with AI transcription
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[80vh] overflow-y-auto flex-1">

          {/* Error Message if Mic not permitted */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold">Microphone Access Error</div>
                <div>{errorMessage}</div>
                <button
                  onClick={startRecordingSession}
                  className="text-[11px] font-semibold underline hover:opacity-80 mt-1 inline-block"
                >
                  Retry Microphone Permission
                </button>
              </div>
            </div>
          )}

          {/* Active Recording State */}
          {(recordingState === 'recording' || recordingState === 'paused') && (
            <div className="space-y-5">
              
              {/* Timer & Pulsing recording status */}
              <div className="flex flex-col items-center justify-center space-y-2 py-1">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <span className={`w-3 h-3 rounded-full bg-rose-500 ${recordingState === 'recording' ? 'animate-ping' : ''}`} />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {recordingState === 'recording' ? 'Recording Live Audio...' : 'Recording Paused'}
                  </span>
                </div>

                <div className="text-4xl font-extrabold font-mono text-stone-900 dark:text-stone-100 tracking-tight">
                  {formatDuration(elapsedSeconds)}
                </div>
              </div>

              {/* Soundwave Frequency Visualizer Canvas */}
              <div className="p-3 rounded-2xl bg-stone-950 border border-stone-800 flex items-center justify-center h-20 overflow-hidden shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={80}
                  className="w-full h-full"
                />
              </div>

              {/* Live Speech Recognition Transcript Card */}
              {(liveTranscript || interimTranscript) && (
                <div className="p-3 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Live Speech Recognition</span>
                  </div>
                  <p className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed font-sans">
                    {liveTranscript}
                    <span className="text-stone-400 italic"> {interimTranscript}</span>
                  </p>
                </div>
              )}

              {/* Optional Title & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    Note Title (Optional - AI will auto-generate if blank)
                  </label>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="e.g. Sprint Planning Ideas"
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    Assign Project (Optional)
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
                  >
                    <option value="">Auto-Detect / Inbox</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* In-Flight Real-Time Bookmarking */}
              <div className="p-3.5 rounded-2xl bg-stone-100/70 dark:bg-stone-800/50 border border-stone-200/60 dark:border-stone-700/60 space-y-2">
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
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddLiveBookmark}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-stone-950 text-xs font-semibold hover:bg-amber-400 transition-colors shrink-0"
                  >
                    + Add Bookmark
                  </button>
                </div>

                {liveBookmarks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {liveBookmarks.map((bm, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300"
                      >
                        {formatDuration(bm.timestampMs / 1000)} · {bm.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons: Pause/Resume & Stop & Process */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePauseResume}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium transition-colors cursor-pointer"
                >
                  {recordingState === 'recording' ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStopAndProcess}
                  disabled={elapsedSeconds < 1}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop & Transcribe with AI</span>
                </button>
              </div>
            </div>
          )}

          {/* Processing / Transcribing State */}
          {recordingState === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center animate-spin">
                <RotateCw className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Processing & Transcribing Recording
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">
                  {processingStep || 'Running AI transcription and structured organization...'}
                </p>
              </div>

              <div className="text-[11px] font-mono text-stone-400">
                Duration: {formatDuration(elapsedSeconds)} · {liveBookmarks.length} Bookmarks
              </div>
            </div>
          )}

          {/* Done State */}
          {recordingState === 'done' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  Voice Note Successfully Processed!
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">
                  Your speech was transcribed, organized, summarized, and stored into your local library.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleOpenFinishedNote}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <span>Open Full Note & Audio</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
