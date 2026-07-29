'use client';
import { useState, useEffect, useRef } from 'react';

interface TerminalProps {
  token: string;
  onClose: () => void;
}

export function Terminal({ token, onClose }: TerminalProps) {
  const [lines, setLines] = useState<{ type: string; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLines([
      { type: 'system', text: 'MAX Terminal v1.0 — type "exit" to close' },
      { type: 'system', text: 'Working directory: /workspace' },
      { type: 'system', text: '' }
    ]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  async function runCommand(cmd: string) {
    if (!cmd.trim()) return;
    if (cmd.trim() === 'exit' || cmd.trim() === 'quit') { onClose(); return; }
    if (cmd.trim() === 'clear') { setLines([]); return; }

    setRunning(true);
    setLines(prev => [...prev, { type: 'input', text: `$ ${cmd}` }]);
    setHistory(prev => [...prev, cmd]);
    setHistoryIdx(-1);

    try {
      const r = await fetch('/api/sandbox/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: cmd, language: 'bash', timeoutMs: 15000 })
      });
      const data = await r.json();
      if (data.stdout) data.stdout.split('\n').forEach((l: string) => setLines(prev => [...prev, { type: 'output', text: l }]));
      if (data.stderr) data.stderr.split('\n').forEach((l: string) => setLines(prev => [...prev, { type: 'error', text: l }]));
      setLines(prev => [...prev, { type: 'system', text: `[exit: ${data.exitCode}, ${data.durationMs}ms]` }, { type: 'system', text: '' }]);
    } catch (e) {
      setLines(prev => [...prev, { type: 'error', text: `Error: ${(e as Error).message}` }]);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(input); setInput(''); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(idx); setInput(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx !== -1) {
        const idx = historyIdx + 1;
        if (idx >= history.length) { setHistoryIdx(-1); setInput(''); }
        else { setHistoryIdx(idx); setInput(history[idx]); }
      }
    } else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); setInput(''); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden font-mono text-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            </div>
            <span className="text-[#999] ml-2">MAX Terminal</span>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#ccc] px-2">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 text-[#ececec]">
          {lines.map((line, i) => {
            let color = '#ccc';
            if (line.type === 'input') color = '#FF6B35';
            else if (line.type === 'error') color = '#fca5a5';
            else if (line.type === 'system') color = '#666';
            return <div key={i} style={{ color }} className="whitespace-pre-wrap break-all">{line.text || '\u00A0'}</div>;
          })}
          {running && <div className="text-[#FF6B35] animate-pulse">▋</div>}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#2a2a2a]">
          <span className="text-[#FF6B35]">$</span>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={running}
            placeholder="type a command..." autoComplete="off" spellCheck={false}
            className="flex-1 bg-transparent text-[#ececec] focus:outline-none font-mono text-xs" />
        </div>
      </div>
    </div>
  );
}
