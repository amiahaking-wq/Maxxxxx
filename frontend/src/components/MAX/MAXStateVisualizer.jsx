/**
 * MAX State Visualizer
 *
 * Visualizes milestone dependency graph and execution state
 */

import React, { useEffect, useRef } from 'react';
import './MAXStateVisualizer.css';

export default function MAXStateVisualizer({ milestones }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!milestones || milestones.length === 0) return;

    drawGraph();
  }, [milestones]);

  const drawGraph = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate layout
    const nodeRadius = 30;
    const levelHeight = height / (milestones.length + 1);
    const nodes = {};

    // Position nodes
    milestones.forEach((milestone, index) => {
      const x = width / 2;
      const y = levelHeight * (index + 1);

      nodes[milestone.id] = {
        ...milestone,
        x,
        y,
        radius: nodeRadius
      };
    });

    // Draw dependencies
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;

    milestones.forEach(milestone => {
      if (milestone.dependencies && milestone.dependencies.length > 0) {
        const target = nodes[milestone.id];

        milestone.dependencies.forEach(depId => {
          const source = nodes[depId];
          if (source && target) {
            ctx.beginPath();
            ctx.moveTo(source.x, source.y + source.radius);
            ctx.lineTo(target.x, target.y - target.radius);
            ctx.stroke();

            // Draw arrow
            const angle = Math.atan2(
              target.y - source.y,
              target.x - source.x
            );
            const arrowSize = 8;
            ctx.beginPath();
            ctx.moveTo(target.x, target.y - target.radius);
            ctx.lineTo(
              target.x - arrowSize * Math.cos(angle - Math.PI / 6),
              target.y - target.radius - arrowSize * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
              target.x - arrowSize * Math.cos(angle + Math.PI / 6),
              target.y - target.radius - arrowSize * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fill();
          }
        });
      }
    });

    // Draw nodes
    milestones.forEach(milestone => {
      const node = nodes[milestone.id];

      // Node color based on status
      let fillColor;
      switch (milestone.status) {
        case 'completed':
          fillColor = '#4caf50';
          break;
        case 'active':
          fillColor = '#2196f3';
          break;
        case 'failed':
          fillColor = '#f44336';
          break;
        default:
          fillColor = '#666';
      }

      // Draw node circle
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
      ctx.fill();

      // Draw border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw agent role icon
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const icon = getAgentIcon(milestone.agent_role);
      ctx.fillText(icon, node.x, node.y);
    });
  };

  const getAgentIcon = (agentRole) => {
    switch (agentRole) {
      case 'architect':
        return '🏗️';
      case 'engineer':
        return '⚙️';
      case 'devops':
        return '🚀';
      case 'media':
        return '🎬';
      default:
        return '●';
    }
  };

  return (
    <div className="max-state-visualizer">
      {milestones && milestones.length > 0 ? (
        <>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            className="milestone-graph"
          />
          <div className="milestone-list">
            {milestones.map(milestone => (
              <div
                key={milestone.id}
                className={`milestone-item ${milestone.status}`}
              >
                <span className="milestone-icon">
                  {getAgentIcon(milestone.agent_role)}
                </span>
                <div className="milestone-details">
                  <span className="milestone-desc">
                    {milestone.description}
                  </span>
                  <span className="milestone-meta">
                    {milestone.agent_role} • {milestone.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No active milestones</p>
        </div>
      )}
    </div>
  );
}
