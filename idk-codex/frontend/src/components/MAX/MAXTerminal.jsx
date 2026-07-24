/**
 * MAX Terminal
 *
 * Live execution log display (reuses LiveTerminal concept)
 */

import React, { useEffect, useRef } from 'react';
import './MAXTerminal.css';

export default function MAXTerminal({ output }) {
  const terminalRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom on new output
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const getMessageClass = (type) => {
    switch (type) {
      case 'task-start':
        return 'log-info';
      case 'milestone-start':
        return 'log-info';
      case 'milestone-complete':
        return 'log-success';
      case 'context-purge':
        return 'log-warning';
      case 'task-complete':
        return 'log-success';
      case 'task-failed':
        return 'log-error';
      default:
        return 'log-default';
    }
  };

  return (
    <div className="max-terminal" ref={terminalRef}>
      {output.length === 0 ? (
        <div className="terminal-empty">
          <p>Waiting for task execution...</p>
        </div>
      ) : (
        <div className="terminal-content">
          {output.map((log, index) => (
            <div
              key={index}
              className={`terminal-line ${getMessageClass(log.type)}`}
            >
              <span className="log-timestamp">
                [{formatTimestamp(log.timestamp)}]
              </span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
