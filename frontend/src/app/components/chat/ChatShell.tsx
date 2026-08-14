'use client';
import { AppProvider, useApp } from './AppProvider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MessagesArea } from './MessagesArea';
import { InputBar } from './InputBar';
import { useChat } from '@/app/hooks/useChat';
import { useState } from 'react';

function ChatShellContent() {
  const { currentConversationId, mobileSidebarOpen, setMobileSidebarOpen } = useApp();
  const [inputValue, setInputValue] = useState('');
  const { messages, isStreaming, sendMessage, stopGeneration } = useChat(currentConversationId || 'default');

  return (
    <div className="flex h-screen overflow-hidden bg-cg-canvas text-cg-text">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <MessagesArea messages={messages} setInputValue={setInputValue} />
        <InputBar
          value={inputValue}
          onChange={setInputValue}
          onSend={() => {
            if (inputValue.trim()) {
              sendMessage(inputValue);
              setInputValue('');
            }
          }}
          isStreaming={isStreaming}
          onStop={stopGeneration}
        />
      </div>
    </div>
  );
}

export function ChatShell() {
  return (
    <AppProvider>
      <ChatShellContent />
    </AppProvider>
  );
}
