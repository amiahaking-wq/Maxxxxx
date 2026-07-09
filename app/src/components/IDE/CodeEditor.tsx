import { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { EditorTab } from '@/types';
import { useNexusStore } from '@/store/nexusStore';
import { Loader2 } from 'lucide-react';

interface CodeEditorProps {
  tab: EditorTab;
}

export function CodeEditor({ tab }: CodeEditorProps) {
  const { updateTabContent, markTabModified, settings } = useNexusStore();
  const [editorReady, setEditorReady] = useState(false);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateTabContent(tab.id, value);
        markTabModified(tab.id, value !== tab.content);
      }
    },
    [tab.id, tab.content, updateTabContent, markTabModified]
  );

  const languageMap: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    json: 'json',
    css: 'css',
    html: 'html',
    markdown: 'markdown',
    python: 'python',
    rust: 'rust',
    go: 'go',
  };

  useEffect(() => {
    setEditorReady(false);
    const timer = setTimeout(() => setEditorReady(true), 50);
    return () => clearTimeout(timer);
  }, [tab.id]);

  if (!editorReady) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0f0f1a]">
        <Loader2 size={20} className="animate-spin text-[#6c5ce7]" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0">
      <Editor
        key={tab.id}
        height="100%"
        language={languageMap[tab.language] || 'plaintext'}
        value={tab.content}
        onChange={handleChange}
        theme="nexus-dark"
        beforeMount={(monaco) => {
          monaco.editor.defineTheme('nexus-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '6b6b8d', fontStyle: 'italic' },
              { token: 'keyword', foreground: 'c084fc' },
              { token: 'identifier', foreground: '60a5fa' },
              { token: 'string', foreground: '4ade80' },
              { token: 'number', foreground: 'fb923c' },
              { token: 'tag', foreground: 'f87171' },
              { token: 'attribute.name', foreground: 'fcd34d' },
              { token: 'delimiter', foreground: '94a3b8' },
            ],
            colors: {
              'editor.background': '#0f0f1a',
              'editor.foreground': '#e0e0e0',
              'editor.lineHighlightBackground': '#1a1a2e80',
              'editor.selectionBackground': '#6c5ce740',
              'editor.inactiveSelectionBackground': '#6c5ce720',
              'editorCursor.foreground': '#6c5ce7',
              'editorWhitespace.foreground': '#2a2a3e',
              'editorIndentGuide.background': '#2a2a3e',
              'editorIndentGuide.activeBackground': '#3a3a4e',
              'editorLineNumber.foreground': '#4a4a6a',
              'editorLineNumber.activeForeground': '#6c5ce7',
            },
          });
        }}
        options={{
          fontSize: settings.fontSize,
          fontFamily: settings.fontFamily,
          fontLigatures: true,
          minimap: { enabled: settings.minimap },
          lineNumbers: settings.lineNumbers ? 'on' : 'off',
          wordWrap: settings.wordWrap ? 'on' : 'off',
          tabSize: settings.tabSize,
          insertSpaces: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'all',
          roundedSelection: false,
          padding: { top: 16 },
          folding: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          quickSuggestions: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[#0f0f1a]">
            <Loader2 size={20} className="animate-spin text-[#6c5ce7]" />
          </div>
        }
      />
    </div>
  );
}
