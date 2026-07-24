import { useNexusStore } from '@/store/nexusStore';
import { EditorTabs } from '@/components/IDE/EditorTabs';
import { CodeEditor } from '@/components/IDE/CodeEditor';
import { WelcomeScreen } from '@/components/Layout/WelcomeScreen';

export function EditorArea() {
  const { tabs, activeTabId } = useNexusStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col bg-[#0f0f1a] overflow-hidden">
      {tabs.length > 0 && <EditorTabs />}
      {activeTab ? (
        <CodeEditor key={activeTab.id} tab={activeTab} />
      ) : (
        <WelcomeScreen />
      )}
    </div>
  );
}
