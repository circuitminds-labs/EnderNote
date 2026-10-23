import JSZip from 'jszip';
import { dbService } from './db';
import { 
  Note, 
  Project, 
  TaskItem, 
  AudioBookmark, 
  Flashcard, 
  QuizQuestion, 
  Recording, 
  AppSettings, 
  SyncLog 
} from '../types';

export interface BackupManifest {
  version: string;
  exportedAt: string;
  notesCount: number;
  recordingsCount: number;
  projectsCount: number;
  tasksCount: number;
  bookmarksCount: number;
  flashcardsCount: number;
  quizzesCount: number;
  metadataOnly: boolean;
}

export interface BackupData {
  manifest: BackupManifest;
  notes: Note[];
  projects: Project[];
  tasks: TaskItem[];
  bookmarks: AudioBookmark[];
  flashcards: Flashcard[];
  quizzes: QuizQuestion[];
  recordings: Omit<Recording, 'audioBlob'>[];
  syncLogs: SyncLog[];
  settings?: AppSettings;
}

export class BackupService {
  /**
   * Export complete backup as ZIP (manifest.json + audio/ folder)
   */
  async exportFullZipBackup(): Promise<Blob> {
    const zip = new JSZip();

    const notes = await dbService.getNotes();
    const projects = await dbService.getProjects();
    const tasks = await dbService.getTasks();
    const bookmarks = await dbService.getBookmarks();
    const flashcards = await dbService.getFlashcards();
    const quizzes = await dbService.getQuizzes();
    const recordings = await dbService.getRecordings();
    const syncLogs = await dbService.getSyncLogs();
    const settings = await dbService.getSettings();

    const manifest: BackupManifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      notesCount: notes.length,
      recordingsCount: recordings.length,
      projectsCount: projects.length,
      tasksCount: tasks.length,
      bookmarksCount: bookmarks.length,
      flashcardsCount: flashcards.length,
      quizzesCount: quizzes.length,
      metadataOnly: false,
    };

    // Separate audio blobs into audio/ folder
    const audioFolder = zip.folder('audio');
    const recordingsMeta: Omit<Recording, 'audioBlob'>[] = [];

    for (const rec of recordings) {
      const { audioBlob, ...meta } = rec;
      recordingsMeta.push(meta);

      if (audioBlob && audioFolder) {
        const ext = rec.mimeType.includes('mp3') ? 'mp3' : 'wav';
        audioFolder.file(`${rec.id}.${ext}`, audioBlob);
      }
    }

    const backupData: BackupData = {
      manifest,
      notes,
      projects,
      tasks,
      bookmarks,
      flashcards,
      quizzes,
      recordings: recordingsMeta,
      syncLogs,
      settings,
    };

    zip.file('manifest.json', JSON.stringify(backupData, null, 2));

    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Lightweight JSON-only metadata export
   */
  async exportMetadataJson(): Promise<Blob> {
    const notes = await dbService.getNotes();
    const projects = await dbService.getProjects();
    const tasks = await dbService.getTasks();
    const bookmarks = await dbService.getBookmarks();
    const flashcards = await dbService.getFlashcards();
    const quizzes = await dbService.getQuizzes();
    const recordings = await dbService.getRecordings();
    const syncLogs = await dbService.getSyncLogs();
    const settings = await dbService.getSettings();

    const recordingsMeta = recordings.map(({ audioBlob, ...meta }) => meta);

    const manifest: BackupManifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      notesCount: notes.length,
      recordingsCount: recordings.length,
      projectsCount: projects.length,
      tasksCount: tasks.length,
      bookmarksCount: bookmarks.length,
      flashcardsCount: flashcards.length,
      quizzesCount: quizzes.length,
      metadataOnly: true,
    };

    const backupData: BackupData = {
      manifest,
      notes,
      projects,
      tasks,
      bookmarks,
      flashcards,
      quizzes,
      recordings: recordingsMeta,
      syncLogs,
      settings,
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Inspect and preview backup file before restoring
   */
  async previewBackup(file: File): Promise<{
    manifest: BackupManifest;
    backupData: BackupData;
    hasAudioBlobs: boolean;
    audioBlobsMap?: Map<string, Blob>;
  }> {
    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const backupData: BackupData = JSON.parse(text);
      return {
        manifest: backupData.manifest,
        backupData,
        hasAudioBlobs: false,
      };
    }

    // ZIP archive
    const zip = await JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('Invalid backup file: manifest.json missing from root archive.');
    }

    const manifestText = await manifestFile.async('text');
    const backupData: BackupData = JSON.parse(manifestText);

    const audioBlobsMap = new Map<string, Blob>();
    const audioFolder = zip.folder('audio');

    if (audioFolder) {
      const files = Object.keys(audioFolder.files);
      for (const filepath of files) {
        if (!audioFolder.files[filepath].dir) {
          const zipEntry = audioFolder.files[filepath];
          const filename = filepath.replace('audio/', '');
          const id = filename.split('.')[0];
          const blob = await zipEntry.async('blob');
          audioBlobsMap.set(id, blob);
        }
      }
    }

    return {
      manifest: backupData.manifest,
      backupData,
      hasAudioBlobs: audioBlobsMap.size > 0,
      audioBlobsMap,
    };
  }

  /**
   * Restore backup with options:
   * 'merge' = preserve existing data, only insert non-existing records
   * 'replace' = clean slate then restore all records
   */
  async restoreBackup(
    backupData: BackupData,
    audioBlobsMap: Map<string, Blob> | undefined,
    mode: 'merge' | 'replace'
  ): Promise<{ notesRestored: number; recordingsRestored: number }> {
    if (mode === 'replace') {
      await dbService.resetAll();
    }

    // Restore projects
    const existingProjects = await dbService.getProjects();
    const existingProjectIds = new Set(existingProjects.map(p => p.id));
    for (const p of backupData.projects || []) {
      if (mode === 'replace' || !existingProjectIds.has(p.id)) {
        await dbService.saveProject(p);
      }
    }

    // Restore recordings
    const existingRecs = await dbService.getRecordings();
    const existingRecIds = new Set(existingRecs.map(r => r.id));
    let recsCount = 0;

    for (const r of backupData.recordings || []) {
      if (mode === 'replace' || !existingRecIds.has(r.id)) {
        const audioBlob = audioBlobsMap?.get(r.id);
        await dbService.saveRecording({
          ...r,
          audioBlob: audioBlob || undefined,
        });
        recsCount++;
      }
    }

    // Restore notes
    const existingNotes = await dbService.getNotes();
    const existingNoteIds = new Set(existingNotes.map(n => n.id));
    let notesCount = 0;

    for (const n of backupData.notes || []) {
      if (mode === 'replace' || !existingNoteIds.has(n.id)) {
        await dbService.saveNote(n);
        notesCount++;
      }
    }

    // Restore bookmarks
    for (const bm of backupData.bookmarks || []) {
      await dbService.saveBookmark(bm);
    }

    // Restore tasks
    for (const t of backupData.tasks || []) {
      await dbService.saveTask(t);
    }

    // Restore flashcards & quizzes
    for (const f of backupData.flashcards || []) {
      await dbService.saveFlashcard(f);
    }
    for (const q of backupData.quizzes || []) {
      await dbService.saveQuiz(q);
    }

    // Restore sync logs
    for (const l of backupData.syncLogs || []) {
      await dbService.saveSyncLog(l);
    }

    return {
      notesRestored: notesCount,
      recordingsRestored: recsCount,
    };
  }
}

export const backupService = new BackupService();
