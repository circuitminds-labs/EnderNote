import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Wifi, 
  WifiOff, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Pause,
  HardDrive, 
  Bookmark, 
  FileCode, 
  Copy, 
  Check, 
  ArrowRight, 
  Battery, 
  ShieldCheck, 
  Radio, 
  CheckSquare, 
  Square, 
  Volume2, 
  X,
  ExternalLink,
  Layers,
  Sparkles,
  Usb,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle,
  Terminal,
  AlertTriangle,
  FolderOpen,
  Languages
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { esp32Service, ConnectionDiagnosis } from '../../services/esp32Service';
import { Esp32DeviceInfo, Esp32FileItem, TranscriptionLanguage } from '../../types';
import { formatBytes, formatDuration } from '../../services/audioUtils';

export const DeviceSyncView: React.FC = () => {
  const { 
    settings, 
    updateSettings, 
    importAudioFile, 
    setActiveView, 
    clearAllData 
  } = useApp();

  const [deviceIp, setDeviceIp] = useState(settings.esp32DeviceIp || '192.168.4.1');
  const [deviceInfo, setDeviceInfo] = useState<Esp32DeviceInfo | null>(null);
  const [pairedToken, setPairedToken] = useState<string | null>(settings.esp32PairToken || null);
  const esp32Ip = (deviceIp || settings.esp32DeviceIp || '192.168.4.1').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Connection Mode
  const [isSerialConnected, setIsSerialConnected] = useState(esp32Service.isSerialConnected());
  const [diagnosis, setDiagnosis] = useState<ConnectionDiagnosis | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Handshake State
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [pairingStatusText, setPairingStatusText] = useState('Waiting for Device Confirmation...');
  const [pairingSecondsElapsed, setPairingSecondsElapsed] = useState(0);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const pairingPollTimerRef = useRef<number | null>(null);

  // File Selection Dashboard State
  const [files, setFiles] = useState<Esp32FileItem[]>([]);
  const [selectedFilenames, setSelectedFilenames] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fetchFilesError, setFetchFilesError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sdCardFileInputRef = useRef<HTMLInputElement | null>(null);
  const sdCardFolderInputRef = useRef<HTMLInputElement | null>(null);
  const localMicroSdFilesRef = useRef<Map<string, File>>(new Map());
  const localPreviewUrlsRef = useRef<Map<string, string>>(new Map());

  // Sequential Streaming Sync State
  const [syncLanguage, setSyncLanguage] = useState<TranscriptionLanguage>(settings.transcriptionLanguage || 'en');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncTotalCount, setSyncTotalCount] = useState(0);
  const [syncCurrentIndex, setSyncCurrentIndex] = useState(0);
  const [syncCurrentFilename, setSyncCurrentFilename] = useState('');
  const [syncCurrentPercent, setSyncCurrentPercent] = useState(0);
  const [syncOverallPercent, setSyncOverallPercent] = useState(0);
  const [syncBytesReceived, setSyncBytesReceived] = useState(0);
  const [syncTotalBytes, setSyncTotalBytes] = useState(0);
  const [syncedCompletedFiles, setSyncedCompletedFiles] = useState<string[]>([]);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [isSyncComplete, setIsSyncComplete] = useState(false);

  // Modals
  const [firmwareModalOpen, setFirmwareModalOpen] = useState(false);
  const [firmwareCopied, setFirmwareCopied] = useState(false);
  const [localSetupModalOpen, setLocalSetupModalOpen] = useState(false);

  // Initial connection check & diagnosis
  useEffect(() => {
    checkDevice();
    runDiagnosis();
    fetchFiles();
  }, [deviceIp]);

  // Poll cleanup on unmount
  useEffect(() => {
    return () => {
      if (pairingPollTimerRef.current) clearInterval(pairingPollTimerRef.current);
    };
  }, []);

  const runDiagnosis = async () => {
    try {
      const diag = await esp32Service.checkConnectionDiagnosis(deviceIp);
      setDiagnosis(diag);
    } catch (e) {
      console.warn('Diagnosis warning:', e);
    }
  };

  const checkDevice = async () => {
    try {
      const info = await esp32Service.checkConnection(deviceIp);
      setDeviceInfo(info);
      if (info.status === 'connected') {
        fetchFiles();
      }
    } catch (e) {
      console.warn('checkDevice warning:', e);
    }
  };

  const handlePingTest = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const cleanIp = esp32Service.getCleanIp(deviceIp);
      const startTime = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`http://${cleanIp}/status`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const elapsed = Math.round(performance.now() - startTime);
      if (res.ok) {
        setPingResult({
          ok: true,
          message: `Success! ESP32 responded in ${elapsed}ms. Firmware is active and reachable.`,
        });
        checkDevice();
      } else {
        setPingResult({
          ok: false,
          message: `ESP32 responded with HTTP status ${res.status}. Check endpoint.`,
        });
      }
    } catch (err: any) {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      setPingResult({
        ok: false,
        message: isHttps
          ? `Connection blocked by browser HTTPS security. To connect directly via Wi-Fi HTTP, install and run this app locally at http://localhost:3000 or connect via USB.`
          : `Device unreachable at http://${deviceIp}: ${err?.message || 'Check power & Wi-Fi connection'}`,
      });
    } finally {
      setIsPinging(false);
    }
  };

  /**
   * Connect via Web Serial (Direct USB Cable)
   */
  const handleConnectUsbSerial = async () => {
    const res = await esp32Service.connectSerial();
    if (res.ok) {
      setIsSerialConnected(true);
      handleInitiatePairing('serial');
    } else {
      alert(`USB Serial: ${res.message}`);
    }
  };

  const handleDisconnectUsbSerial = async () => {
    await esp32Service.disconnectSerial();
    setIsSerialConnected(false);
  };

  /**
   * 1. The Device Pairing Handshake
   * - Send POST /api/pair/request?device=NotesMaker-WebApp
   * - Block UI with "Waiting for Device Confirmation" modal
   * - Poll /api/pair/status every 1s
   * - When "status": "approved", save returned token, close modal, load dashboard
   */
  const handleInitiatePairing = async (modeOverride?: 'serial' | 'http') => {
    const activeMode = modeOverride || (isSerialConnected ? 'serial' : 'http');

    // Save current IP to settings
    await updateSettings({ ...settings, esp32DeviceIp: deviceIp });

    setIsPairingModalOpen(true);
    setPairingError(null);
    setPairingStatusText(
      activeMode === 'serial' 
        ? 'Sending pairing request to ESP32 over USB Serial...'
        : `Sending pairing request to ESP32 at http://${deviceIp}...`
    );
    setPairingSecondsElapsed(0);

    // Step 1: POST /api/pair/request
    const reqResult = await esp32Service.requestPairing(deviceIp, 'NotesMaker-WebApp', activeMode);
    
    if (reqResult.status === 'error') {
      setPairingError(reqResult.message || 'Unable to reach ESP32.');
      setPairingStatusText('Pairing connection failed.');
      return;
    }

    if (reqResult.status === 'approved') {
      fetchFiles();
      completePairing(reqResult.token || '');
      return;
    }

    setPairingStatusText('Pairing request received by ESP32! Please press the physical button on GPIO 15 to authorize.');

    // Clear any existing poll
    if (pairingPollTimerRef.current) clearInterval(pairingPollTimerRef.current);

    // Step 2: Poll /api/pair/status every 1s using absolute URL
    const pollInterval = window.setInterval(async () => {
      setPairingSecondsElapsed(prev => prev + 1);

      try {
        const cleanIp = esp32Service.getCleanIp(deviceIp);
        // Absolute URL fetch for /api/pair/status
        const res = await fetch(`http://${cleanIp}/api/pair/status`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const statusRes = await res.json();
          // Trigger Timing: Ensure fetchFiles() is explicitly called immediately after /api/pair/status handshake confirms status is "approved"
          if (statusRes.status === 'approved') {
            clearInterval(pollInterval);
            pairingPollTimerRef.current = null;
            fetchFiles();
            completePairing(statusRes.token || '');
            return;
          } else if (statusRes.status === 'rejected') {
            clearInterval(pollInterval);
            pairingPollTimerRef.current = null;
            setPairingError('Pairing request was rejected on the hardware device.');
            setPairingStatusText('Pairing declined.');
            return;
          }
        }
      } catch (err) {
        // Fallback polling via esp32Service if direct fetch fails (e.g. Serial connection)
        try {
          const statusRes = await esp32Service.pollPairingStatus(deviceIp);
          if (statusRes.status === 'approved') {
            clearInterval(pollInterval);
            pairingPollTimerRef.current = null;
            fetchFiles();
            completePairing(statusRes.token || '');
            return;
          } else if (statusRes.status === 'rejected') {
            clearInterval(pollInterval);
            pairingPollTimerRef.current = null;
            setPairingError('Pairing request was rejected on the hardware device.');
            setPairingStatusText('Pairing declined.');
            return;
          }
        } catch (serviceErr) {
          console.warn('Pairing poll tick warning:', serviceErr);
        }
      }
    }, 1000);

    pairingPollTimerRef.current = pollInterval;
  };

  const completePairing = async (token: string) => {
    setPairedToken(token);
    await updateSettings({
      ...settings,
      esp32DeviceIp: deviceIp,
      esp32PairToken: token,
    });

    setPairingStatusText('Pairing Approved! Device Connected.');
    fetchFiles(deviceIp);
    setTimeout(() => {
      setIsPairingModalOpen(false);
      checkDevice();
    }, 800);
  };

  const handleCancelPairing = () => {
    if (pairingPollTimerRef.current) {
      clearInterval(pairingPollTimerRef.current);
      pairingPollTimerRef.current = null;
    }
    setIsPairingModalOpen(false);
  };

  /**
   * 2. The File Selection Dashboard
   * - Absolute URLs: Explicitly uses http://${esp32Ip}/files
   * - Direct Array Parsing: The ESP32 returns a raw, flat JSON array for the files list:
   *   [{"name":"REC0005.WAV","size":183852,"durationSec":5}, ...].
   *   Maps directly over this array without looking for response.data or response.files.
   */
  const fetchFiles = async (ipToUse: string = deviceIp, token?: string, timeoutMs: number = 10000) => {
    setIsLoadingFiles(true);
    setFetchFilesError(null);
    const targetIp = (ipToUse || deviceIp || '192.168.4.1').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

    try {
      // Constraint 1: Absolute URL explicitly using ESP32's IP address
      const url = `http://${targetIp}/files`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`ESP32 /files returned HTTP ${res.status}: ${res.statusText}`);
      }

      // Constraint 2: Direct Array Parsing
      // The ESP32 returns a raw, flat JSON array for the files list: [{"name":"REC0005.WAV","size":183852,"durationSec":5}, ...].
      // Ensure state parsing maps directly over this array without looking for response.data or response.files.
      const data = await res.json();
      const filesArray = Array.isArray(data) ? data : [];

      const parsedFiles: Esp32FileItem[] = filesArray.map((file: any) => {
        const name = file.name || file.filename || 'UNKNOWN.WAV';
        const size = typeof file.size === 'number' ? file.size : (file.fileSizeBytes || 0);
        const durationSec = typeof file.durationSec === 'number'
          ? file.durationSec
          : (typeof file.duration === 'number' ? file.duration : (file.durationSeconds || Math.max(1, Math.round(size / 32000))));

        return {
          name,
          filename: name,
          size,
          duration: durationSec,
          durationSec,
          formattedSize: formatBytes(size),
          formattedDuration: formatDuration(durationSec),
        };
      });

      setFiles(parsedFiles);
      setSelectedFilenames(parsedFiles.map(f => f.name || f.filename));
      return parsedFiles;
    } catch (err: any) {
      console.warn('Direct fetch from http://' + targetIp + '/files failed, trying fallback:', err);
      try {
        const serviceFiles = await esp32Service.fetchFiles(targetIp, token, timeoutMs);
        setFiles(serviceFiles);
        setSelectedFilenames(serviceFiles.map(f => f.name || f.filename));
        return serviceFiles;
      } catch (serviceErr: any) {
        setFetchFilesError(err?.message || serviceErr?.message || 'Failed to fetch recordings from ESP32.');
        setFiles([]);
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const loadFiles = fetchFiles;

  /**
   * Direct MicroSD Card Import (Pick files directly from MicroSD card inserted into PC)
   */
  const handleMicroSdFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    processSelectedFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const processSelectedFiles = (selectedFilesList: File[]) => {
    const audioFiles = selectedFilesList.filter(f => 
      f.name.toLowerCase().endsWith('.wav') || 
      f.type.startsWith('audio/') || 
      f.name.toLowerCase().endsWith('.mp3') ||
      f.name.toLowerCase().endsWith('.m4a')
    );

    if (audioFiles.length === 0) {
      alert('No audio (.wav) files found in the selection.');
      return;
    }

    const newItems: Esp32FileItem[] = [];
    for (const file of audioFiles) {
      localMicroSdFilesRef.current.set(file.name, file);
      const previewUrl = URL.createObjectURL(file);
      localPreviewUrlsRef.current.set(file.name, previewUrl);

      const durationEstimate = Math.max(1, Math.round(file.size / 32000));
      newItems.push({
        filename: file.name,
        name: file.name,
        size: file.size,
        duration: durationEstimate,
        durationSec: durationEstimate,
        formattedSize: formatBytes(file.size),
        formattedDuration: formatDuration(durationEstimate),
      });
    }

    // Merge with existing files (replace if same filename)
    setFiles(prev => {
      const existingNames = new Set(newItems.map(n => n.name || n.filename));
      const filtered = prev.filter(p => !existingNames.has(p.name || p.filename));
      return [...newItems, ...filtered];
    });

    // Select the new files
    setSelectedFilenames(prev => Array.from(new Set([...prev, ...newItems.map(n => n.name || n.filename)])));
    setFetchFilesError(null);
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleToggleFile = (filename: string) => {
    setSelectedFilenames(prev =>
      prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]
    );
  };

  const handleSelectAll = () => {
    if (selectedFilenames.length === files.length) {
      setSelectedFilenames([]);
    } else {
      setSelectedFilenames(files.map(f => f.name || f.filename));
    }
  };

  /**
   * 3. Synchronized Sequential Download
   * - Sequential download one-by-one from real ESP32 or direct MicroSD card
   * - /api/sync/download?file=...&idx=...&total=...&token=...
   * - ReadableStream real-time chunk progress
   * - Stitch into Blob & save to IndexedDB / NotesMaker
   * - POST /api/sync/complete
   */
  const handleStartSequentialSync = async (languageOverride?: TranscriptionLanguage) => {
    if (selectedFilenames.length === 0) return;

    const activeLanguage = languageOverride || syncLanguage;
    const token = pairedToken || 'guest_token';
    const total = selectedFilenames.length;

    setIsSyncModalOpen(true);
    setIsSyncComplete(false);
    setSyncErrorMessage(null);
    setSyncTotalCount(total);
    setSyncedCompletedFiles([]);
    setSyncOverallPercent(0);

    const importedNoteIds: string[] = [];

    try {
      // Strictly sequential download loop
      for (let i = 0; i < total; i++) {
        const filename = selectedFilenames[i];
        const currentIdx = i + 1;

        setSyncCurrentIndex(currentIdx);
        setSyncCurrentFilename(filename);
        setSyncCurrentPercent(0);

        let audioFile: File;

        // Check if file was imported directly from MicroSD card reader
        if (localMicroSdFilesRef.current.has(filename)) {
          audioFile = localMicroSdFilesRef.current.get(filename)!;
          // Animate quick smooth streaming progress for feedback
          setSyncBytesReceived(audioFile.size);
          setSyncTotalBytes(audioFile.size);
          setSyncCurrentPercent(100);
          const basePercent = (i / total) * 100;
          setSyncOverallPercent(Math.min(100, Math.round(basePercent + (100 / total))));
        } else {
          // Download real file with chunk stream from ESP32 HTTP
          const blob = await esp32Service.downloadFileSynchronized(
            deviceIp,
            filename,
            currentIdx,
            total,
            token,
            (bytesReceived, totalBytes, percent) => {
              setSyncBytesReceived(bytesReceived);
              setSyncTotalBytes(totalBytes);
              setSyncCurrentPercent(percent);

              const basePercent = (i / total) * 100;
              const currentFileContribution = (percent / total);
              setSyncOverallPercent(Math.min(100, Math.round(basePercent + currentFileContribution)));
            }
          );
          audioFile = new File([blob], filename, { type: 'audio/wav' });
        }

        // Stitch into File and import into IndexedDB storage
        const { note } = await importAudioFile(audioFile, {
          title: filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          source: 'esp32',
          language: activeLanguage,
          awaitCompletion: false,
        });

        importedNoteIds.push(note.id);
        setSyncedCompletedFiles(prev => [...prev, filename]);
      }

      // Step 4: Tell ESP32 to clear its screen (if connected via HTTP)
      if (!isSerialConnected) {
        await esp32Service.completeSync(deviceIp, token).catch(() => {});
      }

      setSyncOverallPercent(100);
      setSyncCurrentPercent(100);
      setIsSyncComplete(true);
    } catch (err: any) {
      setSyncErrorMessage(err?.message || 'Download interrupted or connection lost.');
    }
  };

  const copyFirmware = () => {
    const code = esp32Service.getFirmwareSketchCode();
    navigator.clipboard.writeText(code);
    setFirmwareCopied(true);
    setTimeout(() => setFirmwareCopied(false), 2000);
  };

  const handleClearDemoNotes = async () => {
    if (confirm('Clear all sample demo notes from your library so you only see real ESP32 recordings?')) {
      await clearAllData();
      alert('Library cleared. Your app is now completely blank and ready for real voice recordings!');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              ESP32 Device Pairing & Sync
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-medium flex items-center gap-1.5">
              <Radio className="w-3 h-3" />
              <span>Real Hardware HTTP & USB Bridge</span>
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Direct communication with your ESP32 device running local HTTP server and OLED display
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLocalSetupModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Local Install Guide</span>
          </button>

          <button
            onClick={() => setFirmwareModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-medium hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-purple-500" />
            <span>ESP32 Arduino Sketch</span>
          </button>

          <button
            onClick={handleClearDemoNotes}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-rose-500/10 hover:text-rose-600 dark:bg-stone-800 dark:hover:bg-rose-500/20 dark:hover:text-rose-400 text-stone-600 dark:text-stone-300 text-xs font-medium transition-colors cursor-pointer"
            title="Erase all demo notes so only your real recordings appear"
          >
            <span>Start Blank (Clear Demo Notes)</span>
          </button>
        </div>
      </div>

      {/* Ping & Reachability Notification */}
      {pingResult && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
          pingResult.ok 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {pingResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
            <span>{pingResult.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setPingResult(null)} 
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-md hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Dismiss ping result"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Workflow Step 1: Device Pairing Handshake Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-start sm:items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              deviceInfo?.status === 'connected'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
            }`}>
              <Cpu className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  ESP32 Hardware Unit
                </h2>
                {deviceInfo?.status === 'connected' ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online & Reachable
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-300 dark:border-stone-700 font-mono">
                    Device Offline / Not Connected
                  </span>
                )}
                {isSerialConnected && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    USB Serial
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Target: http://{deviceIp} · SSD1306 OLED · MicroSD SPI Audio Storage
              </p>
            </div>
          </div>

          {/* Connection Controls: IP Input & USB Connect */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {esp32Service.isWebSerialSupported() && (
              <button
                type="button"
                onClick={isSerialConnected ? handleDisconnectUsbSerial : handleConnectUsbSerial}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                  isSerialConnected
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200'
                }`}
                title="Connect directly via USB Cable using Web Serial API"
              >
                <Usb className="w-3.5 h-3.5" />
                <span>{isSerialConnected ? 'Disconnect USB' : 'USB Serial'}</span>
              </button>
            )}

            <div className="relative flex-1 sm:w-36">
              <input
                type="text"
                value={deviceIp}
                onChange={(e) => setDeviceIp(e.target.value)}
                placeholder="192.168.4.1"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <button
              onClick={handlePingTest}
              disabled={isPinging}
              className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors cursor-pointer"
              title="Ping device to test network reachability"
            >
              {isPinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>Ping</span>}
            </button>

            <button
              onClick={() => handleInitiatePairing('http')}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          </div>
        </div>

        {/* Real Hardware Telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
            <span className="text-stone-400 text-[11px]">Hardware Status</span>
            <div className="text-xs font-bold font-mono text-stone-800 dark:text-stone-200 mt-0.5 truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${deviceInfo?.status === 'connected' ? 'bg-emerald-500' : 'bg-stone-400'}`} />
              <span>{deviceInfo?.status === 'connected' ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
            <span className="text-stone-400 text-[11px]">MicroSD Free Space</span>
            <div className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5">
              {deviceInfo && deviceInfo.freeSdSpaceMb > 0
                ? `${Math.round(deviceInfo.freeSdSpaceMb / 1024 * 10) / 10} GB`
                : deviceInfo?.status === 'connected' ? 'SD Ready' : '—'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
            <span className="text-stone-400 text-[11px]">Recordings on SD</span>
            <div className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5">
              {deviceInfo?.status === 'connected' ? `${deviceInfo.recordingsCount || files.length} files` : '—'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60">
            <span className="text-stone-400 text-[11px]">Pairing Token</span>
            <div className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100 mt-0.5 truncate">
              {pairedToken ? `${pairedToken.slice(0, 14)}...` : 'None (Click Connect)'}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for direct MicroSD card reading via card reader / PC */}
      <input
        ref={sdCardFileInputRef}
        type="file"
        multiple
        accept=".wav,audio/wav,audio/*"
        className="hidden"
        onChange={handleMicroSdFilesSelected}
      />

      {/* Workflow Step 2: Real File Selection Dashboard */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDropFiles}
        className={`p-6 rounded-2xl bg-white dark:bg-stone-900 border transition-all shadow-xs space-y-4 ${
          isDragging 
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10' 
            : 'border-stone-200 dark:border-stone-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>Recordings on ESP32 MicroSD</span>
              </h2>
              {files.some(f => localMicroSdFilesRef.current.has(f.filename)) && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                  MicroSD Reader Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-stone-400">
              Fetch over Wi-Fi HTTP or import directly from your MicroSD card reader / PC folder
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => sdCardFileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              title="Insert your MicroSD card into your computer and select the WAV recordings"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Import from MicroSD Card</span>
            </button>

            <button
              onClick={() => fetchFiles()}
              disabled={isLoadingFiles}
              className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              title="Fetch files list over Wi-Fi from the ESP32 /files endpoint"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>Refresh Wi-Fi</span>
            </button>

            {files.length > 0 && (
              <>
                {/* Transcription Language Switcher: Strictly English or Hindi */}
                <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800/90 p-1 rounded-xl border border-stone-200/80 dark:border-stone-700/80 shadow-2xs">
                  <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 pl-2 pr-1 flex items-center gap-1.5 select-none">
                    <Languages className="w-3.5 h-3.5 text-amber-500" />
                    <span className="hidden sm:inline">Transcribe in:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSyncLanguage('en')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      syncLanguage === 'en'
                        ? 'bg-amber-500 text-stone-950 shadow-xs ring-1 ring-amber-400'
                        : 'text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-700/60'
                    }`}
                    title="Transcribe speech in English"
                  >
                    <span>English</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSyncLanguage('hi')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      syncLanguage === 'hi'
                        ? 'bg-amber-500 text-stone-950 shadow-xs ring-1 ring-amber-400'
                        : 'text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-100 hover:bg-stone-200/60 dark:hover:bg-stone-700/60'
                    }`}
                    title="हिंदी में ट्रांसक्राइब करें (Transcribe speech in Hindi)"
                  >
                    <span>हिंदी (Hindi)</span>
                  </button>
                </div>

                <button
                  onClick={handleSelectAll}
                  className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  {selectedFilenames.length === files.length ? 'Deselect All' : 'Select All'}
                </button>

                <button
                  onClick={() => handleStartSequentialSync()}
                  disabled={selectedFilenames.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-bold disabled:opacity-40 transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sync Selected ({selectedFilenames.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Fetch Error Display with 1-Click Actionable Solutions */}
        {fetchFilesError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-stone-800 dark:text-stone-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-amber-900 dark:text-amber-200">
                  Unable to read files over Wi-Fi from ESP32 at http://{deviceIp}
                </div>
                <p className="text-[11px] leading-relaxed opacity-90 text-stone-600 dark:text-stone-300">
                  {fetchFilesError}
                </p>
                {typeof window !== 'undefined' && window.location.protocol === 'https:' && (
                  <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 font-medium">
                    💡 <strong>Why this happens:</strong> Modern browsers block web pages on HTTPS from accessing unencrypted local network IP addresses (<code className="font-mono">http://192.168.x.x</code>) due to Mixed Content & Private Network Access restrictions.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
              <span className="text-[11px] text-stone-500 font-medium">Available options:</span>
              
              <button
                type="button"
                onClick={() => sdCardFileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Select from MicroSD Card Reader</span>
              </button>

              <button
                type="button"
                onClick={() => setLocalSetupModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Run App Locally (http://localhost:3000)</span>
              </button>

              {esp32Service.isWebSerialSupported() && (
                <button
                  type="button"
                  onClick={handleConnectUsbSerial}
                  className="px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Usb className="w-3.5 h-3.5" />
                  <span>USB Serial Cable</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fetchFiles(deviceIp, undefined, 15000)}
                className="px-2.5 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer flex items-center gap-1"
                title="Retry Wi-Fi request with a longer 15-second timeout"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Wi-Fi (15s)</span>
              </button>
            </div>
          </div>
        )}

        {/* File Table / List */}
        {isLoadingFiles ? (
          <div className="py-12 flex flex-col items-center justify-center text-xs text-stone-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
            <span>Fetching real audio files list from ESP32 MicroSD card...</span>
          </div>
        ) : files.length === 0 ? (
          <div 
            onClick={() => sdCardFileInputRef.current?.click()}
            className="py-12 text-center text-xs text-stone-400 space-y-3 border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-2xl hover:border-amber-500/50 hover:bg-amber-500/5 transition-all cursor-pointer"
          >
            <Volume2 className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-700" />
            <div className="space-y-1">
              <div className="font-semibold text-stone-700 dark:text-stone-300">
                No recordings loaded yet
              </div>
              <p className="text-[11px] text-stone-400 max-w-md mx-auto">
                Click here or drag & drop <code className="font-mono text-amber-600 dark:text-amber-400">.WAV</code> files directly from your ESP32 MicroSD card, or connect to your ESP32 via Wi-Fi.
              </p>
            </div>
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 font-medium text-xs">
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>Browse MicroSD Card</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-stone-100 dark:divide-stone-800">
            {files.map(file => {
              const fileName = file.name || file.filename;
              const isSelected = selectedFilenames.includes(fileName) || selectedFilenames.includes(file.filename);
              const isLocalSd = localMicroSdFilesRef.current.has(fileName) || localMicroSdFilesRef.current.has(file.filename);

              return (
                <div
                  key={fileName}
                  className={`p-3 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20'
                      : 'hover:bg-stone-50 dark:hover:bg-stone-800/40 border border-transparent'
                  }`}
                >
                  {/* Left: Checkbox & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleToggleFile(fileName)}
                      className="cursor-pointer text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-500 fill-amber-500/10" />
                      ) : (
                        <Square className="w-4 h-4 text-stone-400" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold font-mono text-stone-900 dark:text-stone-100 truncate">
                          {fileName}
                        </span>
                        {isLocalSd ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
                            MicroSD
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                            Wi-Fi
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono flex items-center gap-2 mt-0.5">
                        <span>{file.formattedDuration || formatDuration(file.durationSec || file.duration)}</span>
                        <span>·</span>
                        <span>{file.formattedSize || formatBytes(file.size)}</span>
                        <span>·</span>
                        <span className="text-stone-500">16kHz 16-bit Mono WAV</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Inline Audio Player Preview */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100 dark:border-stone-850">
                    <div className="flex items-center gap-2 bg-stone-100 dark:bg-stone-800/80 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700 flex-1 sm:flex-none">
                      <span className="text-[10px] font-mono text-stone-400">Preview:</span>
                      <audio
                        controls
                        preload="none"
                        src={"http://" + esp32Ip + "/audio?file=" + encodeURIComponent(file.name)}
                        className="h-7 w-full sm:w-48 md:w-56"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFilenames([fileName]);
                        handleStartSequentialSync(syncLanguage);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-stone-200/80 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Sync
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1. The Device Pairing Handshake: "Waiting for Device Confirmation" Modal */}
      {isPairingModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-center">
            
            {/* Animated Hardware OLED Screen Mockup */}
            <div className="p-4 rounded-2xl bg-stone-950 border-2 border-stone-800 shadow-inner font-mono text-left space-y-2 text-stone-100 select-none">
              <div className="flex items-center justify-between text-[10px] text-amber-400 border-b border-stone-800 pb-1">
                <span>ESP32 OLED 0.96"</span>
                <span className="animate-pulse">● WAITING HARDWARE CONFIRM</span>
              </div>
              
              <div className="py-2 text-xs space-y-1">
                <div className="text-amber-300 font-bold">PAIRING REQUEST:</div>
                <div className="text-stone-200">NotesMaker-WebApp</div>
                <div className="text-[10px] text-stone-400">
                  PRESS PHYSICAL BUTTON ON ESP32 (GPIO 15) TO AUTHORIZE
                </div>
              </div>

              <div className="text-[10px] text-stone-500 pt-1 border-t border-stone-800 flex justify-between">
                <span>{isSerialConnected ? 'PORT: USB-SERIAL' : `IP: ${deviceIp}`}</span>
                <span>{pairingSecondsElapsed}s</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center justify-center gap-2">
                <Radio className="w-4 h-4 text-amber-500 animate-pulse" />
                <span>Waiting for Device Confirmation</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {pairingStatusText}
              </p>
            </div>

            {pairingError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-800 dark:text-rose-200 text-left space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Connection Error</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">{pairingError}</p>
              </div>
            )}

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleCancelPairing}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
              >
                Close & Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Synchronized Sequential Download: Full-Screen Progress Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            
            {/* Title & Sync Status */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <Download className="w-5 h-5 text-amber-500" />
                  <span>Synchronized Sequential Download</span>
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Streaming chunk-by-chunk mirroring the physical ESP32 screen
                </p>
              </div>

              {isSyncComplete && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Completed</span>
                </span>
              )}
            </div>

            {/* Language indicator & quick switch in modal */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/80 text-xs">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="font-semibold text-stone-800 dark:text-stone-200">
                    Transcription Language
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">
                    {syncLanguage === 'hi' ? 'Transcribing audio in Hindi (हिंदी)' : 'Transcribing audio in English'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-stone-200/70 dark:bg-stone-900 border border-stone-300/60 dark:border-stone-700/60">
                <button
                  type="button"
                  onClick={() => setSyncLanguage('en')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    syncLanguage === 'en'
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setSyncLanguage('hi')}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    syncLanguage === 'hi'
                      ? 'bg-amber-500 text-stone-950 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  हिंदी
                </button>
              </div>
            </div>

            {/* Error banner if stream broke */}
            {syncErrorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Download Error</span>
                </div>
                <p className="text-[11px] leading-relaxed">{syncErrorMessage}</p>
              </div>
            )}

            {/* Perfect Physical OLED Screen Mirror */}
            <div className="p-5 rounded-2xl bg-stone-950 border-2 border-stone-800 shadow-2xl font-mono text-stone-100 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-amber-400 border-b border-stone-800 pb-1.5">
                <span>ESP32 0.96" OLED DISPLAY</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isSyncComplete ? 'bg-emerald-500' : 'bg-amber-400 animate-ping'}`} />
                  <span>{isSyncComplete ? 'SYNC COMPLETE' : 'STREAMING CHUNKS'}</span>
                </span>
              </div>

              <div className="space-y-1.5 py-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">
                    SYNC [{syncCurrentIndex}/{syncTotalCount}]
                  </span>
                  <span className="text-amber-300 font-bold">
                    {syncCurrentPercent}%
                  </span>
                </div>

                <div className="text-xs font-semibold text-stone-100 truncate">
                  {syncCurrentFilename || 'Preparing sequential pipeline...'}
                </div>

                {/* OLED physical progress bar mockup */}
                <div className="w-full h-4 bg-stone-900 rounded-sm border border-stone-700 p-0.5">
                  <div
                    className="h-full bg-stone-100 rounded-2xs transition-all duration-75"
                    style={{ width: `${syncCurrentPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-800">
                <span>
                  {syncTotalBytes > 0 
                    ? `${formatBytes(syncBytesReceived)} / ${formatBytes(syncTotalBytes)}`
                    : '16kHz 16-bit Mono WAV'}
                </span>
                <span>Chunk Stream · SPI SD</span>
              </div>
            </div>

            {/* Web App Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-stone-600 dark:text-stone-400">
                  Overall Sync Progress ({syncedCompletedFiles.length}/{syncTotalCount} files)
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {syncOverallPercent}%
                </span>
              </div>

              <div className="w-full h-2.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-150"
                  style={{ width: `${syncOverallPercent}%` }}
                />
              </div>
            </div>

            {/* Synced files check items */}
            <div className="max-h-36 overflow-y-auto space-y-1 text-xs border border-stone-100 dark:border-stone-800 rounded-xl p-2.5 bg-stone-50/50 dark:bg-stone-900/50">
              {selectedFilenames.map((name, i) => {
                const isFinished = syncedCompletedFiles.includes(name);
                const isCurrent = name === syncCurrentFilename && !isFinished;

                return (
                  <div
                    key={name}
                    className={`flex items-center justify-between px-2 py-1 rounded-lg text-[11px] font-mono ${
                      isFinished
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                        : isCurrent
                        ? 'text-amber-600 dark:text-amber-400 bg-amber-500/5 font-bold'
                        : 'text-stone-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isFinished ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : isCurrent ? (
                        <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      ) : (
                        <span className="w-3.5 text-center text-stone-300">{i + 1}</span>
                      )}
                      <span className="truncate">{name}</span>
                    </div>

                    <span className="text-[10px]">
                      {isFinished ? 'Saved to IndexedDB' : isCurrent ? 'Streaming chunks...' : 'Queued'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              {isSyncComplete ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsSyncModalOpen(false);
                    setActiveView('notes');
                  }}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <span>View Synced Notes in Library</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  Cancel Sync
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Local Installation Guide Modal */}
      {localSetupModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl w-full max-w-2xl shadow-2xl p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                    Running EnderNote Locally on Your Computer
                  </h3>
                  <p className="text-xs text-stone-400">
                    Run on http://localhost:3000 to connect directly to your ESP32 with zero browser restrictions
                  </p>
                </div>
              </div>

              <button
                onClick={() => setLocalSetupModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[11px] flex items-center justify-center font-bold">1</span>
                  <span>Install Node.js & Dependencies</span>
                </div>
                <p className="text-[11px] text-stone-500 pl-7">
                  Ensure Node.js 18+ is installed on your computer. Open your terminal in the downloaded project folder:
                </p>
                <div className="ml-7 p-3 rounded-xl bg-stone-950 font-mono text-emerald-400 text-[11px]">
                  npm install
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[11px] flex items-center justify-center font-bold">2</span>
                  <span>Launch the Local Web App</span>
                </div>
                <div className="ml-7 p-3 rounded-xl bg-stone-950 font-mono text-emerald-400 text-[11px]">
                  npm run dev
                </div>
                <p className="text-[11px] text-stone-500 pl-7">
                  Open <strong>http://localhost:3000</strong> in Google Chrome or Microsoft Edge. Because it runs on plain HTTP locally, browser Mixed-Content blocking is completely disabled.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[11px] flex items-center justify-center font-bold">3</span>
                  <span>Flash the ESP32 Hardware Firmware</span>
                </div>
                <p className="text-[11px] text-stone-500 pl-7">
                  Click the <strong>ESP32 Arduino Sketch</strong> button, copy the sketch into the Arduino IDE, and upload it to your board.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[11px] flex items-center justify-center font-bold">4</span>
                  <span>Connect Wi-Fi & Pair</span>
                </div>
                <p className="text-[11px] text-stone-500 pl-7">
                  Connect your computer to the ESP32 Wi-Fi (<code className="font-mono">NotesMaker-ESP32</code> / pass: <code className="font-mono">auranote123</code>). Enter <code className="font-mono">192.168.4.1</code> in the IP box and click <strong>Connect</strong>!
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end">
              <button
                onClick={() => setLocalSetupModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 font-bold text-xs cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESP32 Arduino Sketch Code Modal */}
      {firmwareModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl w-full max-w-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-purple-500" />
                  <span>ESP32 Arduino Firmware (Production v2.5)</span>
                </h3>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Real MicroSD audio streaming, hardware button GPIO 15 debouncing, and OLED live sync
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyFirmware}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition-colors shadow-xs cursor-pointer"
                >
                  {firmwareCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{firmwareCopied ? 'Copied!' : 'Copy Code'}</span>
                </button>

                <button
                  onClick={() => setFirmwareModalOpen(false)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-stone-950 p-4 rounded-xl border border-stone-800 text-stone-200 font-mono text-[11px] leading-relaxed select-all">
              <pre className="whitespace-pre">{esp32Service.getFirmwareSketchCode()}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
