import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Note, NoteMode, SaveState, NotePayload } from '../types';
import { noteService } from '../services/noteService';
import { sanitizeHTML, wrapPlainText, getNoteTextContent } from '../lib/sanitizer';
import { 
  Pin, Trash2, Copy, FileCode, Type, AlertCircle, CheckCircle2, 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  Code, List, ListOrdered, Heading1, Heading2, Quote, 
  Eraser
} from 'lucide-react';

interface EditorCanvasProps {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ note, onUpdate, onDelete }) => {
  const [saveState, setSaveState] = useState<SaveState>('IDLE');
  const [localTitle, setLocalTitle] = useState(note.title);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestQueue = useRef<Promise<any>>(Promise.resolve());

  // Tiptap setup
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px]',
      },
      handlePaste: (view, event) => {
        if (note.mode === NoteMode.PLAIN) return false;
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');
        
        if (html && html.trim() !== '') {
          const clean = sanitizeHTML(html);
          editor?.commands.insertContent(clean);
          return true;
        } else if (text) {
          const clean = wrapPlainText(text);
          editor?.commands.insertContent(clean);
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      if (note.mode === NoteMode.RICH) {
        triggerSave({ content: editor.getHTML() });
      }
    },
  });

  // Sync editor content when note changes from parent (e.g. switching notes)
  useEffect(() => {
    if (editor && note.id) {
      const currentContent = note.mode === NoteMode.RICH ? editor.getHTML() : editor.getText();
      if (note.content !== currentContent) {
        editor.commands.setContent(note.content, { emitUpdate: false });
      }
    }
    setLocalTitle(note.title);
    setSaveState('IDLE');
  }, [note.id, note.title, editor, note.content, note.mode]);

  const persistChange = useCallback((payload: NotePayload) => {
    setSaveState('SAVING');
    requestQueue.current = requestQueue.current.then(async () => {
      try {
        const updated = await noteService.update(note.id, payload);
        onUpdate(updated);
        setSaveState('SAVED');
        setTimeout(() => setSaveState('IDLE'), 2000);
      } catch (err) {
        setSaveState('FAILED');
      }
    });
  }, [note.id, onUpdate]);

  const triggerSave = useCallback((updates: Partial<NotePayload>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const content = updates.content ?? (note.mode === NoteMode.RICH ? editor?.getHTML() : editor?.getText()) ?? '';
      const payload: NotePayload = {
        title: updates.title ?? localTitle,
        content: content,
        textContent: getNoteTextContent(content),
        mode: updates.mode ?? note.mode,
        isPinned: updates.isPinned ?? note.isPinned
      };
      persistChange(payload);
    }, 1000);
  }, [localTitle, note.mode, note.isPinned, persistChange, editor]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalTitle(val);
    triggerSave({ title: val });
  };

  const handleTogglePin = () => {
    persistChange({
      content: note.content,
      textContent: note.textContent,
      mode: note.mode,
      isPinned: !note.isPinned
    });
  };

  const handleSwitchMode = () => {
    if (note.mode === NoteMode.RICH) {
      if (confirm('Switching to plain text will permanently remove formatting and save immediately. Continue?')) {
        const plainText = editor?.getText() || '';
        editor?.commands.setContent(plainText);
        persistChange({
          content: plainText,
          textContent: plainText,
          mode: NoteMode.PLAIN
        });
      }
    } else {
      const richHTML = wrapPlainText(editor?.getText() || '');
      editor?.commands.setContent(richHTML);
      persistChange({
        content: richHTML,
        textContent: getNoteTextContent(richHTML),
        mode: NoteMode.RICH
      });
    }
  };

  const copyToClipboard = async (isHTML: boolean = false) => {
    if (!editor) return;
    try {
      if (isHTML && note.mode === NoteMode.RICH) {
        const html = editor.getHTML();
        const text = editor.getText();
        const blobHTML = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([text], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': blobHTML, 'text/plain': blobText })
        ]);
        alert('Rich text copied!');
      } else {
        await navigator.clipboard.writeText(editor.getText());
        alert('Plain text copied!');
      }
    } catch (err) {
      await navigator.clipboard.writeText(editor.getText());
      alert('Copying rich text failed, plain text copied instead.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Editor Header */}
      <header className="px-6 py-4 flex items-center justify-between gap-4 border-b border-zinc-800 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <input 
          type="text"
          value={localTitle}
          onChange={handleTitleChange}
          placeholder="Note Title"
          className="bg-transparent text-xl font-medium focus:outline-none w-full placeholder-zinc-800 text-zinc-100"
        />
        
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center mr-2">
            {saveState === 'SAVING' && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse mr-2" />}
            {saveState === 'SAVED' && <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />}
            {saveState === 'FAILED' && <AlertCircle className="w-4 h-4 text-red-500 mr-2" />}
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">
              {saveState === 'IDLE' ? '' : saveState}
            </span>
          </div>

          <button 
            onClick={handleTogglePin}
            className={`p-2 rounded-lg transition-all ${note.isPinned ? 'text-indigo-400 bg-indigo-400/10' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}
            title="Pin note"
          >
            <Pin className={`w-4 h-4 ${note.isPinned ? 'fill-current' : ''}`} />
          </button>
          
          <button 
            onClick={handleSwitchMode}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${
              note.mode === NoteMode.RICH 
                ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500' 
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Switch Mode (Cmd+Shift+P)"
          >
            {note.mode === NoteMode.RICH ? <FileCode className="w-4 h-4" /> : <Type className="w-4 h-4" />}
            {note.mode}
          </button>

          <div className="w-px h-6 bg-zinc-800 mx-1" />

          <button 
            onClick={() => copyToClipboard(false)}
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="Copy Plain"
          >
            <Copy className="w-4 h-4" />
          </button>
          
          {note.mode === NoteMode.RICH && (
            <button 
              onClick={() => copyToClipboard(true)}
              className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all flex items-center gap-1.5"
              title="Copy Rich (HTML)"
            >
              <Copy className="w-4 h-4" />
              <span className="text-[9px] font-black border border-current px-1 rounded-sm">HTML</span>
            </button>
          )}

          <button 
            onClick={onDelete}
            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Formatting Toolbar for Rich Mode */}
      {editor && note.mode === NoteMode.RICH && (
        <div className="flex flex-wrap items-center gap-1 p-2 bg-zinc-900/50 border-b border-zinc-800">
          <button onClick={() => (editor.chain().focus() as any).toggleBold().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('bold') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Bold className="w-4 h-4" /></button>
          <button onClick={() => (editor.chain().focus() as any).toggleItalic().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('italic') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Italic className="w-4 h-4" /></button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('underline') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><UnderlineIcon className="w-4 h-4" /></button>
          <button onClick={() => (editor.chain().focus() as any).toggleStrike().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('strike') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Strikethrough className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button onClick={() => (editor.chain().focus() as any).toggleHeading({ level: 1 }).run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('heading', { level: 1 }) ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Heading1 className="w-4 h-4" /></button>
          <button onClick={() => (editor.chain().focus() as any).toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('heading', { level: 2 }) ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Heading2 className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button onClick={() => (editor.chain().focus() as any).toggleBulletList().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('bulletList') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><List className="w-4 h-4" /></button>
          <button onClick={() => (editor.chain().focus() as any).toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('orderedList') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><ListOrdered className="w-4 h-4" /></button>
          <div className="w-px h-4 bg-zinc-800 mx-1" />
          <button onClick={() => (editor.chain().focus() as any).toggleCodeBlock().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('codeBlock') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Code className="w-4 h-4" /></button>
          <button onClick={() => (editor.chain().focus() as any).toggleBlockquote().run()} className={`p-1.5 rounded hover:bg-zinc-800 ${editor.isActive('blockquote') ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-400'}`}><Quote className="w-4 h-4" /></button>
          <button onClick={() => editor.chain().focus().unsetAllMarks().run()} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400" title="Clear Formatting"><Eraser className="w-4 h-4" /></button>
        </div>
      )}

      {/* Editor Body */}
      <div className={`flex-1 overflow-auto p-6 md:px-20 lg:px-40 transition-colors ${note.mode === NoteMode.PLAIN ? 'font-mono' : 'font-sans'}`}>
        {note.mode === NoteMode.RICH ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <textarea
            value={editor?.getText() || ''}
            onChange={(e) => {
              const val = e.target.value;
              editor?.commands.setContent(val);
              triggerSave({ content: val });
            }}
            placeholder="Start typing plain text..."
            className="w-full h-full bg-transparent resize-none focus:outline-none text-zinc-400 leading-relaxed font-mono text-sm"
          />
        )}
      </div>

      {/* Footer Info */}
      <footer className="px-6 py-2 border-t border-zinc-900 bg-black flex justify-between items-center text-[10px] text-zinc-600 uppercase tracking-widest font-bold">
        <div className="flex items-center gap-4">
          <span>Synced: {new Date(note.updatedAt).toLocaleTimeString()}</span>
          <span className="text-zinc-800">•</span>
          <span>{note.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${note.mode === NoteMode.RICH ? 'text-indigo-500' : 'text-zinc-500'}`}>{note.mode}</span>
          <span className="text-zinc-800">•</span>
          <span>{getNoteTextContent(note.content).length} chars</span>
        </div>
      </footer>
    </div>
  );
};

export default EditorCanvas;