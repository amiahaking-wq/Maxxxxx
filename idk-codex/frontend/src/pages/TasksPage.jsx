import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { getSessions, getTaskStatus } from '../services/api';

export default function TasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, running, completed, failed

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    try {
      const data = await getSessions(100, 0);
      const sessions = data.sessions || [];

      // Get task status for each session
      const tasksWithStatus = await Promise.all(
        sessions.map(async (session) => {
          try {
            const status = await getTaskStatus(session.sessionId);
            return {
              sessionId: session.sessionId,
              title: session.metadata?.title || `Session ${session.sessionId.slice(0, 8)}`,
              status: status.status || 'idle',
              phase: status.phase,
              progress: status.progress,
              error: status.error,
              startedAt: status.startedAt || session.createdAt,
              updatedAt: session.updatedAt
            };
          } catch (error) {
            return {
              sessionId: session.sessionId,
              title: session.metadata?.title || `Session ${session.sessionId.slice(0, 8)}`,
              status: 'idle',
              startedAt: session.createdAt,
              updatedAt: session.updatedAt
            };
          }
        })
      );

      setTasks(tasksWithStatus.filter(t => t.status !== 'idle' || filter === 'all'));
      setLoading(false);
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      running: {
        bg: 'bg-phase-executing/20',
        text: 'text-phase-executing',
        border: 'border-phase-executing/30',
        icon: Clock,
        label: 'Running'
      },
      completed: {
        bg: 'bg-success/20',
        text: 'text-success',
        border: 'border-success/30',
        icon: CheckCircle,
        label: 'Completed'
      },
      failed: {
        bg: 'bg-error/20',
        text: 'text-error',
        border: 'border-error/30',
        icon: XCircle,
        label: 'Failed'
      },
      idle: {
        bg: 'bg-text-secondary/20',
        text: 'text-text-secondary',
        border: 'border-text-secondary/30',
        icon: Clock,
        label: 'Idle'
      }
    };

    const badge = badges[status] || badges.idle;
    const Icon = badge.icon;

    return (
      <div className={`flex items-center gap-2 px-3 py-1 ${badge.bg} border ${badge.border} rounded-full`}>
        <Icon className={`w-4 h-4 ${badge.text}`} />
        <span className={`text-sm font-medium ${badge.text}`}>{badge.label}</span>
      </div>
    );
  };

  const getPhaseBadge = (phase) => {
    if (!phase) return null;

    const colors = {
      Planning: 'bg-phase-planning/20 text-phase-planning border-phase-planning/30',
      Executing: 'bg-phase-executing/20 text-phase-executing border-phase-executing/30',
      Testing: 'bg-phase-testing/20 text-phase-testing border-phase-testing/30',
      Deploying: 'bg-phase-deploying/20 text-phase-deploying border-phase-deploying/30'
    };

    const colorClass = colors[phase] || 'bg-text-secondary/20 text-text-secondary border-text-secondary/30';

    return (
      <span className={`px-2 py-1 text-xs font-medium border rounded ${colorClass}`}>
        {phase}
      </span>
    );
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Tasks</h1>
            <p className="text-text-secondary">Monitor agent task execution</p>
          </div>
          <button
            onClick={loadTasks}
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-accent transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { key: 'all', label: 'All Tasks' },
            { key: 'running', label: 'Running' },
            { key: 'completed', label: 'Completed' },
            { key: 'failed', label: 'Failed' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                filter === key
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-border text-text-secondary hover:border-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="text-center py-12 text-text-secondary">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-xl">
            <CheckSquare className="w-12 h-12 text-text-secondary mx-auto mb-3" />
            <p className="text-text-secondary">No {filter !== 'all' ? filter : ''} tasks found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div
                key={task.sessionId}
                onClick={() => navigate(`/chat/${task.sessionId}`)}
                className="p-4 bg-surface border border-border rounded-xl hover:border-accent transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-text-primary font-medium mb-1 truncate">{task.title}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(task.status)}
                      {task.phase && getPhaseBadge(task.phase)}
                    </div>
                  </div>
                  <span className="text-xs text-text-secondary whitespace-nowrap ml-4">
                    {new Date(task.updatedAt).toLocaleString()}
                  </span>
                </div>

                {/* Progress Bar */}
                {task.status === 'running' && task.progress !== undefined && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-secondary">Progress</span>
                      <span className="text-xs text-text-primary font-medium">{task.progress}%</span>
                    </div>
                    <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-500"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {task.error && (
                  <div className="p-3 bg-error/10 border border-error/30 rounded-lg">
                    <p className="text-sm text-error">{task.error}</p>
                  </div>
                )}

                {/* Timestamps */}
                <div className="flex items-center gap-4 text-xs text-text-secondary mt-3">
                  <span>Started: {new Date(task.startedAt).toLocaleString()}</span>
                  {task.status === 'running' && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                      <span>Active</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
