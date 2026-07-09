import { ActivityBar } from '@/components/Layout/ActivityBar';
import { Sidebar } from '@/components/Layout/Sidebar';
import { EditorArea } from '@/components/Layout/EditorArea';
import { StatusBar } from '@/components/Layout/StatusBar';
import { Panel } from '@/components/Layout/Panel';

function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f0f1a] text-[#e0e0e0] overflow-hidden font-sans">
      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Activity Bar */}
        <ActivityBar />

        {/* Sidebar */}
        <Sidebar />

        {/* Editor + Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditorArea />
          <Panel />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
