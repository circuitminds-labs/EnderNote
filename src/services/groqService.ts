import { TranscriptSegment, NoteType, TaskItem, Flashcard, QuizQuestion } from '../types';

export interface GroqTranscriptionResult {
  fullTranscript: string;
  language?: string;
  duration?: number;
  segments: TranscriptSegment[];
}

export interface StructuredAnalysisResult {
  title: string;
  summary: string;
  noteType: NoteType;
  keyPoints: string[];
  actionItems: { title: string; priority: 'low' | 'medium' | 'high'; dueDate?: string }[];
  suggestedTags: string[];
  suggestedProjectName?: string;
  confidenceScore: number;
  uncertainties: string[];
}

export class GroqService {
  /**
   * Transcribe an audio blob using Groq Whisper API (verbose_json for timestamps).
   * Falls back to smart mock/local recognition if offline or no key is provided.
   */
  async transcribeAudio(
    audioBlob: Blob,
    apiKey: string,
    model: string = 'whisper-large-v3-turbo',
    fallbackTranscript?: string
  ): Promise<GroqTranscriptionResult> {
    if (!apiKey || !apiKey.trim() || !navigator.onLine) {
      // Local fallback / offline simulation using actual transcript text if available
      return this.simulateOfflineTranscription(audioBlob, fallbackTranscript);
    }

    try {
      const formData = new FormData();
      let extension = 'wav';
      const mime = (audioBlob.type || '').toLowerCase();
      if (mime.includes('webm')) extension = 'webm';
      else if (mime.includes('mp4') || mime.includes('m4a')) extension = 'm4a';
      else if (mime.includes('mp3') || mime.includes('mpeg')) extension = 'mp3';
      else if (mime.includes('ogg')) extension = 'ogg';

      const filename = `recording_${Date.now()}.${extension}`;
      formData.append('file', audioBlob, filename);
      formData.append('model', model);
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0.0');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText || response.statusText}`);
      }

      const data = await response.json();
      
      const segments: TranscriptSegment[] = (data.segments || []).map((seg: any, idx: number) => ({
        id: `seg_${idx}_${Math.round(seg.start * 1000)}`,
        start: seg.start || 0,
        end: seg.end || 0,
        text: (seg.text || '').trim(),
      }));

      // If segments array was empty, chunk text manually
      if (segments.length === 0 && data.text) {
        const sentences = data.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [data.text];
        let currentSec = 0;
        const totalDuration = data.duration || 30;
        const secPerSent = totalDuration / Math.max(1, sentences.length);

        sentences.forEach((sent: string, i: number) => {
          segments.push({
            id: `seg_${i}`,
            start: Math.round(currentSec * 10) / 10,
            end: Math.round((currentSec + secPerSent) * 10) / 10,
            text: sent.trim(),
          });
          currentSec += secPerSent;
        });
      }

      return {
        fullTranscript: data.text || segments.map(s => s.text).join(' '),
        language: data.language || 'en',
        duration: data.duration,
        segments,
      };
    } catch (err: any) {
      console.warn('Groq Transcription error, using offline simulation fallback:', err);
      // If error occurred (e.g. bad key or network), throw if user explicitly supplied key and wants to know,
      // but return simulated offline transcript if it's a network offline event
      if (!navigator.onLine) {
        return this.simulateOfflineTranscription(audioBlob);
      }
      throw err;
    }
  }

  /**
   * Generate structured note analysis, project recommendations, key points, tasks, and tags.
   */
  async analyzeNote(
    transcript: string,
    existingProjects: { id: string; name: string; description: string }[],
    existingTags: string[],
    apiKey: string,
    model: string = 'openai/gpt-oss-120b'
  ): Promise<StructuredAnalysisResult> {
    if (!apiKey || !apiKey.trim() || !navigator.onLine) {
      return this.simulateOfflineAnalysis(transcript, existingProjects, existingTags);
    }

    try {
      const projectCatalog = existingProjects.map(p => `"${p.name}": ${p.description}`).join('; ');
      const knownTags = existingTags.slice(0, 30).join(', ');

      const systemPrompt = `You are the executive intelligence for EnderNote, a local-first personal voice-note organizer.
Analyze the provided transcript and produce a strictly valid JSON object conforming to this schema:
{
  "title": "A crisp, informative, human title (max 7 words)",
  "summary": "2-3 dense, clear paragraphs synthesizing what was discussed, decided, or planned",
  "noteType": "meeting" | "lecture" | "idea" | "reminder" | "personal" | "journal" | "interview",
  "keyPoints": ["Bullet 1", "Bullet 2", "Bullet 3"],
  "actionItems": [
    { "title": "Clear actionable task", "priority": "high" | "medium" | "low", "dueDate": "YYYY-MM-DD or empty string" }
  ],
  "suggestedTags": ["tag1", "tag2"],
  "suggestedProjectName": "One of the existing project names if it clearly fits, or empty string",
  "confidenceScore": 0.85,
  "uncertainties": ["Any ambiguous points or unconfirmed deadlines"]
}

Available projects: [${projectCatalog || 'None created yet'}]
Existing reusable tags: [${knownTags || 'hardware, meeting, idea, planning'}]
Return ONLY raw JSON, with no markdown code fences.`;

      // Try the requested model; if Groq model name changed, fallback to llama-3.3-70b-versatile
      const targetModel = model.includes('oss') ? 'openai/gpt-oss-120b' : (model || 'llama-3.3-70b-versatile');

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `TRANSCRIPT TO ANALYZE:\n"""${transcript.slice(0, 12000)}"""` },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        // Fallback to llama-3.3-70b-versatile if the selected model is unavailable on user account
        if (targetModel !== 'llama-3.3-70b-versatile') {
          return this.analyzeNote(transcript, existingProjects, existingTags, apiKey, 'llama-3.3-70b-versatile');
        }
        throw new Error(`Groq LLM error (${response.status}): ${await response.text()}`);
      }

      const json = await response.json();
      const rawContent = json.choices?.[0]?.message?.content || '{}';
      const cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanContent);

      return {
        title: parsed.title || 'Voice Note',
        summary: parsed.summary || transcript.slice(0, 200),
        noteType: this.validateNoteType(parsed.noteType),
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
        suggestedProjectName: parsed.suggestedProjectName || undefined,
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.85,
        uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [],
      };
    } catch (err) {
      console.warn('Groq Analysis error, falling back to deterministic local organizer:', err);
      return this.simulateOfflineAnalysis(transcript, existingProjects, existingTags);
    }
  }

  /**
   * Regenerate note summary in alternate formats:
   * - meeting_minutes
   * - study_notes
   * - executive_summary
   * - structured_outline
   */
  async generateAlternateStyle(
    transcript: string,
    style: 'meeting_minutes' | 'study_notes' | 'executive_summary' | 'structured_outline',
    apiKey: string,
    model: string = 'llama-3.3-70b-versatile'
  ): Promise<string> {
    if (!apiKey || !apiKey.trim() || !navigator.onLine) {
      return this.simulateAlternateStyle(transcript, style);
    }

    const styleInstructions = {
      meeting_minutes: 'Formal meeting minutes: Attendees/Context, Discussion Topics, Decisions Reached, Action Items with Assignees.',
      study_notes: 'Academic study notes: Core Thesis, Key Theorems/Concepts, Detailed Explanations, Exam Review Tips.',
      executive_summary: 'High-level executive briefing: 1-paragraph bottom-line up front (BLUF), 3 strategic takeaways, immediate risks & next steps.',
      structured_outline: 'Hierarchical outline with Roman numerals (I, II, III) and indented sub-bullets for quick reference.',
    }[style];

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are an expert technical writer. Format the note in the following style:\n${styleInstructions}\nUse clean, beautiful Markdown without fluff.`,
            },
            { role: 'user', content: transcript.slice(0, 10000) },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      return data.choices?.[0]?.message?.content || this.simulateAlternateStyle(transcript, style);
    } catch (err) {
      console.warn('Alternate style failed, returning local version:', err);
      return this.simulateAlternateStyle(transcript, style);
    }
  }

  /**
   * Generate flashcards and quiz questions for study mode.
   */
  async generateStudyDeck(
    transcript: string,
    title: string,
    apiKey: string,
    model: string = 'llama-3.3-70b-versatile'
  ): Promise<{ flashcards: Omit<Flashcard, 'id' | 'noteId' | 'repetitions' | 'intervalDays' | 'easeFactor' | 'nextReviewDate' | 'createdAt'>[]; quizzes: Omit<QuizQuestion, 'id' | 'noteId'>[] }> {
    if (!apiKey || !apiKey.trim() || !navigator.onLine) {
      return this.simulateStudyDeck(transcript, title);
    }

    try {
      const prompt = `Based on this transcript titled "${title}", generate:
1. 4 high-yield flashcards with "front" (question/concept) and "back" (crisp definition/answer).
2. 3 multiple-choice quiz questions with "question", "options" (array of 4 choices), "correctAnswerIndex" (0-3), and "explanation".

Return strictly raw JSON conforming to:
{
  "flashcards": [{ "front": "...", "back": "..." }],
  "quizzes": [{ "question": "...", "options": ["A", "B", "C", "D"], "correctAnswerIndex": 0, "explanation": "..." }]
}`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt + `\n\nTRANSCRIPT:\n${transcript.slice(0, 8000)}` }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      return {
        flashcards: parsed.flashcards || [],
        quizzes: parsed.quizzes || [],
      };
    } catch {
      return this.simulateStudyDeck(transcript, title);
    }
  }

  /**
   * "Ask My Notes" grounded Q&A across user's notes.
   */
  async askNotes(
    question: string,
    notesContext: { id: string; title: string; summary: string; transcript: string }[],
    apiKey: string,
    model: string = 'llama-3.3-70b-versatile'
  ): Promise<{ answer: string; citations: { noteId: string; noteTitle: string; quote: string }[] }> {
    if (!apiKey || !apiKey.trim() || !navigator.onLine) {
      return this.simulateAskNotes(question, notesContext);
    }

    const contextText = notesContext
      .map(
        n =>
          `NOTE_ID: ${n.id}\nNOTE_TITLE: ${n.title}\nSUMMARY: ${n.summary}\nTRANSCRIPT EXCERPT: ${n.transcript.slice(0, 1500)}\n---`
      )
      .join('\n');

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `You are EnderNote Knowledge Assistant. Ground your answer strictly in the provided notes.
Never hallucinate facts. If the evidence is insufficient, state that directly.
Return JSON:
{
  "answer": "Detailed answer with clear markdown structure",
  "citations": [
    { "noteId": "...", "noteTitle": "...", "quote": "exact sentence quoted from transcript" }
  ]
}`,
            },
            {
              role: 'user',
              content: `CONTEXT NOTES:\n${contextText}\n\nQUESTION: ${question}`,
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      return JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch {
      return this.simulateAskNotes(question, notesContext);
    }
  }

  // Fallback / Offline simulators
  private simulateOfflineTranscription(blob: Blob, fallbackTranscript?: string): GroqTranscriptionResult {
    const text = (fallbackTranscript || '').trim();
    if (text) {
      // Split into realistic sentence chunks
      const rawSentences = text
        .split(/(?<=[.?!])\s+|\n+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const sentences = rawSentences.length > 0 ? rawSentences : [text];
      const approxDuration = Math.max(3, Math.round(blob.size / 32000));
      const secPerSentence = approxDuration / Math.max(1, sentences.length);

      let currentSec = 0;
      const segments: TranscriptSegment[] = sentences.map((sentence, idx) => {
        const start = Math.round(currentSec * 10) / 10;
        const end = Math.round(Math.min(approxDuration, currentSec + secPerSentence) * 10) / 10;
        currentSec = end + 0.2;
        return {
          id: `seg_${Date.now()}_${idx}`,
          start,
          end,
          text: sentence,
        };
      });

      return {
        fullTranscript: text,
        language: 'en',
        duration: Math.max(approxDuration, Math.round(currentSec)),
        segments,
      };
    }

    // Audio recorded without SpeechRecognition or API key
    const duration = Math.max(2, Math.round(blob.size / 32000));
    return {
      fullTranscript: '',
      language: 'en',
      duration,
      segments: [],
    };
  }

  private simulateOfflineAnalysis(
    transcript: string,
    existingProjects: { id: string; name: string }[],
    existingTags: string[]
  ): StructuredAnalysisResult {
    const clean = (transcript || '').trim();

    // Sensible fallback when source content is missing
    if (!clean) {
      const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return {
        title: `Voice Note - ${dateStr}`,
        summary: 'Voice recording saved locally. No speech transcript available to generate an automated summary. Use the audio player to listen or add notes manually.',
        noteType: 'personal',
        keyPoints: [
          'Audio recording preserved in local browser database.',
          'Add tags, tasks, or edit summary to expand details.'
        ],
        actionItems: [],
        suggestedTags: ['voice-memo'],
        suggestedProjectName: undefined,
        confidenceScore: 0.5,
        uncertainties: ['No speech transcript was detected from audio source.'],
      };
    }

    // Parse actual sentences
    const sentences = clean
      .split(/(?<=[.?!])\s+|\n+/)
      .map(s => s.trim().replace(/^[-*•]\s*/, ''))
      .filter(s => s.length > 5);

    // Title generation from first substantive sentence or words
    let title = '';
    const firstSentence = sentences[0] || clean;
    if (firstSentence.length <= 50) {
      title = firstSentence.replace(/[.,!?]+$/, '');
    } else {
      const words = firstSentence.split(/\s+/).slice(0, 7).join(' ');
      title = `${words}...`;
    }

    // Context-specific note type classification based on actual content
    let noteType: NoteType = 'meeting';
    const lower = clean.toLowerCase();
    if (lower.includes('lecture') || lower.includes('professor') || lower.includes('chapter') || lower.includes('student') || lower.includes('class') || lower.includes('exam')) {
      noteType = 'lecture';
    } else if (lower.includes('idea') || lower.includes('concept') || lower.includes('brainstorm') || lower.includes('what if') || lower.includes('hypothesis') || lower.includes('innovation')) {
      noteType = 'idea';
    } else if (lower.includes('remind') || lower.includes('todo') || lower.includes("don't forget") || lower.includes('urgent') || lower.includes('deadline')) {
      noteType = 'reminder';
    } else if (lower.includes('interview') || lower.includes('q&a') || lower.includes('candidate') || lower.includes('interviewee')) {
      noteType = 'interview';
    } else if (lower.includes('journal') || lower.includes('today i') || lower.includes('felt') || lower.includes('reflection') || lower.includes('grateful')) {
      noteType = 'journal';
    } else if (lower.includes('personal') || lower.includes('family') || lower.includes('health') || lower.includes('doctor') || lower.includes('home')) {
      noteType = 'personal';
    }

    // Context-specific summary synthesis directly from the actual text
    const summarySentences = sentences.slice(0, Math.min(3, sentences.length));
    const summary = summarySentences.join(' ');

    // Key points from genuine informative sentences
    const keyPoints: string[] = [];
    for (let i = 0; i < sentences.length && keyPoints.length < 4; i++) {
      const s = sentences[i];
      if (s.length > 15 && !keyPoints.includes(s)) {
        keyPoints.push(s.endsWith('.') ? s : `${s}.`);
      }
    }
    if (keyPoints.length === 0 && clean) {
      keyPoints.push(clean.slice(0, 80));
    }

    // Extract action items ONLY when real action imperatives appear in text
    const actionItems: { title: string; priority: 'low' | 'medium' | 'high'; dueDate?: string }[] = [];
    const actionRegex = /\b(action item:?|need to|should|must|will follow up with|todo:?|make sure to|remember to|schedule|verify)\s+([^.?!;\n]+)/gi;
    let match;
    while ((match = actionRegex.exec(clean)) !== null && actionItems.length < 4) {
      const taskBody = match[2].trim();
      if (taskBody.length > 5) {
        const capitalized = taskBody.charAt(0).toUpperCase() + taskBody.slice(1);
        actionItems.push({
          title: capitalized,
          priority: lower.includes('urgent') || lower.includes('asap') || lower.includes('critical') ? 'high' : 'medium',
        });
      }
    }

    // Suggested tags strictly extracted from words that actually occur in the text
    const suggestedTags: string[] = [];
    const candidateTags = [
      'design', 'architecture', 'research', 'engineering', 'product',
      'planning', 'review', 'performance', 'frontend', 'backend',
      'security', 'database', 'testing', 'roadmap', 'study', 'meeting',
      'marketing', 'budget', 'operations', 'analytics', 'health', 'finance'
    ];

    for (const tag of candidateTags) {
      if (lower.includes(tag) && !suggestedTags.includes(tag)) {
        suggestedTags.push(tag);
      }
    }

    // Include existing tags if explicitly mentioned
    for (const tag of existingTags) {
      const tLower = tag.toLowerCase();
      if (tLower.length > 2 && !['note', 'notes', 'voice-note'].includes(tLower) && lower.includes(tLower) && !suggestedTags.includes(tLower)) {
        suggestedTags.push(tLower);
      }
    }

    if (suggestedTags.length === 0) {
      suggestedTags.push(noteType);
    }

    // Match existing project ONLY if project name is explicitly mentioned in the text
    const matchedProject = existingProjects.find(p => {
      const pName = p.name.toLowerCase();
      return pName.length > 3 && lower.includes(pName);
    });

    const confidenceScore = sentences.length >= 3 ? 0.9 : sentences.length >= 1 ? 0.75 : 0.6;

    return {
      title,
      summary,
      noteType,
      keyPoints,
      actionItems,
      suggestedTags,
      suggestedProjectName: matchedProject?.name || undefined,
      confidenceScore,
      uncertainties: sentences.length < 2 ? ['Short recording; summary derived from available audio.'] : [],
    };
  }

  private simulateAlternateStyle(transcript: string, style: string): string {
    const clean = (transcript || '').trim();
    const sentences = clean ? clean.split(/(?<=[.?!])\s+|\n+/).filter(s => s.trim().length > 0) : [];
    const dateStr = new Date().toLocaleDateString();

    if (style === 'meeting_minutes') {
      const discussion = sentences.slice(0, 4).map(s => `- ${s}`).join('\n');
      return `### Meeting Minutes\n\n**Date:** ${dateStr}\n\n#### Key Discussion Points\n${discussion || '- No detailed transcript recorded.'}\n\n#### Summary\n${sentences.slice(0, 2).join(' ') || 'Meeting notes captured.'}`;
    }
    if (style === 'study_notes') {
      return `### Study Notes\n\n**Core Concept:** ${sentences[0] || 'Subject overview'}\n\n#### Key Learnings\n${sentences.slice(1, 5).map((s, idx) => `${idx + 1}. **Concept:** ${s}`).join('\n\n') || 'Detailed notes from session.'}`;
    }
    if (style === 'structured_outline') {
      return `### Structured Outline\n\n#### 1. Overview\n- ${sentences[0] || 'Topic captured'}\n\n#### 2. Detailed Breakdown\n${sentences.slice(1, 5).map(s => `- ${s}`).join('\n') || '- Further details in source audio.'}`;
    }
    // Executive summary
    const bluf = sentences[0] || 'Summary of recorded note.';
    const details = sentences.slice(1, 4).map((s, idx) => `${idx + 1}. ${s}`).join('\n');
    return `### Executive Briefing\n\n**Bottom Line Up Front (BLUF):** ${bluf}\n\n**Key Takeaways:**\n${details || '1. Notes recorded for review.'}`;
  }

  private simulateStudyDeck(transcript: string, title: string) {
    const clean = (transcript || '').trim();
    const sentences = clean ? clean.split(/(?<=[.?!])\s+/).filter(s => s.length > 10) : [];

    const flashcards = sentences.slice(0, 3).map((s, idx) => ({
      front: `Key point from "${title}" (#${idx + 1})`,
      back: s,
    }));

    if (flashcards.length === 0) {
      flashcards.push({
        front: `What was discussed in "${title}"?`,
        back: clean || 'Refer to the note audio playback and transcript.',
      });
    }

    return {
      flashcards,
      quizzes: [],
    };
  }

  private simulateAskNotes(
    question: string,
    notesContext: { id: string; title: string; summary: string; transcript: string }[]
  ) {
    const qWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // Score each note based on question keyword matches
    const scored = notesContext.map(n => {
      const text = `${n.title} ${n.summary} ${n.transcript}`.toLowerCase();
      let matchCount = 0;
      for (const w of qWords) {
        if (text.includes(w)) matchCount++;
      }
      return { note: n, score: matchCount };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]?.score > 0 ? scored[0].note : notesContext[0];

    if (!best || scored[0]?.score === 0) {
      return {
        answer: `I searched across your notes library for "${question}", but did not find an explicit match in the current note contents.\n\nYou can review your notes or record a voice note on this topic.`,
        citations: [],
      };
    }

    // Extract best matching sentence for quote
    const sentences = `${best.summary} ${best.transcript}`.split(/(?<=[.?!])\s+/);
    const bestSentence = sentences.find(s => qWords.some(w => s.toLowerCase().includes(w))) || best.summary;

    return {
      answer: `Based on your note **"${best.title}"**, here is the relevant context:\n\n${best.summary || best.transcript}`,
      citations: [
        {
          noteId: best.id,
          noteTitle: best.title,
          quote: (bestSentence || best.title).slice(0, 150),
        },
      ],
    };
  }

  private validateNoteType(type: string): NoteType {
    const valid: NoteType[] = ['meeting', 'lecture', 'idea', 'reminder', 'personal', 'journal', 'interview'];
    return valid.includes(type as NoteType) ? (type as NoteType) : 'meeting';
  }
}

export const groqService = new GroqService();
