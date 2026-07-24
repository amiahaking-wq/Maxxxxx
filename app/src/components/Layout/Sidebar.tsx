import { useNexusStore } from '@/store/nexusStore';
import { FileExplorer } from '@/components/FileExplorer/FileExplorer';
import { GitPanel } from '@/components/Git/GitPanel';
import { AIChatPanel } from '@/components/Chat/AIChatPanel';
import { ImageStudio } from '@/components/ImageStudio/ImageStudio';
import { VideoStudio } from '@/components/VideoStudio/VideoStudio';
import { AudioStudio } from '@/components/AudioStudio/AudioStudio';
import { TerminalPanel } from '@/components/Terminal/TerminalPanel';
import { SettingsPanel } from '@/components/Layout/SettingsPanel';
import { SearchPanel } from '@/components/Layout/SearchPanel';
import { ExtensionsPanel } from '@/components/Layout/ExtensionsPanel';

export function Sidebar() {
  const { activeView, sidebarWidth, setSidebarWidth, sidebarVisible } = useNexusStore();

  if (!sidebarVisible) return null;

  const renderContent = () => {
    switch (activeView) {
      case 'explorer':
        return <FileExplorer />;
      case 'search':
        return <SearchPanel />;
      case 'git':
        return <GitPanel />;
      case 'extensions':
        return <ExtensionsPanel />;
      case 'chat':
        return <AIChatPanel />;
      case 'image':
        return <ImageStudio />;
      case 'video':
        return <VideoStudio />;
      case 'audio':
        return <AudioStudio />;
      case 'terminal':
        return <TerminalPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <FileExplorer />;
    }
  };

  return (
    <div
      className="h-full bg-[#16162a] border-r border-[#2a2a3e] flex flex-col overflow-hidden relative"
      style={{ width: sidebarWidth }}
    >
      {renderContent()}
      <Resizer onResize={(delta) => setSidebarWidth(Math.max(180, Math.min(500, sidebarWidth + delta)))} />
    </div>
  );
}

function Resizer({ onResize }: { onResize: (delta: number) => void }) {
  const handleMouseDown = () => {
    const handleMouseMove = (e: MouseEvent) => {
      onResize(e.movementX);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-[#6c5ce7]/50 z-50 transition-colors"
      onMouseDown={handleMouseDown}
    />
  );
}
