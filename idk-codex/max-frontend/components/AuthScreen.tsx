'use client';
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://maxxxxx-production.up.railway.app';

function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

interface AuthScreenProps {
  onSuccess: (token: string, user: any) => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const endpoint = mode === 'signup' ? apiUrl('/api/auth/signup')
                     : mode === 'magic' ? apiUrl('/api/auth/magic')
                     : apiUrl('/api/auth/login');

      const body = mode === 'signup' ? { email, password, name }
                 : mode === 'magic' ? { email }
                 : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (mode === 'magic') {
        setSuccess('Magic link sent! Check your email.');
        return;
      }

      onSuccess(data.session?.access_token || data.token, {
        id: data.user?.id,
        email: data.user?.email,
        name: data.user?.user_metadata?.name || data.user?.email?.split('@')[0] || 'User'
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] p-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full max-w-sm bg-[#1a1a1a] rounded-2xl p-8 border border-[#2a2a2a]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-[#FF6B35] rounded-2xl flex items-center justify-center mb-3">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-white">MAX</h1>
          <p className="text-[#888] text-sm mt-1">Your autonomous AI agent</p>
        </div>

        <div className="flex rounded-lg bg-[#111] p-1 mb-6">
          {[['login','Sign In'],['signup','Sign Up']].map(([m,l]) => (
            <button key={m} onClick={() => setMode(m as any)}
              className={`flex-1 py-2 text-sm rounded-md transition-all ${
                mode === m ? 'bg-[#FF6B35] text-white font-medium' : 'text-[#888] hover:text-white'
              }`}>{l}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" required
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#FF6B35] text-sm" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email address" required
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#FF6B35] text-sm" />
          {mode !== 'magic' && (
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" required minLength={6}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#FF6B35] text-sm" />
          )}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {success && <p className="text-green-400 text-sm text-center">{success}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-[#FF6B35] hover:bg-[#e05a28] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50 text-sm mt-2">
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Magic Link'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => setMode('magic')}
            className="text-[#888] hover:text-[#FF6B35] text-sm transition-colors">
            Sign in with magic link instead →
          </button>
        </div>
      </div>
    </div>
  );
}
