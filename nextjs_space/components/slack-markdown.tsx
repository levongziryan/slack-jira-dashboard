'use client';

import React from 'react';

// Render Slack mrkdwn: <url|label>, @names, :emoji: codes, *bold*, _italic_
export function SlackMarkdown({ text }: { text: string }) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  // Split on Slack link pattern <url|label> or <url>
  const regex = /(<[^>]+>|\*[^*]+\*|_[^_]+_|:[a-z0-9_+-]+:)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];

    if (token.startsWith('<') && token.endsWith('>')) {
      const inner = token.slice(1, -1);
      const pipeIdx = inner.indexOf('|');
      if (pipeIdx >= 0) {
        const url = inner.slice(0, pipeIdx);
        const label = inner.slice(pipeIdx + 1);
        if (url.startsWith('http')) {
          parts.push(
            <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
              {label}
            </a>
          );
        } else {
          parts.push(<span key={key++} className="font-semibold text-primary">@{label}</span>);
        }
      } else if (inner.startsWith('@') || inner.startsWith('!')) {
        parts.push(<span key={key++} className="font-semibold text-primary">{inner}</span>);
      } else if (inner.startsWith('http')) {
        const short = inner.length > 50 ? inner.slice(0, 47) + '...' : inner;
        parts.push(
          <a key={key++} href={inner} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
            {short}
          </a>
        );
      } else {
        parts.push(<span key={key++} className="font-semibold text-primary">@{inner}</span>);
      }
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<strong key={key++}>{token.slice(1, -1)}</strong>);
    } else if (token.startsWith('_') && token.endsWith('_')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith(':') && token.endsWith(':')) {
      // Emoji code — render as text with slight styling
      const emojiMap: Record<string, string> = {
        ':pray:': '🙏', ':eyes:': '👀', ':disappointed_relieved:': '😥',
        ':pray::skin-tone-2:': '🙏🏻', ':+1:': '👍', ':wave:': '👋',
        ':fire:': '🔥', ':rocket:': '🚀', ':white_check_mark:': '✅',
      };
      const emoji = emojiMap[token];
      parts.push(<span key={key++}>{emoji ?? token}</span>);
    }

    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}
