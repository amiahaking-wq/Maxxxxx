import React, { useState, useEffect } from 'react';
import MonacoEditor from './MonacoEditor';
import TerminalPanel from './TerminalPanel';
import TabBar from './TabBar';
import { Code, Terminal, FileText } from 'lucide-react';

const EditorPanel = ({
  activeFile,
  onFileSave,
  sessionId,
  onCursorChange
}) => {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [activeView, setActiveView] = useState('editor'); // 'editor' or 'terminal'
  const [editorContent, setEditorContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (activeFile) {
      // Check if file is already open
      const existingTab = tabs.find(t => t.path === activeFile.path);

      if (existingTab) {
        setActiveTab(existingTab.id);
        setEditorContent(existingTab.content);
      } else {
        // Create new tab
        const newTab = {
          id: `tab-${Date.now()}`,
          path: activeFile.path,
          content: activeFile.content || '',
          isDirty: false,
        };
        setTabs([...tabs, newTab]);
        setActiveTab(newTab.id);
        setEditorContent(newTab.content);
      }
      setIsDirty(false);
    }
  }, [activeFile]);

  const handleEditorChange = (value) => {
    setEditorContent(value);
    setIsDirty(true);

    // Update tab content
    setTabs(tabs.map(tab =>
      tab.id === activeTab
        ? { ...tab, content: value, isDirty: true }
        : tab
    ));
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setEditorContent(tab.content);
      setIsDirty(tab.isDirty);
    }
  };

  const handleTabClose = (tabId) => {
    const tab = tabs.find(t => t.id === tabId);

    // Warn if unsaved changes
    if (tab && tab.isDirty) {
      if (!window.confirm(`Close ${tab.path}? You have unsaved changes.`)) {
        return;
      }
    }

    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    // Switch to another tab if closing active tab
    if (tabId === activeTab && newTabs.length > 0) {
      const newActiveTab = newTabs[newTabs.length - 1];
      setActiveTab(newActiveTab.id);
      setEditorContent(newActiveTab.content);
      setIsDirty(newActiveTab.isDirty);
    } else if (newTabs.length === 0) {
      setActiveTab(null);
      setEditorContent('');
      setIsDirty(false);
    }
  };

  const handleSave = () => {
    if (activeTab && isDirty) {
      const tab = tabs.find(t => t.id === activeTab);
      if (tab && onFileSave) {
        onFileSave(tab.path, editorContent);
        setIsDirty(false);
        setTabs(tabs.map(t =>
          t.id === activeTab
            ? { ...t, isDirty: false }
            : t
        ));
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isDirty, editorContent]);

  const currentTab = tabs.find(t => t.id === activeTab);

  return (
    <div className="editor-panel">
      <div className="editor-panel-header">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabClick={handleTabClick}
          onTabClose={handleTabClose}
        />

        <div className="view-switcher">
          <button
            className={`view-btn ${activeView === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveView('editor')}
            title="Code Editor"
          >
            <Code size={16} />
            <span>Editor</span>
          </button>
          <button
            className={`view-btn ${activeView === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveView('terminal')}
            title="Terminal"
          >
            <Terminal size={16} />
            <span>Terminal</span>
          </button>
        </div>
      </div>

      <div className="editor-panel-content">
        {activeView === 'editor' ? (
          currentTab ? (
            <MonacoEditor
              value={editorContent}
              onChange={handleEditorChange}
              path={currentTab.path}
              onCursorChange={onCursorChange}
            />
          ) : (
            <div className="editor-empty-state">
              <FileText size={64} className="empty-icon" />
              <h3>No File Open</h3>
              <p>Select a file from the explorer to start editing</p>
            </div>
          )
        ) : (
          <TerminalPanel sessionId={sessionId} />
        )}
      </div>

      {isDirty && activeView === 'editor' && (
        <div className="editor-unsaved-indicator">
          Unsaved changes • Press Cmd+S to save
        </div>
      )}
    </div>
  );
};

export default EditorPanel;
