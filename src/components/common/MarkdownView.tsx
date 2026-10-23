import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  // Parse lines into structured tokens
  const lines = (content || '').split('\n');

  const renderInline = (text: string) => {
    // Process bold, italics, inline code, strikethrough
    // Match inline code first: `code`
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    // Regex to find bold **text**, inline code `code`, strikethrough ~~text~~, italic *text*
    const inlineRegex = /(\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\*[^*]+\*)/g;

    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = inlineRegex.exec(remaining)) !== null) {
      const start = match.index;
      if (start > lastIndex) {
        parts.push(remaining.substring(lastIndex, start));
      }

      const matchText = match[0];
      if (matchText.startsWith('**') && matchText.endsWith('**')) {
        parts.push(
          <strong key={keyIdx++} className="font-semibold text-stone-900 dark:text-stone-100">
            {matchText.slice(2, -2)}
          </strong>
        );
      } else if (matchText.startsWith('`') && matchText.endsWith('`')) {
        parts.push(
          <code
            key={keyIdx++}
            className="px-1.5 py-0.5 rounded-md bg-stone-200/80 dark:bg-stone-800/90 text-amber-700 dark:text-amber-300 font-mono text-[11px] border border-stone-300/80 dark:border-stone-700/60"
          >
            {matchText.slice(1, -1)}
          </code>
        );
      } else if (matchText.startsWith('~~') && matchText.endsWith('~~')) {
        parts.push(
          <span key={keyIdx++} className="line-through text-stone-400 dark:text-stone-500">
            {matchText.slice(2, -2)}
          </span>
        );
      } else if (matchText.startsWith('*') && matchText.endsWith('*')) {
        parts.push(
          <em key={keyIdx++} className="italic text-stone-700 dark:text-stone-300">
            {matchText.slice(1, -1)}
          </em>
        );
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < remaining.length) {
      parts.push(remaining.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={elements.length} className="space-y-1.5 my-2 pl-4 list-disc marker:text-amber-500 dark:marker:text-amber-400">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="text-stone-700 dark:text-stone-300 leading-relaxed text-xs">
                {item}
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={elements.length} className="space-y-1.5 my-2 pl-4 list-decimal marker:text-amber-500 dark:marker:text-amber-400">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="text-stone-700 dark:text-stone-300 leading-relaxed text-xs">
                {item}
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block detection
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre
            key={elements.length}
            className="p-3 my-2.5 rounded-xl bg-stone-100 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-[11px] font-mono text-stone-800 dark:text-stone-200 overflow-x-auto"
          >
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={elements.length} className="my-3 border-stone-200 dark:border-stone-800" />);
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      flushList();
      elements.push(
        <h4 key={elements.length} className="text-xs font-semibold text-stone-800 dark:text-stone-200 mt-2.5 mb-1">
          {renderInline(line.slice(5))}
        </h4>
      );
      continue;
    }

    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={elements.length} className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 mt-3 mb-1.5 flex items-center gap-1.5">
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }

    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={elements.length} className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-3.5 mb-1.5">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={elements.length} className="text-base font-bold text-stone-900 dark:text-stone-100 mt-4 mb-2">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote
          key={elements.length}
          className="border-l-2 border-amber-500/80 pl-3 py-1 my-2 text-xs italic text-stone-700 dark:text-stone-300 bg-amber-500/10 rounded-r-lg"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Unordered List (- or *)
    const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(renderInline(ulMatch[2]));
      continue;
    }

    // Ordered List (1. ...)
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(renderInline(olMatch[2]));
      continue;
    }

    // Plain Paragraph
    flushList();
    if (line.trim().length > 0) {
      elements.push(
        <p key={elements.length} className="my-1.5 text-xs text-stone-800 dark:text-stone-200 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};
