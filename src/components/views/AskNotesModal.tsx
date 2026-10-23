import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Send, 
  ExternalLink, 
  Play, 
  HelpCircle,
  FileText,
  Clock,
  Quote
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { groqService } from '../../services/groqService';
import { formatDuration } from '../../services/audioUtils';

interface AskNotesModalProps {
  onClose: () => void;
}

export const AskNotesModal: React.FC<AskNotesModalProps> = ({ onClose }) => {
  const { 
    notes, 
    recordings, 
    playRecording, 
    setSelectedNoteId, 
    setActiveView, 
    settings, 
    isOnline 
  } = useApp();

  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [response, setResponse] = useState<{
    answer: string;
    citations: { noteId: string; noteTitle: string; quote: string }[];
  } | null>(null);

  const sampleQuestions = [
    'What DMA buffer configuration fixed audio dropouts?',
    'What was decided regarding the physical bookmark button debounce?',
    'Which lecture covers Raft distributed consensus quorum?',
    'What tasks are currently open for Alex?',
  ];

  const handleAsk = async (queryText?: string) => {
    const q = queryText || question;
    if (!q.trim()) return;

    setIsAsking(true);
    setResponse(null);

    const notesContext = notes.map(n => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      transcript: n.fullTranscript,
    }));

    try {
      const result = await groqService.askNotes(
        q,
        notesContext,
        settings.groqApiKey,
        settings.summarizationModel
      );
      setResponse(result);
    } catch (err: any) {
      setResponse({
        answer: `Could not retrieve an answer: ${err.message || 'Unknown error'}. Please check your connection or Groq API settings.`,
        citations: [],
      });
    } finally {
      setIsAsking(false);
    }
  };

  const handleCitationClick = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      setSelectedNoteId(note.id);
      setActiveView('note_detail');
      onClose();
    }
  };

  const handlePlayCitationAudio = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note && note.recordingId) {
      const rec = recordings.find(r => r.id === note.recordingId);
      if (rec) {
        playRecording(rec, 0);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-stone-950/50">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>Ask My Notes</span>
                {!isOnline && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-normal">
                    Offline Local Search
                  </span>
                )}
              </h2>
              <div className="text-[11px] text-stone-500">
                Grounded Q&A strictly backed by your local transcripts with verified citations
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Question Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder="Ask anything about meetings, lectures, decisions, or ideas..."
                className="w-full pl-4 pr-12 py-3 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-300/80 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500"
              />
              <button
                onClick={() => handleAsk()}
                disabled={isAsking || !question.trim()}
                className="absolute right-2 p-2 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick questions suggestion pills */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sampleQuestions.map((sq, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQuestion(sq);
                    handleAsk(sq);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 transition-colors text-left"
                >
                  {sq}
                </button>
              ))}
            </div>
          </div>

          {/* Loading indicator */}
          {isAsking && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-stone-400 text-xs">
              <Sparkles className="w-5 h-5 text-amber-500 animate-spin" />
              <span>Searching local transcripts and synthesizing grounded answer...</span>
            </div>
          )}

          {/* Response area */}
          {response && !isAsking && (
            <div className="space-y-4 animate-in fade-in pt-2">
              <div className="p-4 rounded-xl bg-stone-100/80 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/80 space-y-3">
                <div className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed whitespace-pre-wrap">
                  {response.answer}
                </div>

                {/* Citations list */}
                {response.citations && response.citations.length > 0 && (
                  <div className="pt-3 border-t border-stone-200 dark:border-stone-700/60 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                      <Quote className="w-3 h-3" />
                      <span>Verified Citations ({response.citations.length})</span>
                    </div>

                    <div className="space-y-1.5">
                      {response.citations.map((c, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-stone-900 dark:text-stone-100 text-[11px]">
                              {c.noteTitle}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handlePlayCitationAudio(c.noteId)}
                                className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Play Audio</span>
                              </button>
                              <button
                                onClick={() => handleCitationClick(c.noteId)}
                                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                                title="Open full note"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] italic text-stone-600 dark:text-stone-400 pl-2 border-l-2 border-amber-400/70">
                            "{c.quote}"
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
