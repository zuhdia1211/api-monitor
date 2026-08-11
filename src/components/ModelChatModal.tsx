import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Cpu, Clock, Zap } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  latencyMs?: number;
}

interface ModelChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  modelId: string;
}

export const ModelChatModal: React.FC<ModelChatModalProps> = ({
  isOpen,
  onClose,
  targetId,
  targetName,
  modelId,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [maxTokens, setMaxTokens] = useState(1024);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, modelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setSending(true);

    try {
      const apiMessages = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`/api/targets/${targetId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, messages: apiMessages, maxTokens }),
      });

      const data = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}: Invalid JSON response` }));
      if (data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content, latencyMs: data.latencyMs }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data.error}`, latencyMs: data.latencyMs }]);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Network error: ${err.message}` }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="theme-bg-card border theme-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh] max-h-[700px] theme-text-main transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b theme-border theme-bg-subtle rounded-t-2xl">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Cpu className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold theme-text-main truncate">{modelId}</h3>
              <p className="text-[11px] theme-text-muted font-mono truncate">{targetName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 text-[11px] theme-text-muted">
              <Zap className="w-3 h-3" />
              <span>Max:</span>
              <select
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="theme-bg-input border theme-border rounded-lg px-1.5 py-0.5 text-[11px] theme-text-main font-mono"
              >
                <option value={256}>256</option>
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
                <option value={4096}>4096</option>
              </select>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg theme-text-muted hover:theme-text-main hover:theme-bg-subtle transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full theme-text-muted text-xs space-y-2">
              <Cpu className="w-8 h-8 text-indigo-400" />
              <p className="font-semibold">Chat Reasoning Test</p>
              <p className="text-center max-w-xs">Kirim pesan untuk menguji kemampuan reasoning model <strong className="theme-text-main">{modelId}</strong></p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-md'
                    : 'theme-bg-subtle border theme-border theme-text-main rounded-bl-md'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.latencyMs !== undefined && (
                  <div className={`flex items-center space-x-1 mt-1.5 text-[10px] ${msg.role === 'user' ? 'text-indigo-200' : 'theme-text-muted'}`}>
                    <Clock className="w-3 h-3" />
                    <span>{msg.latencyMs}ms</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="theme-bg-subtle border theme-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t theme-border p-3">
          <div className="flex items-end space-x-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pesan untuk test reasoning..."
              rows={1}
              className="flex-1 theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-indigo-500 resize-none font-medium"
              style={{ minHeight: '38px', maxHeight: '120px' }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-40 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
