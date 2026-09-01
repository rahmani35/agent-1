import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, RefreshCw, Sparkles, Database, AlertCircle } from 'lucide-react';
import { sendChatMessage, fetchDocuments } from '../services/api';
import MarkdownRenderer from './MarkdownRenderer';

const GREETING = {
  role: 'assistant',
  content:
    "Hello! I am your **Document Q&A RAG Agent**. Upload your documents in the *Documents* tab, then ask me any question! I will retrieve the most relevant sections and synthesize grounded answers with citations.",
};

const SAMPLE_QUESTIONS = [
  'What are the main takeaways from the uploaded documents?',
  'Summarize the key findings and cite the source pages.',
  'Is there any mention of pricing, timelines, or requirements?',
];

function newSessionId() {
  return `session_${Math.random().toString(36).substring(2, 9)}`;
}

export default function ChatView({ sessionId, setSessionId, activeBackend }) {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [docCount, setDocCount] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // How many documents are indexed is the fact that decides whether asking is
  // worth anything - which is why it, and not the session id, heads this view.
  useEffect(() => {
    let cancelled = false;
    fetchDocuments()
      .then((res) => {
        if (!cancelled) setDocCount((res.documents || []).length);
      })
      .catch(() => {
        if (!cancelled) setDocCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBackend]);

  // Grow the field with its content instead of scrolling a one-line ribbon the
  // user cannot proofread before sending.
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setInput('');
    setLoading(true);

    try {
      const data = await sendChatMessage({ message: prompt, sessionId });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          isError: true,
          content: err.message || 'The reasoning engine did not respond. Try sending the question again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResetSession = () => {
    setSessionId(newSessionId());
    setMessages([
      {
        role: 'assistant',
        content: 'New conversation started. What would you like to explore in your documents?',
      },
    ]);
  };

  const backendLabel = activeBackend === 'cloudsql' ? 'Cloud SQL (pgvector)' : 'Firestore Vector';

  return (
    <div className="chat-container">
      {/* Which store is answering, and whether anything is indexed to answer from. */}
      <div className="chat-meta-bar">
        <div className="chat-meta-facts">
          <Database size={14} aria-hidden="true" />
          <span>{backendLabel}</span>
          {docCount !== null && (
            <>
              <span className="chat-meta-sep" aria-hidden="true">/</span>
              <span>
                <span className="chat-meta-count">{docCount}</span>{' '}
                {docCount === 1 ? 'document' : 'documents'} indexed
              </span>
            </>
          )}
        </div>
        <button
          className="btn-icon"
          onClick={handleResetSession}
          title={`Start a new conversation (current session: ${sessionId})`}
          aria-label="Start a new conversation"
          style={{ width: '28px', height: '28px' }}
        >
          <RefreshCw size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="messages-list" aria-live="polite" aria-atomic="false">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`message-bubble ${msg.role}${msg.isError ? ' is-error' : ''}`}
          >
            <div className="message-role">
              {msg.role === 'user' ? (
                <>
                  <User size={13} aria-hidden="true" />
                  <span>You</span>
                </>
              ) : (
                <>
                  <Bot size={13} aria-hidden="true" />
                  <span>RAG Agent</span>
                </>
              )}
            </div>

            {msg.isError ? (
              <div className="message-error-body">
                <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>{msg.content}</span>
              </div>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
          </div>
        ))}

        {loading && (
          <div
            className="message-bubble assistant"
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
          >
            <div className="spinner" style={{ width: '16px', height: '16px' }} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Searching vector store and synthesizing response...
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length === 1 && (
        <div className="quick-prompts">
          {SAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="quick-prompt"
              onClick={() => {
                setInput(q);
                textareaRef.current?.focus();
              }}
            >
              <Sparkles size={11} aria-hidden="true" style={{ marginRight: '0.3rem', verticalAlign: '-1px' }} />
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="chat-input-bar">
        <textarea
          ref={textareaRef}
          rows={1}
          className="chat-input chat-textarea"
          placeholder="Ask a question about your uploaded documents..."
          aria-label="Ask a question about your uploaded documents"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          {loading ? (
            <div className="spinner" style={{ width: '16px', height: '16px' }} />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
          <span>Send</span>
        </button>
      </form>
      <div className="chat-hint">Enter to send, Shift + Enter for a new line.</div>
    </div>
  );
}
