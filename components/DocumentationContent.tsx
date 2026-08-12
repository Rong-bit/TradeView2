import React from 'react';

function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text.includes('**')) return [text];

  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

interface Props {
  content: string;
}

const DocumentationContent: React.FC<Props> = ({ content }) => {
  const lines = content.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={i} className="text-base font-bold text-slate-800 mt-4 mb-1">
              {renderInlineMarkdown(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-lg font-bold text-slate-800 mt-5 mb-2">
              {renderInlineMarkdown(line.slice(3))}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={i} className="text-xl font-bold text-slate-800 mt-2 mb-3">
              {renderInlineMarkdown(line.slice(2))}
            </h2>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <blockquote
              key={i}
              className="my-2 border-0 border-none pl-0 ml-0 text-slate-600"
              style={{ border: 'none', marginInline: 0, paddingInline: 0 }}
            >
              {renderInlineMarkdown(line.slice(2))}
            </blockquote>
          );
        }
        if (/^[*-] /.test(line)) {
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-slate-400 shrink-0">•</span>
              <span>{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        if (line.trim() === '') {
          return <div key={i} className="h-2" aria-hidden />;
        }
        return (
          <p key={i} className="leading-relaxed">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
};

export default DocumentationContent;
