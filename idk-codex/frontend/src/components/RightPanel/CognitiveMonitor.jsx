import React from 'react';

export function CognitiveMonitor({ agentStatus }) {
  return (
    <div className="cognitive-monitor">
      <div className="monitor-stat">
        <span className="stat-label">Reflection Depth</span>
        <span className="stat-value">{agentStatus?.reflectionDepth || 0}</span>
      </div>
      <div className="monitor-stat">
        <span className="stat-label">Self-Corrections</span>
        <span className="stat-value">{agentStatus?.corrections || 0}</span>
      </div>
    </div>
  );
}
