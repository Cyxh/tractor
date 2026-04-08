import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from 'tractor-shared';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  compact?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ messages, onSend, compact }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const msg = input.trim();
    if (msg) {
      onSend(msg);
      setInput('');
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`chat-panel ${compact ? 'chat-compact' : ''}`}>
      <div className="chat-header">Chat</div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="chat-message">
            <span className="chat-time">{formatTime(msg.timestamp)}</span>
            <span className="chat-name">{msg.playerName}</span>
            <span className="chat-text">{msg.message}</span>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          maxLength={200}
        />
        <button className="btn btn-chat-send" onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
