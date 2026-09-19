'use client';

import React, { type RefObject } from 'react';
import type { Heading } from '@/lib/markdown/render-html';

interface MarkdownOutlineProps {
  headings: Heading[];
  containerRef: RefObject<HTMLDivElement | null>;
}

const MarkdownOutline: React.FC<MarkdownOutlineProps> = ({ headings, containerRef }) => {
  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="Markdown outline"
      className="hidden w-48 shrink-0 overflow-auto border-r border-zinc-800 p-3 md:block"
    >
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li key={heading.id}>
            <button
              type="button"
              className="w-full rounded px-2 py-1 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-indigo-400"
              style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
              onClick={() => {
                const container = containerRef.current;
                container?.dispatchEvent(new Event('preview-navigation'));
                if (!container) return;
                const selector = `#${CSS.escape(heading.id)}`;
                const target =
                  container.querySelector<HTMLElement>(selector) ??
                  Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(
                    (element) => element.id === heading.id,
                  );
                target?.scrollIntoView({ block: 'start' });
              }}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default MarkdownOutline;
