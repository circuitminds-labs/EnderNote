export type NoteType = 'meeting' | 'lecture' | 'idea' | 'reminder' | 'personal' | 'journal' | 'interview';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type NoteStatus = 
  | 'imported' 
  | 'awaiting_transcription' 
  | 'transcribing' 
  | 'awaiting_organization' 
  | 'ready_for_review' 
  | 'filed' 
  | 'archived' 
  | 'failed';

export interface TranscriptSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  speaker?: string;
}

export interface AudioBookmark {
  id: string;
  recordingId: string;
  timestampMs: number; // in milliseconds
  label: string;
  category?: 'highlight' | 'question' | 'todo' | 'keypoint' | 'general';
  source: 'device' | 'application';
  transcriptSegmentId?: string;
  createdAt: string;
}

export interface Recording {
  id: string;              // unique stable ID (e.g. rec_timestamp_uuid)
  deviceFileId?: string;   // original filename on ESP32 SD card e.g. "REC_0042.WAV"
  filename: string;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  audioBlob?: Blob;        // audio binary in indexedDB
  fingerprint?: string;    // SHA-256 or size-hash to detect duplicate
  createdAt: string;
  source: 'esp32' | 'manual_upload' | 'browser_mic' | 'sample';
}

export interface TaskItem {
  id: string;
  noteId?: string;
  recordingId?: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  projectId?: string;
  transcriptSegmentId?: string;
  timestampMs?: number;
  createdAt: string;
  reminderEnabled?: boolean;
}

export interface Flashcard {
  id: string;
  noteId: string;
  front: string;
  back: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewDate: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  noteId: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface Note {
  id: string;
  recordingId?: string;
  title: string;
  summary: string;
  noteType: NoteType;
  projectId?: string;
  tags: string[];
  keyPoints: string[];
  status: NoteStatus;
  fullTranscript: string;
  segments: TranscriptSegment[];
  relatedNoteIds: string[];
  possibleDuplicateOfId?: string;
  confidenceScore?: number; // 0-1 for project/category suggestion
  suggestedProjectId?: string;
  suggestedTags?: string[];
  uncertainties?: string[];
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  isFavorite?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingJob {
  id: string;
  recordingId: string;
  noteId?: string;
  stage: 'transcription' | 'summarization' | 'organization';
  status: JobStatus;
  progressPercent: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  deviceIp: string;
  importedCount: number;
  failedCount: number;
  notesSummary: string;
  status: 'success' | 'partial' | 'failed';
}

export type TranscriptionLanguage = 'en' | 'hi';

export interface AppSettings {
  groqApiKey: string;
  transcriptionModel: string;
  transcriptionLanguage?: TranscriptionLanguage; // Strictly 'en' | 'hi'
  summarizationModel: string;
  esp32DeviceIp: string;
  esp32PairToken?: string;
  autoFileHighConfidence: boolean;
  confidenceThreshold: number; // default 0.8
  theme: 'dark' | 'light' | 'system';
  offlineSimulationMode: boolean; // allows mock AI processing when no Groq key is set
  storageQuotaNoticeDismissed?: boolean;
}

export interface Esp32DeviceInfo {
  ip: string;
  status: 'connected' | 'disconnected' | 'connecting';
  firmwareVersion: string;
  freeSdSpaceMb: number;
  totalSdSpaceMb: number;
  batteryPercent?: number;
  recordingsCount: number;
  lastSyncTime?: string;
  pairedToken?: string;
}

export interface Esp32FileItem {
  filename: string;
  name: string;
  size: number;
  duration: number; // in seconds
  durationSec?: number;
  formattedSize?: string;
  formattedDuration?: string;
}

export interface Esp32RemoteRecording {
  filename: string;
  fileSizeBytes: number;
  durationSeconds: number;
  createdAt: string;
  bookmarksCount: number;
  transferred: boolean;
  bookmarks?: { timestampMs: number; label: string }[];
}

export type ActiveView = 
  | 'home' 
  | 'inbox' 
  | 'notes' 
  | 'note_detail' 
  | 'projects' 
  | 'tasks' 
  | 'audio_library' 
  | 'knowledge_graph' 
  | 'archive' 
  | 'device_sync' 
  | 'settings';
