
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Note, NoteMode, SaveState } from './types';
import { noteService } from './services/noteService';
import Sidebar from './components/Sidebar';
import EditorCanvas from './components/EditorCanvas';
import Login from './components/Login';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('plaindock_token');
    if (token) setIsAuthenticated(true);
  }, []);

  const loadNotes = useCallback(async () => {
    const data = await noteService.list();
    setNotes(data);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotes();
    }
  }, [isAuthenticated, loadNotes]);

  const handleCreateNote = async () => {
    const newNote = await noteService.create();
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
  };

  const handleDeleteNote = async (id: string) => {
    await noteService.delete(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  const handleUpdateNoteLocally = (updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
  };

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  return (
    <div className="flex h-screen bg-black text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar 
        notes={notes} 
        activeNoteId={activeNoteId}
        onSelectNote={setActiveNoteId}
        onCreateNote={handleCreateNote}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-900/30">
        {activeNote ? (
          <EditorCanvas 
            note={activeNote} 
            onUpdate={handleUpdateNoteLocally}
            onDelete={() => handleDeleteNote(activeNote.id)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <h1 className="text-2xl font-light mb-2">PlainDock</h1>
              <p className="text-sm">Select or create a note to begin</p>
              <button 
                onClick={handleCreateNote}
                className="mt-6 px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Create New Note
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
