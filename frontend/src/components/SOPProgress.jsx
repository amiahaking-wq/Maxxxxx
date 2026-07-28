/**
 * SOP Progress Tracker Component
 * Displays agent execution progress through phases
 */

import { Check, Loader2, X, Clock, AlertCircle } from 'lucide-react';
import './SOPProgress.css';

const PHASES = [
  { name: 'plan', label: 'Planning', description: 'Analyzing task and creating execution plan' },
  { name: 'execute', label: 'Execution', description: 'Implementing code changes' },
  { name: 'test', label: 'Testing', description: 'Running tests and validation' },
  { name: 'deploy', label: 'Deployment', description: 'Deploying changes' },
  { name: 'monitor', label: 'Monitoring', description: 'Monitoring deployment health' }
];

export function SOPProgress({ agentRuns = [], currentProgress = null }) {
  const getPhaseStatus = (phaseName) => {
    // Check current progress first
    if (currentProgress && currentProgress.phase === phaseName) {
      return currentProgress.status || 'running';
    }

    // Check agent runs
    const run = agentRuns.find(r => r.phase === phaseName);
    if (run) {
      return run.status;
    }

    return 'pending';
  };

  const getPhaseRetryCount = (phaseName) => {
    const runs = agentRuns.filter(r => r.phase === phaseName);
    return runs.reduce((max, run) => Math.max(max, run.retry_count || 0), 0);
  };

  const StatusIcon = ({ status }) => {
    switch (status) {
      case 'success':
        return <Check className="icon icon-success" />;
      case 'running':
        return <Loader2 className="icon icon-running animate-spin" />;
      case 'failed':
        return <X className="icon icon-failed" />;
      case 'healing':
        return <AlertCircle className="icon icon-healing animate-pulse" />;
      default:
        return <Clock className="icon icon-pending" />;
    }
  };

  return (
    <div className="sop-progress">
      <div className="sop-header">
        <h3>Agent Progress</h3>
        <div className="sop-subtitle">Standard Operating Procedure</div>
      </div>

      <div className="sop-phases">
        {PHASES.map((phase, idx) => {
          const status = getPhaseStatus(phase.name);
          const retryCount = getPhaseRetryCount(phase.name);
          const isActive = status === 'running' || status === 'healing';

          return (
            <div
              key={phase.name}
              className={`phase-item phase-${status} ${isActive ? 'phase-active' : ''}`}
            >
              <div className="phase-number">{idx + 1}</div>

              <div className="phase-icon">
                <StatusIcon status={status} />
              </div>

              <div className="phase-details">
                <div className="phase-label">{phase.label}</div>
                <div className="phase-description">{phase.description}</div>

                {retryCount > 0 && (
                  <div className="retry-badge">
                    Retry {retryCount}/10
                  </div>
                )}

                {status === 'healing' && (
                  <div className="healing-badge">
                    Self-healing in progress
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentProgress && currentProgress.error && (
        <div className="error-display">
          <AlertCircle className="error-icon" />
          <div className="error-message">{currentProgress.error}</div>
        </div>
      )}
    </div>
  );
}
