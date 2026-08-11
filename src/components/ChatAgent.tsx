import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ApiTarget, ChatSession, ChatMessage, ModelTestResult } from '../types';
import {
  MessageSquare, Plus, Trash2, Send, Loader2, Clock, Zap,
  Archive, ChevronRight, Search, X, Edit3, Check,
} from 'lucide-react';

const MESSAGE_LIMIT = 50;

interface ChatAgentProps {
  targets: ApiTarget[];
}

export const ChatAgent: React.FC<ChatAgentProps> = ({ targets }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Default closed on narrow (< md) so the chat area is visible immediately.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelTestResult[]>([]);
  const [modelQuery, setModelQuery] = useState('');

  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) setSessions(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/chat/sessions/${activeSessionId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
          setMessageCount(data.messageCount || 0);
          setSelectedTargetId(data.targetId);
          setSelectedModelId(data.modelId);
        }
      } catch {}
    })();
  }, [activeSessionId]);

  useEffect(() => {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    if (!selectedTargetId) { setAvailableModels([]); return; }
    const target = targets.find(t => t.id === selectedTargetId);
    const raw = target?.lastCheckResult?.modelResults || [];
    const unique = raw.filter((m, i, arr) => arr.findIndex((x) => x.modelId === m.modelId) === i);
    setAvailableModels(unique);
  }, [selectedTargetId, targets]);

  // Only operational models are chat-worthy, so the picker never lists failing ones.
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    return availableModels.filter(
      m => m.status === 'operational' && (!q || m.modelId.toLowerCase().includes(q))
    );
  }, [availableModels, modelQuery]);

  const handleNewChat = async () => {
    if (!selectedTargetId || !selectedModelId) return;
    const target = targets.find(t => t.id === selectedTargetId);
    if (!target) return;

    try {
      const res = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: selectedTargetId, targetName: target.name, modelId: selectedModelId }),
      });
      if (res.ok) {
        const session = await res.json();
        setSessions(prev => [session, ...prev]);
        setActiveSessionId(session.id);
        setMessages([]);
        setMessageCount(0);
      }
    } catch {}
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setMessageCount(0);
      }
    } catch {}
  };

  const handleSend = async () => {
    if (!input.trim() || !activeSessionId || sending) return;

    const userContent = input.trim();
    setInput('');
    setSending(true);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`, sessionId: activeSessionId, role: 'user',
      content: userContent, createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userContent, targetId: selectedTargetId, modelId: selectedModelId }),
      });
      const data = await res.json();

      if (data.message) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, { ...tempUserMsg, id: `usr-${Date.now()}` }, data.message];
        });
      }
      if (data.messageCount !== undefined) setMessageCount(data.messageCount);
      fetchSessions();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, sessionId: activeSessionId, role: 'assistant',
        content: `Error: ${err.message}`, createdAt: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleCompress = async () => {
    if (!activeSessionId || compressing) return;
    setCompressing(true);
    try {
      const res = await fetch(`/api/chat/sessions/${activeSessionId}/compress`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        if (data.messageCount !== undefined) setMessageCount(data.messageCount);
        const sessionRes = await fetch(`/api/chat/sessions/${activeSessionId}`);
        if (sessionRes.ok) {
          const refreshed = await sessionRes.json();
          setMessages(refreshed.messages || []);
        }
        fetchSessions();
      }
    } catch {} finally {
      setCompressing(false);
    }
  };

  const handleChangeModel = async (newModelId: string) => {
    if (!activeSessionId) return;
    setSelectedModelId(newModelId);
    try {
      await fetch(`/api/chat/sessions/${activeSessionId}/model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: newModelId }),
      });
      fetchSessions();
    } catch {}
  };

  const handleSaveTitle = async (sessionId: string) => {
    if (!editTitleValue.trim()) return;
    try {
      await fetch(`/api/chat/sessions/${sessionId}/title`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitleValue.trim() }),
      });
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: editTitleValue.trim() } : s));
    } catch {} finally {
      setEditingTitle(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredSessions = searchQuery
    ? sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.targetName.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  const openaiTargets = targets.filter(t => t.type === 'openai' && t.lastCheckResult?.modelResults?.length);

  return (
    <div className="relative flex flex-1 min-h-0 rounded-2xl overflow-hidden border theme-border theme-bg-card">
      {/* Sidebar — mobile: slide-over drawer (absolute z-30); desktop: static side-panel */}
      {/* Semi-transparent backdrop on mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden absolute inset-0 z-20 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`
        absolute inset-y-0 left-0 z-30
        md:relative md:inset-y-auto md:left-auto md:z-auto
        w-[82%] max-w-xs md:w-72
        flex-shrink-0 border-r theme-border flex flex-col min-h-0 theme-bg-subtle
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* New Chat Controls */}
        <div className="p-3 border-b theme-border space-y-2 flex-shrink-0">
            <select
              value={selectedTargetId}
              onChange={e => { setSelectedTargetId(e.target.value); setSelectedModelId(''); }}
              className="w-full text-xs px-3 py-2 rounded-lg theme-bg-card theme-border border theme-text-main"
            >
              <option value="">Select Target...</option>
              {openaiTargets.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {/* Model search — the list itself is already limited to active models */}
            {selectedTargetId && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 theme-text-muted" />
                <input
                  type="text"
                  value={modelQuery}
                  onChange={e => setModelQuery(e.target.value)}
                  placeholder="Search active models..."
                className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg theme-bg-card theme-border border theme-text-main"
              />
              {modelQuery && (
                <button onClick={() => setModelQuery('')} className="absolute right-2 top-1.5">
                  <X className="w-3.5 h-3.5 theme-text-muted" />
                </button>
              )}
            </div>
          )}
          <select
            value={selectedModelId}
            onChange={e => setSelectedModelId(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg theme-bg-card theme-border border theme-text-main"
            disabled={!selectedTargetId}
          >
            <option value="">
              {filteredModels.length ? `Select Model (${filteredModels.length} active)...` : 'No active models found'}
            </option>
            {filteredModels.map(m => (
              <option key={m.modelId} value={m.modelId}>{m.modelId}</option>
            ))}
          </select>
          <button
            onClick={handleNewChat}
            disabled={!selectedTargetId || !selectedModelId}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 theme-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full text-xs pl-8 pr-7 py-1.5 rounded-lg theme-bg-card theme-border border theme-text-main"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1.5">
                <X className="w-3.5 h-3.5 theme-text-muted" />
              </button>
            )}
          </div>
        </div>

        {/* Session List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {filteredSessions.length === 0 && (
            <p className="text-xs theme-text-muted text-center py-6">No chat sessions yet</p>
          )}
          {filteredSessions.map(s => (
            <div
              key={s.id}
              onClick={() => {
                setActiveSessionId(s.id);
                // Close the drawer after picking a session on narrow screens.
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition text-xs ${
                activeSessionId === s.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  : 'hover:theme-bg-card theme-text-main'
              }`}
            >
              <div className="flex-1 min-w-0">
                {editingTitle === s.id ? (
                  <div className="flex items-center space-x-1">
                    <input
                      value={editTitleValue}
                      onChange={e => setEditTitleValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveTitle(s.id)}
                      className="flex-1 text-xs px-1 py-0.5 rounded theme-bg-card theme-border border theme-text-main"
                      autoFocus
                      onClick={e => e.stopPropagation()}
                    />
                    <button onClick={e => { e.stopPropagation(); handleSaveTitle(s.id); }}>
                      <Check className="w-3 h-3 text-emerald-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="font-semibold truncate">{s.title}</p>
                    <p className="text-[10px] theme-text-muted truncate">{s.targetName} / {s.modelId}</p>
                  </>
                )}
              </div>
              {/* Always visible on touch devices; hover-reveal on desktop */}
              <div className="flex items-center space-x-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition ml-1">
                <button
                  onClick={e => { e.stopPropagation(); setEditingTitle(s.id); setEditTitleValue(s.title); }}
                  className="p-1 hover:text-indigo-500"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                  className="p-1 hover:text-rose-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b theme-border flex-shrink-0">
          <div className="flex items-center space-x-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:theme-bg-subtle">
              <ChevronRight className={`w-4 h-4 theme-text-muted transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
            {activeSession ? (
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-bold theme-text-main truncate max-w-xs">{activeSession.title}</span>
              </div>
            ) : (
              <span className="text-sm theme-text-muted">Select or create a chat session</span>
            )}
          </div>

          {activeSession && (
            <div className="flex items-center space-x-1.5 sm:space-x-3">
              {/* Model Switcher */}
              <select
                value={selectedModelId}
                onChange={e => handleChangeModel(e.target.value)}
                className="text-xs px-1.5 py-1 rounded-lg theme-bg-subtle theme-border border theme-text-main max-w-[110px] sm:max-w-[200px]"
              >
                {/* Keep the session's model selectable even if the search would hide it. */}
                {!filteredModels.some(m => m.modelId === selectedModelId) && selectedModelId && (
                  <option value={selectedModelId}>{selectedModelId}</option>
                )}
                {filteredModels.map(m => (
                  <option key={m.modelId} value={m.modelId}>{m.modelId}</option>
                ))}
              </select>

              {/* Message Counter */}
              <div className={`flex items-center space-x-1 text-xs font-bold px-1.5 sm:px-2.5 py-1 rounded-full ${
                messageCount >= 48 ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                : messageCount >= 40 ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                : 'theme-bg-subtle theme-text-muted'
              }`}>
                <span>{messageCount}/{MESSAGE_LIMIT}</span>
              </div>

              {/* Compress Button */}
              <button
                onClick={handleCompress}
                disabled={compressing || messageCount < 4}
                className={`flex items-center space-x-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  messageCount >= 40
                    ? 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse'
                    : 'theme-bg-subtle theme-text-muted hover:theme-text-main'
                } disabled:opacity-40`}
              >
                {compressing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Compress</span>
              </button>
            </div>
          )}
        </div>

        {/* Messages — the only scrollable region on this page */}
        <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-4 space-y-4">
          {!activeSession && (
            <div className="flex flex-col items-center justify-center h-full space-y-3 theme-text-muted">
              <MessageSquare className="w-12 h-12 opacity-30" />
              <p className="text-sm">Select a chat session or create a new one</p>
              <p className="text-xs">Choose a target and model from the sidebar, then click "New Chat"</p>
            </div>
          )}

          {activeSession && messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full space-y-2 theme-text-muted">
              <MessageSquare className="w-10 h-10 opacity-30" />
              <p className="text-sm">Start your conversation</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : msg.role === 'system'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800'
                  : 'theme-bg-subtle theme-text-main border theme-border'
              }`}>
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.role === 'assistant' && (msg.latencyMs || msg.modelId) && (
                  <div className="flex items-center space-x-3 mt-2 pt-2 border-t border-current/10 text-[10px] opacity-60">
                    {msg.latencyMs && (
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{msg.latencyMs}ms</span>
                      </span>
                    )}
                    {msg.modelId && (
                      <span className="flex items-center space-x-1">
                        <Zap className="w-3 h-3" />
                        <span>{msg.modelId}</span>
                      </span>
                    )}
                    {msg.usage && (
                      <span>{(msg.usage.prompt_tokens || 0) + (msg.usage.completion_tokens || 0)} tokens</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="theme-bg-subtle rounded-2xl px-4 py-3 border theme-border">
                <Loader2 className="w-5 h-5 animate-spin theme-text-muted" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {activeSession && (
          <div className="px-4 py-3 border-t theme-border flex-shrink-0">
            {messageCount >= MESSAGE_LIMIT ? (
              <div className="text-center py-3">
                <p className="text-xs text-rose-500 font-bold mb-2">Message limit reached ({MESSAGE_LIMIT}). Compress chat to continue.</p>
                <button
                  onClick={handleCompress}
                  disabled={compressing}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600"
                >
                  {compressing ? 'Compressing...' : 'Compress Chat History'}
                </button>
              </div>
            ) : (
              <div className="flex items-end space-x-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  rows={1}
                  className="flex-1 text-sm px-4 py-2.5 rounded-xl theme-bg-subtle theme-border border theme-text-main resize-none focus:ring-2 focus:ring-indigo-500/30 focus:outline-none"
                  style={{ minHeight: '42px', maxHeight: '120px' }}
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
