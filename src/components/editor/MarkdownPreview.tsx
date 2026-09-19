'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown/render-html';
import MarkdownOutline from './MarkdownOutline';
import { restorePreviewScroll } from './preview-scroll';

interface MarkdownPreviewProps {
  content: string;
  initialScrollTop: number;
  onScrollPositionChange: (scrollTop: number) => void;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  initialScrollTop,
  onScrollPositionChange,
}) => {
  const { html, headings } = useMemo(() => renderMarkdown(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(initialScrollTop);
  const reportRef = useRef(onScrollPositionChange);
  reportRef.current = onScrollPositionChange;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return restorePreviewScroll(container, offsetRef.current, (top) => {
      offsetRef.current = top;
      reportRef.current(top);
    });
  }, [html]);

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-[var(--md-canvas)]">
      <MarkdownOutline headings={headings} containerRef={containerRef} />
      <div
        ref={containerRef}
        data-testid="markdown-preview-scroll"
        tabIndex={0}
        aria-label="Markdown preview"
        className="min-w-0 flex-1 overflow-auto"
      >
        <article
          className="md-preview p-6 md:px-10 lg:px-20"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};

export default MarkdownPreview;
