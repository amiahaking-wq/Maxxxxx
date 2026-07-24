import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  FileCode,
  Terminal,
  Play,
  Square,
  Settings,
  GitBranch,
  Save,
  FolderOpen,
  Trash2,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react';

const CommandPalette = ({ isOpen, onClose, onCommandExecute }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = [
    {
      id: 'run-agent',
      label: 'Run Agent',
      description: 'Start the MAX agent',
      icon: <Play size={16} />,
      action: 'run-agent',
      shortcut: 'Ctrl+R'
    },
    {
      id: 'stop-agent',
      label: 'Stop Agent',
      description: 'Stop the running agent',
      icon: <Square size={16} />,
      action: 'stop-agent',
      shortcut: 'Ctrl+.'
    },
    {
      id: 'open-terminal',
      label: 'Open Terminal',
      description: 'Switch to terminal view',
      icon: <Terminal size={16} />,
      action: 'open-terminal',
      shortcut: 'Ctrl+`'
    },
    {
      id: 'open-file',
      label: 'Open File',
      description: 'Open a file in the editor',
      icon: <FileCode size={16} />,
      action: 'open-file',
      shortcut: 'Ctrl+O'
    },
    {
      id: 'save-file',
      label: 'Save File',
      description: 'Save the current file',
      icon: <Save size={16} />,
      action: 'save-file',
      shortcut: 'Ctrl+S'
    },
    {
      id: 'save-all',
      label: 'Save All',
      description: 'Save all open files',
      icon: <Save size={16} />,
      action: 'save-all',
      shortcut: 'Ctrl+Shift+S'
    },
    {
      id: 'open-folder',
      label: 'Open Folder',
      description: 'Open a folder in the explorer',
      icon: <FolderOpen size={16} />,
      action: 'open-folder'
    },
    {
      id: 'git-status',
      label: 'Git: Show Status',
      description: 'Show git status',
      icon: <GitBranch size={16} />,
      action: 'git-status'
    },
    {
      id: 'git-commit',
      label: 'Git: Commit',
      description: 'Commit changes',
      icon: <GitBranch size={16} />,
      action: 'git-commit'
    },
    {
      id: 'clear-terminal',
      label: 'Clear Terminal',
      description: 'Clear the terminal output',
      icon: <Trash2 size={16} />,
      action: 'clear-terminal'
    },
    {
      id: 'reload-window',
      label: 'Reload Window',
      description: 'Reload the entire application',
      icon: <RefreshCw size={16} />,
      action: 'reload-window',
      shortcut: 'Ctrl+R'
    },
    {
      id: 'settings',
      label: 'Open Settings',
      description: 'Open user settings',
      icon: <Settings size={16} />,
      action: 'settings',
      shortcut: 'Ctrl+,'
    },
    {
      id: 'export-session',
      label: 'Export Session',
      description: 'Export current session data',
      icon: <Download size={16} />,
      action: 'export-session'
    },
    {
      id: 'import-session',
      label: 'Import Session',
      description: 'Import a session from file',
      icon: <Upload size={16} />,
      action: 'import-session'
    },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev =>
        prev < filteredCommands.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const executeCommand = (command) => {
    if (onCommandExecute) {
      onCommandExecute(command.action);
    }
    onClose();
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-header">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="command-palette-results">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              No commands found
            </div>
          ) : (
            filteredCommands.map((command, index) => (
              <div
                key={command.id}
                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => executeCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="command-icon">{command.icon}</div>
                <div className="command-content">
                  <div className="command-label">{command.label}</div>
                  <div className="command-description">{command.description}</div>
                </div>
                {command.shortcut && (
                  <div className="command-shortcut">{command.shortcut}</div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <span className="footer-hint">↑↓ to navigate</span>
          <span className="footer-hint">↵ to select</span>
          <span className="footer-hint">esc to close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
