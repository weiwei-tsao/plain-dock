import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlainDock',
  description: 'Minimalist dual-mode text sanitizer and note-taking app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className="h-full overflow-hidden overscroll-none bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
