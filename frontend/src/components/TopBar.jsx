import React, { useState } from 'react';
import { Play, Square, GitBranch, Settings, HelpCircle, User } from 'lucide-react';

const TopBar = ({
  onRunAgent,
  onStopAgent,
  isAgentRunning,
  currentPhase,
  sessionId,
  onSettingsClick,
  onHelpClick
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="logo">
          <span className="logo-text">MAX Agent Studio</span>
          <span className="logo-version">v1.0</span>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-project-info">
          <GitBranch size={16} />
          <span className="project-name">main</span>
        </div>

        {sessionId && (
          <>
            <div className="topbar-divider" />
            <div className="session-info">
              <span className="session-label">Session:</span>
              <span className="session-id">{sessionId.substring(0, 8)}</span>
            </div>
          </>
        )}
      </div>

      <div className="topbar-center">
        {currentPhase && (
          <div className={`phase-indicator ${isAgentRunning ? 'running' : ''}`}>
            <div className="phase-dot" />
            <span className="phase-name">{currentPhase}</span>
          </div>
        )}
      </div>

      <div className="topbar-right">
        <button
          className={`topbar-btn ${isAgentRunning ? 'stop' : 'run'}`}
          onClick={isAgentRunning ? onStopAgent : onRunAgent}
          title={isAgentRunning ? 'Stop Agent' : 'Run Agent'}
        >
          {isAgentRunning ? (
            <>
              <Square size={16} />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Play size={16} />
              <span>Run</span>
            </>
          )}
        </button>

        <div className="topbar-divider" />

        <button
          className="topbar-icon-btn"
          onClick={onSettingsClick}
          title="Settings"
        >
          <Settings size={18} />
        </button>

        <button
          className="topbar-icon-btn"
          onClick={onHelpClick}
          title="Help"
        >
          <HelpCircle size={18} />
        </button>

        <div className="topbar-divider" />

        <div className="user-menu">
          <button
            className="topbar-icon-btn user-btn"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <User size={18} />
          </button>

          {showUserMenu && (
            <div className="user-dropdown">
              <div className="user-dropdown-item">Profile</div>
              <div className="user-dropdown-item">Preferences</div>
              <div className="user-dropdown-divider" />
              <div className="user-dropdown-item">Sign Out</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopBar;
