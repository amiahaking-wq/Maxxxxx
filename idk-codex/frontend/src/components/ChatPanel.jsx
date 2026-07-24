import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { getMessages, sendMessage } from '../services/api';

const ChatPanel = ({ sessionId, onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (sessionId) {
      loadMessages();
    }
  }, [sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      const msgs = await getMessages(sessionId);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load chat history');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage(sessionId, input.trim());

      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        phase: response.phase,
        status: response.status,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (onNewMessage) {
        onNewMessage(assistantMessage);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';

    return (
      <div key={message.id} className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
        <div className="message-avatar">
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>

        <div className="message-content">
          <div className="message-header">
            <span className="message-role">{isUser ? 'You' : 'MAX Agent'}</span>
            <span className="message-timestamp">{formatTimestamp(message.timestamp)}</span>
          </div>

          <div className="message-body">
            {message.content}
          </div>

          {message.phase && (
            <div className="message-metadata">
              <span className="message-phase">Phase: {message.phase}</span>
              {message.status && (
                <span className={`message-status status-${message.status}`}>
                  {message.status === 'success' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                  {message.status}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <Bot size={20} />
        <span className="chat-title">MAX Agent Chat</span>
        {sessionId && (
          <span className="chat-session-id">{sessionId.substring(0, 8)}</span>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <Bot size={64} className="empty-icon" />
            <h3>Start a Conversation</h3>
            <p>Ask MAX Agent to help you code, debug, or manage your project</p>
          </div>
        ) : (
          <>
            {messages.map(renderMessage)}
            {isLoading && (
              <div className="chat-message assistant loading">
                <div className="message-avatar">
                  <Bot size={20} />
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-role">MAX Agent</span>
                  </div>
                  <div className="message-body">
                    <Loader size={16} className="spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {error && (
        <div className="chat-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          placeholder="Ask MAX Agent anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
