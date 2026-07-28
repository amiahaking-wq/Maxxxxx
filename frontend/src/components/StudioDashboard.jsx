/**
 * MAX Studio Dashboard - 3-Column Layout
 *
 * Main interface for monitoring and controlling the MAX agent system.
 *
 * Layout:
 * ┌────────────┬─────────────────────┬────────────┐
 * │ Left Panel │   Center Panel      │ Right Panel│
 * │            │                     │            │
 * │ - Files    │ - Phase Progress    │ - Controls │
 * │ - Status   │ - Terminal Logs     │ - Providers│
 * │ - Queue    │ - Code Diff         │ - Costs    │
 * └────────────┴─────────────────────┴────────────┘
 *
 * @component
 */

import React, { useState, useEffect } from 'react';
import { FileExplorer } from './LeftPanel/FileExplorer';
import { APIKeyStatus } from './LeftPanel/APIKeyStatus';
import { TaskQueue } from './LeftPanel/TaskQueue';
import { PhaseVisualization } from './CenterPanel/PhaseVisualization';
import { LiveTerminal } from './CenterPanel/LiveTerminal';
import { CodeDiffViewer } from './CenterPanel/CodeDiffViewer';
import { ProviderSelector } from './RightPanel/ProviderSelector';
import { CognitiveMonitor } from './RightPanel/CognitiveMonitor';
import { CostTracker } from './RightPanel/CostTracker';
import { useWebSocket } from '../hooks/useWebSocket';
import { getProviderStatus, getCostBreakdown } from '../services/api';
import './StudioDashboard.css';

export function StudioDashboard() {
  // WebSocket connection for real-time updates
  const { messages, agentStatus, isConnected } = useWebSocket();

  // State management
  const [currentPhase, setCurrentPhase] = useState(null);
  const [phaseStatuses, setPhaseStatuses] = useState({
    PLAN: 'pending',
    EXECUTE: 'pending',
    TEST: 'pending',
    DEPLOY: 'pending',
    MONITOR: 'pending'
  });
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [providerStatus, setProviderStatus] = useState({});
  const [costData, setCostData] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('auto');
  const [fileTree, setFileTree] = useState([]);
  const [codeDiff, setCodeDiff] = useState(null);

  // Load provider status on mount
  useEffect(() => {
    loadProviderStatus();
    loadCostData();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadProviderStatus();
      loadCostData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Process WebSocket messages
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];

    if (latestMessage.type === 'progress') {
      // Update phase status
      setCurrentPhase(latestMessage.data.phase);

      setPhaseStatuses(prev => ({
        ...prev,
        [latestMessage.data.phase]: latestMessage.data.status
      }));
    } else if (latestMessage.type === 'log') {
      // Add to terminal logs
      setTerminalLogs(prev => [...prev, latestMessage.data]);
    } else if (latestMessage.type === 'diff') {
      // Update code diff
      setCodeDiff(latestMessage.data);
    }
  }, [messages]);

  // Load provider status
  const loadProviderStatus = async () => {
    try {
      const status = await getProviderStatus();
      setProviderStatus(status);
    } catch (error) {
      console.error('Failed to load provider status:', error);
    }
  };

  // Load cost data
  const loadCostData = async () => {
    try {
      const costs = await getCostBreakdown();
      setCostData(costs);
    } catch (error) {
      console.error('Failed to load cost data:', error);
    }
  };

  return (
    <div className="studio-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="dashboard-title">
            <span className="title-icon">🤖</span>
            MAX Studio
          </h1>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
            <span className="status-text">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="header-right">
          <button className="header-button" onClick={loadProviderStatus}>
            🔄 Refresh
          </button>
          <button className="header-button">
            ⚙️ Settings
          </button>
        </div>
      </header>

      {/* Main 3-Column Layout */}
      <div className="dashboard-body">
        {/* LEFT PANEL: Files & Status */}
        <aside className="left-panel">
          <div className="panel-section">
            <h2 className="panel-title">API Keys</h2>
            <APIKeyStatus providers={providerStatus} />
          </div>

          <div className="panel-section">
            <h2 className="panel-title">File Explorer</h2>
            <FileExplorer files={fileTree} />
          </div>

          <div className="panel-section">
            <h2 className="panel-title">Task Queue</h2>
            <TaskQueue />
          </div>
        </aside>

        {/* CENTER PANEL: Workspace */}
        <main className="center-panel">
          <div className="panel-section phase-section">
            <h2 className="panel-title">Agent Progress</h2>
            <PhaseVisualization
              currentPhase={currentPhase}
              phaseStatuses={phaseStatuses}
            />
          </div>

          <div className="panel-section terminal-section">
            <h2 className="panel-title">Live Terminal</h2>
            <LiveTerminal logs={terminalLogs} />
          </div>

          {codeDiff && (
            <div className="panel-section diff-section">
              <h2 className="panel-title">Code Changes</h2>
              <CodeDiffViewer diff={codeDiff} />
            </div>
          )}
        </main>

        {/* RIGHT PANEL: Controls */}
        <aside className="right-panel">
          <div className="panel-section">
            <h2 className="panel-title">Provider Control</h2>
            <ProviderSelector
              selected={selectedProvider}
              onChange={setSelectedProvider}
              providers={providerStatus}
            />
          </div>

          <div className="panel-section">
            <h2 className="panel-title">Cognitive Monitor</h2>
            <CognitiveMonitor agentStatus={agentStatus} />
          </div>

          <div className="panel-section">
            <h2 className="panel-title">Cost Tracker</h2>
            <CostTracker data={costData} />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default StudioDashboard;
