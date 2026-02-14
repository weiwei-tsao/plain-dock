import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlainDock',
  description: 'Minimalist dual-mode text sanitizer and note-taking app',
};

/**
 * App root layout that wraps provided page content in an HTML scaffold with a dark theme.
 *
 * @param children - React nodes to render as the page content inside the body element
 * @returns The root `<html>` element containing a `<body>` with dark styling and the given children
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}