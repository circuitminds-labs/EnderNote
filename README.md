# EnderNote — Local-First AI Voice Notes Companion & Studio

A production-minded, offline-first personal web application and companion for voice note-taking with both **Direct In-App Voice Recording** and **ESP32 Voice Notes Hardware Synchronization** (ESP32-DevKit V1 + INMP441 I²S microphone + SPI MicroSD card reader + 0.96" SSD1306 OLED display + push buttons).

## Key Architecture & Capabilities

### 1. Direct In-App Voice Recording & AI Studio
- **No Hardware Required**: Record voice notes directly from your browser using your computer or phone microphone.
- **Live Soundwave Visualizer**: Real-time frequency canvas driven by the Web Audio API `AnalyserNode`.
- **In-Flight Live Bookmarking**: Tap **"+ Bookmark"** or hit `B` while talking to mark important moments with exact millisecond timestamps.
- **Automatic Cloud AI Processing**: When recording ends, audio is immediately saved locally into IndexedDB and sent to Groq Whisper (`whisper-large-v3-turbo`) for transcription with timestamped segments and Groq LLM (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`) for structured summarization, project matching, key points, and task extraction.

### 2. Local-First & Offline-Capable Persistence
- **Zero Cloud Database Requirement**: Primary source of truth lives securely in browser **IndexedDB** (`auranote_db`) and origin storage.
- **Direct Audio Blob Storage**: Audio recordings are persisted directly as binary `Blob` objects within IndexedDB—no 33% Base64 overhead or string concatenation.
- **Storage Quota & Durability**: Supports `navigator.storage.persist()` and real-time usage monitoring (`navigator.storage.estimate()`).
- **Full ZIP Backup & Recovery**: Complete data portability via compressed `.zip` packages containing `manifest.json` and raw audio files in an `/audio` directory, with merge or clean-replace conflict handling.

### 3. Dual AI Availability Modes
- **Online Mode (Groq Integration)**:
  - Speech-to-Text: `whisper-large-v3-turbo` with `verbose_json` for millisecond transcript segment timestamps.
  - Organization & Synthesis: `openai/gpt-oss-120b` or `llama-3.3-70b-versatile` for structured outputs (titles, summaries, project assignment, key points, tasks, and tags).
  - Configurable in **Settings** using your personal Groq API key (persisted only in local browser storage).
- **Offline / Local Simulation Mode**:
  - Full local deterministic organizer, transcript segment player, keyword matching, and grounded knowledge retrieval when offline or when no API key is configured.

### 4. Audio Bookmarks & Tap-to-Replay
- **First-Class Markers**: Bookmarks capture the exact millisecond offset from recording start, originating either from the ESP32 physical push-button interrupts (`source: 'device'`) or inside the web player (`source: 'application'`).
- **Interactive Timeline**: Visual bookmark markers rendered directly on the playback seekbar. Hovering reveals labels; clicking jumps straight to that moment.
- **Synchronized Transcript**: Chronological segment display with click-to-seek and real-time active segment highlighting during audio playback.

### 5. Smart Organizer & Review Workflow
- **Structured Categories**: Distinct separation between Inbox, Notes, Projects, Tags, and Archive.
- **Review Screen (`ReviewModal`)**: Review AI-suggested titles, summaries, project assignments, tags, duplicate warnings, and approve extracted tasks before filing.
- **Automated Filing Rule**: Optional auto-file setting for high-confidence project matches.

### 6. Knowledge Library & Tools
- **"Ask My Notes"**: Grounded question answering strictly backed by your notes with verified quotations and audio playback jump links.
- **Action Items & Reminders**: Extracted tasks with priorities, due dates, project tags, and browser notification reminders.
- **Related Notes Network**: Interactive SVG knowledge graph visualizing connections across shared tags, projects, and direct semantic relationships.

### 7. ESP32 Hardware Bridge & Firmware
- **Local Wi-Fi Sync**: Connects to the ESP32 Access Point (`192.168.4.1`) or local network IP to list SD card recordings, download audio, and acknowledge transfers (`/api/ack/:filename`) so the SD card retains files until confirmed.
- **Included Firmware Sketch**: View and export the full Arduino C++ firmware sketch in the **Device & Sync** tab, complete with pinouts for INMP441 (GPIO 25, 26, 27), SPI SD (GPIO 5, 23, 19, 18), OLED (GPIO 21, 22), and push buttons (GPIO 4, 15).
