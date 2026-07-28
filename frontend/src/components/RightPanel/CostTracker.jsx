import React from 'react';

export function CostTracker({ data }) {
  if (!data) {
    return <div className="cost-tracker">Loading costs...</div>;
  }

  return (
    <div className="cost-tracker">
      <div className="cost-total">
        <span className="cost-label">Total Cost</span>
        <span className="cost-value">${(data.total || 0).toFixed(4)}</span>
      </div>
      <div className="cost-breakdown">
        {Object.entries(data.breakdown || {}).map(([provider, cost]) => (
          <div key={provider} className="cost-item">
            <span>{provider}</span>
            <span>${cost.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
