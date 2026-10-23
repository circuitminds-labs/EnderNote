import { Note, TaskItem, Project, Recording } from '../types';
import { groqService } from './groqService';

export interface ChatMessageCitation {
  noteId: string;
  noteTitle: string;
  quote: string;
  recordingId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: ChatMessageCitation[];
  isError?: boolean;
}

export interface RelevantNoteContext {
  id: string;
  title: string;
  summary: string;
  projectName?: string;
  tags: string[];
  keyPoints: string[];
  transcriptSnippet: string;
  recordingId?: string;
  createdAt: string;
}

/**
 * Filter and rank relevant notes and tasks based on user query.
 * Limits token size while maximizing grounded context.
 */
export function extractRelevantContext(
  query: string,
  notes: Note[],
  tasks: TaskItem[],
  projects: Project[]
): {
  relevantNotes: RelevantNoteContext[];
  relevantTasks: TaskItem[];
  relevantProjects: { id: string; name: string; description: string }[];
} {
  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery
    .split(/[^\w\d-]+/)
    .filter(t => t.length > 2 && !['what', 'when', 'where', 'which', 'about', 'from', 'with', 'that', 'this', 'have', 'been'].includes(t));

  const isLatestQuery = /latest|recent|newest|last|update/i.test(normalizedQuery);
  const isTaskQuery = /task|todo|pending|action|item|done|finish|deadline/i.test(normalizedQuery);
  const isProjectQuery = /project|catalog|hardware|embedded|consensus|research/i.test(normalizedQuery);

  // Score each note
  const scoredNotes = notes
    .filter(n => !n.isArchived)
    .map(n => {
      let score = 0;
      const titleLower = (n.title || '').toLowerCase();
      const summaryLower = (n.summary || '').toLowerCase();
      const transcriptLower = (n.fullTranscript || '').toLowerCase();
      const tagsLower = (n.tags || []).join(' ').toLowerCase();
      const keyPointsLower = (n.keyPoints || []).join(' ').toLowerCase();

      // Keyword matches
      for (const token of queryTokens) {
        if (titleLower.includes(token)) score += 8;
        if (summaryLower.includes(token)) score += 4;
        if (tagsLower.includes(token)) score += 5;
        if (keyPointsLower.includes(token)) score += 4;
        if (transcriptLower.includes(token)) score += 2;
      }

      // If user asks about latest or recent notes, boost recency
      if (isLatestQuery) {
        const ageHours = (Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 20 - ageHours);
      }

      // Project match boost
      const project = projects.find(p => p.id === n.projectId);
      if (project && queryTokens.some(t => project.name.toLowerCase().includes(t))) {
        score += 7;
      }

      // Extract most relevant snippet from transcript or summary
      let bestSnippet = n.summary;
      if (queryTokens.length > 0 && n.fullTranscript) {
        const sentences = n.fullTranscript.split(/(?<=[.?!])\s+/);
        const matchingSentence = sentences.find(s => queryTokens.some(t => s.toLowerCase().includes(t)));
        if (matchingSentence) {
          bestSnippet = matchingSentence;
        }
      }

      return {
        note: n,
        projectName: project?.name,
        score,
        snippet: bestSnippet,
      };
    });

  // Sort by relevance score
  scoredNotes.sort((a, b) => b.score - a.score);

  // Take top notes (minimum 2, up to 5)
  const topNotes = (scoredNotes[0]?.score > 0 || isLatestQuery)
    ? scoredNotes.slice(0, 5)
    : scoredNotes.slice(0, 3);

  const relevantNotes: RelevantNoteContext[] = topNotes.map(sn => ({
    id: sn.note.id,
    title: sn.note.title,
    summary: sn.note.summary,
    projectName: sn.projectName,
    tags: sn.note.tags,
    keyPoints: sn.note.keyPoints || [],
    transcriptSnippet: (sn.snippet || sn.note.summary || '').slice(0, 800),
    recordingId: sn.note.recordingId,
    createdAt: sn.note.createdAt,
  }));

  // Relevant tasks
  let relevantTasks: TaskItem[] = [];
  if (isTaskQuery) {
    // Show all pending tasks first, plus any matching completed tasks
    relevantTasks = tasks.filter(t => !t.completed).concat(tasks.filter(t => t.completed).slice(0, 3));
  } else if (queryTokens.length > 0) {
    relevantTasks = tasks.filter(t => queryTokens.some(tok => t.title.toLowerCase().includes(tok)));
  }

  const relevantProjects = projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
  }));

  return { relevantNotes, relevantTasks, relevantProjects };
}

/**
 * Intelligent local synthesis engine.
 * Guarantees zero downtime, offline capability, and instant grounded answers with citations.
 */
export function generateLocalGroundedAnswer(
  query: string,
  relevantNotes: RelevantNoteContext[],
  tasks: TaskItem[],
  projects: Project[]
): { answer: string; citations: ChatMessageCitation[] } {
  const q = query.toLowerCase().trim();

  // 1. "Summarize my latest notes"
  if (/summar(y|ize)|latest note|recent note|overview of note/i.test(q)) {
    if (relevantNotes.length === 0) {
      return {
        answer: "You don't have any notes saved in EnderNote yet. Record your first voice note using the **Record Voice** button!",
        citations: [],
      };
    }

    const summaries = relevantNotes.slice(0, 4).map((n, i) => {
      const proj = n.projectName ? `*(${n.projectName})*` : '';
      return `### ${i + 1}. ${n.title} ${proj}\n${n.summary}\n\n**Key Takeaways:**\n${(n.keyPoints || []).slice(0, 2).map(kp => `- ${kp}`).join('\n') || '- Voice note captured in library.'}`;
    }).join('\n\n---\n\n');

    const citations: ChatMessageCitation[] = relevantNotes.slice(0, 4).map(n => ({
      noteId: n.id,
      noteTitle: n.title,
      quote: (n.keyPoints?.[0] || n.summary).slice(0, 140),
      recordingId: n.recordingId,
    }));

    return {
      answer: `Here is a structured summary of your most recent voice notes:\n\n${summaries}\n\nAsk me anytime for deeper analysis, action items, or technical specifications from any of these recordings.`,
      citations,
    };
  }

  // 2. "What tasks are pending?"
  if (/task|todo|pending|action item|to-do|what.*open/i.test(q)) {
    const pendingTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);

    if (pendingTasks.length === 0 && completedTasks.length === 0) {
      return {
        answer: "You currently have no open or completed action items in your workspace. You can extract tasks automatically from meeting recordings or add them manually in the Tasks view.",
        citations: [],
      };
    }

    let response = `### Pending Action Items (${pendingTasks.length})\n\n`;
    if (pendingTasks.length > 0) {
      response += pendingTasks.map((t, i) => {
        const priorityTag = t.priority === 'high' ? '🔴 High' : t.priority === 'medium' ? '🟡 Medium' : '🟢 Low';
        const due = t.dueDate ? ` · Due: **${t.dueDate}**` : '';
        return `${i + 1}. **${t.title}**\n   Priority: ${priorityTag}${due}`;
      }).join('\n\n');
    } else {
      response += "Great news! All existing action items have been marked as completed.";
    }

    if (completedTasks.length > 0) {
      response += `\n\n### Recently Completed (${completedTasks.length})\n`;
      response += completedTasks.slice(0, 3).map(t => `- ~~${t.title}~~`).join('\n');
    }

    // Associate citations with notes linked to pending tasks
    const citedNoteIds = new Set(pendingTasks.map(t => t.noteId).filter(Boolean));
    const citations: ChatMessageCitation[] = [];
    for (const noteId of citedNoteIds) {
      const note = relevantNotes.find(n => n.id === noteId);
      if (note) {
        citations.push({
          noteId: note.id,
          noteTitle: note.title,
          quote: `Action item extracted from: "${note.title}"`,
          recordingId: note.recordingId,
        });
      }
    }

    return { answer: response, citations };
  }

  // 3. "Find notes about my projects"
  if (/project|about my project|categor/i.test(q)) {
    if (projects.length === 0) {
      return {
        answer: "No projects have been cataloged yet. You can create projects in the Projects section to organize your thoughts by initiative.",
        citations: [],
      };
    }

    let text = "Here is an overview of your active projects and their associated voice notes:\n\n";
    const citations: ChatMessageCitation[] = [];

    projects.forEach(p => {
      const projNotes = relevantNotes.filter(n => n.projectName === p.name);
      text += `### 📁 ${p.name}\n${p.description}\n`;
      if (projNotes.length > 0) {
        text += `**Saved Notes (${projNotes.length}):**\n`;
        projNotes.forEach(pn => {
          text += `- **${pn.title}**: ${(pn.summary || '').slice(0, 110)}...\n`;
          if (!citations.some(c => c.noteId === pn.id)) {
            citations.push({
              noteId: pn.id,
              noteTitle: pn.title,
              quote: pn.summary.slice(0, 120),
              recordingId: pn.recordingId,
            });
          }
        });
      } else {
        text += `*No notes assigned yet to this project.*\n`;
      }
      text += `\n`;
    });

    return { answer: text.trim(), citations };
  }

  // 4. "What did I discuss recently?"
  if (/discuss|talk about|meeting|conversation|what did i/i.test(q)) {
    if (relevantNotes.length === 0) {
      return {
        answer: "No recent discussions found. Once you record voice notes, EnderNote transcribes and catalogs them here.",
        citations: [],
      };
    }

    let text = "### Recent Voice Note Discussions\n\n";
    const citations: ChatMessageCitation[] = [];

    relevantNotes.slice(0, 3).forEach((n, idx) => {
      text += `#### ${idx + 1}. ${n.title}\n`;
      text += `**Transcript Excerpt:**\n> "${(n.transcriptSnippet || n.summary).slice(0, 180)}..."\n\n`;
      text += `**Summary:** ${n.summary}\n\n`;

      citations.push({
        noteId: n.id,
        noteTitle: n.title,
        quote: (n.transcriptSnippet || n.summary).slice(0, 130),
        recordingId: n.recordingId,
      });
    });

    return { answer: text.trim(), citations };
  }

  // 5. Keyword or specific question search (e.g., ESP32, DMA buffers, debounce, Raft)
  if (relevantNotes.length > 0) {
    const bestNote = relevantNotes[0];
    const citations: ChatMessageCitation[] = [{
      noteId: bestNote.id,
      noteTitle: bestNote.title,
      quote: (bestNote.transcriptSnippet || bestNote.summary).slice(0, 140),
      recordingId: bestNote.recordingId,
    }];

    let text = `Based on your note **"${bestNote.title}"**`;
    if (bestNote.projectName) {
      text += ` under project *${bestNote.projectName}*`;
    }
    text += `:\n\n${bestNote.summary}\n\n`;

    if (bestNote.keyPoints && bestNote.keyPoints.length > 0) {
      text += `**Key Points Recorded:**\n`;
      text += bestNote.keyPoints.map(kp => `- ${kp}`).join('\n');
      text += '\n\n';
    }

    if (bestNote.transcriptSnippet) {
      text += `**Transcript Evidence:**\n> "${bestNote.transcriptSnippet.slice(0, 220)}..."`;
    }

    // If second note also shares context
    if (relevantNotes.length > 1 && relevantNotes[1].title !== bestNote.title) {
      const second = relevantNotes[1];
      text += `\n\n---\n**Related Record:** Also referenced in **"${second.title}"**:\n${second.summary.slice(0, 180)}...`;
      citations.push({
        noteId: second.id,
        noteTitle: second.title,
        quote: second.summary.slice(0, 130),
        recordingId: second.recordingId,
      });
    }

    return { answer: text, citations };
  }

  // 6. No match found
  return {
    answer: `I searched across your notes, transcripts, and action items for "${query}", but didn't find any direct matches in your library.\n\nYou can:\n- Try searching with different keywords.\n- Record a new voice note using **Record Voice**.\n- Check the **All Notes** or **Projects** view for existing records.`,
    citations: [],
  };
}

/**
 * Execute chat query with multi-tiered fallback:
 * 1. Server-side Gemini API (/api/ai/chat)
 * 2. Groq Whisper / Llama via groqService (if user has Groq API key)
 * 3. Local Grounded Synthesizer (instant, resilient, offline-ready)
 */
export async function sendChatMessage(
  message: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  notes: Note[],
  tasks: TaskItem[],
  projects: Project[],
  settings?: { groqApiKey?: string; summarizationModel?: string }
): Promise<{ answer: string; citations: ChatMessageCitation[]; source: 'gemini' | 'groq' | 'local' }> {
  const { relevantNotes, relevantTasks, relevantProjects } = extractRelevantContext(
    message,
    notes,
    tasks,
    projects
  );

  // 1. Try Server-Side Gemini API
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        relevantNotes,
        relevantTasks,
        relevantProjects,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.answer) {
        // Hydrate citations with recordingId if possible
        const hydratedCitations: ChatMessageCitation[] = (data.citations || []).map((c: any) => {
          const match = notes.find(n => n.id === c.noteId);
          return {
            noteId: c.noteId,
            noteTitle: c.noteTitle || match?.title || 'Referenced Note',
            quote: c.quote || '',
            recordingId: match?.recordingId,
          };
        });

        return {
          answer: data.answer,
          citations: hydratedCitations,
          source: 'gemini',
        };
      }
    }
  } catch (err) {
    console.warn('Server-side Gemini chat unavailable or failed, trying alternative:', err);
  }

  // 2. Try Groq if user configured a key in settings
  if (settings?.groqApiKey && settings.groqApiKey.trim() && navigator.onLine) {
    try {
      const groqContext = relevantNotes.map(n => ({
        id: n.id,
        title: n.title,
        summary: n.summary,
        transcript: n.transcriptSnippet,
      }));

      const groqResult = await groqService.askNotes(
        message,
        groqContext,
        settings.groqApiKey,
        settings.summarizationModel
      );

      if (groqResult && groqResult.answer) {
        const citations: ChatMessageCitation[] = (groqResult.citations || []).map(c => {
          const match = notes.find(n => n.id === c.noteId);
          return {
            noteId: c.noteId,
            noteTitle: c.noteTitle,
            quote: c.quote,
            recordingId: match?.recordingId,
          };
        });

        return {
          answer: groqResult.answer,
          citations,
          source: 'groq',
        };
      }
    } catch (groqErr) {
      console.warn('Groq askNotes fallback failed, using local grounded synthesizer:', groqErr);
    }
  }

  // 3. Resilient Local Grounded Synthesizer
  const localResult = generateLocalGroundedAnswer(
    message,
    relevantNotes,
    tasks,
    projects
  );

  return {
    answer: localResult.answer,
    citations: localResult.citations,
    source: 'local',
  };
}
