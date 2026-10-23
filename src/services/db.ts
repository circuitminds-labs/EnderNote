import { 
  Recording, 
  Note, 
  Project, 
  TaskItem, 
  AudioBookmark, 
  Flashcard, 
  QuizQuestion, 
  ProcessingJob, 
  SyncLog, 
  AppSettings 
} from '../types';

const DB_NAME = 'auranote_db';
const DB_VERSION = 1;

export class DatabaseService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Recordings
        if (!db.objectStoreNames.contains('recordings')) {
          const recStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recStore.createIndex('createdAt', 'createdAt', { unique: false });
          recStore.createIndex('fingerprint', 'fingerprint', { unique: false });
          recStore.createIndex('deviceFileId', 'deviceFileId', { unique: false });
        }

        // Notes
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('projectId', 'projectId', { unique: false });
          noteStore.createIndex('status', 'status', { unique: false });
          noteStore.createIndex('createdAt', 'createdAt', { unique: false });
          noteStore.createIndex('isArchived', 'isArchived', { unique: false });
        }

        // Projects
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }

        // Tasks
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('noteId', 'noteId', { unique: false });
          taskStore.createIndex('completed', 'completed', { unique: false });
        }

        // Bookmarks
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bmStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bmStore.createIndex('recordingId', 'recordingId', { unique: false });
        }

        // Flashcards
        if (!db.objectStoreNames.contains('flashcards')) {
          const fcStore = db.createObjectStore('flashcards', { keyPath: 'id' });
          fcStore.createIndex('noteId', 'noteId', { unique: false });
          fcStore.createIndex('nextReviewDate', 'nextReviewDate', { unique: false });
        }

        // Quizzes
        if (!db.objectStoreNames.contains('quizzes')) {
          const quizStore = db.createObjectStore('quizzes', { keyPath: 'id' });
          quizStore.createIndex('noteId', 'noteId', { unique: false });
        }

        // Processing Jobs
        if (!db.objectStoreNames.contains('jobs')) {
          const jobStore = db.createObjectStore('jobs', { keyPath: 'id' });
          jobStore.createIndex('recordingId', 'recordingId', { unique: false });
          jobStore.createIndex('status', 'status', { unique: false });
        }

        // Sync logs
        if (!db.objectStoreNames.contains('syncLogs')) {
          db.createObjectStore('syncLogs', { keyPath: 'id' });
        }

        // Settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.initPromise;
  }

  // Generic store operations
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getById<T>(storeName: string, id: string): Promise<T | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, item: T): Promise<T> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Domain specific methods
  async getRecordings(): Promise<Recording[]> {
    return this.getAll<Recording>('recordings');
  }

  async saveRecording(recording: Recording): Promise<Recording> {
    return this.put<Recording>('recordings', recording);
  }

  async deleteRecording(id: string): Promise<void> {
    await this.delete('recordings', id);
    // Also remove associated bookmarks
    const bookmarks = await this.getAll<AudioBookmark>('bookmarks');
    for (const bm of bookmarks) {
      if (bm.recordingId === id) {
        await this.delete('bookmarks', bm.id);
      }
    }
  }

  async getNotes(): Promise<Note[]> {
    return this.getAll<Note>('notes');
  }

  async saveNote(note: Note): Promise<Note> {
    return this.put<Note>('notes', note);
  }

  async deleteNote(id: string): Promise<void> {
    await this.delete('notes', id);
    // Delete linked flashcards, quizzes, tasks
    const cards = await this.getAll<Flashcard>('flashcards');
    for (const c of cards) {
      if (c.noteId === id) await this.delete('flashcards', c.id);
    }
    const quizzes = await this.getAll<QuizQuestion>('quizzes');
    for (const q of quizzes) {
      if (q.noteId === id) await this.delete('quizzes', q.id);
    }
    const tasks = await this.getAll<TaskItem>('tasks');
    for (const t of tasks) {
      if (t.noteId === id) await this.delete('tasks', t.id);
    }
  }

  async getProjects(): Promise<Project[]> {
    return this.getAll<Project>('projects');
  }

  async saveProject(project: Project): Promise<Project> {
    return this.put<Project>('projects', project);
  }

  async deleteProject(id: string): Promise<void> {
    return this.delete('projects', id);
  }

  async getTasks(): Promise<TaskItem[]> {
    return this.getAll<TaskItem>('tasks');
  }

  async saveTask(task: TaskItem): Promise<TaskItem> {
    return this.put<TaskItem>('tasks', task);
  }

  async deleteTask(id: string): Promise<void> {
    return this.delete('tasks', id);
  }

  async getBookmarks(recordingId?: string): Promise<AudioBookmark[]> {
    const all = await this.getAll<AudioBookmark>('bookmarks');
    if (recordingId) {
      return all.filter(bm => bm.recordingId === recordingId);
    }
    return all;
  }

  async saveBookmark(bm: AudioBookmark): Promise<AudioBookmark> {
    return this.put<AudioBookmark>('bookmarks', bm);
  }

  async deleteBookmark(id: string): Promise<void> {
    return this.delete('bookmarks', id);
  }

  async getFlashcards(noteId?: string): Promise<Flashcard[]> {
    const all = await this.getAll<Flashcard>('flashcards');
    if (noteId) {
      return all.filter(c => c.noteId === noteId);
    }
    return all;
  }

  async saveFlashcard(card: Flashcard): Promise<Flashcard> {
    return this.put<Flashcard>('flashcards', card);
  }

  async deleteFlashcard(id: string): Promise<void> {
    return this.delete('flashcards', id);
  }

  async getQuizzes(noteId?: string): Promise<QuizQuestion[]> {
    const all = await this.getAll<QuizQuestion>('quizzes');
    if (noteId) {
      return all.filter(q => q.noteId === noteId);
    }
    return all;
  }

  async saveQuiz(quiz: QuizQuestion): Promise<QuizQuestion> {
    return this.put<QuizQuestion>('quizzes', quiz);
  }

  async getJobs(): Promise<ProcessingJob[]> {
    return this.getAll<ProcessingJob>('jobs');
  }

  async saveJob(job: ProcessingJob): Promise<ProcessingJob> {
    return this.put<ProcessingJob>('jobs', job);
  }

  async deleteJob(id: string): Promise<void> {
    return this.delete('jobs', id);
  }

  async getSyncLogs(): Promise<SyncLog[]> {
    return this.getAll<SyncLog>('syncLogs');
  }

  async saveSyncLog(log: SyncLog): Promise<SyncLog> {
    return this.put<SyncLog>('syncLogs', log);
  }

  // App Settings
  async getSettings(): Promise<AppSettings> {
    const db = await this.getDb();
    return new Promise((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('app_config');

      request.onsuccess = () => {
        if (request.result && request.result.value) {
          resolve(request.result.value);
        } else {
          // Defaults
          const defaultSettings: AppSettings = {
            groqApiKey: '',
            transcriptionModel: 'whisper-large-v3-turbo',
            summarizationModel: 'openai/gpt-oss-120b',
            esp32DeviceIp: '192.168.4.1',
            autoFileHighConfidence: false,
            confidenceThreshold: 0.85,
            theme: 'dark',
            offlineSimulationMode: true, // Seamless offline / fallback simulation
          };
          resolve(defaultSettings);
        }
      };
      request.onerror = () => {
        resolve({
          groqApiKey: '',
          transcriptionModel: 'whisper-large-v3-turbo',
          summarizationModel: 'openai/gpt-oss-120b',
          esp32DeviceIp: '192.168.4.1',
          autoFileHighConfidence: false,
          confidenceThreshold: 0.85,
          theme: 'dark',
          offlineSimulationMode: true,
        });
      };
    });
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key: 'app_config', value: settings });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Storage estimation
  async getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number; isPersisted: boolean }> {
    let usageBytes = 0;
    let quotaBytes = 0;
    let isPersisted = false;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usageBytes = est.usage || 0;
        quotaBytes = est.quota || 0;
      } catch (err) {
        console.warn('Storage estimate failed:', err);
      }
    }

    if (navigator.storage && navigator.storage.persisted) {
      try {
        isPersisted = await navigator.storage.persisted();
      } catch {
        // ignore
      }
    }

    return { usageBytes, quotaBytes, isPersisted };
  }

  async requestPersistentStorage(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  }

  // Reset entire database
  async resetAll(clearSettings: boolean = false): Promise<void> {
    const stores = [
      'recordings',
      'notes',
      'projects',
      'tasks',
      'bookmarks',
      'flashcards',
      'quizzes',
      'jobs',
      'syncLogs'
    ];
    if (clearSettings) {
      stores.push('settings');
    }
    for (const s of stores) {
      try {
        await this.clearStore(s);
      } catch (err) {
        console.warn(`Failed to clear store ${s}:`, err);
      }
    }
  }
}

export const dbService = new DatabaseService();
