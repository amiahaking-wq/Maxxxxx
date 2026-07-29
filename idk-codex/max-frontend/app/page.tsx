'use client';
import { useEffect, useState } from 'react';
import { AuthScreen } from '@/components/AuthScreen';
import { MainApp } from '@/components/MainApp';

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem('max_token');
    const u = localStorage.getItem('max_user');
    if (t && u) {
      setToken(t);
      try { setUser(JSON.parse(u)); } catch {}
    }
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="w-12 h-12 bg-[#FF6B35] rounded-2xl flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-xl">M</span>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthScreen onSuccess={(t, u) => {
      localStorage.setItem('max_token', t);
      localStorage.setItem('max_user', JSON.stringify(u));
      setToken(t);
      setUser(u);
    }} />;
  }

  return <MainApp token={token} user={user} onLogout={() => {
    localStorage.removeItem('max_token');
    localStorage.removeItem('max_user');
    setToken(null);
    setUser(null);
  }} />;
}
