import { Esp32DeviceInfo, Esp32FileItem, Esp32RemoteRecording } from '../types';
import { formatBytes, formatDuration } from './audioUtils';

export interface PairRequestResult {
  ok: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'error';
  token?: string;
  message?: string;
}

export interface PairStatusResult {
  status: 'waiting_button' | 'approved' | 'rejected' | 'idle' | 'error';
  token?: string;
  deviceIp?: string;
  message?: string;
}

export interface ConnectionDiagnosis {
  isHttps: boolean;
  webSerialAvailable: boolean;
  canConnectHttp: boolean;
  mixedContentBlocked: boolean;
  errorReason: string;
}

export class Esp32Service {
  // Web Serial state
  private serialPort: any = null;
  private serialReader: any = null;
  private serialWriter: any = null;
  private isSerialConnectedState: boolean = false;
  private serialIncomingBuffer: string = '';
  private serialLineListeners: Array<(line: string) => void> = [];

  /**
   * Helper to clean up IP string
   */
  public getCleanIp(ip: string): string {
    return (ip || '192.168.4.1').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  /**
   * Diagnostics probe: checks if browser is on HTTPS and tests real connectivity to device
   */
  async checkConnectionDiagnosis(ip: string): Promise<ConnectionDiagnosis> {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const webSerialAvailable = typeof navigator !== 'undefined' && 'serial' in navigator;
    let canConnectHttp = false;
    let mixedContentBlocked = false;
    let errorReason = '';

    const cleanIp = this.getCleanIp(ip);

    if (isHttps) {
      mixedContentBlocked = true;
      errorReason = `Browsers block direct http://${cleanIp} calls when running inside an HTTPS webpage (Mixed Content & Private Network Access restrictions). Running locally on http://localhost:3000 removes this restriction.`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(`http://${cleanIp}/status`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 200) {
        canConnectHttp = true;
        mixedContentBlocked = false;
        errorReason = '';
      }
    } catch (e: any) {
      if (!isHttps) {
        errorReason = e?.message || `Device not reachable at http://${cleanIp}`;
      }
    }

    return {
      isHttps,
      webSerialAvailable,
      canConnectHttp,
      mixedContentBlocked,
      errorReason,
    };
  }

  // ==========================================
  // Web Serial API (Direct USB Cable Support)
  // ==========================================

  isWebSerialSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  isSerialConnected(): boolean {
    return this.isSerialConnectedState && this.serialPort !== null;
  }

  async connectSerial(): Promise<{ ok: boolean; message: string }> {
    if (!this.isWebSerialSupported()) {
      return { ok: false, message: 'Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge.' };
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });

      this.serialPort = port;
      this.isSerialConnectedState = true;

      // Start background reader
      this.startSerialReader();

      // Send initial ping to device
      await this.writeSerial('PING\n');

      return { ok: true, message: 'Connected to ESP32 via USB Serial (115200 baud)' };
    } catch (err: any) {
      console.warn('Web Serial connection cancelled or failed:', err);
      return { ok: false, message: err?.message || 'User cancelled port selection or port busy.' };
    }
  }

  async disconnectSerial(): Promise<void> {
    try {
      if (this.serialReader) {
        await this.serialReader.cancel().catch(() => {});
        this.serialReader = null;
      }
      if (this.serialWriter) {
        await this.serialWriter.close().catch(() => {});
        this.serialWriter = null;
      }
      if (this.serialPort) {
        await this.serialPort.close().catch(() => {});
        this.serialPort = null;
      }
    } finally {
      this.isSerialConnectedState = false;
    }
  }

  private async writeSerial(text: string): Promise<void> {
    if (!this.serialPort || !this.serialPort.writable) return;
    const encoder = new TextEncoder();
    const writer = this.serialPort.writable.getWriter();
    await writer.write(encoder.encode(text));
    writer.releaseLock();
  }

  private async startSerialReader(): Promise<void> {
    if (!this.serialPort || !this.serialPort.readable) return;

    const textDecoder = new TextDecoderStream();
    this.serialPort.readable.pipeTo(textDecoder.writable).catch(() => {});
    const reader = textDecoder.readable.getReader();
    this.serialReader = reader;

    try {
      while (this.isSerialConnectedState) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.serialIncomingBuffer += value;
          const lines = this.serialIncomingBuffer.split('\n');
          this.serialIncomingBuffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.length > 0) {
              this.serialLineListeners.forEach(fn => fn(cleanLine));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Serial reader ended:', e);
    } finally {
      this.isSerialConnectedState = false;
    }
  }

  // ==========================================
  // 1. Device Pairing Handshake (Real ESP32 HTTP)
  // ==========================================

  /**
   * 1. Send pair request to real ESP32
   * POST /api/pair/request?device=NotesMaker-WebApp
   */
  async requestPairing(
    ip: string,
    deviceName: string = 'NotesMaker-WebApp',
    mode: 'auto' | 'serial' | 'http' = 'auto'
  ): Promise<PairRequestResult> {
    // Mode A: USB Serial
    if (this.isSerialConnected() && mode !== 'http') {
      await this.writeSerial(`PAIR:${deviceName}\n`);
      return {
        ok: true,
        status: 'pending',
        message: 'Pairing command sent via USB Serial. Press button on ESP32 (GPIO 15).',
      };
    }

    // Mode B: Real HTTP POST to ESP32
    const cleanIp = this.getCleanIp(ip);
    const url = `http://${cleanIp}/api/pair/request?device=${encodeURIComponent(deviceName)}`;
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Timeout: ESP32 at http://${cleanIp} did not respond within 6 seconds`));
      }, 6000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => ({ status: 'pending' }));
        return {
          ok: true,
          status: data.status === 'approved' ? 'approved' : 'pending',
          token: data.token,
          message: data.message || 'Pairing request received by ESP32 OLED',
        };
      } else {
        return {
          ok: false,
          status: 'error',
          message: `ESP32 returned HTTP error: ${res.status} ${res.statusText}`,
        };
      }
    } catch (err: any) {
      let message = err?.message || 'Network unreachable';
      if (isHttps && (err?.name === 'AbortError' || message.includes('aborted') || message.includes('Failed to fetch'))) {
        message = `Browser blocked request to http://${cleanIp} (HTTPS Mixed Content / Private Network Access). Because this app is opened via HTTPS, browsers restrict direct HTTP calls to local IP addresses. Run the app locally on http://localhost:3000, or connect via USB Serial.`;
      } else if (err?.name === 'AbortError' || message.includes('aborted')) {
        message = `Request timed out connecting to ESP32 at http://${cleanIp}. Verify that the ESP32 is powered on and connected to the same Wi-Fi.`;
      } else {
        message = `Cannot reach ESP32 at http://${cleanIp}. Verify that the ESP32 is powered on, running the firmware, and connected to the same Wi-Fi network. (${message})`;
      }
      return {
        ok: false,
        status: 'error',
        message,
      };
    }
  }

  /**
   * 1. Poll pair status on real ESP32
   * GET /api/pair/status
   */
  async pollPairingStatus(ip: string): Promise<PairStatusResult> {
    const cleanIp = this.getCleanIp(ip);
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

    // If using USB Serial, await serial approval
    if (this.isSerialConnected()) {
      return { status: 'waiting_button', deviceIp: 'USB-Serial' };
    }

    const url = `http://${cleanIp}/api/pair/status`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Timeout polling pairing status`));
      }, 3500);

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'approved') {
          return {
            status: 'approved',
            token: data.token || '',
            deviceIp: cleanIp,
          };
        } else if (data.status === 'rejected') {
          return { status: 'rejected', deviceIp: cleanIp };
        }
        return { status: 'waiting_button', deviceIp: cleanIp };
      } else {
        return { status: 'error', deviceIp: cleanIp, message: `HTTP ${res.status}` };
      }
    } catch (err: any) {
      let msg = err?.message || 'Poll connection failed';
      if (isHttps && (err?.name === 'AbortError' || msg.includes('aborted') || msg.includes('Failed to fetch'))) {
        msg = `Browser blocked request (HTTPS Mixed Content). Use USB Serial or run locally on http://localhost:3000.`;
      }
      return {
        status: 'error',
        deviceIp: cleanIp,
        message: msg,
      };
    }
  }

  // ==========================================
  // 2. The File Selection Dashboard (Real ESP32 HTTP)
  // ==========================================

  /**
   * 2. Fetch real file list from ESP32 MicroSD card
   * GET http://<ESP32_IP>/files
   * Direct Flat Array Parsing: maps directly over [{"name":"REC0005.WAV","size":183852,"durationSec":5}, ...]
   */
  async fetchFiles(ip: string, token?: string, timeoutMs: number = 10000): Promise<Esp32FileItem[]> {
    const cleanIp = this.getCleanIp(ip);
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const url = `http://${cleanIp}/files`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Timeout: The ESP32 at http://${cleanIp} did not respond within ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);

    try {
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

      const rawFiles = await res.json();
      const filesArray = Array.isArray(rawFiles) ? rawFiles : [];

      return filesArray.map((f: any) => {
        const name = f.name || f.filename || 'UNKNOWN.WAV';
        const size = typeof f.size === 'number' ? f.size : (f.fileSizeBytes || 0);
        const durationSec = typeof f.durationSec === 'number' 
          ? f.durationSec 
          : (typeof f.duration === 'number' ? f.duration : (f.durationSeconds || Math.max(1, Math.round(size / 32000))));

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
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('Real fetchFiles failed from ESP32:', err);

      let msg = err?.message || 'Failed to fetch recordings from ESP32.';
      if (err?.name === 'AbortError' || msg.includes('aborted') || msg.includes('abort')) {
        if (isHttps) {
          msg = `Browser blocked request to http://${cleanIp} (Mixed Content & Private Network Access restriction). Web browsers strictly block HTTPS websites from making unencrypted HTTP calls to local IP addresses (192.168.x.x).`;
        } else {
          msg = `Connection to ESP32 at http://${cleanIp} timed out after ${Math.round(timeoutMs / 1000)} seconds. Verify that the ESP32 is powered on, Wi-Fi is connected, and that http://${cleanIp} is reachable on your router.`;
        }
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        if (isHttps) {
          msg = `Browser blocked request to http://${cleanIp} (Mixed Content restriction). Modern web browsers block HTTPS pages from fetching data directly from local private network IPs.`;
        } else {
          msg = `Network connection to http://${cleanIp} failed. Verify that your computer and ESP32 are on the same Wi-Fi network and no firewall is blocking port 80.`;
        }
      }
      throw new Error(msg);
    }
  }

  /**
   * 2. Inline Audio Preview URL pointing directly to real ESP32
   * /audio?file=[FILENAME]
   */
  getAudioPreviewUrl(ip: string, filename: string): string {
    const cleanIp = this.getCleanIp(ip);
    return `http://${cleanIp}/audio?file=${encodeURIComponent(filename)}`;
  }

  // ==========================================
  // 3. Synchronized Sequential Download (Real ESP32 HTTP Stream)
  // ==========================================

  /**
   * 3. Synchronized Sequential Download:
   * GET /api/sync/download?file=[FILENAME]&idx=[CURRENT]&total=[TOTAL]&token=[TOKEN]
   *
   * Streams chunks from the real ESP32 HTTP response, updates real-time progress,
   * and stitches into a local Blob.
   */
  async downloadFileSynchronized(
    ip: string,
    filename: string,
    currentIndex: number,
    totalFiles: number,
    token: string,
    onProgress: (bytesReceived: number, totalBytes: number, percent: number) => void
  ): Promise<Blob> {
    const cleanIp = this.getCleanIp(ip);
    
    // Candidate absolute URLs on the ESP32 (without CORS-blocking custom headers)
    const candidateUrls = [
      `http://${cleanIp}/audio?file=${encodeURIComponent(filename)}`,
      `http://${cleanIp}/api/sync/download?file=${encodeURIComponent(filename)}&idx=${currentIndex}&total=${totalFiles}`,
    ];

    let response: Response | null = null;
    let lastError: any = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          response = res;
          break;
        }
      } catch (e: any) {
        lastError = e;
      }
    }

    if (!response || !response.ok) {
      throw new Error(lastError?.message || `Failed to download ${filename} from ESP32 at http://${cleanIp}`);
    }

    if (response.body) {
      const contentLengthHeader = response.headers.get('Content-Length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          bytesReceived += value.length;
          const pct = totalBytes > 0 
            ? Math.min(100, Math.round((bytesReceived / totalBytes) * 100))
            : 0;
          onProgress(bytesReceived, totalBytes, pct);
        }
      }

      onProgress(bytesReceived, totalBytes || bytesReceived, 100);
      return new Blob(chunks as BlobPart[], { type: 'audio/wav' });
    } else {
      const blob = await response.blob();
      onProgress(blob.size, blob.size, 100);
      return blob;
    }
  }

  /**
   * 3. Completion Notification to clear screen on real ESP32
   * POST /api/sync/complete
   */
  async completeSync(ip: string, token?: string): Promise<boolean> {
    const cleanIp = this.getCleanIp(ip);
    const url = `http://${cleanIp}/api/sync/complete`;

    if (this.isSerialConnected()) {
      await this.writeSerial('COMPLETE\n');
      return true;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'complete', timestamp: Date.now() }),
      });
      return res.ok;
    } catch (e) {
      console.warn('completeSync request warning:', e);
      return false;
    }
  }

  /**
   * Real Telemetry check from ESP32 /status endpoint
   */
  async checkConnection(ip: string): Promise<Esp32DeviceInfo> {
    const cleanIp = this.getCleanIp(ip);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`http://${cleanIp}/status`, { 
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json();
        return {
          ip: cleanIp,
          status: 'connected',
          firmwareVersion: data.firmwareVersion || 'v2.5',
          freeSdSpaceMb: typeof data.freeSdSpaceMb === 'number' ? data.freeSdSpaceMb : 0,
          totalSdSpaceMb: typeof data.totalSdSpaceMb === 'number' ? data.totalSdSpaceMb : 0,
          recordingsCount: typeof data.recordingsCount === 'number' ? data.recordingsCount : 0,
          batteryPercent: typeof data.batteryPercent === 'number' ? data.batteryPercent : undefined,
          lastSyncTime: data.lastSyncTime || new Date().toISOString(),
        };
      }
    } catch {}

    // Return truthful disconnected status if unreachable
    return {
      ip: cleanIp,
      status: 'disconnected',
      firmwareVersion: 'Offline',
      freeSdSpaceMb: 0,
      totalSdSpaceMb: 0,
      recordingsCount: 0,
      batteryPercent: undefined,
      lastSyncTime: undefined,
    };
  }

  /**
   * Production Arduino Sketch for the ESP32 hardware
   * - Connects to local router or runs SoftAP
   * - CORS headers and OPTIONS preflight for all endpoints
   * - Real MicroSD directory listing for /files
   * - Real audio streaming for /audio and /api/sync/download
   * - Hardware button pairing with debouncing on GPIO 15
   * - OLED display mirroring with live progress bar
   */
  getFirmwareSketchCode(): string {
    return `/**
 * =========================================================================
 * EnderNote / NotesMaker ESP32 Production Firmware
 * =========================================================================
 * Hardware Configuration:
 *  - Board: ESP32 Dev Module / ESP32-WROOM-32
 *  - OLED: 0.96" SSD1306 (I2C: SDA=GPIO 21, SCL=GPIO 22)
 *  - SD Card: SPI MicroSD Reader (CS=GPIO 5, SCK=GPIO 18, MISO=GPIO 19, MOSI=GPIO 23)
 *  - Buttons:
 *      * GPIO 15: Pairing Confirmation Button (Internal Pullup, active LOW)
 *      * GPIO 4:  Voice Record Button (Internal Pullup, active LOW)
 * =========================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

#define SD_CS 5
#define BTN_REC 4
#define BTN_CONFIRM 15

// Wi-Fi Configuration
// Option 1: SoftAP mode (Default: connect computer directly to ESP32 Wi-Fi)
const char* AP_SSID = "NotesMaker-ESP32";
const char* AP_PASS = "auranote123";

// Option 2: Connect ESP32 to your Home Wi-Fi router (Uncomment to use station mode)
// const char* STA_SSID = "YOUR_HOME_WIFI";
// const char* STA_PASS = "YOUR_WIFI_PASSWORD";

WebServer server(80);

enum PairState { PAIR_IDLE, PAIR_WAITING_BUTTON, PAIR_APPROVED };
PairState currentPairState = PAIR_IDLE;
String requestingDevice = "";
String activeToken = "";
unsigned long pairRequestTime = 0;

void drawOledStatus(const char* title, const char* line1, const char* line2 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println(title);
  display.drawLine(0, 11, 128, 11, WHITE);
  display.setCursor(0, 16);
  display.println(line1);
  if (strlen(line2) > 0) {
    display.setCursor(0, 28);
    display.println(line2);
  }
  display.display();
}

void drawOledProgress(const char* filename, int currentIdx, int total, int percent) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.printf("SYNC [%d/%d]", currentIdx, total);
  display.setCursor(0, 14);
  display.println(filename);

  // Draw progress bar outline
  display.drawRect(0, 32, 128, 14, WHITE);
  int fillWidth = map(percent, 0, 100, 0, 124);
  display.fillRect(2, 34, fillWidth, 10, WHITE);

  display.setCursor(48, 50);
  display.printf("%d%%", percent);
  display.display();
}

void setCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
}

int countWavFiles() {
  int count = 0;
  File root = SD.open("/");
  File file = root.openNextFile();
  while (file) {
    String name = String(file.name());
    if (name.endsWith(".WAV") || name.endsWith(".wav")) {
      count++;
    }
    file = root.openNextFile();
  }
  return count;
}

void setupWebServer() {
  // Handle HTTP OPTIONS Preflight for browser CORS & Private Network Access
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      setCorsHeaders();
      server.send(204);
      return;
    }
    server.send(404, "text/plain", "Not found");
  });

  // Telemetry endpoint
  server.on("/status", HTTP_GET, []() {
    setCorsHeaders();
    StaticJsonDocument<384> doc;
    doc["ip"] = WiFi.getMode() == WIFI_AP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
    doc["status"] = "connected";
    doc["firmwareVersion"] = "EnderNote-ESP32-v2.5";
    
    uint64_t totalBytes = SD.totalBytes();
    uint64_t usedBytes = SD.usedBytes();
    doc["freeSdSpaceMb"] = (totalBytes > usedBytes) ? (int)((totalBytes - usedBytes) / (1024 * 1024)) : 0;
    doc["totalSdSpaceMb"] = (int)(totalBytes / (1024 * 1024));
    doc["recordingsCount"] = countWavFiles();
    doc["batteryPercent"] = 100;
    
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // 1. Device Pairing Handshake: Request
  server.on("/api/pair/request", HTTP_POST, []() {
    setCorsHeaders();
    requestingDevice = server.hasArg("device") ? server.arg("device") : "NotesMaker-WebApp";
    currentPairState = PAIR_WAITING_BUTTON;
    pairRequestTime = millis();
    activeToken = "esp32_" + String(random(100000, 999999));

    drawOledStatus("PAIRING REQUEST", "Press BTN to allow:", requestingDevice.c_str());

    StaticJsonDocument<256> doc;
    doc["status"] = "waiting_confirmation";
    doc["message"] = "Press physical button on ESP32 (GPIO 15) to authorize";
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // 1. Device Pairing Handshake: Status Poll
  server.on("/api/pair/status", HTTP_GET, []() {
    setCorsHeaders();
    StaticJsonDocument<256> doc;
    if (currentPairState == PAIR_APPROVED) {
      doc["status"] = "approved";
      doc["token"] = activeToken;
    } else if (currentPairState == PAIR_WAITING_BUTTON) {
      doc["status"] = "waiting_button";
    } else {
      doc["status"] = "idle";
    }
    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // 2. File Selection Dashboard: List recordings from SD card
  server.on("/files", HTTP_GET, []() {
    setCorsHeaders();
    File root = SD.open("/");
    DynamicJsonDocument doc(4096);
    JsonArray arr = doc.to<JsonArray>();

    File file = root.openNextFile();
    while (file) {
      String name = String(file.name());
      if (name.endsWith(".WAV") || name.endsWith(".wav")) {
        JsonObject obj = arr.createNestedObject();
        obj["filename"] = name;
        obj["size"] = file.size();
        obj["duration"] = file.size() / 32000; // 16kHz 16-bit mono PCM = 32000 bytes/sec
      }
      file = root.openNextFile();
    }

    String res;
    serializeJson(doc, res);
    server.send(200, "application/json", res);
  });

  // 2. Inline Audio Preview Stream
  server.on("/audio", HTTP_GET, []() {
    setCorsHeaders();
    if (!server.hasArg("file")) {
      server.send(400, "text/plain", "Missing file parameter");
      return;
    }
    String filename = server.arg("file");
    if (!filename.startsWith("/")) filename = "/" + filename;

    File audio = SD.open(filename, FILE_READ);
    if (!audio) {
      server.send(404, "text/plain", "Audio file not found on SD card");
      return;
    }
    server.streamFile(audio, "audio/wav");
    audio.close();
  });

  // 3. Synchronized Sequential Download with live chunk updates
  server.on("/api/sync/download", HTTP_GET, []() {
    setCorsHeaders();
    if (!server.hasArg("file")) {
      server.send(400, "text/plain", "Missing file parameter");
      return;
    }

    String filename = server.arg("file");
    int currentIdx = server.hasArg("idx") ? server.arg("idx").toInt() : 1;
    int total = server.hasArg("total") ? server.arg("total").toInt() : 1;

    if (!filename.startsWith("/")) filename = "/" + filename;
    File audio = SD.open(filename, FILE_READ);
    if (!audio) {
      server.send(404, "text/plain", "File not found on SD card");
      return;
    }

    size_t fileSize = audio.size();
    server.setContentLength(fileSize);
    server.sendHeader("Content-Type", "audio/wav");
    server.sendHeader("Connection", "close");
    server.send(200, "audio/wav", "");

    WiFiClient client = server.client();
    uint8_t buffer[2048];
    size_t sentBytes = 0;

    while (audio.available() && client.connected()) {
      size_t bytesRead = audio.read(buffer, sizeof(buffer));
      client.write(buffer, bytesRead);
      sentBytes += bytesRead;

      int pct = (fileSize > 0) ? (int)((sentBytes * 100) / fileSize) : 0;
      drawOledProgress(filename.c_str(), currentIdx, total, pct);
    }

    audio.close();
  });

  // 3. Completion Notification to clear screen
  server.on("/api/sync/complete", HTTP_POST, []() {
    setCorsHeaders();
    drawOledStatus("EnderNote Ready", "Sync Complete!", "Device Ready");
    server.send(200, "application/json", "{\\"status\\":\\"ok\\"}");
  });

  server.begin();
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_REC, INPUT_PULLUP);
  pinMode(BTN_CONFIRM, INPUT_PULLUP);

  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();

  if (!SD.begin(SD_CS)) {
    drawOledStatus("SD Card Error", "Check MicroSD!", "Insert card & reboot");
    Serial.println("SD initialization failed!");
  }

  // Start Wi-Fi SoftAP
  WiFi.softAP(AP_SSID, AP_PASS);
  String ipStr = WiFi.softAPIP().toString();

  drawOledStatus("NotesMaker ESP32", "AP: NotesMaker-ESP32", ("IP: " + ipStr).c_str());
  setupWebServer();
}

void loop() {
  server.handleClient();

  // Check physical confirmation button on GPIO 15 (Active LOW)
  if (currentPairState == PAIR_WAITING_BUTTON) {
    if (digitalRead(BTN_CONFIRM) == LOW) {
      delay(50); // Debounce
      if (digitalRead(BTN_CONFIRM) == LOW) {
        currentPairState = PAIR_APPROVED;
        drawOledStatus("PAIRING APPROVED", "Authorized:", requestingDevice.c_str());
        Serial.println("PAIR:APPROVED:" + activeToken);
      }
    }
    // Timeout after 60s
    if (millis() - pairRequestTime > 60000) {
      currentPairState = PAIR_IDLE;
      drawOledStatus("NotesMaker ESP32", "Pairing timed out", "Device Idle");
    }
  }
}
`;
  }
}

export const esp32Service = new Esp32Service();
