/**
 * Phase Visualization Component
 *
 * Displays the 5-phase agent execution pipeline with real-time status updates.
 *
 * Phases: PLAN → EXECUTE → TEST → DEPLOY → MONITOR
 * Statuses: pending, running, completed, failed
 *
 * @component
 */

import React from 'react';
import './PhaseVisualization.css';

const PHASES = [
  { id: 'PLAN', icon: '📋', label: 'Planning' },
  { id: 'EXECUTE', icon: '⚡', label: 'Executing' },
  { id: 'TEST', icon: '🧪', label: 'Testing' },
  { id: 'DEPLOY', icon: '🚀', label: 'Deploying' },
  { id: 'MONITOR', icon: '👁️', label: 'Monitoring' }
];

const STATUS_ICONS = {
  pending: '⏳',
  running: '▶️',
  completed: '✅',
  failed: '❌'
};

export function PhaseVisualization({ currentPhase, phaseStatuses = {} }) {
  return (
    <div className="phase-visualization">
      <div className="phase-timeline">
        {PHASES.map((phase, index) => {
          const status = phaseStatuses[phase.id] || 'pending';
          const isCurrent = currentPhase === phase.id;
          const isCompleted = status === 'completed';
          const isFailed = status === 'failed';
          const isRunning = status === 'running' || isCurrent;

          return (
            <React.Fragment key={phase.id}>
              <div
                className={`phase-node ${status} ${isCurrent ? 'current' : ''} ${
                  isFailed ? 'failed' : ''
                }`}
              >
                <div className="phase-icon">{phase.icon}</div>
                <div className="phase-label">{phase.label}</div>
                <div className="phase-status">{STATUS_ICONS[status]}</div>
                {isRunning && !isFailed && (
                  <div className="phase-progress-ring">
                    <div className="progress-ring-inner" />
                  </div>
                )}
              </div>

              {index < PHASES.length - 1 && (
                <div
                  className={`phase-connector ${
                    isCompleted ? 'completed' : ''
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default PhaseVisualization;
