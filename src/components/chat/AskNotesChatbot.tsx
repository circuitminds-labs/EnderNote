import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  Minus, 
  Send, 
  RotateCcw, 
  ExternalLink, 
  Play, 
  Quote, 
  CornerDownLeft,
  Bot,
  Clock,
  Trash2,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { sendChatMessage, ChatMessage, ChatMessageCitation } from '../../services/aiChatService';
import { MarkdownView } from '../common/MarkdownView';

export interface SavedChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const STORAGE_CONVERSATIONS_KEY = 'auranote_chat_conversations';
const STORAGE_ACTIVE_ID_KEY = 'auranote_active_chat_id';

function loadSavedConversations(): SavedChatConversation[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_CONVERSATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading conversations:', e);
  }
  return [];
}

function persistConversations(conversations: SavedChatConversation[], activeId: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_CONVERSATIONS_KEY, JSON.stringify(conversations));
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, activeId);
    }
  } catch (e) {
    console.error('Error persisting conversations:', e);
  }
}

interface AskNotesChatbotProps {
  isOpen: boolean;
  onClose: () => void;
  isPlayerActive?: boolean;
}

export const AskNotesChatbot: React.FC<AskNotesChatbotProps> = ({
  isOpen,
  onClose,
  isPlayerActive = false,
}) => {
  const {
    notes,
    tasks,
    projects,
    recordings,
    playRecording,
    setSelectedNoteId,
    setActiveView,
    settings,
    isOnline,
    showCapsule,
  } = useApp();

  // Saved conversations state with persistent hydration
  const [conversations, setConversations] = useState<SavedChatConversation[]>(() => {
    return loadSavedConversations();
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const list = loadSavedConversations();
    const savedActiveId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_ACTIVE_ID_KEY) : null;
    if (savedActiveId && list.some(c => c.id === savedActiveId)) {
      return savedActiveId;
    }
    if (list.length > 0) {
      return list[0].id;
    }
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const list = loadSavedConversations();
    const savedActiveId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_ACTIVE_ID_KEY) : null;
    const found = list.find(c => c.id === savedActiveId) || list[0];
    return found ? found.messages : [];
  });

  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lastQuery, setLastQuery] = useState<string>('');
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom('auto');
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (messages.length > 0 && !isMinimized) {
      scrollToBottom('smooth');
    }
  }, [messages, isSubmitting, isMinimized]);

  // Clickable suggestion chips
  const suggestionChips = [
    'Summarize my latest notes',
    'What tasks are pending?',
    'Find notes about my projects',
    'What did I discuss recently?',
  ];

  // Helper to persist updated messages into active conversation
  const saveMessagesToActiveConversation = (newMessages: ChatMessage[]) => {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConversationId);
      const firstUserMsg = newMessages.find(m => m.role === 'user');
      const title = firstUserMsg 
        ? (firstUserMsg.content.length > 36 ? `${firstUserMsg.content.slice(0, 34)}...` : firstUserMsg.content)
        : 'New Conversation';

      let updated: SavedChatConversation[];
      if (idx >= 0) {
        updated = prev.map((c, i) => i === idx ? {
          ...c,
          title: c.title !== 'New Conversation' ? c.title : title,
          updatedAt: new Date().toISOString(),
          messages: newMessages,
        } : c);
      } else {
        updated = [{
          id: activeConversationId,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: newMessages,
        }, ...prev];
      }
      persistConversations(updated, activeConversationId);
      return updated;
    });
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!query || isSubmitting) return;

    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedWithUser = [...messages, userMessage];
    setMessages(updatedWithUser);
    saveMessagesToActiveConversation(updatedWithUser);

    setInputText('');
    setLastQuery(query);
    setIsSubmitting(true);

    // Prepare conversation history (up to last 6 messages)
    const history = updatedWithUser.slice(-6).map(m => ({
      role: m.role,
      text: m.content,
    }));

    try {
      const result = await sendChatMessage(
        query,
        history,
        notes,
        tasks,
        projects,
        settings
      );

      const aiMessage: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citations: result.citations,
      };

      const updatedWithAi = [...updatedWithUser, aiMessage];
      setMessages(updatedWithAi);
      saveMessagesToActiveConversation(updatedWithAi);

    } catch (err: any) {
      console.error('Chat error:', err);
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `I encountered an unexpected issue while retrieving your notes: ${err.message || 'Network error'}. Please try asking again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      const updatedWithError = [...updatedWithUser, errorMessage];
      setMessages(updatedWithError);
      saveMessagesToActiveConversation(updatedWithError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Start genuinely new conversation reliably without window.confirm blocking
  const handleStartNewConversation = () => {
    // If the active conversation is already brand new and empty, notify & focus
    if (messages.length === 0 && !inputText.trim()) {
      showCapsule({
        type: 'theme',
        title: 'New Conversation Active',
        subtitle: 'Ask anything about your notes',
      });
      textareaRef.current?.focus();
      setShowHistoryDrawer(false);
      return;
    }

    // Save existing messages to conversations list if not saved yet
    let updatedConversations = [...conversations];
    if (messages.length > 0) {
      const existingIdx = updatedConversations.findIndex(c => c.id === activeConversationId);
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg 
        ? (firstUserMsg.content.length > 36 ? `${firstUserMsg.content.slice(0, 34)}...` : firstUserMsg.content)
        : 'Voice Notes Query';

      if (existingIdx >= 0) {
        updatedConversations[existingIdx] = {
          ...updatedConversations[existingIdx],
          messages,
          title: updatedConversations[existingIdx].title !== 'New Conversation' 
            ? updatedConversations[existingIdx].title 
            : title,
          updatedAt: new Date().toISOString(),
        };
      } else {
        updatedConversations.unshift({
          id: activeConversationId,
          title,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages,
        });
      }
    }

    // Generate brand-new conversation ID
    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newConversation: SavedChatConversation = {
      id: newConvId,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    // Filter out previous empty placeholders, place new conversation at top
    const finalizedList = [newConversation, ...updatedConversations.filter(c => c.messages.length > 0 && c.id !== newConvId)];

    setConversations(finalizedList);
    setActiveConversationId(newConvId);
    setMessages([]);
    setInputText('');
    setIsSubmitting(false);
    setLastQuery('');
    setShowHistoryDrawer(false);

    persistConversations(finalizedList, newConvId);

    showCapsule({
      type: 'theme',
      title: 'New Conversation Started',
      subtitle: 'Ask anything about your notes',
    });

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const handleSelectConversation = (conv: SavedChatConversation) => {
    if (conv.id === activeConversationId) {
      setShowHistoryDrawer(false);
      return;
    }

    // Save current messages first if any exist
    let updatedConversations = [...conversations];
    if (messages.length > 0) {
      const curIdx = updatedConversations.findIndex(c => c.id === activeConversationId);
      if (curIdx >= 0) {
        updatedConversations[curIdx] = {
          ...updatedConversations[curIdx],
          messages,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    setConversations(updatedConversations);
    setActiveConversationId(conv.id);
    setMessages(conv.messages);
    setInputText('');
    setIsSubmitting(false);
    setLastQuery('');
    setShowHistoryDrawer(false);

    persistConversations(updatedConversations, conv.id);

    showCapsule({
      type: 'theme',
      title: 'Conversation Loaded',
      subtitle: conv.title,
    });
  };

  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = conversations.filter(c => c.id !== convId);
    setConversations(updated);

    if (activeConversationId === convId) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id);
        setMessages(updated[0].messages);
        persistConversations(updated, updated[0].id);
      } else {
        const freshId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const freshConv: SavedChatConversation = {
          id: freshId,
          title: 'New Conversation',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        setConversations([freshConv]);
        setActiveConversationId(freshId);
        setMessages([]);
        persistConversations([freshConv], freshId);
      }
    } else {
      persistConversations(updated, activeConversationId);
    }

    showCapsule({
      type: 'delete',
      title: 'Conversation Removed',
      subtitle: 'Deleted from chat history',
    });
  };

  const handleCitationClick = (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note) {
      setSelectedNoteId(note.id);
      setActiveView('note_detail');
    }
  };

  const handlePlayCitationAudio = (citation: ChatMessageCitation) => {
    const note = notes.find(n => n.id === citation.noteId);
    const recId = citation.recordingId || note?.recordingId;
    if (recId) {
      const rec = recordings.find(r => r.id === recId);
      if (rec) {
        playRecording(rec, 0);
        showCapsule({
          type: 'record',
          title: 'Playing Source Audio',
          subtitle: rec.filename || note?.title || 'Voice recording',
        });
      }
    }
  };

  if (!isOpen) return null;

  // Bottom positioning for minimized pill based on mobile BottomNav and audio player bar
  const bottomPositionClass = isPlayerActive 
    ? 'bottom-[calc(8.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-22' 
    : 'bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  // Minimized Floating Pill State
  if (isMinimized) {
    return (
      <div 
        className={`fixed right-3 sm:right-6 z-40 transition-all duration-200 pointer-events-auto ${bottomPositionClass}`}
        role="region"
        aria-label="Ask My Notes (Minimized)"
      >
        <div className="flex items-center gap-2 p-1.5 pl-3 pr-2 rounded-full bg-stone-100/95 dark:bg-stone-900/95 border border-stone-200/90 dark:border-stone-700/80 shadow-2xl backdrop-blur-md text-stone-900 dark:text-stone-100 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-800 dark:text-stone-100 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
            title="Restore Ask My Notes chat window"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Ask My Notes</span>
            {messages.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono border border-stone-300/60 dark:border-transparent">
                {messages.length}
              </span>
            )}
          </button>

          <div className="w-px h-3.5 bg-stone-300 dark:bg-stone-700 mx-0.5" />

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Close Assistant"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded Window: Mobile-First Full Bottom Sheet on < sm, Anchored Floating Card on sm+
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className="fixed inset-0 bg-stone-950/40 dark:bg-stone-950/70 backdrop-blur-2xs z-40 sm:hidden cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed z-40 transition-all duration-200 pointer-events-auto 
          inset-x-0 bottom-0 top-12 sm:top-auto sm:inset-x-auto sm:right-6 
          ${isPlayerActive ? 'sm:bottom-22' : 'sm:bottom-6'}
        `}
        role="region"
        aria-label="Ask My Notes Assistant"
      >
        <div className="w-full sm:w-[410px] md:w-[420px] max-w-full sm:max-w-[420px] h-full sm:h-[660px] sm:max-h-[calc(100vh-4.5rem)] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl shadow-stone-950/20 dark:shadow-black/70 overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)] sm:pb-0">
          
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50/95 dark:bg-stone-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-500 dark:text-amber-400 shadow-inner">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>

            {/* Header Controls */}
            <div className="flex items-center gap-1 shrink-0 text-stone-500 dark:text-stone-400">
              {/* History Drawer Toggle Button */}
              {conversations.filter(c => c.messages.length > 0).length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistoryDrawer(prev => !prev)}
                  className={`p-1.5 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer ${
                    showHistoryDrawer ? 'text-amber-600 dark:text-amber-400 bg-amber-500/15' : ''
                  }`}
                  title="Past Conversations"
                  aria-label="Past Conversations"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Start New Conversation Button */}
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="p-1.5 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer"
                title="Start a new conversation"
                aria-label="Start a new conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer"
                title="Minimize window"
                aria-label="Minimize window"
              >
                <Minus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer"
                title="Close assistant"
                aria-label="Close assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation History Drawer (Slide-down overlay) */}
          {showHistoryDrawer && (
            <div className="border-b border-stone-200 dark:border-stone-800 bg-stone-100/95 dark:bg-stone-950/95 p-3 space-y-2 animate-in slide-in-from-top-2 duration-150 max-h-56 overflow-y-auto">
              <div className="flex items-center justify-between text-[11px] font-semibold text-stone-600 dark:text-stone-300 px-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Conversation History ({conversations.filter(c => c.messages.length > 0).length})</span>
                </span>
                <button
                  type="button"
                  onClick={handleStartNewConversation}
                  className="text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
                >
                  + New Chat
                </button>
              </div>

              <div className="space-y-1">
                {conversations
                  .filter(c => c.messages.length > 0)
                  .map(conv => {
                    const isActive = conv.id === activeConversationId;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv)}
                        className={`p-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold'
                            : 'bg-white dark:bg-stone-900/80 hover:bg-stone-200/60 dark:hover:bg-stone-800 border border-stone-200/70 dark:border-stone-800 text-stone-800 dark:text-stone-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare className="w-3 h-3 text-stone-400 shrink-0" />
                          <span className="truncate">{conv.title || 'Conversation'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-stone-400 font-mono">
                            {conv.messages.length} msg{conv.messages.length === 1 ? '' : 's'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="p-1 rounded text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            title="Delete this conversation"
                            aria-label="Delete this conversation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Conversation Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text bg-white dark:bg-stone-900">
            {/* Welcome Screen when conversation is empty */}
            {messages.length === 0 && (
              <div className="h-full flex flex-col justify-between py-2 space-y-4 animate-in fade-in duration-200">
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Hey! I'm your EnderNote AI.
                    </h4>
                    <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                      I can help you find information in your voice notes, summarize recordings, organize your thoughts, and track action items.
                    </p>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400/90 pt-1">
                      What would you like to know?
                    </p>
                  </div>
                </div>

                {/* Clickable Suggestion Chips */}
                <div className="space-y-2 pt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-stone-500 dark:text-stone-400">
                    Suggested Queries
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {suggestionChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(chip)}
                        className="w-full text-left p-2.5 rounded-xl bg-stone-100/80 hover:bg-stone-200/80 dark:bg-stone-800/70 dark:hover:bg-stone-800 border border-stone-200/90 hover:border-amber-500/50 dark:border-stone-700/60 dark:hover:border-amber-500/40 text-xs text-stone-800 hover:text-stone-950 dark:text-stone-200 dark:hover:text-stone-100 transition-all flex items-center justify-between group cursor-pointer shadow-xs"
                      >
                        <span>{chip}</span>
                        <CornerDownLeft className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Message Stream */}
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150`}
                >
                  <div className="flex items-end gap-1.5 max-w-[92%]">
                    {!isUser && (
                      <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mb-1">
                        <Sparkles className="w-3 h-3" />
                      </div>
                    )}

                    <div
                      className={`p-3.5 rounded-2xl text-xs ${
                        isUser
                          ? 'bg-amber-600 text-white rounded-br-xs shadow-md shadow-amber-600/15'
                          : msg.isError
                          ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 rounded-bl-xs'
                          : 'bg-stone-100 dark:bg-stone-800/85 border border-stone-200 dark:border-stone-700/70 text-stone-900 dark:text-stone-100 rounded-bl-xs shadow-xs'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      ) : (
                        <MarkdownView content={msg.content} />
                      )}

                      {/* Verified Citations List if provided */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-stone-200 dark:border-stone-700/60 space-y-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400/90 flex items-center gap-1">
                            <Quote className="w-3 h-3" />
                            <span>Sources & Citations ({msg.citations.length})</span>
                          </div>

                          <div className="space-y-1.5">
                            {msg.citations.map((c, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-2 rounded-xl bg-white dark:bg-stone-900/90 border border-stone-200 dark:border-stone-700/60 text-[11px] space-y-1 shadow-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                                    {c.noteTitle}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handlePlayCitationAudio(c)}
                                      className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium cursor-pointer"
                                      title="Play source audio"
                                    >
                                      <Play className="w-2.5 h-2.5 fill-current" />
                                      <span>Play</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleCitationClick(c.noteId)}
                                      className="text-stone-400 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 cursor-pointer"
                                      title="Open note in EnderNote"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {c.quote && (
                                  <p className="text-[11px] italic text-stone-600 dark:text-stone-400 pl-2 border-l-2 border-amber-500/60 line-clamp-2">
                                    "{c.quote}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Retry button on error */}
                      {msg.isError && lastQuery && (
                        <button
                          type="button"
                          onClick={() => handleSendMessage(lastQuery)}
                          className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry query</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono px-1">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {/* Typing Indicator */}
            {isSubmitting && (
              <div className="flex items-end gap-1.5 max-w-[85%] animate-in fade-in duration-150">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mb-1">
                  <Sparkles className="w-3 h-3 animate-spin" />
                </div>
                <div className="p-3 rounded-2xl rounded-bl-xs bg-stone-100 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/60 flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-bounce" />
                  </div>
                  <span className="text-[11px] text-stone-600 dark:text-stone-400">
                    Searching notes & synthesizing...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Message Composer - fully theme responsive in both light & dark modes */}
          <div className="p-3 border-t border-stone-200/90 dark:border-stone-800/90 bg-stone-100/95 dark:bg-stone-950/90 backdrop-blur-md shrink-0">
            <div className="relative flex items-end rounded-2xl bg-stone-200/70 dark:bg-stone-900 border border-stone-300/80 dark:border-stone-800 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/30 transition-all p-1.5 shadow-xs">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your notes..."
                className="w-full pl-3 pr-10 py-1.5 text-xs bg-transparent text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:outline-hidden resize-none max-h-24 min-h-[32px] leading-relaxed"
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={isSubmitting || !inputText.trim()}
                className="absolute right-2 bottom-2 p-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 dark:hover:bg-amber-400 text-stone-950 disabled:opacity-30 disabled:hover:bg-amber-500 transition-all cursor-pointer shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500/50"
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5 text-stone-950" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-stone-500 dark:text-stone-400 px-1 pt-1.5">
              <span>Press <kbd className="font-mono text-stone-600 dark:text-stone-300 bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded text-[9px] border border-stone-300/70 dark:border-stone-700/70">Enter</kbd> to send, <kbd className="font-mono text-stone-600 dark:text-stone-300 bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded text-[9px] border border-stone-300/70 dark:border-stone-700/70">Shift+Enter</kbd> for new line</span>
              <span className="truncate ml-2">Grounded in local notes & audio</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
