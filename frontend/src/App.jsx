/**
 * App entry — checks auth, shows AuthScreen or ChatPage
 */
import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import HomePage from './pages/HomePage';
import ChatListPage from './pages/ChatListPage';
import ChatDetailPage from './pages/ChatDetailPage';
import RuntimePage from './pages/RuntimePage';
import RepoPage from './pages/RepoPage';
import TasksPage from './pages/TasksPage';
import BottomNav from './components/BottomNav';
import AuthScreen from './components/AuthScreen';
import { useViewportHeight } from './hooks/useViewportHeight';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

function App() {
  useViewportHeight();
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('max_auth_token'));
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('max_user') || 'null'); } catch { return null; }
  });
  const [authChecked, setAuthChecked] = useState(false);

  // Validate existing token on mount
  useEffect(() => {
    if (authToken) {
      fetch(`${API_BASE}/api/auth/validate`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
        .then(r => r.json())
        .then(data => {
          if (!data.valid) {
            localStorage.removeItem('max_auth_token');
            localStorage.removeItem('max_user');
            setAuthToken(null);
            setCurrentUser(null);
          }
        })
        .catch(() => { /* network error — keep token */ })
        .finally(() => setAuthChecked(true));
    } else {
      // No token — check if Supabase auth is configured
      fetch(`${API_BASE}/api/auth/validate`)
        .then(r => r.json())
        .then(data => {
          // If valid (dev mode without Supabase), proceed
          if (data.valid) {
            setCurrentUser(data.user);
          }
        })
        .catch(() => {})
        .finally(() => setAuthChecked(true));
    }
  }, []);

  const handleAuthSuccess = (token, user) => {
    localStorage.setItem('max_auth_token', token);
    localStorage.setItem('max_user', JSON.stringify(user));
    setAuthToken(token);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('max_auth_token');
    localStorage.removeItem('max_user');
    setAuthToken(null);
    setCurrentUser(null);
  };

  // Show nothing while checking auth
  if (!authChecked) {
    return <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center"><div className="w-12 h-12 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold text-xl animate-pulse">M</div></div>;
  }

  // Show auth screen if not logged in (and auth is configured)
  if (!authToken || !currentUser) {
    // Check if we need auth (Supabase configured) — if not, skip login
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  // Show main app
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Routes>
          <Route path="/" element={<ChatPage authToken={authToken} user={currentUser} onLogout={handleLogout} />} />
          <Route path="/chat" element={<ChatPage authToken={authToken} user={currentUser} onLogout={handleLogout} />} />
          <Route path="/chat/:sessionId" element={<ChatPage authToken={authToken} user={currentUser} onLogout={handleLogout} />} />
          <Route path="/dev" element={<HomePage />} />
          <Route path="/dev/chat" element={<ChatListPage />} />
          <Route path="/dev/chat/:sessionId" element={<ChatDetailPage />} />
          <Route path="/dev/runtime" element={<RuntimePage />} />
          <Route path="/dev/repo" element={<RepoPage />} />
          <Route path="/dev/tasks" element={<TasksPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ConditionalBottomNav />
      </div>
    </BrowserRouter>
  );
}

function ConditionalBottomNav() {
  const loc = useLocation();
  return loc.pathname.startsWith('/dev') ? <BottomNav /> : null;
}

export default App;
