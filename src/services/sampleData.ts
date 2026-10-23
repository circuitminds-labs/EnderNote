import { Note, Project, Recording, AudioBookmark, TaskItem, Flashcard, QuizQuestion } from '../types';
import { createSyntheticWav } from './audioUtils';
import { dbService } from './db';

export async function populateSampleDataIfEmpty(force: boolean = false): Promise<boolean> {
  if (!force) {
    if (typeof localStorage !== 'undefined') {
      // If user explicitly chose to erase their database, do not automatically re-seed demo data
      if (localStorage.getItem('auranote_cleared_by_user') === 'true') {
        return false;
      }
      if (localStorage.getItem('auranote_demo_seeded') === 'true') {
        const existing = await dbService.getNotes();
        if (existing.length > 0) return false;
      }
    }
    const existingNotes = await dbService.getNotes();
    if (existingNotes.length > 0) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auranote_demo_seeded', 'true');
      }
      return false; // already initialized
    }
  } else {
    // If forced reset, wipe any lingering records first
    await dbService.resetAll();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auranote_cleared_by_user');
      localStorage.setItem('auranote_demo_seeded', 'true');
    }
  }

  // 1. Projects
  const projects: Project[] = [
    {
      id: 'proj_hardware',
      name: 'Hardware & Embedded',
      description: 'ESP32 firmware, INMP441 I2S microphone calibration, SPI SD card, and PCB designs.',
      color: '#0284c7', // sky-600
      createdAt: '2026-10-18T09:00:00Z',
      updatedAt: '2026-10-18T09:00:00Z',
    },
    {
      id: 'proj_ai_arch',
      name: 'Local-First AI Systems',
      description: 'IndexedDB durability, Whisper Turbo transcription, and structured knowledge extraction.',
      color: '#7c3aed', // violet-600
      createdAt: '2026-10-18T09:30:00Z',
      updatedAt: '2026-10-18T09:30:00Z',
    },
    {
      id: 'proj_product',
      name: 'Product & Field Research',
      description: 'User interviews, hardware field ergonomics, audio bookmarking workflows, and roadmap.',
      color: '#059669', // emerald-600
      createdAt: '2026-10-18T10:00:00Z',
      updatedAt: '2026-10-18T10:00:00Z',
    },
  ];

  for (const p of projects) {
    await dbService.saveProject(p);
  }

  // 2. Realistic Audio Recordings & Blobs
  const rec1Blob = createSyntheticWav(32, 220);
  const rec2Blob = createSyntheticWav(45, 260);
  const rec3Blob = createSyntheticWav(24, 196);

  const recordings: Recording[] = [
    {
      id: 'rec_sample_01',
      deviceFileId: 'REC_0042.WAV',
      filename: 'ESP32_DMA_Buffer_Optimization.wav',
      durationSeconds: 32,
      fileSizeBytes: rec1Blob.size,
      mimeType: 'audio/wav',
      audioBlob: rec1Blob,
      fingerprint: 'fp_sample_dma_01',
      createdAt: '2026-10-19T14:20:00Z',
      source: 'sample',
    },
    {
      id: 'rec_sample_02',
      deviceFileId: 'REC_0043.WAV',
      filename: 'Lecture_Distributed_Consensus.wav',
      durationSeconds: 45,
      fileSizeBytes: rec2Blob.size,
      mimeType: 'audio/wav',
      audioBlob: rec2Blob,
      fingerprint: 'fp_sample_lecture_02',
      createdAt: '2026-10-19T16:45:00Z',
      source: 'sample',
    },
    {
      id: 'rec_sample_03',
      deviceFileId: 'REC_0044.WAV',
      filename: 'Field_Notes_Button_Debounce.wav',
      durationSeconds: 24,
      fileSizeBytes: rec3Blob.size,
      mimeType: 'audio/wav',
      audioBlob: rec3Blob,
      fingerprint: 'fp_sample_field_03',
      createdAt: '2026-10-20T08:15:00Z',
      source: 'sample',
    },
  ];

  for (const r of recordings) {
    await dbService.saveRecording(r);
  }

  // 3. Audio Bookmarks
  const bookmarks: AudioBookmark[] = [
    {
      id: 'bm_01',
      recordingId: 'rec_sample_01',
      timestampMs: 8200,
      label: 'DMA ping-pong buffer size setting',
      category: 'keypoint',
      source: 'device',
      createdAt: '2026-10-19T14:20:08Z',
    },
    {
      id: 'bm_02',
      recordingId: 'rec_sample_01',
      timestampMs: 21500,
      label: 'SD card SPI bus clock speed limit',
      category: 'highlight',
      source: 'application',
      createdAt: '2026-10-19T14:20:22Z',
    },
    {
      id: 'bm_03',
      recordingId: 'rec_sample_02',
      timestampMs: 14000,
      label: 'Byzantine fault tolerance threshold',
      category: 'keypoint',
      source: 'device',
      createdAt: '2026-10-19T16:45:14Z',
    },
  ];

  for (const bm of bookmarks) {
    await dbService.saveBookmark(bm);
  }

  // 4. Notes
  const notes: Note[] = [
    {
      id: 'note_sample_01',
      recordingId: 'rec_sample_01',
      title: 'ESP32 DMA Buffers & SD Card SPI Throughput',
      summary: 'Detailed bench analysis of audio buffer overruns when streaming 16kHz 16-bit PCM from the INMP441 microphone to the SPI SD card.\n\nIncreasing the DMA buffer count to 8 and setting buffer length to 512 bytes eliminated all dropped frames during write flushes.',
      noteType: 'meeting',
      projectId: 'proj_hardware',
      tags: ['hardware', 'esp32', 'i2s', 'performance'],
      keyPoints: [
        'INMP441 sample rate fixed at 16,000 Hz mono 16-bit PCM.',
        'DMA buffers adjusted to 8 x 512 bytes to absorb SD write latencies up to 120ms.',
        'SPI bus clock tested at 20MHz; stable across SanDisk Ultra 32GB cards.',
        'OLED update loop decoupled from the audio ISR loop using FreeRTOS task prioritization.'
      ],
      status: 'filed',
      fullTranscript: 'Good morning team. Let us review the audio buffer testing on the ESP32. We observed occasional audio clicks when writing directly to the SPI microSD card. The root cause was SD card sector allocation delays blocking the I2S stream. By expanding our DMA ping-pong buffers to eight buffers of 512 bytes each, the FreeRTOS audio task now buffers over 250 milliseconds of sound. Testing confirms zero dropped frames during 30-minute stress tests. Next, Alex will finalize the button interrupt debounce logic.',
      segments: [
        {
          id: 'seg_1_1',
          start: 0.0,
          end: 6.8,
          text: 'Good morning team. Let us review the audio buffer testing on the ESP32.',
        },
        {
          id: 'seg_1_2',
          start: 7.0,
          end: 14.5,
          text: 'We observed occasional audio clicks when writing directly to the SPI microSD card. The root cause was SD card sector allocation delays.',
        },
        {
          id: 'seg_1_3',
          start: 14.8,
          end: 23.2,
          text: 'By expanding our DMA ping-pong buffers to eight buffers of 512 bytes each, the FreeRTOS audio task now buffers over 250 milliseconds of sound.',
        },
        {
          id: 'seg_1_4',
          start: 23.5,
          end: 32.0,
          text: 'Testing confirms zero dropped frames during 30-minute stress tests. Next, Alex will finalize the button interrupt debounce logic.',
        },
      ],
      relatedNoteIds: ['note_sample_03'],
      createdAt: '2026-10-19T14:22:00Z',
      updatedAt: '2026-10-19T15:00:00Z',
      isArchived: false,
      isFavorite: true,
      confidenceScore: 0.95,
    },
    {
      id: 'note_sample_02',
      recordingId: 'rec_sample_02',
      title: 'Distributed Consensus & State Machine Replication',
      summary: 'Lecture overview covering Paxos and Raft consensus algorithms, state machine replication, and handling split-brain network partitions.\n\nFocuses on the trade-offs between linearizability and availability in distributed storage systems.',
      noteType: 'lecture',
      projectId: 'proj_ai_arch',
      tags: ['distributed-systems', 'consensus', 'raft', 'architecture'],
      keyPoints: [
        'Raft simplifies Paxos into leader election, log replication, and safety.',
        'Quorum requires (N/2) + 1 nodes to guarantee overlap across partitions.',
        'Local-first databases avoid consensus overhead by using CRDTs and client-side authoritative state.'
      ],
      status: 'filed',
      fullTranscript: 'Welcome back everyone. Today we are diving into distributed consensus and state machine replication. In any distributed cluster without a shared clock, agreement on ordering is critical. In Raft, consensus decomposes cleanly into three sub-problems: leader election, log replication, and safety guarantees. Notice how in local-first personal software, we avoid multi-master network locks by treating the local browser as the authoritative master and syncing asynchronously.',
      segments: [
        {
          id: 'seg_2_1',
          start: 0.0,
          end: 8.5,
          text: 'Welcome back everyone. Today we are diving into distributed consensus and state machine replication.',
        },
        {
          id: 'seg_2_2',
          start: 8.8,
          end: 18.0,
          text: 'In any distributed cluster without a shared clock, agreement on ordering is critical.',
        },
        {
          id: 'seg_2_3',
          start: 18.4,
          end: 31.0,
          text: 'In Raft, consensus decomposes cleanly into three sub-problems: leader election, log replication, and safety guarantees.',
        },
        {
          id: 'seg_2_4',
          start: 31.5,
          end: 45.0,
          text: 'Notice how in local-first personal software, we avoid multi-master network locks by treating the local browser as the authoritative master and syncing asynchronously.',
        },
      ],
      relatedNoteIds: [],
      createdAt: '2026-10-19T16:50:00Z',
      updatedAt: '2026-10-19T17:10:00Z',
      isArchived: false,
      isFavorite: false,
      confidenceScore: 0.91,
    },
    {
      id: 'note_sample_03',
      recordingId: 'rec_sample_03',
      title: 'Physical Bookmark Button Hardware Field Feedback',
      summary: 'Observations on physical push-button feedback when bookmarking key audio segments during walking sessions.\n\nRecommends 25ms hardware debounce filter and tactile microswitch click confirmation.',
      noteType: 'idea',
      projectId: 'proj_product',
      tags: ['hardware', 'ergonomics', 'bookmarks', 'field-test'],
      keyPoints: [
        'Double-clicks were accidentally registered when pressing button with gloves.',
        'Require a 25ms interrupt lockout in ESP32 GPIO ISR.',
        'OLED should invert colors for 100ms as visual tap confirmation.'
      ],
      status: 'ready_for_review', // Currently in Inbox awaiting user review!
      fullTranscript: 'Quick voice memo while walking across campus. When pressing the physical bookmark button on the device enclosure, I noticed occasional double-bookmark entries in the log file. We definitely need a 25ms software debounce timer in the ISR. Also, having the OLED display blink an inverted flash for a tenth of a second provides great tactile confidence when your headphones are in.',
      segments: [
        {
          id: 'seg_3_1',
          start: 0.0,
          end: 9.0,
          text: 'Quick voice memo while walking across campus. When pressing the physical bookmark button on the device enclosure, I noticed occasional double-bookmark entries in the log file.',
        },
        {
          id: 'seg_3_2',
          start: 9.3,
          end: 16.5,
          text: 'We definitely need a 25ms software debounce timer in the ISR.',
        },
        {
          id: 'seg_3_3',
          start: 17.0,
          end: 24.0,
          text: 'Also, having the OLED display blink an inverted flash for a tenth of a second provides great tactile confidence when your headphones are in.',
        },
      ],
      relatedNoteIds: ['note_sample_01'],
      suggestedProjectId: 'proj_product',
      suggestedTags: ['hardware', 'ergonomics', 'bookmarks'],
      uncertainties: ['Confirm microswitch travel distance on revision 2 3D printed case.'],
      createdAt: '2026-10-20T08:18:00Z',
      updatedAt: '2026-10-20T08:20:00Z',
      isArchived: false,
      isFavorite: false,
      confidenceScore: 0.88,
    },
  ];

  for (const n of notes) {
    await dbService.saveNote(n);
  }

  // 5. Tasks
  const tasks: TaskItem[] = [
    {
      id: 'task_01',
      noteId: 'note_sample_01',
      recordingId: 'rec_sample_01',
      title: 'Implement 25ms GPIO debounce in ESP32 button interrupt handler',
      priority: 'high',
      dueDate: '2026-10-23',
      completed: false,
      projectId: 'proj_hardware',
      timestampMs: 23500,
      createdAt: '2026-10-19T15:00:00Z',
      reminderEnabled: true,
    },
    {
      id: 'task_02',
      noteId: 'note_sample_01',
      recordingId: 'rec_sample_01',
      title: 'Run 1-hour continuous audio capture stress test on SanDisk 32GB card',
      priority: 'medium',
      dueDate: '2026-10-24',
      completed: false,
      projectId: 'proj_hardware',
      createdAt: '2026-10-19T15:02:00Z',
    },
    {
      id: 'task_03',
      noteId: 'note_sample_02',
      recordingId: 'rec_sample_02',
      title: 'Review Raft leader election invariants before midterm discussion',
      priority: 'medium',
      dueDate: '2026-10-25',
      completed: true,
      projectId: 'proj_ai_arch',
      createdAt: '2026-10-19T17:15:00Z',
    },
  ];

  for (const t of tasks) {
    await dbService.saveTask(t);
  }

  // 6. Sync Logs
  await dbService.saveSyncLog({
    id: 'synclog_01',
    timestamp: '2026-10-20T08:15:20Z',
    deviceIp: '192.168.4.1',
    importedCount: 3,
    failedCount: 0,
    notesSummary: 'Imported REC_0042.WAV, REC_0043.WAV, REC_0044.WAV successfully over local AP.',
    status: 'success',
  });

  return true;
}
