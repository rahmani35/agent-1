import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RefreshCw, Sparkles, BookOpen } from 'lucide-react';
import { sendChatMessage } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';

export default function ChatView({ sessionId, setSessionId }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I am your **Document Q&A RAG Agent**. Upload your documents in the *Documents* tab, then ask me any question! I will retrieve the most relevant sections and synthesize grounded answers with citations.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    const userMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const data = await sendChatMessage({ message: prompt, sessionId });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message || 'Failed to get a response from the reasoning engine.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSession = () => {
    const newSessionId = `session_${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSessionId);
    setMessages([
      {
        role: 'assistant',
        content: "New conversation started. What would you like to explore in your documents?",
      },
    ]);
  };

  const sampleQuestions = [
    "What are the main takeaways from the uploaded documents?",
    "Summarize the key findings and cite the source pages.",
    "Is there any mention of pricing, timelines, or requirements?",
  ];

  return (
    <div className="chat-container">
      {/* Top Session Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
          <BookOpen size={14} color="var(--accent-blue)" />
          <span>Session: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>{sessionId}</code></span>
        </div>
        <button
          className="btn-icon"
          onClick={handleResetSession}
          title="New Conversation Session"
          style={{ width: '28px', height: '28px' }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Messages List */}
      <div className="messages-list">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-bubble ${msg.role}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>
              {msg.role === 'user' ? (
                <>
                  <User size={13} />
                  <span>You</span>
                </>
              ) : (
                <>
                  <Bot size={13} color="var(--accent-blue)" />
                  <span>RAG Agent</span>
                </>
              )}
            </div>
            <MarkdownRenderer content={msg.content} />
          </div>
        ))}

        {loading && (
          <div className="message-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div className="spinner" style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Searching vector store and synthesizing response...
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      {messages.length === 1 && (
        <div style={{ padding: '0 1.25rem 0.5rem', display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
          {sampleQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => { setInput(q); }}
              style={{
                fontSize: '0.75rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '9999px',
                backgroundColor: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Sparkles size={11} color="var(--accent-purple)" />
              <span>{q}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder="Ask a question about your uploaded documents..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          {loading ? (
            <div className="spinner" style={{ width: '16px', height: '16px' }} />
          ) : (
            <Send size={16} />
          )}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
