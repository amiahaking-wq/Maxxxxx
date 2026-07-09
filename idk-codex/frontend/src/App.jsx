/**
 * Main Application Component
 * Router for MAX Dashboard with portable.dev design
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
          {/* New MAX Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatListPage />} />
          <Route path="/chat/:sessionId" element={<ChatDetailPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
          <Route path="/repo" element={<RepoPage />} />
          <Route path="/tasks" element={<TasksPage />} />

          {/* Legacy Routes */}
          <Route path="/simple" element={<SimpleChat />} />
          <Route path="/max-legacy" element={<MAXDashboard />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Bottom Navigation for Mobile */}
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
