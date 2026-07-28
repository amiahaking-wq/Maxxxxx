/**
 * CodeStudio - Main IDE Container
 * Portable.dev-style web IDE for MAX Agent
 * 3-Panel Layout: Files | Editor/Terminal | Chat
 */

import { useState, useEffect } from 'react';
import Split from 'react-split';
import FileExplorer from './FileExplorer';
import EditorPanel from './EditorPanel';
import ChatPanel from './ChatPanel';
import StatusBar from './StatusBar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { useWebSocket } from '../hooks/useWebSocket';
import { useHotkeys } from 'react-hotkeys-hook';
import * as api from '../services/api';
import './CodeStudio.css';

export default function CodeStudio() {
  // Session state
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);

  // File state
  const [fileTree, setFileTree] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // UI state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [messages, setMessages] = useState([]);
  const [agentRuns, setAgentRuns] = useState([]);
  const [currentPhase, setCurrentPhase] = useState(null);

  // WebSocket connection
  const { connected, progress, message } = useWebSocket(sessionId);

  // Keyboard shortcuts
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    setShowCommandPalette(true);
  });

  useHotkeys('mod+s', (e) => {
    e.preventDefault();
    saveCurrentFile();
  });

  useHotkeys('mod+p', (e) => {
    e.preventDefault();
    setShowCommandPalette(true);
  });

  useHotkeys('mod+b', (e) => {
    e.preventDefault();
    // Toggle file explorer
  });

  // Load initial data
  useEffect(() => {
    loadSessions();
    loadFileTree();
  }, []);

  // Load session data when session changes
  useEffect(() => {
    if (sessionId) {
      loadSessionData(sessionId);
    }
  }, [sessionId]);

  // Handle WebSocket messages
  useEffect(() => {
    if (message && message.sessionId === sessionId) {
      setMessages(prev => [...prev, message]);
    }
  }, [message, sessionId]);

  // Handle progress updates
  useEffect(() => {
    if (progress && progress.sessionId === sessionId) {
      setCurrentPhase(progress.phase);

      // Add to terminal output
      if (progress.output) {
        setTerminalOutput(prev => [...prev, {
          timestamp: new Date().toISOString(),
          type: progress.type || 'info',
          content: progress.output
        }]);
      }

      loadAgentRuns(sessionId);
    }
  }, [progress, sessionId]);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions(10, 0);
      setSessions(data.sessions || []);

      if (data.sessions && data.sessions.length > 0) {
        setSessionId(data.sessions[0].id);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSessionData = async (sid) => {
    try {
      const data = await api.getMessages(sid);
      setMessages(data.messages || []);

      const runsData = await api.getAgentRuns(sid);
      setAgentRuns(runsData.runs || []);
    } catch (error) {
      console.error('Failed to load session data:', error);
    }
  };

  const loadAgentRuns = async (sid) => {
    try {
      const data = await api.getAgentRuns(sid);
      setAgentRuns(data.runs || []);
    } catch (error) {
      console.error('Failed to load agent runs:', error);
    }
  };

  const loadFileTree = async () => {
    try {
      const data = await api.getFileTree(5);
      setFileTree(data.tree);
    } catch (error) {
      console.error('Failed to load file tree:', error);
      setFileTree({ name: 'root', type: 'directory', children: [] });
    }
  };

  const createNewSession = async () => {
    try {
      const userId = 'web_user_' + Date.now();
      const data = await api.createSession(userId);
      setSessionId(data.session.id);
      setSessions(prev => [data.session, ...prev]);
      setMessages([]);
      setTerminalOutput([]);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleFileOpen = async (file) => {
    try {
      // Check if file is already open
      const existingIndex = openFiles.findIndex(f => f.path === file.path);

      if (existingIndex >= 0) {
        setActiveFileIndex(existingIndex);
        return;
      }

      // Load file content
      const data = await api.getFileContent(file.path);

      const newFile = {
        path: file.path,
        name: file.name,
        content: data.content,
        language: detectLanguage(file.name),
        modified: false
      };

      setOpenFiles(prev => [...prev, newFile]);
      setActiveFileIndex(openFiles.length);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleFileClose = (index) => {
    setOpenFiles(prev => prev.filter((_, i) => i !== index));

    if (activeFileIndex >= index && activeFileIndex > 0) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  const handleFileContentChange = (content) => {
    setOpenFiles(prev => prev.map((file, i) =>
      i === activeFileIndex
        ? { ...file, content, modified: true }
        : file
    ));
  };

  const saveCurrentFile = async () => {
    if (openFiles.length === 0) return;

    const file = openFiles[activeFileIndex];
    if (!file.modified) return;

    try {
      await api.updateFileContent(file.path, file.content);

      setOpenFiles(prev => prev.map((f, i) =>
        i === activeFileIndex
          ? { ...f, modified: false }
          : f
      ));

      addTerminalOutput('info', `✓ Saved ${file.name}`);
    } catch (error) {
      console.error('Failed to save file:', error);
      addTerminalOutput('error', `✗ Failed to save ${file.name}: ${error.message}`);
    }
  };

  const handleSendMessage = async (content) => {
    if (!sessionId) {
      await createNewSession();
    }

    try {
      // Add user message
      const userMsg = {
        id: Date.now(),
        role: 'user',
        content,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMsg]);

      // Send to agent
      await api.triggerAgentTask(sessionId, content, 'web_user');

      addTerminalOutput('info', `🚀 Task started: ${content.substring(0, 50)}...`);
    } catch (error) {
      console.error('Failed to send message:', error);
      addTerminalOutput('error', `✗ Failed to start task: ${error.message}`);
    }
  };

  const addTerminalOutput = (type, content) => {
    setTerminalOutput(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      content
    }]);
  };

  const detectLanguage = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'json': 'json',
      'md': 'markdown',
      'css': 'css',
      'html': 'html',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'shell',
      'bash': 'shell'
    };
    return languageMap[ext] || 'plaintext';
  };

  const currentFile = openFiles[activeFileIndex] || null;

  return (
    <div className="code-studio">
      <TopBar
        connected={connected}
        sessionId={sessionId}
        sessions={sessions}
        onSessionChange={setSessionId}
        onNewSession={createNewSession}
      />

      <div className="code-studio-body">
        <Split
          className="code-studio-split"
          sizes={[20, 55, 25]}
          minSize={[200, 400, 300]}
          gutterSize={4}
          snapOffset={30}
        >
          {/* Left Panel: File Explorer */}
          <FileExplorer
            tree={fileTree}
            onFileOpen={handleFileOpen}
            onRefresh={loadFileTree}
          />

          {/* Center Panel: Editor + Terminal */}
          <EditorPanel
            files={openFiles}
            activeFileIndex={activeFileIndex}
            currentFile={currentFile}
            terminalOutput={terminalOutput}
            onFileSelect={setActiveFileIndex}
            onFileClose={handleFileClose}
            onContentChange={handleFileContentChange}
            onClearTerminal={() => setTerminalOutput([])}
          />

          {/* Right Panel: Chat */}
          <ChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            isConnected={connected}
          />
        </Split>
      </div>

      <StatusBar
        currentPhase={currentPhase}
        agentRuns={agentRuns}
        fileCount={fileTree?.children?.length || 0}
        connected={connected}
      />

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onCommand={(cmd) => {
            // Handle command
            setShowCommandPalette(false);
          }}
        />
      )}
    </div>
  );
}
