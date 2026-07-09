import { useNexusStore } from '@/store/nexusStore';
import { TerminalPanel } from '@/components/Terminal/TerminalPanel';
import { AIChatPanel } from '@/components/Chat/AIChatPanel';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Panel() {
  const { panelVisible, panelHeight, setPanelHeight, togglePanel, activeView } = useNexusStore();

  if (!panelVisible) return null;

  const renderPanelContent = () => {
    switch (activeView) {
      case 'terminal':
        return <TerminalPanel />;
      case 'chat':
        return <AIChatPanel />;
      default:
        return <TerminalPanel />;
    }
  };

  return (
    <div
      className="border-t border-[#2a2a3e] bg-[#0f0f1a] flex flex-col relative"
      style={{ height: panelHeight }}
    >
      {/* Panel Header */}
      <div className="h-8 bg-[#16162a] border-b border-[#2a2a3e] flex items-center px-3 justify-between select-none">
        <div className="flex items-center gap-4">
          <span className={cn(
            'text-xs font-medium text-[#6c5ce7] cursor-pointer border-b-2 border-[#6c5ce7] pb-1.5',
          )}>
            Terminal
          </span>
          <span className="text-xs text-[#6b6b8d] cursor-pointer hover:text-[#a0a0c0] pb-1.5">
            Output
          </span>
          <span className="text-xs text-[#6b6b8d] cursor-pointer hover:text-[#a0a0c0] pb-1.5">
            Problems
          </span>
          <span className="text-xs text-[#6b6b8d] cursor-pointer hover:text-[#a0a0c0] pb-1.5">
            Debug
          </span>
        </div>
        <button
          onClick={togglePanel}
          className="text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {renderPanelContent()}
      </div>

      {/* Resizer */}
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-[#6c5ce7]/50 z-50"
        onMouseDown={(e) => {
          const startY = e.clientY;
          const startH = panelHeight;
          const handleMouseMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY;
            setPanelHeight(Math.max(120, Math.min(500, startH + delta)));
          };
          const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
          };
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';
        }}
      />
    </div>
  );
}
