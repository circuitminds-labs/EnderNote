import React, { useState, useRef } from 'react';
import { 
  Settings as SettingsIcon, 
  Key, 
  HardDrive, 
  Download, 
  Upload, 
  Trash2, 
  ShieldCheck, 
  Sliders, 
  AlertTriangle, 
  Check, 
  RotateCcw,
  Sparkles,
  Cpu,
  FileArchive,
  Sun,
  Moon,
  Palette,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatBytes, downloadBlob } from '../../services/audioUtils';
import { backupService, BackupManifest } from '../../services/backupService';

export const SettingsView: React.FC = () => {
  const { 
    settings, 
    updateSettings, 
    toggleTheme,
    storageStats, 
    requestPersistentStorage, 
    clearAllData, 
    resetToSampleData,
    reloadAllData,
    recordings
  } = useApp();

  const [groqKey, setGroqKey] = useState(settings.groqApiKey || '');
  const [transcriptionModel, setTranscriptionModel] = useState(settings.transcriptionModel || 'whisper-large-v3-turbo');
  const [transcriptionLanguage, setTranscriptionLanguage] = useState<'en' | 'hi'>(settings.transcriptionLanguage || 'en');
  const [summarizationModel, setSummarizationModel] = useState(settings.summarizationModel || 'openai/gpt-oss-120b');
  const [autoFile, setAutoFile] = useState(settings.autoFileHighConfidence);
  const [confidenceThreshold, setConfidenceThreshold] = useState(settings.confidenceThreshold || 0.85);
  const [offlineSim, setOfflineSim] = useState(settings.offlineSimulationMode);

  const [isSaved, setIsSaved] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restorePreview, setRestorePreview] = useState<{
    manifest: BackupManifest;
    hasAudioBlobs: boolean;
    backupData: any;
    audioBlobsMap?: any;
  } | null>(null);

  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [isErasingStorage, setIsErasingStorage] = useState(false);
  const [showResetDemoConfirm, setShowResetDemoConfirm] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(() => 
    typeof localStorage !== 'undefined' && localStorage.getItem('auranote_demo_banner_dismissed') === 'true'
  );

  const handleSaveSettings = async () => {
    await updateSettings({
      ...settings,
      groqApiKey: groqKey.trim(),
      transcriptionModel,
      transcriptionLanguage,
      summarizationModel,
      autoFileHighConfidence: autoFile,
      confidenceThreshold,
      offlineSimulationMode: offlineSim,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleRequestPersistence = async () => {
    const granted = await requestPersistentStorage();
    if (granted) {
      alert('Persistent storage granted by browser! IndexedDB data will not be evicted during disk pressure.');
    } else {
      alert('Persistent storage request returned standard transient status.');
    }
  };

  // Export full ZIP
  const handleExportZip = async () => {
    setIsExporting(true);
    try {
      const zipBlob = await backupService.exportFullZipBackup();
      const dateStr = new Date().toISOString().split('T')[0];
      downloadBlob(zipBlob, `EnderNote_Full_Backup_${dateStr}.zip`);
    } finally {
      setIsExporting(false);
    }
  };

  // Export JSON metadata
  const handleExportJson = async () => {
    setIsExporting(true);
    try {
      const jsonBlob = await backupService.exportMetadataJson();
      const dateStr = new Date().toISOString().split('T')[0];
      downloadBlob(jsonBlob, `EnderNote_Metadata_${dateStr}.json`);
    } finally {
      setIsExporting(false);
    }
  };

  // File chosen for restore
  const handleBackupFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const preview = await backupService.previewBackup(file);
      setRestorePreview(preview);
    } catch (err: any) {
      alert(`Invalid backup file: ${err.message}`);
    }
    if (e.target) e.target.value = '';
  };

  const handleConfirmRestore = async (mode: 'merge' | 'replace') => {
    if (!restorePreview) return;
    setIsRestoring(true);
    setRestoreMessage('');

    try {
      const res = await backupService.restoreBackup(
        restorePreview.backupData,
        restorePreview.audioBlobsMap,
        mode
      );
      await reloadAllData();
      setRestoreMessage(`Restored ${res.notesRestored} notes and ${res.recordingsRestored} recordings successfully!`);
      setRestorePreview(null);
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          Application & Storage Settings
        </h1>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
          Configure AI speech models, persistent storage quotas, automated organization, and portable backups
        </p>
      </div>

      {/* Section 1: Groq AI Provider */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
          <Key className="w-4 h-4 text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Groq Cloud AI Integration (Online Mode)
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-stone-500">
              Groq API Key
            </label>
            <input
              type="password"
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              className="w-full px-3 py-2 font-mono text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
            />
            <p className="text-[11px] text-stone-400">
              Stored exclusively in your local browser storage. Never sent to any central server. Used directly for Groq Whisper & LLM requests.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-500">
                Speech-to-Text Model
              </label>
              <select
                value={transcriptionModel}
                onChange={(e) => setTranscriptionModel(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
              >
                <option value="whisper-large-v3-turbo">whisper-large-v3-turbo (Fast & Accurate)</option>
                <option value="whisper-large-v3">whisper-large-v3 (Standard)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-500">
                Summarization & Organization Model
              </label>
              <select
                value={summarizationModel}
                onChange={(e) => setSummarizationModel(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
              >
                <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Structured Reasoning)</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Fast 70B)</option>
                <option value="llama3-70b-8192">llama3-70b-8192</option>
              </select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-medium text-stone-500 flex items-center justify-between">
                <span>Transcription Language</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Strictly English & Hindi only</span>
              </label>
              <select
                value={transcriptionLanguage}
                onChange={(e) => setTranscriptionLanguage(e.target.value as 'en' | 'hi')}
                className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
              >
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi - हिंदी)</option>
              </select>
              <p className="text-[10px] text-stone-400">
                Transcriber only operates in English or Hindi. Any other languages are rejected.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={offlineSim}
                onChange={(e) => setOfflineSim(e.target.checked)}
                className="rounded border-stone-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-xs text-stone-700 dark:text-stone-300 font-medium">
                Enable Smart Local Simulation Fallback when offline or if no Groq key is set
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Section: Appearance & Visual Theme */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
          <Palette className="w-4 h-4 text-amber-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Appearance & Visual Theme
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <button
            type="button"
            onClick={() => {
              if (settings.theme !== 'dark') toggleTheme();
            }}
            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              settings.theme === 'dark'
                ? 'bg-stone-950 border-amber-500/80 text-white shadow-md'
                : 'bg-stone-100 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-400'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-stone-900 border border-stone-700 flex items-center justify-center shrink-0">
              <Moon className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="font-semibold text-xs flex items-center gap-2">
                <span>Dark Mode</span>
                {settings.theme === 'dark' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-stone-950 font-bold rounded-full">Active</span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                Optimized for embedded hardware studios, low-glare work, and nighttime recording sessions.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (settings.theme !== 'light') toggleTheme();
            }}
            className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              settings.theme === 'light'
                ? 'bg-amber-500/10 border-amber-500 text-stone-900 shadow-md'
                : 'bg-stone-100 dark:bg-stone-800/40 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-400'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
              <Sun className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <div className="font-semibold text-xs flex items-center gap-2 text-stone-900 dark:text-stone-100">
                <span>Light Mode</span>
                {settings.theme === 'light' && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-stone-950 font-bold rounded-full">Active</span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                High-contrast clean paper aesthetic for daytime reading, documentation, and office light.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Section 2: Automated Organizer Rules */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
          <Sliders className="w-4 h-4 text-sky-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Organizer Automation Rules
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoFile}
              onChange={(e) => setAutoFile(e.target.checked)}
              className="mt-0.5 rounded border-stone-300 text-sky-600 focus:ring-sky-500"
            />
            <div>
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                Automatically file high-confidence recordings into matched projects
              </span>
              <p className="text-[11px] text-stone-400 mt-0.5">
                When disabled, all newly processed recordings wait in the Inbox for manual review.
              </p>
            </div>
          </label>

          {autoFile && (
            <div className="space-y-1.5 pl-6 pt-1">
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <span>Confidence Threshold: {Math.round(confidenceThreshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.05}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Storage & Persistence */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
          <HardDrive className="w-4 h-4 text-purple-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Local Browser Storage & Persistence
          </h2>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
              <span className="text-stone-400 text-[11px]">IndexedDB Storage Usage</span>
              <div className="text-sm font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5">
                {formatBytes(storageStats.usageBytes)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
              <span className="text-stone-400 text-[11px]">Storage Persistence Status</span>
              <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className={`w-4 h-4 ${storageStats.isPersisted ? 'text-emerald-500' : 'text-stone-400'}`} />
                <span>{storageStats.isPersisted ? 'Persistent (Protected)' : 'Transient'}</span>
              </div>
            </div>
          </div>

          {!storageStats.isPersisted && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
              <span>Request persistent storage so the browser never clears your voice notes cache under disk pressure.</span>
              <button
                onClick={handleRequestPersistence}
                className="px-3 py-1 rounded-md bg-amber-500 text-stone-950 font-semibold hover:bg-amber-400 shrink-0 ml-2"
              >
                Request Persistence
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save Settings Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold shadow-xs transition-colors"
        >
          {isSaved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : null}
          <span>{isSaved ? 'Settings Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Section 4: Data Portability, Backup & Restore */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
          <Download className="w-4 h-4 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
            Data Portability, Backup & Recovery
          </h2>
        </div>

        <p className="text-xs text-stone-500 dark:text-stone-400">
          Because EnderNote is local-first, backups are your personal lifeline. Export full ZIP packages containing structured metadata, transcripts, and all original audio binaries.
        </p>

        {/* Restore Result Message */}
        {restoreMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs">
            {restoreMessage}
          </div>
        )}

        {/* Export / Restore Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportZip}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium transition-colors"
          >
            <FileArchive className="w-3.5 h-3.5 text-amber-500" />
            <span>{isExporting ? 'Generating ZIP...' : 'Export Complete Backup (.ZIP)'}</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-stone-400" />
            <span>Export Metadata Only (.JSON)</span>
          </button>

          <input
            ref={backupInputRef}
            type="file"
            accept=".zip,.json"
            className="hidden"
            onChange={handleBackupFileChosen}
          />

          <button
            onClick={() => backupInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold shadow-xs transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore from Backup</span>
          </button>
        </div>

        {/* Restore Preview Dialog */}
        {restorePreview && (
          <div className="p-4 rounded-xl bg-stone-100 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-3 animate-in fade-in text-xs">
            <div className="font-semibold text-stone-900 dark:text-stone-100">
              Backup Archive Inspection:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-stone-600 dark:text-stone-300">
              <div>Notes: {restorePreview.manifest.notesCount}</div>
              <div>Recordings: {restorePreview.manifest.recordingsCount}</div>
              <div>Tasks: {restorePreview.manifest.tasksCount}</div>
              <div>Audio Files: {restorePreview.hasAudioBlobs ? 'Included' : 'None'}</div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleConfirmRestore('merge')}
                disabled={isRestoring}
                className="px-3 py-1.5 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-medium"
              >
                Merge with Existing Data
              </button>

              <button
                onClick={() => handleConfirmRestore('replace')}
                disabled={isRestoring}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-500"
              >
                Clean Replace All
              </button>

              <button
                type="button"
                onClick={() => setRestorePreview(null)}
                className="px-3 py-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 5: Reset & Demo Data */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-rose-200 dark:border-rose-950/50 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-rose-100 dark:border-rose-950/40 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-4 h-4" />
          <h2 className="text-xs font-bold uppercase tracking-wider">
            Danger Zone & Demo Controls
          </h2>
        </div>

        {/* Action feedback message */}
        {actionFeedback && (
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="p-1 hover:opacity-70 text-stone-500 dark:text-stone-400 text-xs ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Demo Data Option */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-stone-800 dark:text-stone-200">
                Load Sample Demo Library
              </div>
              <div className="text-[11px] text-stone-400">
                Populates realistic sample ESP32 voice notes, bookmarks, projects, and actionable tasks for testing.
              </div>
            </div>
            {!showResetDemoConfirm && (
              <button
                onClick={() => {
                  setShowResetDemoConfirm(true);
                  setShowEraseConfirm(false);
                  setActionFeedback(null);
                }}
                disabled={isResettingDemo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-medium cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Demo Data</span>
              </button>
            )}
          </div>

          {/* Inline Reset to Demo Confirmation */}
          {showResetDemoConfirm && (
            <div className="p-3.5 rounded-xl bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-xs space-y-2.5 animate-in fade-in">
              <div className="text-stone-800 dark:text-stone-200 font-medium">
                Reset database to demo dataset? This replaces existing voice notes and tasks with fresh sample notes.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setIsResettingDemo(true);
                      await resetToSampleData();
                      setBannerDismissed(false);
                      setShowResetDemoConfirm(false);
                      setActionFeedback({
                        type: 'success',
                        message: 'Demo library successfully restored! Sample voice notes, projects, and tasks are ready.'
                      });
                    } catch (err: any) {
                      setActionFeedback({
                        type: 'error',
                        message: `Failed to restore demo data: ${err?.message || 'Unknown error'}`
                      });
                    } finally {
                      setIsResettingDemo(false);
                    }
                  }}
                  disabled={isResettingDemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 font-semibold cursor-pointer"
                >
                  {isResettingDemo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>{isResettingDemo ? 'Restoring Demo Data...' : 'Confirm Reset to Demo'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetDemoConfirm(false)}
                  disabled={isResettingDemo}
                  className="px-3 py-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Option to restore the dismissed demo library banner on the dashboard */}
          {bannerDismissed && recordings.some(r => r.source === 'sample') && (
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-stone-100/80 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700/60 mt-1">
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                Sample Demo Library banner is currently dismissed on the dashboard.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem('auranote_demo_banner_dismissed');
                  }
                  setBannerDismissed(false);
                  setActionFeedback({
                    type: 'success',
                    message: 'Demo library banner has been restored to the dashboard!'
                  });
                }}
                className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer ml-2 shrink-0"
              >
                Restore Banner
              </button>
            </div>
          )}
        </div>

        {/* Clear All Storage Option */}
        <div className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-semibold text-rose-600">
                Clear All Local Storage
              </div>
              <div className="text-[11px] text-stone-400">
                Permanently wipes all local audio recordings, notes, tasks, bookmarks, and settings from this browser.
              </div>
            </div>
            {!showEraseConfirm && (
              <button
                onClick={() => {
                  setShowEraseConfirm(true);
                  setShowResetDemoConfirm(false);
                  setActionFeedback(null);
                }}
                disabled={isErasingStorage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase Local Storage</span>
              </button>
            )}
          </div>

          {/* Inline Erase Confirmation Card */}
          {showEraseConfirm && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs space-y-2.5 animate-in fade-in">
              <div className="text-rose-900 dark:text-rose-200 font-medium leading-relaxed">
                ⚠️ <strong>Are you absolutely sure?</strong> All audio recordings, transcripts, notes, projects, tasks, and bookmarks in this browser will be permanently erased. This cannot be undone without a backup file.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      setIsErasingStorage(true);
                      await clearAllData();
                      setShowEraseConfirm(false);
                      setActionFeedback({
                        type: 'success',
                        message: 'All local storage and database records have been completely erased.'
                      });
                    } catch (err: any) {
                      setActionFeedback({
                        type: 'error',
                        message: `Failed to erase local storage: ${err?.message || 'Unknown error'}`
                      });
                    } finally {
                      setIsErasingStorage(false);
                    }
                  }}
                  disabled={isErasingStorage}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 font-semibold cursor-pointer"
                >
                  {isErasingStorage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isErasingStorage ? 'Wiping Storage...' : 'Yes, Permanently Erase All Data'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowEraseConfirm(false)}
                  disabled={isErasingStorage}
                  className="px-3 py-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
