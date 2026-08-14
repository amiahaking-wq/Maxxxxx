'use client';
import { AppProvider, useApp } from './AppProvider';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MessagesArea } from './MessagesArea';
import { InputBar } from './InputBar';
import { GptStore } from './GptStore';
import { useChat } from '@/app/hooks/useChat';
import { useState } from 'react';
import { Store, X, Share2 } from 'lucide-react';

function ChatShellContent() {
  const { currentConversationId, mobileSidebarOpen, setMobileSidebarOpen, activeGpt, setActiveGpt, activeWorkspace } = useApp();
  const [inputValue, setInputValue] = useState('');
  const [storeOpen, setStoreOpen] = useState(false);
  const { messages, isStreaming, sendMessage, stopGeneration, regenerate, setFeedback, editUserMessage } = useChat(currentConversationId || 'default');

  const handleSend = (attachments?: any[]) => {
    const text = inputValue.trim();
    if ((!text && (!attachments || attachments.length === 0)) || isStreaming) return;

    // If a GPT is active, prepend its system prompt/instructions to the message
    let emitText = text;
    if (activeGpt) {
      const gptPrompt = activeGpt.systemPrompt || activeGpt.instructions;
      if (gptPrompt) {
        emitText = `[Using GPT: ${activeGpt.name}]\nSystem: ${gptPrompt}\n\nUser: ${text}`;
      }
    }

    sendMessage(emitText, attachments);
    setInputValue('');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-cg-canvas text-cg-text">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar messages={messages} />

        {/* Active GPT indicator + store button */}
        {(activeGpt || true) && (
          <div className="flex items-center gap-2 border-b border-cg-border bg-cg-sidebar px-4 py-1.5">
            {activeGpt ? (
              <div className="flex items-center gap-2 rounded-full bg-cg-hover px-3 py-1 text-xs">
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: activeGpt.iconColor || '#10a37f' }}
                >
                  {activeGpt.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium text-cg-text">{activeGpt.name}</span>
                <button
                  onClick={() => setActiveGpt(null)}
                  className="rounded p-0.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
                  aria-label="Clear GPT"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            <button
              onClick={() => setStoreOpen(true)}
              className="flex items-center gap-1 rounded-full border border-cg-border px-3 py-1 text-xs text-cg-muted hover:bg-cg-hover hover:text-cg-text"
            >
              <Store className="h-3 w-3" /> Explore GPTs
            </button>

            {/* Share to team (only when a team workspace is active) */}
            {activeWorkspace && currentConversationId && (
              <button
                onClick={async () => {
                  try {
                    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
                    const res = await fetch(`/api/teams/${activeWorkspace.id}/conversations`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({ conversationId: currentConversationId }),
                    });
                    if (res.ok) {
                      alert(`Shared to ${activeWorkspace.name} team!`);
                    } else {
                      alert('Failed to share to team');
                    }
                  } catch {
                    alert('Failed to share to team');
                  }
                }}
                className="flex items-center gap-1 rounded-full border border-cg-border px-3 py-1 text-xs text-cg-muted hover:bg-cg-hover hover:text-cg-text"
              >
                <Share2 className="h-3 w-3" /> Share to {activeWorkspace.name}
              </button>
            )}
          </div>
        )}

        <MessagesArea
          messages={messages}
          setInputValue={setInputValue}
          onRegenerate={regenerate}
          onFeedback={setFeedback}
          onEditUserMessage={editUserMessage}
        />
        <InputBar
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={stopGeneration}
        />
      </div>

      <GptStore
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        onSelectGpt={(gpt) => {
          setActiveGpt(gpt);
          // Increment usage count
          fetch(`/api/gpts/${gpt.id}/use`, { method: 'POST' }).catch(() => {});
        }}
      />
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
