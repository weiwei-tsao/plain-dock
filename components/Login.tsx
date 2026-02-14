
import React, { useState } from 'react';
import { Lock, Layout } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In PRD, this checks APP_PASSWORD env. For this demo, any password works or we just simulate.
    if (password.length > 0) {
      localStorage.setItem('plaindock_token', 'mock_jwt_token');
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 shadow-2xl">
            <Layout className="w-12 h-12 text-indigo-500" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-center mb-2 text-white">PlainDock</h1>
        <p className="text-zinc-500 text-center mb-8 text-sm">Self-Hosted Dual-Mode Text Sanitizer</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input 
              type="password"
              placeholder="Enter App Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(false);
              }}
              className={`w-full bg-zinc-900 border ${error ? 'border-red-500' : 'border-zinc-800'} rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all`}
            />
          </div>
          
          <button 
            type="submit"
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-colors shadow-lg active:scale-95 transform"
          >
            Access Dock
          </button>
        </form>

        <p className="mt-8 text-center text-zinc-700 text-[10px] uppercase tracking-[0.2em]">
          v1.7 implementation • secure context required
        </p>
      </div>
    </div>
  );
};

export default Login;
