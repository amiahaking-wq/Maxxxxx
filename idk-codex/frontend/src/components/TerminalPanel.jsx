import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Trash2, Copy, Download } from 'lucide-react';

const TerminalPanel = ({ sessionId }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      cols: 80,
      rows: 24,
      scrollback: 1000,
    });

    xtermRef.current = term;

    // Add fit addon for responsive sizing
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // Add web links addon
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    // Open terminal
    term.open(terminalRef.current);
    fitAddon.fit();

    // Welcome message
    term.writeln('\x1b[1;32m╔═══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[1;32m║   MAX Agent Terminal - Ready          ║\x1b[0m');
    term.writeln('\x1b[1;32m╚═══════════════════════════════════════╝\x1b[0m');
    term.writeln('');

    if (sessionId) {
      term.writeln(`\x1b[1;36mSession ID:\x1b[0m ${sessionId}`);
      term.writeln('');
    }

    term.writeln('\x1b[0;33mConnecting to agent output stream...\x1b[0m');
    term.writeln('');

    // Simulate connection (replace with actual WebSocket)
    setTimeout(() => {
      setIsConnected(true);
      term.writeln('\x1b[1;32m✓ Connected\x1b[0m');
      term.writeln('');
      term.write('$ ');
    }, 1000);

    // Handle user input
    let currentLine = '';
    term.onData((data) => {
      const code = data.charCodeAt(0);

      // Enter key
      if (code === 13) {
        term.writeln('');
        if (currentLine.trim()) {
          handleCommand(currentLine.trim(), term);
        }
        currentLine = '';
        term.write('$ ');
      }
      // Backspace
      else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      }
      // Regular character
      else if (code >= 32) {
        currentLine += data;
        term.write(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [sessionId]);

  const handleCommand = (command, term) => {
    // Simple command handler (extend with actual agent integration)
    if (command === 'clear' || command === 'cls') {
      term.clear();
    } else if (command === 'help') {
      term.writeln('Available commands:');
      term.writeln('  clear/cls  - Clear terminal');
      term.writeln('  help       - Show this help');
      term.writeln('  status     - Show agent status');
      term.writeln('');
    } else if (command === 'status') {
      term.writeln(`\x1b[1;36mAgent Status:\x1b[0m ${isConnected ? '\x1b[1;32mRunning\x1b[0m' : '\x1b[1;31mStopped\x1b[0m'}`);
      term.writeln(`\x1b[1;36mSession:\x1b[0m ${sessionId || 'None'}`);
      term.writeln('');
    } else {
      term.writeln(`Command not found: ${command}`);
      term.writeln('Type "help" for available commands');
      term.writeln('');
    }
  };

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const handleCopy = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  };

  const handleDownload = () => {
    if (xtermRef.current) {
      const buffer = xtermRef.current.buffer.active;
      let content = '';

      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (line) {
          content += line.translateToString(true) + '\n';
        }
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">Terminal</span>
        <div className="terminal-actions">
          <button className="terminal-action-btn" onClick={handleCopy} title="Copy">
            <Copy size={14} />
          </button>
          <button className="terminal-action-btn" onClick={handleDownload} title="Download">
            <Download size={14} />
          </button>
          <button className="terminal-action-btn" onClick={handleClear} title="Clear">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="terminal-container" />
    </div>
  );
};

export default TerminalPanel;
