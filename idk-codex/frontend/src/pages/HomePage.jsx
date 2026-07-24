import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GitBranch, MessageSquare, Clock } from 'lucide-react';
import { getSessions, getConfig, createSession } from '../services/api';

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [recentChats, setRecentChats] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessionsData, configData] = await Promise.all([
        getSessions(5, 0),
        getConfig()
      ]);
      setRecentChats(sessionsData.sessions || []);
      setConfig(configData);
    } catch (error) {
      console.error('Failed to load home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const session = await createSession('web_user');
      navigate(`/chat/${session.sessionId}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/chat?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-text-primary mb-2">MAX AI Agent</h1>
          <p className="text-text-secondary">Multi-Agent eXecution System</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-12">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What would you like to build today?"
              className="w-full pl-12 pr-4 py-4 bg-surface border border-border rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent transition-all"
            />
          </div>
        </form>

        {/* Current Repo */}
        {config && (
          <div className="mb-8 p-6 bg-surface border border-border rounded-xl max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="w-5 h-5 text-accent" />
                <div>
                  <p className="text-sm text-text-secondary">Current Repository</p>
                  <p className="text-text-primary font-medium">{config.repoUrl || 'No repo configured'}</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/repo')}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Continue Recent Chats */}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Continue where you left off
            </h2>
            <button
              onClick={() => navigate('/chat')}
              className="text-accent hover:underline text-sm"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-text-secondary">Loading...</div>
          ) : recentChats.length === 0 ? (
            <div className="text-center py-12 bg-surface border border-border rounded-xl">
              <MessageSquare className="w-12 h-12 text-text-secondary mx-auto mb-3" />
              <p className="text-text-secondary mb-4">No recent chats</p>
              <button
                onClick={handleNewChat}
                className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all"
              >
                Start New Chat
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentChats.map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => navigate(`/chat/${session.sessionId}`)}
                  className="w-full p-4 bg-surface border border-border rounded-xl hover:border-accent transition-all text-left group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-4 h-4 text-accent" />
                        <p className="text-text-primary font-medium group-hover:text-accent transition-colors">
                          {session.metadata?.title || `Session ${session.sessionId.slice(0, 8)}`}
                        </p>
                      </div>
                      <p className="text-sm text-text-secondary line-clamp-2">
                        {session.metadata?.lastMessage || 'No messages yet'}
                      </p>
                    </div>
                    <span className="text-xs text-text-secondary whitespace-nowrap ml-4">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="max-w-2xl mx-auto mt-8 grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/runtime')}
            className="p-4 bg-surface border border-border rounded-xl hover:border-accent transition-all text-left"
          >
            <h3 className="text-text-primary font-medium mb-1">Runtime Status</h3>
            <p className="text-sm text-text-secondary">View system resources</p>
          </button>
          <button
            onClick={() => navigate('/tasks')}
            className="p-4 bg-surface border border-border rounded-xl hover:border-accent transition-all text-left"
          >
            <h3 className="text-text-primary font-medium mb-1">Tasks</h3>
            <p className="text-sm text-text-secondary">View active tasks</p>
          </button>
        </div>
      </div>
    </div>
  );
}
