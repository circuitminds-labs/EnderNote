import React, { useState, useMemo } from 'react';
import { 
  Network, 
  ExternalLink, 
  Tag, 
  FolderKanban, 
  Clock, 
  Sparkles,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Note } from '../../types';

export const KnowledgeGraphView: React.FC = () => {
  const { notes, projects, setSelectedNoteId, setActiveView } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id || null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const activeNotes = useMemo(() => notes.filter(n => !n.isArchived), [notes]);

  // Selected note guaranteed to stay in sync with latest notes state
  const selectedNote = useMemo(() => {
    return activeNotes.find(n => n.id === selectedId) || activeNotes[0] || null;
  }, [activeNotes, selectedId]);

  // Generic tags to exclude from establishing false graph edges
  const genericTags = useMemo(() => new Set(['note', 'notes', 'voice-note', 'audio', 'recording', 'voice-memo']), []);

  // Compute graph nodes with deterministic, stable circular positions
  const graphData = useMemo(() => {
    const width = 640;
    const height = 480;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.36;

    const count = activeNotes.length;
    const nodes = activeNotes.map((note, i) => {
      const angle = (i / Math.max(1, count)) * 2 * Math.PI;
      const x = Math.round((centerX + radius * Math.cos(angle)) * 10) / 10;
      const y = Math.round((centerY + radius * Math.sin(angle)) * 10) / 10;
      const project = projects.find(p => p.id === note.projectId);

      return {
        ...note,
        x,
        y,
        color: project?.color || '#a8a29e', // stone-400
      };
    });

    // Compute links: direct relatedNoteIds + shared meaningful tags + shared project
    const links: { source: typeof nodes[0]; target: typeof nodes[0]; strength: number; isRelated: boolean; sharedLabel: string }[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const isDirect = (a.relatedNoteIds || []).includes(b.id) || (b.relatedNoteIds || []).includes(a.id);
        const meaningfulSharedTags = (a.tags || []).filter(t => !genericTags.has(t.toLowerCase()) && (b.tags || []).includes(t));
        const sameProject = a.projectId && b.projectId && a.projectId === b.projectId;

        if (isDirect || meaningfulSharedTags.length > 0 || sameProject) {
          let sharedLabel = '';
          if (meaningfulSharedTags.length > 0) {
            sharedLabel = `#${meaningfulSharedTags[0]}`;
          } else if (sameProject) {
            sharedLabel = 'Same Project';
          } else {
            sharedLabel = 'Thematic Link';
          }

          links.push({
            source: a,
            target: b,
            strength: isDirect ? 3 : meaningfulSharedTags.length > 1 ? 2 : 1,
            isRelated: isDirect || meaningfulSharedTags.length > 0,
            sharedLabel,
          });
        }
      }
    }

    return { nodes, links, width, height };
  }, [activeNotes, projects, genericTags]);

  const handleOpenNote = (id: string) => {
    setSelectedNoteId(id);
    setActiveView('note_detail');
  };

  const hoveredNode = useMemo(() => {
    return hoveredNodeId ? graphData.nodes.find(n => n.id === hoveredNodeId) : null;
  }, [hoveredNodeId, graphData.nodes]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Related Notes & Knowledge Graph
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
            {graphData.nodes.length} nodes · {graphData.links.length} connections
          </span>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
          Contextual relationships, shared topics, and semantic links generated from your actual note contents
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Canvas */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs relative overflow-hidden flex flex-col items-center justify-center min-h-[480px]">
          <svg
            viewBox={`0 0 ${graphData.width} ${graphData.height}`}
            className="w-full h-auto max-h-[480px] select-none pointer-events-auto"
          >
            {/* Draw links */}
            {graphData.links.map((link, idx) => {
              const activeFocusId = hoveredNodeId || selectedNote?.id;
              const isHighlighted =
                activeFocusId &&
                (link.source.id === activeFocusId || link.target.id === activeFocusId);

              return (
                <line
                  key={`link-${idx}`}
                  x1={link.source.x}
                  y1={link.source.y}
                  x2={link.target.x}
                  y2={link.target.y}
                  stroke={isHighlighted ? '#f59e0b' : '#78716c'}
                  strokeWidth={isHighlighted ? 2.5 : 1}
                  strokeDasharray={link.strength === 1 ? '4 3' : undefined}
                  strokeOpacity={isHighlighted ? 0.95 : 0.25}
                  style={{ transition: 'stroke 180ms ease, stroke-width 180ms ease, stroke-opacity 180ms ease' }}
                />
              );
            })}

            {/* Draw nodes with rock-solid, jitter-free coordinates & CSS scale animations */}
            {graphData.nodes.map(node => {
              const isSelected = selectedNote?.id === node.id;
              const isHovered = hoveredNodeId === node.id;
              const activeRef = hoveredNode || selectedNote;
              const isConnected =
                activeRef &&
                (activeRef.id === node.id ||
                  (activeRef.relatedNoteIds || []).includes(node.id) ||
                  (node.relatedNoteIds || []).includes(activeRef.id) ||
                  (node.tags || []).some(t => !genericTags.has(t.toLowerCase()) && (activeRef.tags || []).includes(t)));

              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer"
                >
                  {/* Static permanent transparent hit-testing circle (prevents rapid mouseenter/mouseleave oscillation) */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={28}
                    fill="transparent"
                    className="pointer-events-auto"
                  />

                  {/* Outer pulse aura: permanently in DOM to prevent mount/unmount thrashing */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={22}
                    fill={node.color}
                    fillOpacity={0.25}
                    style={{
                      opacity: isSelected || isHovered ? 1 : 0,
                      transformOrigin: `${node.x}px ${node.y}px`,
                      transform: isSelected ? 'scale(1.2)' : isHovered ? 'scale(1.1)' : 'scale(0.8)',
                      transition: 'opacity 180ms ease, transform 180ms ease',
                    }}
                    pointerEvents="none"
                  />

                  {/* Stable topic node circle: fixed radius, smooth CSS transform origin scale */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={13}
                    fill={node.color}
                    stroke={isSelected ? '#ffffff' : isHovered ? '#fbbf24' : isConnected ? '#f59e0b' : '#1c1917'}
                    strokeWidth={isSelected ? 3 : isHovered ? 2.5 : isConnected ? 2 : 1.5}
                    style={{
                      transformOrigin: `${node.x}px ${node.y}px`,
                      transform: isSelected ? 'scale(1.25)' : isHovered ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 180ms ease, stroke 180ms ease, stroke-width 180ms ease',
                    }}
                    pointerEvents="none"
                  />

                  {/* Note title label with static vertical coordinate */}
                  <text
                    x={node.x}
                    y={node.y + 26}
                    textAnchor="middle"
                    pointerEvents="none"
                    className={`text-[10px] select-none font-semibold ${
                      isSelected
                        ? 'fill-amber-500 font-bold'
                        : isHovered
                        ? 'fill-amber-400'
                        : 'fill-stone-700 dark:fill-stone-300'
                    }`}
                    style={{ transition: 'fill 180ms ease' }}
                  >
                    {node.title.length > 20 ? `${node.title.slice(0, 18)}...` : node.title}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Canvas overlay instructions */}
          <div className="absolute bottom-3 left-4 text-[10px] text-stone-400 font-mono flex items-center gap-2">
            <span>Hover or click any node to inspect semantic connections and note summaries</span>
          </div>
        </div>

        {/* Selected Node Details Drawer */}
        <div className="space-y-4">
          {selectedNote ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Selected Note</span>
                </span>

                <button
                  onClick={() => handleOpenNote(selectedNote.id)}
                  className="text-xs font-semibold text-stone-900 dark:text-stone-100 hover:text-amber-500 flex items-center gap-1 transition-colors"
                >
                  <span>Open Full Note</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                  {selectedNote.title}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 font-mono mt-1 capitalize">
                  <span>{selectedNote.noteType}</span>
                  <span>·</span>
                  <span>{new Date(selectedNote.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Context-specific summary or sensible fallback */}
              <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-800/40 p-3 rounded-xl border border-stone-100 dark:border-stone-800">
                {selectedNote.summary ? (
                  <p className="line-clamp-5">{selectedNote.summary}</p>
                ) : selectedNote.fullTranscript ? (
                  <p className="line-clamp-5 italic text-stone-500">"{selectedNote.fullTranscript}"</p>
                ) : (
                  <p className="text-stone-400 italic">No summary recorded for this note yet.</p>
                )}
              </div>

              {/* Tags */}
              {selectedNote.tags && selectedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedNote.tags.map(t => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Connected notes list with context-specific descriptions */}
              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  Connected & Related Notes
                </div>
                {(() => {
                  const connected = activeNotes
                    .filter(
                      n =>
                        n.id !== selectedNote.id &&
                        ((selectedNote.relatedNoteIds || []).includes(n.id) ||
                          (n.relatedNoteIds || []).includes(selectedNote.id) ||
                          (n.tags || []).some(t => !genericTags.has(t.toLowerCase()) && (selectedNote.tags || []).includes(t)))
                    )
                    .map(cn => {
                      const shared = (cn.tags || []).filter(t => !genericTags.has(t.toLowerCase()) && (selectedNote.tags || []).includes(t));
                      const isDirect = (selectedNote.relatedNoteIds || []).includes(cn.id);
                      let relationshipReason = '';
                      if (shared.length > 0) {
                        relationshipReason = `Shared topic: #${shared.join(', #')}`;
                      } else if (isDirect) {
                        relationshipReason = `Thematic link`;
                      } else {
                        relationshipReason = `Related context`;
                      }

                      // Context-specific summary snippet from the actual note's content
                      const cleanSummary = (cn.summary || cn.fullTranscript || '').replace(/^#+\s+/gm, '').trim();
                      const snippet = cleanSummary
                        ? (cleanSummary.length > 90 ? `${cleanSummary.slice(0, 85)}...` : cleanSummary)
                        : 'No detailed summary recorded for this note.';

                      return { cn, relationshipReason, snippet };
                    })
                    .slice(0, 4);

                  if (connected.length === 0) {
                    return (
                      <div className="py-3 text-center text-xs text-stone-400 italic">
                        No connected notes found for this topic yet.
                      </div>
                    );
                  }

                  return connected.map(({ cn, relationshipReason, snippet }) => (
                    <button
                      key={cn.id}
                      onClick={() => setSelectedId(cn.id)}
                      className="w-full text-left p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/40 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs transition-colors space-y-1 border border-stone-100 dark:border-stone-800/60 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-stone-800 dark:text-stone-200 truncate pr-2">
                          {cn.title}
                        </span>
                        <ArrowRight className="w-3 h-3 text-stone-400 shrink-0" />
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                        {relationshipReason}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2">
                        {snippet}
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-stone-400 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
              Select a node to inspect relationships.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
