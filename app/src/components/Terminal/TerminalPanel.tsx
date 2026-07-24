import { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  Plus,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function TerminalPanel() {
  const { terminalSessions, activeTerminalId, addTerminalSession, setActiveTerminal, addTerminalLine } = useNexusStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession = terminalSessions.find((s) => s.id === activeTerminalId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeSession?.history.length]);

  const handleCommand = () => {
    if (!input.trim() || !activeSession) return;

    addTerminalLine(activeSession.id, {
      id: `line-${Date.now()}`,
      type: 'input',
      content: `${activeSession.currentPath} $ ${input}`,
      timestamp: new Date(),
    });

    // Simulate command responses
    const responses = simulateCommand(input.trim());
    responses.forEach((resp, i) => {
      setTimeout(() => {
        addTerminalLine(activeSession.id, {
          id: `line-${Date.now() + i}`,
          type: resp.type as 'output' | 'error',
          content: resp.content,
          timestamp: new Date(),
        });
      }, i * 100);
    });

    setInput('');
  };

  const simulateCommand = (cmd: string): { type: string; content: string }[] => {
    const [command, ...args] = cmd.split(' ');
    switch (command) {
      case 'help':
        return [{
          type: 'output',
          content: `Available commands:
  ls          List directory contents
  cd <dir>    Change directory
  pwd         Print working directory
  cat <file>  Display file contents
  mkdir <dir> Create directory
  touch <file> Create file
  rm <file>   Remove file
  clear       Clear terminal
  git <cmd>   Git commands
  npm <cmd>   NPM commands
  node <file> Run Node.js file
  python <f>  Run Python file
  whoami      Display current user
  date        Display current date
  echo <msg>  Print message
  help        Show this help`,
        }];
      case 'ls':
        return [{ type: 'output', content: 'src/  public/  node_modules/  package.json  tsconfig.json  README.md  .gitignore' }];
      case 'pwd':
        return [{ type: 'output', content: activeSession?.currentPath || '~/projects/nexus' }];
      case 'whoami':
        return [{ type: 'output', content: 'nexus-developer' }];
      case 'date':
        return [{ type: 'output', content: new Date().toString() }];
      case 'clear':
        return [];
      case 'echo':
        return [{ type: 'output', content: args.join(' ') }];
      case 'git':
        if (args[0] === 'status') {
          return [{
            type: 'output',
            content: `On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  modified:   src/components/App.tsx

Changes not staged for commit:
  modified:   src/store/store.ts
  modified:   package.json

Untracked files:
  src/components/NewFeature.tsx`,
          }];
        }
        return [{ type: 'output', content: `git ${args.join(' ')} executed successfully` }];
      case 'npm':
        return [{ type: 'output', content: `> nexus-project@1.0.0 ${args.join(' ')}
> Process completed successfully` }];
      case 'cat':
        if (args[0] === 'package.json') {
          return [{ type: 'output', content: JSON.stringify({ name: 'nexus-project', version: '1.0.0', dependencies: { react: '^18.2.0' } }, null, 2) }];
        }
        return [{ type: 'error', content: `cat: ${args[0]}: No such file or directory` }];
      default:
        return [{ type: 'output', content: `Command '${command}' executed. Output simulated.` }];
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommand();
  };

  const createSession = () => {
    const id = `term-${Date.now()}`;
    addTerminalSession({
      id,
      name: `bash ${terminalSessions.length + 1}`,
      history: [{ id: '1', type: 'output', content: 'Welcome to NEXUS Terminal', timestamp: new Date() }],
      currentPath: '~/projects/nexus',
    });
    setActiveTerminal(id);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Tabs */}
      <div className="h-8 flex items-center border-b border-[#2a2a3e] bg-[#16162a] shrink-0 overflow-x-auto">
        {terminalSessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveTerminal(session.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 h-full text-xs border-r border-[#2a2a3e] transition-colors',
              session.id === activeTerminalId
                ? 'bg-[#0f0f1a] text-[#e0e0e0]'
                : 'text-[#6b6b8d] hover:bg-[#1e1e32] hover:text-[#a0a0c0]'
            )}
          >
            <Terminal size={12} />
            <span>{session.name}</span>
          </button>
        ))}
        <button
          onClick={createSession}
          className="p-1.5 text-[#6b6b8d] hover:text-[#e0e0e0] hover:bg-[#2a2a3e] transition-colors"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Terminal Content */}
      {activeSession && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs">
            {activeSession.history.map((line) => (
              <div key={line.id} className="mb-0.5">
                {line.type === 'input' ? (
                  <span className="text-[#a0a0c0]">{line.content}</span>
                ) : line.type === 'error' ? (
                  <span className="text-red-400">{line.content}</span>
                ) : (
                  <pre className="text-[#e0e0e0] whitespace-pre-wrap">{line.content}</pre>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="h-8 flex items-center px-3 border-t border-[#2a2a3e] bg-[#16162a] shrink-0">
            <ChevronRight size={12} className="text-[#6c5ce7] mr-2 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              className="flex-1 bg-transparent text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none font-mono"
              autoFocus
            />
          </div>
        </>
      )}
    </div>
  );
}
