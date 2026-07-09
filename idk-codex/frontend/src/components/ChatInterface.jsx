/**
 * Chat Interface Component
 */

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import './ChatInterface.css';

export function ChatInterface({ messages = [], onSendMessage, isLoading = false }) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={`message message-${msg.role}`}>
            <div className="message-header">
              <span className="message-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
              <span className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your task..."
          disabled={isLoading}
          className="chat-input"
        />
        <button type="submit" disabled={!input.trim() || isLoading} className="chat-submit">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
