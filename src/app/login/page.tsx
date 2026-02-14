'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Render the login page with a password input that authenticates against the server and navigates to the app on success.
 *
 * Manages local password, error, and loading state and presents inline feedback for authentication failures.
 *
 * @returns The React element for the password-based login page.
 */
export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length === 0) {
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">PlainDock</h1>
          <p className="mt-1 text-sm text-zinc-500">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoFocus
            className={`w-full rounded-xl border bg-zinc-800 px-4 py-3 text-white placeholder-zinc-600 transition-all focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
              error ? 'border-red-500' : 'border-zinc-700'
            }`}
          />
          {error && (
            <p className="mt-2 text-xs text-red-400">Invalid password. Please try again.</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}