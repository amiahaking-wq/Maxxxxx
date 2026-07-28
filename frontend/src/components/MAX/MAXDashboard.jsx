/**
 * MAX Dashboard - Main 3-column layout
 *
 * Layout:
 * - Left: File tree + API key vault
 * - Center: Live execution stream with phase indicators + terminal output
 * - Right: Orchestration controls
 */

import React, { useState, useEffect } from 'react';
import { FileExplorer } from '../LeftPanel/FileExplorer';
import { APIKeyStatus } from '../LeftPanel/APIKeyStatus';
import MAXOrchestrator from './MAXOrchestrator';
import MAXStateVisualizer from './MAXStateVisualizer';
import MAXTerminal from './MAXTerminal';
import PhaseVisualization from '../CenterPanel/PhaseVisualization';
import './MAXDashboard.css';

export default function MAXDashboard() {
  const [activeTask, setActiveTask] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [taskStatus, setTaskStatus] = useState(null);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new WebSocket(
      `ws://${window.location.host}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'max:milestone:start':
          handleMilestoneStart(data);
          break;
        case 'max:milestone:complete':
          handleMilestoneComplete(data);
          break;
        case 'max:context:purged':
          handleContextPurged(data);
          break;
        case 'max:task:complete':
          handleTaskComplete(data);
          break;
        case 'max:task:failed':
          handleTaskFailed(data);
          break;
        default:
          break;
      }
    };

    return () => ws.close();
  }, []);

  const handleMilestoneStart = (data) => {
    setTerminalOutput(prev => [
      ...prev,
      {
        type: 'milestone-start',
        timestamp: Date.now(),
        message: `🚀 Starting: ${data.description}`,
        agentRole: data.agentRole
      }
    ]);

    // Update milestone status
    setMilestones(prev =>
      prev.map(m =>
        m.id === data.milestoneId
          ? { ...m, status: 'active' }
          : m
      )
    );
  };

  const handleMilestoneComplete = (data) => {
    setTerminalOutput(prev => [
      ...prev,
      {
        type: 'milestone-complete',
        timestamp: Date.now(),
        message: `✅ Completed: ${data.description}`,
        agentRole: data.agentRole
      }
    ]);

    setMilestones(prev =>
      prev.map(m =>
        m.id === data.milestoneId
          ? { ...m, status: 'completed' }
          : m
      )
    );
  };

  const handleContextPurged = (data) => {
    setTerminalOutput(prev => [
      ...prev,
      {
        type: 'context-purge',
        timestamp: Date.now(),
        message: `🧹 Purged ${data.tokensFreed} tokens from context`,
        milestoneId: data.milestoneId
      }
    ]);
  };

  const handleTaskComplete = (data) => {
    setTaskStatus('completed');
    setTerminalOutput(prev => [
      ...prev,
      {
        type: 'task-complete',
        timestamp: Date.now(),
        message: '🎉 Task completed successfully!',
        taskId: data.taskId
      }
    ]);
  };

  const handleTaskFailed = (data) => {
    setTaskStatus('failed');
    setTerminalOutput(prev => [
      ...prev,
      {
        type: 'task-failed',
        timestamp: Date.now(),
        message: `❌ Task failed: ${data.error}`,
        taskId: data.taskId
      }
    ]);
  };

  const handleTaskSubmit = async (taskDescription) => {
    try {
      const response = await fetch('/api/max/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: taskDescription,
          sessionId: 1, // TODO: Get from session context
          userId: 1 // TODO: Get from auth context
        })
      });

      const data = await response.json();

      if (data.success) {
        setActiveTask(data.taskId);
        setTaskStatus('planning');
        setTerminalOutput([{
          type: 'task-start',
          timestamp: Date.now(),
          message: `📋 Task submitted: ${taskDescription}`,
          taskId: data.taskId
        }]);

        // Fetch initial milestones
        fetchMilestones(data.taskId);
      }
    } catch (error) {
      console.error('Failed to submit task:', error);
    }
  };

  const fetchMilestones = async (taskId) => {
    try {
      const response = await fetch(`/api/max/milestones/${taskId}`);
      const data = await response.json();

      if (data.success) {
        setMilestones(data.milestones);
      }
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
    }
  };

  return (
    <div className="max-dashboard">
      {/* Left Panel */}
      <div className="max-left-panel">
        <div className="max-section">
          <h3>Project Files</h3>
          <FileExplorer />
        </div>
        <div className="max-section">
          <h3>API Keys</h3>
          <APIKeyStatus />
        </div>
      </div>

      {/* Center Panel */}
      <div className="max-center-panel">
        <div className="max-section execution-stream">
          <h3>Execution Stream</h3>
          {activeTask && (
            <PhaseVisualization
              currentPhase={taskStatus}
              phases={['PLAN', 'EXECUTE', 'SELF-HEAL', 'COMPLETE']}
            />
          )}
          <MAXStateVisualizer milestones={milestones} />
        </div>
        <div className="max-section terminal-output">
          <h3>Terminal Output</h3>
          <MAXTerminal output={terminalOutput} />
        </div>
      </div>

      {/* Right Panel */}
      <div className="max-right-panel">
        <div className="max-section">
          <h3>Orchestration Controls</h3>
          <MAXOrchestrator
            onTaskSubmit={handleTaskSubmit}
            activeTask={activeTask}
            taskStatus={taskStatus}
          />
        </div>
      </div>
    </div>
  );
}
