import React, { useEffect, useRef } from 'react';
import './LiveTerminal.css';

export function LiveTerminal({ logs = [] }) {
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="live-terminal" ref={terminalRef}>
      {logs.length === 0 ? (
        <div className="terminal-empty">Waiting for agent activity...</div>
      ) : (
        logs.map((log, index) => (
          <div key={index} className={`terminal-line ${log.level || 'info'}`}>
            <span className="terminal-timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className="terminal-content">{log.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
