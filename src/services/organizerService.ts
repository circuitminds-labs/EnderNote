import { Note, Project, TaskItem, Recording } from '../types';
import { groqService } from './groqService';

export interface OrganizerResult {
  title: string;
  summary: string;
  noteType: Note['noteType'];
  suggestedProjectId?: string;
  suggestedTags: string[];
  keyPoints: string[];
  extractedTasks: Omit<TaskItem, 'id' | 'createdAt'>[];
  relatedNoteIds: string[];
  possibleDuplicateId?: string;
  confidenceScore: number;
  uncertainties: string[];
}

export class OrganizerService {
  /**
   * Run the organizer pipeline for a transcribed recording or manual note.
   */
  async processNoteOrganization(
    transcript: string,
    existingProjects: Project[],
    existingNotes: Note[],
    existingTags: string[],
    currentRecording?: Recording,
    apiKey: string = '',
    model: string = 'openai/gpt-oss-120b'
  ): Promise<OrganizerResult> {
    // 1. Get structured AI analysis or deterministic local analysis
    const analysis = await groqService.analyzeNote(
      transcript,
      existingProjects.map(p => ({ id: p.id, name: p.name, description: p.description })),
      existingTags,
      apiKey,
      model
    );

    // 2. Validate Project ID against existing projects
    let matchedProjectId: string | undefined = undefined;
    if (analysis.suggestedProjectName) {
      const found = existingProjects.find(
        p => p.name.toLowerCase() === analysis.suggestedProjectName?.toLowerCase()
      );
      if (found) {
        matchedProjectId = found.id;
      }
    }
    // If not found by name, try fuzzy keyword match on project name/description
    if (!matchedProjectId && existingProjects.length > 0) {
      const lowerTranscript = transcript.toLowerCase();
      for (const p of existingProjects) {
        if (
          lowerTranscript.includes(p.name.toLowerCase()) ||
          (p.description && lowerTranscript.includes(p.description.toLowerCase().slice(0, 20)))
        ) {
          matchedProjectId = p.id;
          break;
        }
      }
    }

    // 3. Find potentially related notes based on shared tags, title keywords, or content overlap
    const relatedNoteIds = this.findRelatedNotes(transcript, analysis.title, analysis.suggestedTags, existingNotes);

    // 4. Duplicate detection (fingerprint, identical duration/title, or high text overlap)
    const possibleDuplicateId = this.detectDuplicate(transcript, currentRecording, existingNotes);

    // 5. Structure action items
    const extractedTasks: Omit<TaskItem, 'id' | 'createdAt'>[] = analysis.actionItems.map(item => ({
      title: item.title,
      completed: false,
      priority: item.priority || 'medium',
      dueDate: item.dueDate || undefined,
      projectId: matchedProjectId,
      recordingId: currentRecording?.id,
    }));

    return {
      title: analysis.title,
      summary: analysis.summary,
      noteType: analysis.noteType,
      suggestedProjectId: matchedProjectId,
      suggestedTags: analysis.suggestedTags,
      keyPoints: analysis.keyPoints,
      extractedTasks,
      relatedNoteIds,
      possibleDuplicateId,
      confidenceScore: analysis.confidenceScore,
      uncertainties: analysis.uncertainties,
    };
  }

  /**
   * Deterministic local related-notes matcher with strict semantic relevancy
   */
  findRelatedNotes(
    transcript: string,
    title: string,
    tags: string[],
    existingNotes: Note[],
    maxResults: number = 3
  ): string[] {
    if (existingNotes.length === 0) return [];

    const lowerTranscript = transcript.toLowerCase();
    const genericStopWords = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'what', 'your',
      'about', 'voice', 'note', 'notes', 'review', 'session', 'recording', 'today',
      'good', 'morning', 'audio', 'unit', 'team', 'meeting', 'discuss', 'quick'
    ]);

    const titleWords = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !genericStopWords.has(w));

    const validTags = new Set(
      tags
        .map(t => t.toLowerCase())
        .filter(t => t.length > 2 && !['note', 'notes', 'voice-note', 'audio', 'recording', 'general', 'voice-memo'].includes(t))
    );

    const scoredNotes = existingNotes.map(n => {
      let score = 0;
      const matchedReasons: string[] = [];

      // 1. Tag overlap (high value only for specific tags)
      for (const tag of (n.tags || [])) {
        const tLower = tag.toLowerCase();
        if (validTags.has(tLower)) {
          score += 4;
          matchedReasons.push(`#${tag}`);
        }
      }

      // 2. Title word overlap (require specific non-generic words)
      const otherTitleWords = new Set(
        n.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !genericStopWords.has(w))
      );

      for (const word of titleWords) {
        if (otherTitleWords.has(word)) {
          score += 3;
          matchedReasons.push(`"${word}"`);
        }
      }

      // 3. Deep phrase / concept overlap in summary or transcript (at least 20 chars of exact significant match)
      if (n.summary && n.summary.length > 20) {
        const cleanN = n.summary.toLowerCase().slice(0, 50);
        if (cleanN.length > 15 && lowerTranscript.includes(cleanN)) {
          score += 6;
        }
      }

      return { id: n.id, score, matchedReasons };
    });

    // Require score >= 4 (must have either a specific tag overlap or multiple title keywords)
    return scoredNotes
      .filter(s => s.score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(s => s.id);
  }

  /**
   * Duplicate detection: checks fingerprint, exact title, or severe transcript overlap
   */
  detectDuplicate(
    transcript: string,
    recording: Recording | undefined,
    existingNotes: Note[]
  ): string | undefined {
    if (existingNotes.length === 0) return undefined;

    const cleanTranscript = transcript.trim().toLowerCase();

    for (const note of existingNotes) {
      // 1. Identical recording fingerprint
      if (recording && note.recordingId === recording.id) {
        return note.id;
      }

      // 2. High transcript similarity (substring match or length ratio)
      const otherClean = (note.fullTranscript || '').trim().toLowerCase();
      if (cleanTranscript.length > 50 && otherClean.length > 50) {
        if (cleanTranscript === otherClean) {
          return note.id;
        }
        if (cleanTranscript.includes(otherClean) || otherClean.includes(cleanTranscript)) {
          return note.id;
        }
      }
    }

    return undefined;
  }
}

export const organizerService = new OrganizerService();
