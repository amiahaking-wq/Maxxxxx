import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MessageSquare, Archive, Plus, Trash2 } from 'lucide-react';
import { getSessions, createSession, archiveSession, deleteSession } from '../services/api';

export default function ChatListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, [activeTab]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getSessions(50, 0);
      const allSessions = data.sessions || [];

      // Filter based on active tab
      let filtered = allSessions;
      if (activeTab === 'active') {
        filtered = allSessions.filter(s => !s.isArchived);
      } else if (activeTab === 'archived') {
        filtered = allSessions.filter(s => s.isArchived);
      } else if (activeTab === 'routines') {
        filtered = allSessions.filter(s => s.metadata?.isRoutine);
      }

      setSessions(filtered);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const session = await createSession('web_user');
      navigate(`/dev/chat/${session.sessionId}`);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleArchive = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await archiveSession(sessionId);
      loadSessions();
    } catch (error) {
      console.error('Failed to archive session:', error);
    }
  };

  const handleDelete = async (sessionId, e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        await deleteSession(sessionId);
        loadSessions();
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchQuery) return true;
    const title = session.metadata?.title || '';
    const lastMessage = session.metadata?.lastMessage || '';
    return title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-text-primary">Chats</h1>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'active'
                ? 'text-accent border-accent'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab('routines')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'routines'
                ? 'text-accent border-accent'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            Routines
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'archived'
                ? 'text-accent border-accent'
                : 'text-text-secondary border-transparent hover:text-text-primary'
            }`}
          >
            Archived
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent transition-all"
          />
        </div>

        {/* Chat List */}
        {loading ? (
          <div className="text-center py-12 text-text-secondary">Loading chats...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-xl">
            <MessageSquare className="w-12 h-12 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary mb-4">
              {searchQuery ? 'No chats found' : `No ${activeTab} chats`}
            </p>
            {!searchQuery && activeTab === 'active' && (
              <button
                onClick={handleNewChat}
                className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all"
              >
                Start New Chat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => navigate(`/dev/chat/${session.sessionId}`)}
                className="p-4 bg-surface border border-border rounded-xl hover:border-accent transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-accent flex-shrink-0" />
                      <h3 className="text-text-primary font-medium group-hover:text-accent transition-colors truncate">
                        {session.metadata?.title || `Session ${session.sessionId.slice(0, 8)}`}
                      </h3>
                    </div>
                    <p className="text-sm text-text-secondary line-clamp-2 mb-2">
                      {session.metadata?.lastMessage || 'No messages yet'}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
                      {session.metadata?.messageCount && (
                        <span>{session.metadata.messageCount} messages</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {!session.isArchived && (
                      <button
                        onClick={(e) => handleArchive(session.sessionId, e)}
                        className="p-2 hover:bg-background rounded-lg transition-colors"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4 text-text-secondary" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(session.sessionId, e)}
                      className="p-2 hover:bg-background rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
