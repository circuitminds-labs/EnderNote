/**
 * Audio processing utilities: duration extraction, fingerprinting, format helpers, and synthetic wav generation.
 */

export async function computeAudioFingerprint(blob: Blob): Promise<string> {
  try {
    // Read the first 64KB and last 64KB + total size to compute a fast unique fingerprint
    const sliceSize = 65536;
    const size = blob.size;
    let bufferToHash: Uint8Array;

    if (size <= sliceSize * 2) {
      const arrayBuffer = await blob.arrayBuffer();
      bufferToHash = new Uint8Array(arrayBuffer);
    } else {
      const headBuffer = await blob.slice(0, sliceSize).arrayBuffer();
      const tailBuffer = await blob.slice(size - sliceSize, size).arrayBuffer();
      bufferToHash = new Uint8Array(sliceSize * 2 + 8);
      bufferToHash.set(new Uint8Array(headBuffer), 0);
      bufferToHash.set(new Uint8Array(tailBuffer), sliceSize);
      // append size
      const view = new DataView(bufferToHash.buffer, sliceSize * 2, 8);
      view.setBigUint64(0, BigInt(size), true);
    }

    if (crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', bufferToHash as unknown as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) {
    console.warn('Fingerprint computation fallback to size/time:', err);
  }

  return `rec_fp_${blob.size}_${Date.now()}`;
}

/**
 * Returns the best supported audio MIME type for MediaRecorder in the current browser.
 * Returns empty string if no candidate is explicitly listed, so browser can pick its default.
 */
export function getSupportedRecordingMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=opus',
    'audio/mp4',
    'audio/aac',
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return '';
}

/**
 * Accurately extracts audio duration using AudioContext.decodeAudioData when available,
 * with fallbacks for HTMLAudioElement and Chrome MediaRecorder WebM duration discovery.
 */
export async function getAudioDuration(blob: Blob, fallbackDuration?: number): Promise<number> {
  // If an accurate duration was already measured (e.g. live recording timer), prefer it
  if (Number.isFinite(fallbackDuration) && fallbackDuration! > 0) {
    return Math.round(fallbackDuration! * 10) / 10;
  }

  // 1. Try AudioContext decodeAudioData: mathematically exact for WebM, MP4, WAV, OGG
  if (typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && blob.size > 0) {
        const ctx = new AudioContextClass();
        try {
          const arrayBuffer = await blob.arrayBuffer();
          // Use a slice in case buffer is detached
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
          if (audioBuffer && Number.isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
            return Math.round(audioBuffer.duration * 10) / 10;
          }
        } finally {
          try {
            if (ctx.state !== 'closed') {
              await ctx.close();
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('AudioContext decodeAudioData warning, trying HTMLAudioElement fallback:', err);
    }
  }

  // 2. Fallback: HTMLAudioElement with Chrome WebM 1e101 duration workaround
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(blob);
      audio.preload = 'metadata';

      let cleanedUp = false;
      const cleanup = () => {
        if (!cleanedUp) {
          cleanedUp = true;
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
      };

      const fallbackEstimate = () => {
        cleanup();
        const isCompressed = blob.type.includes('webm') || blob.type.includes('ogg') || blob.type.includes('mp4');
        const bytesPerSec = isCompressed ? 4000 : 32000;
        resolve(Math.max(1, Math.round(blob.size / bytesPerSec)));
      };

      // Set safety timeout to prevent stalling
      const timeoutId = setTimeout(fallbackEstimate, 2000);

      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        if (Number.isFinite(dur) && dur > 0) {
          clearTimeout(timeoutId);
          cleanup();
          resolve(Math.round(dur * 10) / 10);
        } else if (dur === Infinity) {
          // Chrome WebM workaround: seeking to infinity forces Chrome to discover finite duration
          audio.currentTime = 1e101;
          const onTimeUpdate = () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            clearTimeout(timeoutId);
            const discoveredDur = audio.duration;
            cleanup();
            if (Number.isFinite(discoveredDur) && discoveredDur > 0) {
              resolve(Math.round(discoveredDur * 10) / 10);
            } else {
              fallbackEstimate();
            }
          };
          audio.addEventListener('timeupdate', onTimeUpdate);
        } else {
          clearTimeout(timeoutId);
          fallbackEstimate();
        }
      };

      audio.onerror = () => {
        clearTimeout(timeoutId);
        fallbackEstimate();
      };

      audio.src = url;
    } catch {
      const isCompressed = blob.type.includes('webm') || blob.type.includes('ogg') || blob.type.includes('mp4');
      const bytesPerSec = isCompressed ? 4000 : 32000;
      resolve(Math.max(1, Math.round(blob.size / bytesPerSec)));
    }
  });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))));
  const val = bytes / Math.pow(k, i);
  return `${parseFloat(val.toFixed(1))} ${sizes[i]}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('downloadBlob failed:', err);
  }
}

/**
 * Creates a valid PCM WAV audio blob with a gentle synthetic waveform (warm harmonic tone)
 * for testing without real hardware or for demo samples.
 * Capped to max 4 seconds to guarantee instantaneous computation and zero UI freeze.
 */
export function createSyntheticWav(durationSeconds: number = 3, freq: number = 220): Blob {
  const safeDuration = Math.min(4, Math.max(0.5, Number.isFinite(durationSeconds) ? durationSeconds : 3));
  const sampleRate = 16000;
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const totalSamples = Math.floor(sampleRate * safeDuration);
  const dataSize = totalSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples with harmonic tone + smooth fade in / fade out
  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Envelope for natural voice-note cadence
    const envelope = Math.sin((Math.PI * i) / totalSamples);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.4 +
                   Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.2;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * envelope * 24000)));
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
