/**
 * AuthScreen — login / signup / magic link
 * Shown when user is not authenticated.
 */
import { useState, useEffect } from 'react';
import { Mail, Lock, User, ArrowRight, Sparkles } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState('login'); // login | signup | magic
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'magic') {
        const r = await fetch(`${API_BASE}/api/auth/magic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Magic link failed');
        setSuccess(d.message || 'Magic link sent!');
      } else {
        const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
        const body = mode === 'login'
          ? { email, password }
          : { email, password, name };

        const r = await fetch(`${API_BASE}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Authentication failed');

        if (d.token) {
          // Login succeeded — store and notify
          localStorage.setItem('max_auth_token', d.token);
          localStorage.setItem('max_user', JSON.stringify(d.user));
          onSuccess && onSuccess(d.token, d.user);
        } else if (mode === 'signup') {
          setSuccess(d.message || 'Check your email to confirm your account');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4" style={{ minHeight: '100dvh', minHeight: '100vh', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold text-2xl mb-3">M</div>
          <h1 className="text-2xl font-semibold text-[#ececec]">MAX</h1>
          <p className="text-[#666] text-sm">Your autonomous AI agent</p>
        </div>

        {/* Card */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8">
          {/* Tab toggle */}
          {mode !== 'magic' && (
            <div className="flex gap-1 mb-6 bg-[#0f0f0f] rounded-lg p-1">
              <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'login' ? 'bg-[#FF6B35] text-white' : 'text-[#666] hover:text-[#999]'}`}>Sign In</button>
              <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-[#FF6B35] text-white' : 'text-[#666] hover:text-[#999]'}`}>Sign Up</button>
            </div>
          )}

          {mode === 'magic' && (
            <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-xs text-[#666] hover:text-[#999] mb-4">← Back to sign in</button>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] w-4 h-4" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full pl-10 pr-3 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/40" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] w-4 h-4" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full pl-10 pr-3 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/40" />
            </div>
            {mode !== 'magic' && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] w-4 h-4" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={mode === 'signup' ? 8 : 1} className="w-full pl-10 pr-3 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/40" />
              </div>
            )}

            {error && <div className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">{error}</div>}
            {success && <div className="text-xs text-green-400 bg-green-950/30 border border-green-900 rounded-lg px-3 py-2">{success}</div>}

            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#FF6B35] hover:bg-[#e55a24] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Magic Link')}
              {!loading && <ArrowRight size={14} />}
            </button>
          </form>

          {mode !== 'magic' && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[#2a2a2a]" />
                <span className="text-[10px] text-[#555]">or</span>
                <div className="flex-1 h-px bg-[#2a2a2a]" />
              </div>
              <button onClick={() => { setMode('magic'); setError(''); setSuccess(''); }} className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#2a2a2a] hover:bg-[#212121] text-[#999] rounded-lg text-sm font-medium transition-colors">
                <Sparkles size={14} /> Send Magic Link
              </button>
            </>
          )}
        </div>

        <p className="text-center text-[10px] text-[#444] mt-4">By continuing you agree to use MAX responsibly.</p>
      </div>
    </div>
  );
}
