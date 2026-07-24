import { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  Send,
  Paperclip,
  Image,
  Film,
  Music,
  Bot,
  User,
  Loader2,
  Sparkles,
  Trash2,
  Settings,
  Mic,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, Attachment } from '@/types';

export function AIChatPanel() {
  const { chatMessages, isChatStreaming, addChatMessage, updateChatMessage, setChatStreaming } = useNexusStore();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    addChatMessage(userMsg);
    setInput('');
    setAttachments([]);
    setChatStreaming(true);

    // Simulate AI response
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    addChatMessage(assistantMsg);

    const responses = [
      "I'll help you with that. Let me analyze your code and provide suggestions.",
      "Great question! Here's how you can approach this problem...",
      "I can see what you're trying to do. Let me generate the code for you.",
      "Looking at your project structure, I recommend organizing it this way...",
      "I've analyzed your codebase. Here are some optimization suggestions...",
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];

    let displayed = '';
    for (let i = 0; i < response.length; i++) {
      await new Promise((r) => setTimeout(r, 15));
      displayed += response[i];
      updateChatMessage(assistantMsg.id, { content: displayed });
    }

    updateChatMessage(assistantMsg.id, { isStreaming: false });
    setChatStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttach = (type: 'image' | 'audio' | 'video') => {
    const mockAttachment: Attachment = {
      id: `att-${Date.now()}`,
      type,
      url: type === 'image' ? 'https://picsum.photos/400/300' : '',
      name: `attached_${type}.${type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'mp3'}`,
      size: Math.floor(Math.random() * 10000000),
    };
    setAttachments([...attachments, mockAttachment]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e] shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#6c5ce7]" />
          <span className="text-xs font-semibold text-[#e0e0e0]">NEXUS AI Assistant</span>
          {isChatStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-[#6c5ce7]">
              <Loader2 size={10} className="animate-spin" />
              thinking...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors">
            <Settings size={12} />
          </button>
          <button className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center mb-3 shadow-lg shadow-[#6c5ce7]/20">
              <Bot size={24} className="text-white" />
            </div>
            <h3 className="text-sm font-medium text-[#e0e0e0] mb-1">NEXUS AI Assistant</h3>
            <p className="text-xs text-[#6b6b8d] max-w-[240px]">
              I can help you code, debug, generate images, edit videos, and more. What would you like to work on?
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-[280px]">
              {['Explain this code', 'Generate a component', 'Debug an error', 'Optimize performance'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-xs p-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-[#a0a0c0] hover:border-[#6c5ce7] hover:text-[#e0e0e0] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={12} className="text-white" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2',
                msg.role === 'user'
                  ? 'bg-[#6c5ce7] text-white'
                  : 'bg-[#1a1a2e] border border-[#2a2a3e] text-[#e0e0e0]'
              )}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex gap-2 mb-2">
                  {msg.attachments.map((att) => (
                    <div key={att.id} className="bg-black/20 rounded p-1.5">
                      {att.type === 'image' ? (
                        <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded" />
                      ) : (
                        <div className="flex items-center gap-1 text-[10px]">
                          <Paperclip size={10} />
                          {att.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-[#6c5ce7] ml-0.5 animate-pulse" />
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md bg-[#2a2a3e] flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-[#a0a0c0]" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-[#2a2a3e] flex gap-2 overflow-x-auto">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-1.5 bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-2 py-1 text-[10px] text-[#a0a0c0]">
              <Paperclip size={10} />
              <span>{att.name}</span>
              <button
                onClick={() => setAttachments(attachments.filter((a) => a.id !== att.id))}
                className="ml-1 text-[#6b6b8d] hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-[#2a2a3e]">
        <div className="flex items-end gap-2 bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg p-2 focus-within:border-[#6c5ce7] transition-colors">
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleAttach('image')}
              className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#fd79a8] transition-colors"
              title="Attach image"
            >
              <Image size={14} />
            </button>
            <button
              onClick={() => handleAttach('video')}
              className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e17055] transition-colors"
              title="Attach video"
            >
              <Film size={14} />
            </button>
            <button
              onClick={() => handleAttach('audio')}
              className="p-1.5 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#00b894] transition-colors"
              title="Attach audio"
            >
              <Music size={14} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask NEXUS anything..."
            className="flex-1 bg-transparent text-xs text-[#e0e0e0] placeholder-[#4a4a6a] resize-none outline-none max-h-24 min-h-[20px] py-1"
            rows={1}
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsRecording(!isRecording)}
              className={cn(
                'p-1.5 rounded transition-colors',
                isRecording ? 'bg-red-500/20 text-red-400' : 'hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]'
              )}
            >
              {isRecording ? <Square size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={handleSend}
              disabled={isChatStreaming || (!input.trim() && attachments.length === 0)}
              className="p-1.5 rounded bg-[#6c5ce7] text-white hover:bg-[#5b4dd1] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isChatStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
