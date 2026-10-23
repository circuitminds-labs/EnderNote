import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI if API key is present in environment
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (geminiApiKey && geminiApiKey.trim()) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: geminiApiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client on server:', err);
  }
}

// AI Status endpoint
app.get('/api/ai/status', (req, res) => {
  res.json({
    online: true,
    hasGemini: Boolean(aiClient),
    model: 'gemini-3.8-flash',
  });
});

// Grounded Chat Endpoint
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [], relevantNotes = [], relevantTasks = [], relevantProjects = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // If Gemini API is not configured on the server, return fallback flag
  if (!aiClient) {
    return res.json({
      success: false,
      fallback: true,
      reason: 'GEMINI_API_KEY not configured on server',
    });
  }

  try {
    // Construct rich grounding context from provided relevant notes and tasks
    const notesSummary = relevantNotes.map((n: any, idx: number) => {
      return `[NOTE ${idx + 1}] ID: ${n.id}
TITLE: ${n.title}
PROJECT: ${n.projectName || 'Unassigned'}
TAGS: ${(n.tags || []).join(', ')}
SUMMARY: ${n.summary}
KEY POINTS: ${(n.keyPoints || []).join('; ')}
TRANSCRIPT SNIPPET: ${(n.transcriptSnippet || '').slice(0, 1200)}
---`;
    }).join('\n');

    const tasksSummary = (relevantTasks || []).map((t: any) => {
      return `- [${t.completed ? 'COMPLETED' : 'PENDING'}] ${t.title} (Priority: ${t.priority || 'medium'}${t.dueDate ? `, Due: ${t.dueDate}` : ''})`;
    }).join('\n');

    const projectsSummary = (relevantProjects || []).map((p: any) => {
      return `- ${p.name}: ${p.description}`;
    }).join('\n');

    const systemInstruction = `You are "Ask My Notes", the official AI personal knowledge assistant for EnderNote.
Your job is to answer user questions grounded strictly in the user's voice notes, transcripts, projects, and action items.

GROUNDING RULES:
1. Always ground your facts in the provided notes and tasks.
2. If multiple notes support the answer, synthesize them clearly with bullet points and headings.
3. If the user asks about tasks, cite whether they are pending or completed.
4. If the provided notes do not contain enough information to answer, state clearly what is known and what is missing. Never fabricate notes, transcripts, or deadlines.
5. If the user asks a general question unrelated to their notes, answer helpfully while politely clarifying that this is general knowledge rather than from their saved voice notes.
6. Provide citations to the notes that contributed to the answer. Include note ID, note title, and a brief supporting quote or key point.

Format your response as a valid JSON object matching this structure:
{
  "answer": "Your detailed, well-formatted response using markdown (headings, bold, lists)",
  "citations": [
    {
      "noteId": "ID of cited note",
      "noteTitle": "Title of cited note",
      "quote": "Short exact excerpt or core insight supporting the point"
    }
  ]
}
Return strictly raw JSON.`;

    const contextPrompt = `USER'S RELEVANT NOTES:
${notesSummary || 'No notes currently match this query.'}

USER'S TASKS:
${tasksSummary || 'No tasks found.'}

USER'S PROJECTS:
${projectsSummary || 'No projects cataloged.'}

USER QUESTION:
${message}`;

    // Format conversation history for Gemini multi-turn
    const contents: any[] = [];
    for (const h of history.slice(-6)) {
      if (h.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: h.text }] });
      } else if (h.role === 'assistant' || h.role === 'model') {
        contents.push({ role: 'model', parts: [{ text: h.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: contextPrompt }] });

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    let parsed: any;
    try {
      parsed = JSON.parse(responseText.trim());
    } catch {
      // If JSON parsing fails, return raw text as answer with empty citations
      parsed = { answer: responseText, citations: [] };
    }

    return res.json({
      success: true,
      answer: parsed.answer || responseText,
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    });

  } catch (err: any) {
    console.error('Gemini chat generation error:', err);
    return res.json({
      success: false,
      fallback: true,
      error: err.message || 'Generation failed',
    });
  }
});

// Setup server in Dev (Vite middleware) vs Prod (Static files)
async function start() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EnderNote server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
