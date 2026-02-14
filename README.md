# PlainDock

A minimalist dual-mode text sanitizer and note-taking application. Notes can operate in **Plain Text** or **Rich Text** mode, with a 3-layer HTML sanitization pipeline that cleans pasted content for safe, consistent formatting.

## Features

- **Dual-mode editing** — switch between plain text and rich text (Tiptap) per note
- **3-layer sanitization** — security stripping, tag normalization, and structure downgrade on paste
- **Auto-save** — 1-second debounced saves with sequential request queue
- **Pin & search** — pin important notes to the top, search by title or content
- **Copy options** — copy as plain text or rich HTML to clipboard
- **Local storage** — all data persisted in the browser, no server required

## Getting Started

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Start the dev server:
   ```
   npm run dev
   ```
   The app runs at `http://localhost:3000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Tech Stack

- React 19 + TypeScript
- Vite
- Tiptap (rich text editor)
- Tailwind CSS (CDN)
- Lucide React (icons)
