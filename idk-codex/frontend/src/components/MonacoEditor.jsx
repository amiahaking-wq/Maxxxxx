import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const MonacoEditor = ({
  value,
  onChange,
  language = 'javascript',
  path,
  onCursorChange,
  readOnly = false
}) => {
  const editorRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Configure Monaco theme
    monaco.editor.defineTheme('max-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955' },
        { token: 'keyword', foreground: 'C586C0' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'function', foreground: 'DCDCAA' },
        { token: 'variable', foreground: '9CDCFE' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#cccccc',
        'editor.lineHighlightBackground': '#2a2a2a',
        'editorLineNumber.foreground': '#858585',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorCursor.foreground': '#aeafad',
        'editor.findMatchBackground': '#515c6a',
        'editor.findMatchHighlightBackground': '#ea5c0055',
      }
    });
    monaco.editor.setTheme('max-dark');

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      if (onCursorChange) {
        onCursorChange({
          line: e.position.lineNumber,
          column: e.position.column
        });
      }
    });

    // Enable common editor features
    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      formatOnPaste: true,
      formatOnType: true,
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      matchBrackets: 'always',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoIndent: 'full',
    });
  };

  const detectLanguage = (filepath) => {
    if (!filepath) return 'javascript';

    const ext = filepath.split('.').pop().toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'md': 'markdown',
      'css': 'css',
      'scss': 'scss',
      'html': 'html',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'sh': 'shell',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
    };

    return languageMap[ext] || 'plaintext';
  };

  const editorLanguage = language || detectLanguage(path);

  return (
    <Editor
      height="100%"
      language={editorLanguage}
      value={value}
      onChange={onChange}
      onMount={handleEditorDidMount}
      theme="max-dark"
      path={path}
      options={{
        readOnly,
        domReadOnly: readOnly,
      }}
      loading={
        <div className="editor-loading">
          <div className="spinner"></div>
          <span>Loading Editor...</span>
        </div>
      }
    />
  );
};

export default MonacoEditor;
