import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
  Cpu,
  Zap,
  Clock
} from 'lucide-react';

const StatusBar = ({
  status = 'idle',
  phase,
  tokenUsage,
  errorCount,
  warningCount,
  activeFile,
  cursorPosition,
  uptime
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader size={14} className="spin" />;
      case 'success':
        return <CheckCircle size={14} />;
      case 'error':
        return <XCircle size={14} />;
      case 'warning':
        return <AlertCircle size={14} />;
      default:
        return <Cpu size={14} />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Agent Running';
      case 'success':
        return 'Ready';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      default:
        return 'Idle';
    }
  };

  const formatTokens = (tokens) => {
    if (!tokens) return '0';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className={`statusbar-item status-indicator status-${status}`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </div>

        {phase && (
          <div className="statusbar-item">
            <Zap size={14} />
            <span>{phase}</span>
          </div>
        )}

        {errorCount > 0 && (
          <div className="statusbar-item error">
            <XCircle size={14} />
            <span>{errorCount}</span>
          </div>
        )}

        {warningCount > 0 && (
          <div className="statusbar-item warning">
            <AlertCircle size={14} />
            <span>{warningCount}</span>
          </div>
        )}
      </div>

      <div className="statusbar-center">
        {activeFile && (
          <div className="statusbar-item">
            <span className="file-path">{activeFile}</span>
          </div>
        )}
      </div>

      <div className="statusbar-right">
        {uptime > 0 && (
          <div className="statusbar-item">
            <Clock size={14} />
            <span>{formatUptime(uptime)}</span>
          </div>
        )}

        {tokenUsage && (
          <div className="statusbar-item">
            <Cpu size={14} />
            <span>{formatTokens(tokenUsage.used)} / {formatTokens(tokenUsage.limit)}</span>
          </div>
        )}

        {cursorPosition && (
          <div className="statusbar-item">
            <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          </div>
        )}

        <div className="statusbar-item">
          <span>UTF-8</span>
        </div>

        <div className="statusbar-item">
          <span>JavaScript</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
