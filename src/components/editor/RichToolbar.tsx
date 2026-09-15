// src/components/editor/RichToolbar.tsx
'use client';

import React from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Quote,
} from 'lucide-react';

interface RichToolbarProps {
  onToggleInlineMark: (marker: string) => void;
  onToggleLinePrefix: (prefix: string) => void;
  onToggleCodeBlock: () => void;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="rounded p-2.5 text-zinc-400 hover:bg-zinc-800 md:p-1.5"
  >
    {children}
  </button>
);

const Divider = () => <div className="mx-1 h-4 w-px bg-zinc-800" />;

const RichToolbar: React.FC<RichToolbarProps> = ({
  onToggleInlineMark,
  onToggleLinePrefix,
  onToggleCodeBlock,
}) => {
  return (
    <div className="overflow-x-auto border-b border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-nowrap items-center gap-1 p-2 md:flex-wrap">
        <ToolbarButton onClick={() => onToggleInlineMark('**')} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleInlineMark('_')} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleInlineMark('~~')} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => onToggleLinePrefix('# ')} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('## ')} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => onToggleLinePrefix('- ')} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('1. ')} title="Ordered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={onToggleCodeBlock} title="Code Block">
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('> ')} title="Blockquote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
};

export default RichToolbar;
