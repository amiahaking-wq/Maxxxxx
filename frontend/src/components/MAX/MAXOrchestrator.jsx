/**
 * MAX Orchestrator Control Panel
 *
 * Provides controls for:
 * - Task submission
 * - Routing mode toggle
 * - Engine configuration
 */

import React, { useState, useEffect } from 'react';
import './MAXOrchestrator.css';

export default function MAXOrchestrator({ onTaskSubmit, activeTask, taskStatus }) {
  const [taskInput, setTaskInput] = useState('');
  const [routingMode, setRoutingMode] = useState('autonomous');
  const [gatewayStatus, setGatewayStatus] = useState(null);

  useEffect(() => {
    fetchGatewayStatus();
  }, []);

  const fetchGatewayStatus = async () => {
    try {
      const response = await fetch('/api/max/gateway/status');
      const data = await response.json();

      if (data.success) {
        setGatewayStatus(data.status);
        setRoutingMode(data.status.routingMode);
      }
    } catch (error) {
      console.error('Failed to fetch gateway status:', error);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (taskInput.trim() && !activeTask) {
      onTaskSubmit(taskInput);
      setTaskInput('');
    }
  };

  const handleRoutingChange = async (mode) => {
    try {
      const response = await fetch('/api/max/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          userId: 1, // TODO: Get from auth
          sessionId: 1 // TODO: Get from session
        })
      });

      const data = await response.json();

      if (data.success) {
        setRoutingMode(mode);
      }
    } catch (error) {
      console.error('Failed to change routing mode:', error);
    }
  };

  return (
    <div className="max-orchestrator">
      {/* Task Input */}
      <div className="orchestrator-section">
        <h4>Submit Task</h4>
        <form onSubmit={handleSubmit} className="task-form">
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="Describe your task... (e.g., 'Add dark mode to the dashboard')"
            disabled={!!activeTask}
            rows={4}
          />
          <button
            type="submit"
            disabled={!taskInput.trim() || !!activeTask}
            className="submit-button"
          >
            {activeTask ? 'Task Running...' : 'Execute Task'}
          </button>
        </form>

        {activeTask && (
          <div className="task-status">
            <div className="status-indicator">
              <span className={`status-dot ${taskStatus}`}></span>
              <span className="status-text">
                Status: <strong>{taskStatus}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Routing Configuration */}
      <div className="orchestrator-section">
        <h4>Engine Routing</h4>
        <div className="routing-controls">
          <label className="routing-option">
            <input
              type="radio"
              name="routing"
              value="autonomous"
              checked={routingMode === 'autonomous'}
              onChange={(e) => handleRoutingChange(e.target.value)}
            />
            <div className="option-content">
              <span className="option-title">Fully Autonomous</span>
              <span className="option-desc">
                Automatic provider routing based on task type
              </span>
            </div>
          </label>

          <label className="routing-option">
            <input
              type="radio"
              name="routing"
              value="force-gemini"
              checked={routingMode === 'force-gemini'}
              onChange={(e) => handleRoutingChange(e.target.value)}
            />
            <div className="option-content">
              <span className="option-title">Force Gemini Pro</span>
              <span className="option-desc">
                Use Gemini Pro for all tasks (large context)
              </span>
            </div>
          </label>

          <label className="routing-option">
            <input
              type="radio"
              name="routing"
              value="force-mobile"
              checked={routingMode === 'force-mobile'}
              onChange={(e) => handleRoutingChange(e.target.value)}
            />
            <div className="option-content">
              <span className="option-title">Local Phone Model</span>
              <span className="option-desc">
                Free-forever inference (coming soon)
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Gateway Status */}
      {gatewayStatus && (
        <div className="orchestrator-section">
          <h4>Gateway Status</h4>
          <div className="gateway-info">
            <div className="info-row">
              <span className="info-label">Current Provider:</span>
              <span className="info-value">
                {gatewayStatus.currentProvider || 'Auto'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Available Providers:</span>
              <span className="info-value">
                {gatewayStatus.providers?.map(p => p.name).join(', ') || 'None'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Mobile Inference:</span>
              <span className={`info-value ${gatewayStatus.mobileInference?.enabled ? 'enabled' : 'disabled'}`}>
                {gatewayStatus.mobileInference?.enabled ? '✓ Enabled' : '✗ Disabled'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
