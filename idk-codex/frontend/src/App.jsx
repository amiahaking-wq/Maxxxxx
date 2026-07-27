/**
 * Main Application Component
 *
 * Default route (/) is the new mobile-first ChatPage (consumer UI).
 * Developer dashboard is at /dev.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ChatPage from './pages/ChatPage';
import HomePage from './pages/HomePage';
import ChatListPage from './pages/ChatListPage';
import ChatDetailPage from './pages/ChatDetailPage';
import RuntimePage from './pages/RuntimePage';
import RepoPage from './pages/RepoPage';
import TasksPage from './pages/TasksPage';
import BottomNav from './components/BottomNav';
import SimpleChat from './components/SimpleChat';
import MAXDashboard from './components/MAX/MAXDashboard';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Routes>
          {/* Consumer-first routes (default) */}
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:sessionId" element={<ChatPage />} />

          {/* Developer dashboard routes */}
          <Route path="/dev" element={<HomePage />} />
          <Route path="/dev/chat" element={<ChatListPage />} />
          <Route path="/dev/chat/:sessionId" element={<ChatDetailPage />} />
          <Route path="/dev/runtime" element={<RuntimePage />} />
          <Route path="/dev/repo" element={<RepoPage />} />
          <Route path="/dev/tasks" element={<TasksPage />} />

          {/* Legacy */}
          <Route path="/simple" element={<SimpleChat />} />
          <Route path="/max-legacy" element={<MAXDashboard />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <ConditionalBottomNav />
      </div>
    </BrowserRouter>
  );
}

function ConditionalBottomNav() {
  const location = useLocation();
  if (location.pathname.startsWith('/dev')) return <BottomNav />;
  return null;
}

export default App;
