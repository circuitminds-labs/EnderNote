import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { 
  Note, 
  Recording, 
  Project, 
  TaskItem, 
  AudioBookmark, 
  Flashcard, 
  QuizQuestion, 
  ProcessingJob, 
  SyncLog, 
  AppSettings, 
  ActiveView,
  TranscriptionLanguage 
} from '../types';
import { dbService } from '../services/db';
import { computeAudioFingerprint, getAudioDuration, createSyntheticWav, formatDuration } from '../services/audioUtils';
import { groqService } from '../services/groqService';
import { organizerService } from '../services/organizerService';
import { populateSampleDataIfEmpty } from '../services/sampleData';

export interface CapsuleData {
  id: string;
  type: 'bookmark' | 'archive' | 'theme' | 'record' | 'delete' | 'star' | 'copy';
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  themeMode?: 'dark' | 'light';
}

interface AudioPlayerState {
  currentRecording: Recording | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  audioElement: HTMLAudioElement | null;
}

interface AppContextType {
  // Navigation
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  selectedRecordingId: string | null;
  setSelectedRecordingId: (id: string | null) => void;
  
  // Data State
  notes: Note[];
  recordings: Recording[];
  projects: Project[];
  tasks: TaskItem[];
  bookmarks: AudioBookmark[];
  flashcards: Flashcard[];
  quizzes: QuizQuestion[];
  jobs: ProcessingJob[];
  syncLogs: SyncLog[];
  settings: AppSettings;
  isOnline: boolean;
  storageStats: { usageBytes: number; quotaBytes: number; isPersisted: boolean };
  isLoading: boolean;

  // Mini-Capsule Floating Notifications
  activeCapsule: CapsuleData | null;
  showCapsule: (capsule: Omit<CapsuleData, 'id'>) => void;
  dismissCapsule: () => void;
  toggleFavoriteNote: (id: string) => Promise<void>;
  copyNoteText: (text: string, title?: string) => void;

  // Audio Player
  player: AudioPlayerState;
  playRecording: (rec: Recording, startSec?: number) => void;
  togglePlayPause: () => void;
  seekTo: (timeSec: number) => void;
  skipSeconds: (deltaSec: number) => void;
  setSpeed: (rate: number) => void;
  stopAudio: () => void;

  importAudioFile: (
    file: File,
    options?: {
      title?: string;
      projectId?: string;
      source?: 'browser_mic' | 'manual_upload' | 'esp32' | 'sample';
      awaitCompletion?: boolean;
      durationSeconds?: number;
      fallbackTranscript?: string;
      language?: TranscriptionLanguage;
      onProgress?: (step: string) => void;
    }
  ) => Promise<{ recording: Recording; note: Note }>;
  createManualNote: (initialTitle?: string) => Promise<Note>;
  updateNote: (note: Note) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
  archiveNote: (id: string, isArchived: boolean) => Promise<void>;
  reprocessNote: (noteId: string) => Promise<void>;
  
  // Bookmarks
  addBookmark: (recordingId: string, timestampMs: number, label?: string, category?: AudioBookmark['category'], transcriptSegmentId?: string) => Promise<AudioBookmark>;
  deleteBookmark: (id: string) => Promise<void>;
  updateBookmark: (bm: AudioBookmark) => Promise<void>;
  toggleBookmark: (recordingId: string, timestampMs: number, label?: string, category?: AudioBookmark['category'], transcriptSegmentId?: string) => Promise<{ bookmarked: boolean; bookmark?: AudioBookmark }>;

  // Projects
  createProject: (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  updateProject: (p: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Tasks
  createTask: (t: Omit<TaskItem, 'id' | 'createdAt'>) => Promise<TaskItem>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Settings & DB Management
  updateSettings: (newSettings: AppSettings) => Promise<void>;
  toggleTheme: () => void;
  requestPersistentStorage: () => Promise<boolean>;
  reloadAllData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  resetToSampleData: () => Promise<void>;

  // Queue runner
  processJobQueue: () => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [bookmarks, setBookmarks] = useState<AudioBookmark[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  // Get initial theme preference from localStorage if available
  const initialTheme: 'dark' | 'light' = (() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('auranote_theme');
      if (stored === 'light' || stored === 'dark') return stored;
    }
    return 'dark'; // Default to dark for embedded hardware workstation
  })();

  const [settings, setSettings] = useState<AppSettings>({
    groqApiKey: '',
    transcriptionModel: 'whisper-large-v3-turbo',
    transcriptionLanguage: 'en',
    summarizationModel: 'openai/gpt-oss-120b',
    esp32DeviceIp: '192.168.4.1',
    autoFileHighConfidence: false,
    confidenceThreshold: 0.85,
    theme: initialTheme,
    offlineSimulationMode: true,
  });

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [storageStats, setStorageStats] = useState({ usageBytes: 0, quotaBytes: 0, isPersisted: false });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Audio Player State & Native Ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const [player, setPlayer] = useState<AudioPlayerState>({
    currentRecording: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    audioElement: null,
  });

  // Mini-Capsule State
  const [activeCapsule, setActiveCapsule] = useState<CapsuleData | null>(null);
  const capsuleTimeoutRef = useRef<number | null>(null);
  const lastDeletedNoteRef = useRef<Note | null>(null);

  const showCapsule = useCallback((data: Omit<CapsuleData, 'id'>) => {
    if (capsuleTimeoutRef.current) {
      clearTimeout(capsuleTimeoutRef.current);
    }
    const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullCapsule: CapsuleData = { ...data, id };
    setActiveCapsule(fullCapsule);

    capsuleTimeoutRef.current = window.setTimeout(() => {
      setActiveCapsule(prev => (prev?.id === id ? null : prev));
    }, 3800);
  }, []);

  const dismissCapsule = useCallback(() => {
    if (capsuleTimeoutRef.current) {
      clearTimeout(capsuleTimeoutRef.current);
      capsuleTimeoutRef.current = null;
    }
    setActiveCapsule(null);
  }, []);

  // Track online/offline status dynamically
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-trigger pending jobs when coming back online
      processJobQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Theme helper
  const applyTheme = (theme: 'dark' | 'light' | 'system') => {
    const root = document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  };

  // Theme support effect
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const toggleTheme = () => {
    const nextTheme: 'dark' | 'light' = settings.theme === 'dark' ? 'light' : 'dark';
    const updated = { ...settings, theme: nextTheme };
    setSettings(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('auranote_theme', nextTheme);
    }
    applyTheme(nextTheme);
    dbService.saveSettings(updated).catch(console.warn);

    showCapsule({
      type: 'theme',
      title: nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode',
      subtitle: nextTheme === 'dark' ? 'Dark theme active' : 'Light theme active',
      themeMode: nextTheme,
    });
  };

  // Load all data on mount
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      // Populate demo dataset if first time
      await populateSampleDataIfEmpty();

      const [
        allNotes,
        allRecs,
        allProjects,
        allTasks,
        allBookmarks,
        allCards,
        allQuizzes,
        allJobs,
        allSyncLogs,
        appSettings,
        storage,
      ] = await Promise.all([
        dbService.getNotes(),
        dbService.getRecordings(),
        dbService.getProjects(),
        dbService.getTasks(),
        dbService.getBookmarks(),
        dbService.getFlashcards(),
        dbService.getQuizzes(),
        dbService.getJobs(),
        dbService.getSyncLogs(),
        dbService.getSettings(),
        dbService.getStorageEstimate(),
      ]);

      setNotes(allNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setRecordings(allRecs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setProjects(allProjects);
      setTasks(allTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setBookmarks(allBookmarks.sort((a, b) => a.timestampMs - b.timestampMs));
      setFlashcards(allCards);
      setQuizzes(allQuizzes);
      setJobs(allJobs);
      setSyncLogs(allSyncLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      
      const storedTheme = typeof localStorage !== 'undefined' ? (localStorage.getItem('auranote_theme') as 'dark' | 'light' | null) : null;
      const effectiveTheme = storedTheme || appSettings.theme || 'dark';
      const resolvedSettings = { ...appSettings, theme: effectiveTheme };
      setSettings(resolvedSettings);
      applyTheme(effectiveTheme);
      setStorageStats(storage);
    } catch (err) {
      console.error('Failed to load local data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Audio setup
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = 'auto';

    audio.ontimeupdate = () => {
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const rawDur = audio.duration;
      setPlayer(prev => ({
        ...prev,
        currentTime: cur,
        duration: Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur * 10) / 10 : prev.duration,
      }));
    };

    audio.onloadedmetadata = () => {
      const rawDur = audio.duration;
      if (Number.isFinite(rawDur) && rawDur > 0) {
        setPlayer(prev => ({ ...prev, duration: Math.round(rawDur * 10) / 10 }));
      } else if (rawDur === Infinity) {
        // Chrome WebM workaround: seeking to infinity forces Chrome to discover finite duration
        audio.currentTime = 1e101;
        const onTimeUpdate = () => {
          audio.removeEventListener('timeupdate', onTimeUpdate);
          const discovered = audio.duration;
          try {
            audio.currentTime = 0;
          } catch {}
          if (Number.isFinite(discovered) && discovered > 0) {
            setPlayer(prev => ({ ...prev, duration: Math.round(discovered * 10) / 10 }));
          }
        };
        audio.addEventListener('timeupdate', onTimeUpdate);
      }
    };

    audio.onended = () => {
      setPlayer(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      try {
        audio.currentTime = 0;
      } catch {}
    };

    audio.onpause = () => {
      setPlayer(prev => ({ ...prev, isPlaying: false }));
    };

    audio.onplay = () => {
      setPlayer(prev => ({ ...prev, isPlaying: true }));
    };

    audio.onerror = () => {
      const mediaErr = audio.error;
      console.warn('Audio playback error:', mediaErr ? `code ${mediaErr.code}: ${mediaErr.message}` : 'unknown media error');
      setPlayer(prev => ({ ...prev, isPlaying: false }));
    };

    return () => {
      audio.pause();
      audio.src = '';
      if (activeAudioUrlRef.current) {
        try {
          URL.revokeObjectURL(activeAudioUrlRef.current);
        } catch {}
        activeAudioUrlRef.current = null;
      }
    };
  }, []);

  const playRecording = (rec: Recording, startSec: number = 0) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const safeStart = Number.isFinite(startSec) && startSec >= 0 ? startSec : 0;
    const isSameRec = player.currentRecording?.id === rec.id;

    // If the exact same recording is already loaded into the audio element
    if (isSameRec && audio.src && activeAudioUrlRef.current && audio.src === activeAudioUrlRef.current) {
      if (safeStart > 0) {
        try {
          audio.currentTime = safeStart;
        } catch {}
      }
      audio.playbackRate = player.playbackRate;
      audio.play().catch(e => {
        console.warn('Audio resume failed:', e);
      });
      setPlayer(prev => ({
        ...prev,
        isPlaying: true,
        currentTime: safeStart > 0 ? safeStart : prev.currentTime,
      }));
      return;
    }

    // Clean up previous blob URL when switching to a different recording
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch {}
      activeAudioUrlRef.current = null;
    }

    // Ensure we have a valid, non-empty audio blob; if missing or 0 bytes, fallback to synthetic wav
    const hasValidBlob = rec.audioBlob && rec.audioBlob.size > 0;
    const blobToPlay = hasValidBlob
      ? rec.audioBlob!
      : createSyntheticWav(Math.min(3, Math.max(1, rec.durationSeconds || 3)));

    try {
      const url = URL.createObjectURL(blobToPlay);
      activeAudioUrlRef.current = url;
      audio.pause();
      audio.src = url;
      audio.playbackRate = player.playbackRate;
      audio.load();

      const initialDuration = Number.isFinite(rec.durationSeconds) && rec.durationSeconds > 0
        ? rec.durationSeconds
        : 1;

      setPlayer({
        currentRecording: rec,
        isPlaying: true,
        currentTime: safeStart,
        duration: initialDuration,
        playbackRate: player.playbackRate,
        audioElement: audio,
      });

      const applyStartTimeAndPlay = () => {
        try {
          if (safeStart > 0 && Number.isFinite(safeStart)) {
            audio.currentTime = safeStart;
          }
        } catch (e) {
          console.warn('Initial currentTime seek warning:', e);
        }
        audio.play().catch(e => {
          console.warn('Audio play request rejected or blocked by browser policy:', e);
          setPlayer(prev => ({ ...prev, isPlaying: false }));
        });
      };

      if (audio.readyState >= 1) {
        applyStartTimeAndPlay();
      } else {
        const onLoaded = () => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          applyStartTimeAndPlay();
        };
        audio.addEventListener('loadedmetadata', onLoaded);
      }
    } catch (err) {
      console.error('Failed to initialize audio playback:', err);
      setPlayer(prev => ({ ...prev, isPlaying: false }));
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current || !player.currentRecording) return;
    const audio = audioRef.current;
    if (player.isPlaying) {
      audio.pause();
    } else {
      // If at end or near end, restart from beginning
      if (audio.ended || (player.duration > 0 && audio.currentTime >= player.duration - 0.15)) {
        try {
          audio.currentTime = 0;
        } catch {}
      }
      audio.play().catch(e => console.warn('Resume audio failed:', e));
    }
  };

  const seekTo = (timeSec: number) => {
    if (!audioRef.current || !player.currentRecording) return;
    const audio = audioRef.current;
    const maxDur = Number.isFinite(player.duration) && player.duration > 0
      ? player.duration
      : (player.currentRecording && Number.isFinite(player.currentRecording.durationSeconds) && player.currentRecording.durationSeconds > 0
          ? player.currentRecording.durationSeconds
          : 99999);
    const clamped = Math.max(0, Math.min(Number.isFinite(timeSec) ? timeSec : 0, maxDur));
    try {
      audio.currentTime = clamped;
    } catch (e) {
      console.warn('Seek error:', e);
    }
    setPlayer(prev => ({ ...prev, currentTime: clamped }));
  };

  const skipSeconds = (deltaSec: number) => {
    if (!audioRef.current) return;
    seekTo(audioRef.current.currentTime + deltaSec);
  };

  const setSpeed = (rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    setPlayer(prev => ({ ...prev, playbackRate: rate }));
  };

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }
    if (activeAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      } catch {}
      activeAudioUrlRef.current = null;
    }
    setPlayer(prev => ({ ...prev, currentRecording: null, isPlaying: false, currentTime: 0 }));
  };

  // Import Audio File (Manual, Direct Mic, or Drag & Drop)
  const importAudioFile = async (
    file: File,
    options?: {
      title?: string;
      projectId?: string;
      source?: 'browser_mic' | 'manual_upload' | 'esp32' | 'sample';
      awaitCompletion?: boolean;
      durationSeconds?: number;
      fallbackTranscript?: string;
      onProgress?: (step: string) => void;
    }
  ): Promise<{ recording: Recording; note: Note }> => {
    const fingerprint = await computeAudioFingerprint(file);
    const duration = await getAudioDuration(file, options?.durationSeconds);

    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const recording: Recording = {
      id: recordingId,
      filename: file.name,
      fileSizeBytes: file.size,
      durationSeconds: duration,
      mimeType: file.type || 'audio/wav',
      audioBlob: file,
      fingerprint,
      createdAt: new Date().toISOString(),
      source: options?.source || 'manual_upload',
    };

    await dbService.saveRecording(recording);
    setRecordings(prev => [recording, ...prev]);

    // Create Initial Note in 'awaiting_transcription'
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const initialNote: Note = {
      id: noteId,
      recordingId: recording.id,
      projectId: options?.projectId,
      title: options?.title && options.title.trim() 
        ? options.title.trim() 
        : file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
      summary: 'Recording captured. Awaiting transcription and organizer processing...',
      noteType: 'meeting',
      tags: options?.source === 'browser_mic' ? ['voice-studio', 'direct-recording'] : ['audio-import'],
      keyPoints: [],
      status: 'awaiting_transcription',
      fullTranscript: options?.fallbackTranscript || '',
      segments: [],
      relatedNoteIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isArchived: false,
    };

    await dbService.saveNote(initialNote);
    setNotes(prev => [initialNote, ...prev]);

    // Create persistent processing job
    const job: ProcessingJob = {
      id: `job_${Date.now()}`,
      recordingId: recording.id,
      noteId: initialNote.id,
      stage: 'transcription',
      status: 'pending',
      progressPercent: 10,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dbService.saveJob(job);
    setJobs(prev => [job, ...prev]);

    // Update storage stats
    dbService.getStorageEstimate().then(setStorageStats);

    if (options?.awaitCompletion) {
      const finalNote = await runSingleJob(job, recording, initialNote, options.onProgress, options.title, options.language);
      return { recording, note: finalNote };
    } else {
      // Kick off processing in background
      setTimeout(() => {
        runSingleJob(job, recording, initialNote, options?.onProgress, options?.title, options?.language);
      }, 100);
      return { recording, note: initialNote };
    }
  };

  // Run a single processing job
  const runSingleJob = async (
    job: ProcessingJob,
    rec: Recording,
    targetNote: Note,
    onProgress?: (step: string) => void,
    userProvidedTitle?: string,
    language?: TranscriptionLanguage
  ): Promise<Note> => {
    try {
      job.status = 'processing';
      job.progressPercent = 25;
      await dbService.saveJob(job);
      setJobs(prev => prev.map(j => (j.id === job.id ? { ...job } : j)));

      targetNote.status = 'transcribing';
      await dbService.saveNote(targetNote);
      setNotes(prev => prev.map(n => (n.id === targetNote.id ? { ...targetNote } : n)));

      // Determine transcription language: option override || settings.transcriptionLanguage || 'en'
      // Strictly restricted to 'en' or 'hi'
      const targetLang: TranscriptionLanguage = (language === 'hi' || settings.transcriptionLanguage === 'hi') ? 'hi' : 'en';
      const langLabel = targetLang === 'hi' ? 'Hindi' : 'English';

      onProgress?.(
        settings.groqApiKey 
          ? `Transcribing audio in ${langLabel} with Groq Whisper Cloud (whisper-large-v3-turbo)...` 
          : `Transcribing ${langLabel} speech locally...`
      );

      // 1. Transcription stage
      if (!rec.audioBlob) {
        throw new Error('Audio file content unavailable');
      }

      const transcription = await groqService.transcribeAudio(
        rec.audioBlob,
        settings.groqApiKey,
        settings.transcriptionModel,
        targetNote.fullTranscript,
        targetLang
      );

      targetNote.fullTranscript = transcription.fullTranscript;
      targetNote.segments = transcription.segments;
      targetNote.status = 'awaiting_organization';
      await dbService.saveNote(targetNote);
      setNotes(prev => prev.map(n => (n.id === targetNote.id ? { ...targetNote } : n)));

      job.stage = 'organization';
      job.progressPercent = 65;
      await dbService.saveJob(job);
      setJobs(prev => prev.map(j => (j.id === job.id ? { ...job } : j)));

      onProgress?.('AI Organizer generating structured summary, key takeaways, and action items...');

      // 2. Organizer stage (title, summary, project match, tasks, tags, related notes)
      const allExistingNotes = await dbService.getNotes();
      const allExistingProjects = await dbService.getProjects();
      const allExistingTags = Array.from(new Set(allExistingNotes.flatMap(n => n.tags)));

      const orgResult = await organizerService.processNoteOrganization(
        transcription.fullTranscript,
        allExistingProjects,
        allExistingNotes.filter(n => n.id !== targetNote.id),
        allExistingTags,
        rec,
        settings.groqApiKey,
        settings.summarizationModel
      );

      targetNote.title = (userProvidedTitle && userProvidedTitle.trim()) ? userProvidedTitle.trim() : orgResult.title;
      targetNote.summary = orgResult.summary;
      targetNote.noteType = orgResult.noteType;
      targetNote.keyPoints = orgResult.keyPoints;
      targetNote.tags = orgResult.suggestedTags;
      targetNote.suggestedProjectId = orgResult.suggestedProjectId;
      targetNote.suggestedTags = orgResult.suggestedTags;
      targetNote.relatedNoteIds = orgResult.relatedNoteIds;
      targetNote.possibleDuplicateOfId = orgResult.possibleDuplicateId;
      targetNote.confidenceScore = orgResult.confidenceScore;
      targetNote.uncertainties = orgResult.uncertainties;
      targetNote.updatedAt = new Date().toISOString();

      // Check auto-file rule: if confidence is high and user enabled auto-file
      if (
        settings.autoFileHighConfidence &&
        orgResult.confidenceScore >= settings.confidenceThreshold &&
        (targetNote.projectId || orgResult.suggestedProjectId)
      ) {
        if (!targetNote.projectId) targetNote.projectId = orgResult.suggestedProjectId;
        targetNote.status = 'filed';
      } else {
        targetNote.status = 'ready_for_review';
      }

      await dbService.saveNote(targetNote);
      setNotes(prev => prev.map(n => (n.id === targetNote.id ? { ...targetNote } : n)));

      // Save extracted action items as pending tasks
      for (const t of orgResult.extractedTasks) {
        const newTask: TaskItem = {
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          noteId: targetNote.id,
          recordingId: rec.id,
          title: t.title,
          completed: false,
          priority: t.priority,
          dueDate: t.dueDate,
          projectId: targetNote.projectId || orgResult.suggestedProjectId,
          createdAt: new Date().toISOString(),
        };
        await dbService.saveTask(newTask);
        setTasks(prev => [newTask, ...prev]);
      }

      job.status = 'completed';
      job.progressPercent = 100;
      await dbService.saveJob(job);
      setJobs(prev => prev.map(j => (j.id === job.id ? { ...job } : j)));

      onProgress?.('Complete! Voice note organized and ready.');
      return targetNote;
    } catch (err: any) {
      console.error('Job execution error:', err);
      job.status = 'failed';
      job.errorMessage = err?.message || 'Processing failed';
      await dbService.saveJob(job);
      setJobs(prev => prev.map(j => (j.id === job.id ? { ...job } : j)));

      targetNote.status = 'failed';
      await dbService.saveNote(targetNote);
      setNotes(prev => prev.map(n => (n.id === targetNote.id ? { ...targetNote } : n)));
      return targetNote;
    }
  };

  const processJobQueue = async () => {
    const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'failed');
    for (const job of pendingJobs) {
      const rec = recordings.find(r => r.id === job.recordingId);
      const note = notes.find(n => n.id === job.noteId);
      if (rec && note) {
        await runSingleJob(job, rec, note);
      }
    }
  };

  const retryJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const rec = recordings.find(r => r.id === job.recordingId);
    const note = notes.find(n => n.id === job.noteId);
    if (rec && note) {
      job.retryCount += 1;
      await runSingleJob(job, rec, note);
    }
  };

  const cancelJob = async (jobId: string) => {
    await dbService.deleteJob(jobId);
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  // Create Manual Note (without audio)
  const createManualNote = async (initialTitle: string = 'Untitled Note'): Promise<Note> => {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNote: Note = {
      id: noteId,
      title: initialTitle,
      summary: '',
      noteType: 'idea',
      tags: [],
      keyPoints: [],
      status: 'filed',
      fullTranscript: '',
      segments: [],
      relatedNoteIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isArchived: false,
    };

    await dbService.saveNote(newNote);
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(noteId);
    setActiveView('note_detail');
    return newNote;
  };

  const updateNote = async (updated: Note) => {
    updated.updatedAt = new Date().toISOString();
    await dbService.saveNote(updated);
    setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)));
  };

  const deleteNote = async (id: string) => {
    const noteToDelete = notes.find(n => n.id === id);
    if (noteToDelete) {
      lastDeletedNoteRef.current = noteToDelete;
    }

    try {
      await dbService.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      setTasks(prev => prev.filter(t => t.noteId !== id));
      setFlashcards(prev => prev.filter(f => f.noteId !== id));
      setQuizzes(prev => prev.filter(q => q.noteId !== id));
      if (selectedNoteId === id) setSelectedNoteId(null);

      showCapsule({
        type: 'delete',
        title: 'Note Deleted',
        subtitle: noteToDelete?.title ? `"${noteToDelete.title}"` : 'Removed from library',
        actionLabel: 'Undo',
        onAction: async () => {
          if (lastDeletedNoteRef.current) {
            const restored = lastDeletedNoteRef.current;
            await dbService.saveNote(restored);
            setNotes(prev => [restored, ...prev]);
            showCapsule({
              type: 'archive',
              title: 'Note Restored',
              subtitle: restored.title,
            });
            lastDeletedNoteRef.current = null;
          }
        },
      });
    } catch (err: any) {
      console.error('Failed to delete note:', err);
      showCapsule({
        type: 'delete',
        title: 'Delete Failed',
        subtitle: err?.message || 'Could not delete note from storage',
      });
      throw err;
    }
  };

  const deleteRecording = async (id: string) => {
    const recToDelete = recordings.find(r => r.id === id);
    if (player.currentRecording?.id === id) {
      stopAudio();
    }
    await dbService.deleteRecording(id);
    setRecordings(prev => prev.filter(r => r.id !== id));
    setBookmarks(prev => prev.filter(b => b.recordingId !== id));
    // Remove recordingId from linked notes so note stays intact
    for (const note of notes.filter(n => n.recordingId === id)) {
      const updated = { ...note, recordingId: undefined };
      await dbService.saveNote(updated);
    }
    setNotes(prev => prev.map(n => (n.recordingId === id ? { ...n, recordingId: undefined } : n)));
    const stats = await dbService.getStorageEstimate();
    setStorageStats(stats);

    showCapsule({
      type: 'delete',
      title: 'Audio Recording Deleted',
      subtitle: recToDelete?.filename || 'Audio file removed',
    });
  };

  const archiveNote = async (id: string, isArchived: boolean) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, isArchived, status: isArchived ? ('archived' as const) : ('filed' as const) };
    await updateNote(updated);

    showCapsule({
      type: 'archive',
      title: isArchived ? 'Note Archived' : 'Note Restored',
      subtitle: note.title,
      actionLabel: isArchived ? 'Undo' : undefined,
      onAction: isArchived ? () => archiveNote(id, false) : undefined,
    });
  };

  const toggleFavoriteNote = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const nextFav = !note.isFavorite;
    const updated = { ...note, isFavorite: nextFav };
    await updateNote(updated);

    showCapsule({
      type: 'star',
      title: nextFav ? 'Note Starred' : 'Note Unstarred',
      subtitle: nextFav ? `Added "${note.title}" to favorites` : `Removed from favorites`,
    });
  };

  const copyNoteText = (text: string, title?: string) => {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {
      console.warn('Clipboard write error:', e);
    }
    showCapsule({
      type: 'copy',
      title: 'Copied to Clipboard',
      subtitle: title ? `"${title}" text` : 'Transcript & summary',
    });
  };

  const reprocessNote = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || !note.recordingId) return;
    const rec = recordings.find(r => r.id === note.recordingId);
    if (!rec) return;

    const job: ProcessingJob = {
      id: `job_${Date.now()}`,
      recordingId: rec.id,
      noteId: note.id,
      stage: 'transcription',
      status: 'pending',
      progressPercent: 10,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbService.saveJob(job);
    setJobs(prev => [job, ...prev]);
    runSingleJob(job, rec, note);
  };

  // Bookmarks
  const addBookmark = async (
    recordingId: string,
    timestampMs: number,
    label: string = 'Bookmark',
    category: AudioBookmark['category'] = 'highlight',
    transcriptSegmentId?: string
  ): Promise<AudioBookmark> => {
    const bm: AudioBookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      recordingId,
      timestampMs,
      label,
      category,
      source: 'application',
      transcriptSegmentId,
      createdAt: new Date().toISOString(),
    };
    await dbService.saveBookmark(bm);
    setBookmarks(prev => [...prev, bm].sort((a, b) => a.timestampMs - b.timestampMs));

    showCapsule({
      type: 'bookmark',
      title: 'Bookmark Saved',
      subtitle: label || `${formatDuration(timestampMs / 1000)} timestamp`,
    });

    return bm;
  };

  const deleteBookmark = async (id: string) => {
    await dbService.deleteBookmark(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
    showCapsule({
      type: 'bookmark',
      title: 'Bookmark Removed',
    });
  };

  const updateBookmark = async (bm: AudioBookmark) => {
    await dbService.saveBookmark(bm);
    setBookmarks(prev => prev.map(b => (b.id === bm.id ? bm : b)));
  };

  const toggleBookmark = async (
    recordingId: string,
    timestampMs: number,
    label: string = 'Bookmark',
    category: AudioBookmark['category'] = 'highlight',
    transcriptSegmentId?: string
  ): Promise<{ bookmarked: boolean; bookmark?: AudioBookmark }> => {
    // Check if matching bookmark exists by transcriptSegmentId or timestamp proximity
    const existing = bookmarks.find(bm => {
      if (transcriptSegmentId && bm.transcriptSegmentId === transcriptSegmentId) {
        return true;
      }
      return bm.recordingId === recordingId && Math.abs(bm.timestampMs - timestampMs) <= 1500;
    });

    if (existing) {
      await deleteBookmark(existing.id);
      return { bookmarked: false };
    } else {
      const created = await addBookmark(recordingId, timestampMs, label, category, transcriptSegmentId);
      return { bookmarked: true, bookmark: created };
    }
  };

  // Projects
  const createProject = async (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
    const proj: Project = {
      id: `proj_${Date.now()}`,
      ...p,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dbService.saveProject(proj);
    setProjects(prev => [...prev, proj]);
    return proj;
  };

  const updateProject = async (p: Project) => {
    p.updatedAt = new Date().toISOString();
    await dbService.saveProject(p);
    setProjects(prev => prev.map(item => (item.id === p.id ? p : item)));
  };

  const deleteProject = async (id: string) => {
    await dbService.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    // Clear project link from notes
    for (const note of notes.filter(n => n.projectId === id)) {
      const updated = { ...note, projectId: undefined };
      await dbService.saveNote(updated);
    }
    setNotes(prev => prev.map(n => (n.projectId === id ? { ...n, projectId: undefined } : n)));
  };

  // Tasks
  const createTask = async (t: Omit<TaskItem, 'id' | 'createdAt'>): Promise<TaskItem> => {
    const task: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...t,
      createdAt: new Date().toISOString(),
    };
    await dbService.saveTask(task);
    setTasks(prev => [task, ...prev]);
    return task;
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const updated = { ...task, completed: !task.completed };
    await dbService.saveTask(updated);
    setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
  };

  const deleteTask = async (id: string) => {
    await dbService.deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // Settings
  const updateSettings = async (newSettings: AppSettings) => {
    await dbService.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const requestPersistentStorage = async (): Promise<boolean> => {
    const granted = await dbService.requestPersistentStorage();
    const stats = await dbService.getStorageEstimate();
    setStorageStats(stats);
    return granted;
  };

  const reloadAllData = async () => {
    await loadData();
  };

  const clearAllData = async () => {
    stopAudio();
    await dbService.resetAll(false);
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('auranote_theme');
      // Mark clearly that user deliberately wiped database so loadData won't resurrect demo data
      localStorage.setItem('auranote_cleared_by_user', 'true');
      localStorage.removeItem('auranote_demo_seeded');
      localStorage.removeItem('auranote_demo_banner_dismissed');
      if (savedTheme) {
        localStorage.setItem('auranote_theme', savedTheme);
      }
    }
    setNotes([]);
    setRecordings([]);
    setProjects([]);
    setTasks([]);
    setBookmarks([]);
    setFlashcards([]);
    setQuizzes([]);
    setJobs([]);
    setSyncLogs([]);
    setSelectedNoteId(null);
    setSelectedRecordingId(null);
    const storage = await dbService.getStorageEstimate();
    setStorageStats(storage);
  };

  const resetToSampleData = async () => {
    stopAudio();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auranote_cleared_by_user');
      localStorage.removeItem('auranote_demo_seeded');
      localStorage.removeItem('auranote_demo_banner_dismissed');
    }
    await populateSampleDataIfEmpty(true);
    await loadData();
  };

  return (
    <AppContext.Provider
      value={{
        activeView,
        setActiveView,
        selectedNoteId,
        setSelectedNoteId,
        selectedRecordingId,
        setSelectedRecordingId,
        notes,
        recordings,
        projects,
        tasks,
        bookmarks,
        flashcards,
        quizzes,
        jobs,
        syncLogs,
        settings,
        isOnline,
        storageStats,
        isLoading,
        activeCapsule,
        showCapsule,
        dismissCapsule,
        toggleFavoriteNote,
        copyNoteText,
        player,
        playRecording,
        togglePlayPause,
        seekTo,
        skipSeconds,
        setSpeed,
        stopAudio,
        importAudioFile,
        createManualNote,
        updateNote,
        deleteNote,
        deleteRecording,
        archiveNote,
        reprocessNote,
        addBookmark,
        deleteBookmark,
        updateBookmark,
        toggleBookmark,
        createProject,
        updateProject,
        deleteProject,
        createTask,
        toggleTask,
        deleteTask,
        updateSettings,
        toggleTheme,
        requestPersistentStorage,
        reloadAllData,
        clearAllData,
        resetToSampleData,
        processJobQueue,
        cancelJob,
        retryJob,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
