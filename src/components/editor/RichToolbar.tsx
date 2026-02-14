'use client';

import React from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, List, ListOrdered, Heading1, Heading2, Quote, Eraser,
} from 'lucide-react';

interface RichToolbarProps {
  editor: Editor;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, active, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded hover:bg-zinc-800 ${active ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}
  >
    {children}
  </button>
);

const Divider = () => <div className="w-px h-4 bg-zinc-800 mx-1" />;

const RichToolbar: React.FC<RichToolbarProps> = ({ editor }) => {
  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-900/50 border-b border-zinc-800">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
        <Code className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().run()} active={false} title="Clear Formatting">
        <Eraser className="w-4 h-4" />
      </ToolbarButton>
    </div>
  );
};

export default RichToolbar;
