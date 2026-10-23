import React, { useState, useRef } from 'react';
import { 
  Volume2, 
  Play, 
  Pause, 
  Upload, 
  Trash2, 
  Download, 
  RotateCw, 
  Clock, 
  HardDrive, 
  AlertTriangle,
  FileText,
  Search,
  ExternalLink,
  Edit2,
  Check,
  X,
  Mic
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDuration, formatBytes, downloadBlob } from '../../services/audioUtils';

interface AudioLibraryViewProps {
  onOpenRecordModal?: () => void;
}

export const AudioLibraryView: React.FC<AudioLibraryViewProps> = ({ onOpenRecordModal }) => {
  const { 
    recordings, 
    notes, 
    player, 
    playRecording, 
    importAudioFile, 
    deleteRecording,
    reprocessNote,
    setSelectedNoteId,
    setActiveView 
  } = useApp();

  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editFilename, setEditFilename] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await importAudioFile(files[i]);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await importAudioFile(files[i]);
      }
    }
    if (e.target) e.target.value = '';
  };

  const filteredRecordings = recordings.filter(r =>
    r.filename.toLowerCase().includes(search.toLowerCase()) ||
    r.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalAudioSeconds = recordings.reduce((sum, r) => sum + r.durationSeconds, 0);
  const totalAudioBytes = recordings.reduce((sum, r) => sum + r.fileSizeBytes, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Audio Recordings Library
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
              {recordings.length}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Durable binary voice recordings stored in local browser IndexedDB
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {onOpenRecordModal && (
            <button
              onClick={onOpenRecordModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors"
              title="Open Voice Studio to record directly in browser"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record Voice</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Audio File</span>
          </button>
        </div>
      </div>

      {/* Drag & Drop Import Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`p-6 border-2 border-dashed rounded-2xl text-center transition-all ${
          dragOver
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30'
        }`}
      >
        <Volume2 className="w-7 h-7 text-stone-400 mx-auto mb-2" />
        <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">
          Drop voice recordings here (.wav, .mp3, .m4a)
        </div>
        <div className="text-[11px] text-stone-400 mt-0.5">
          Or use the file picker to import ESP32 SD card dumps or mobile voice memos
        </div>
      </div>

      {/* Stats summary banner */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
          <div className="text-stone-400">Total Duration</div>
          <div className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
            {formatDuration(totalAudioSeconds)}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
          <div className="text-stone-400">Local Media Size</div>
          <div className="text-base font-bold font-mono text-stone-900 dark:text-stone-100 mt-1">
            {formatBytes(totalAudioBytes)}
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
          <div className="text-stone-400">Storage Architecture</div>
          <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 mt-1 truncate">
            IndexedDB Blobs (0% Base64)
          </div>
        </div>
      </div>

      {/* Filter search */}
      <div className="relative">
        <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recordings by filename or ID..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500 shadow-xs"
        />
      </div>

      {/* Recordings List */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-xs">
        {filteredRecordings.length === 0 ? (
          <div className="py-12 text-center text-xs text-stone-400">
            No recordings found.
          </div>
        ) : (
          filteredRecordings.map(rec => {
            const linkedNote = notes.find(n => n.recordingId === rec.id);
            const isPlaying = player.currentRecording?.id === rec.id && player.isPlaying;

            return (
              <div
                key={rec.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
              >
                {/* Play Button & Details */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <button
                    onClick={() => {
                      if (isPlaying) {
                        player.audioElement?.pause();
                      } else {
                        playRecording(rec, 0);
                      }
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isPlaying
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-amber-400 hover:text-stone-950 shadow-xs'
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
                        {rec.filename}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        · Source: {rec.source}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 font-mono mt-0.5">
                      <span>{formatDuration(rec.durationSeconds)}</span>
                      <span>·</span>
                      <span>{formatBytes(rec.fileSizeBytes)}</span>
                      <span>·</span>
                      <span>{new Date(rec.createdAt).toLocaleDateString()}</span>
                      {rec.deviceFileId && (
                        <>
                          <span>·</span>
                          <span className="text-purple-600 dark:text-purple-400">
                            SD: {rec.deviceFileId}
                          </span>
                        </>
                      )}
                    </div>

                    {linkedNote && (
                      <button
                        onClick={() => {
                          setSelectedNoteId(linkedNote.id);
                          setActiveView('note_detail');
                        }}
                        className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 mt-1 truncate"
                      >
                        <FileText className="w-3 h-3 shrink-0" />
                        <span>Associated Note: {linkedNote.title}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {rec.audioBlob && (
                    <button
                      onClick={() => downloadBlob(rec.audioBlob!, rec.filename)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                      title="Download audio WAV"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}

                  {linkedNote && (
                    <button
                      onClick={() => reprocessNote(linkedNote.id)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                      title="Re-run transcription and organization"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm(`Delete audio recording "${rec.filename}"? Associated note will remain in notes library.`)) {
                        deleteRecording(rec.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 transition-colors"
                    title="Delete recording"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
