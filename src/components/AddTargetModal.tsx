import React, { useState, useEffect, useRef } from 'react';
import { ApiTarget, ProviderId } from '../types';
import { X, Cpu, Eye, EyeOff, Zap, AlertTriangle, Info } from 'lucide-react';

interface ProviderPreset {
  id: ProviderId;
  label: string;
  apiFormat: 'openai' | 'anthropic';
  baseUrl: string;
  editableBaseUrl: boolean;
  keyPlaceholder: string;
  notes?: string;
}

interface AddTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (target: Partial<ApiTarget>) => Promise<void>;
  editingTarget?: ApiTarget | null;
}

export const AddTargetModal: React.FC<AddTargetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTarget,
}) => {
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  const [provider, setProvider] = useState<ProviderId>('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testPrompt, setTestPrompt] = useState('ping');
  const [maxTokens, setMaxTokens] = useState(5);
  const [weizeRouterPortalId, setWeizeRouterPortalId] = useState('');
  const [weizeRouterBaseUrl, setWeizeRouterBaseUrl] = useState('');

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<any | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (editingTarget) {
      setName(editingTarget.name);
      setEnabled(editingTarget.enabled ?? true);
      setProvider(editingTarget.provider || 'openai-compatible');
      setBaseUrl(editingTarget.baseUrl || editingTarget.url || '');
      setApiKey(editingTarget.apiKey || '');
      setTestPrompt(editingTarget.testPrompt || 'ping');
      setMaxTokens(editingTarget.maxTokens || 5);
      setWeizeRouterPortalId(editingTarget.weizeRouterPortalId || '');
      setWeizeRouterBaseUrl(editingTarget.weizeRouterBaseUrl || '');
    } else {
      setName('');
      setEnabled(true);
      setProvider('openai-compatible');
      setBaseUrl('');
      setApiKey('');
      setTestPrompt('ping');
      setMaxTokens(5);
      setWeizeRouterPortalId('');
      setWeizeRouterBaseUrl('');
      setDiscoveryResult(null);
      setDiscoveryError(null);
      setFormError(null);
    }
  }, [editingTarget, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activePreset = providers.find((p) => p.id === provider);
  const effectiveBaseUrl = baseUrl.trim() || activePreset?.baseUrl || '';

  const handleProviderChange = (nextId: ProviderId) => {
    setProvider(nextId);
    const preset = providers.find((p) => p.id === nextId);
    // Hosted providers own their base URL; custom ones start blank for the user to fill.
    setBaseUrl(preset?.editableBaseUrl ? '' : preset?.baseUrl || '');
    setDiscoveryResult(null);
    setDiscoveryError(null);
  };

  const handleLiveDiscover = async () => {
    if (!effectiveBaseUrl) {
      setDiscoveryError('Please enter a Base URL first');
      return;
    }
    setIsDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryResult(null);

    try {
      const res = await fetch('/api/openai/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl: effectiveBaseUrl,
          apiKey: apiKey.trim(),
          testPrompt: testPrompt.trim() || 'ping',
          maxTokens: Number(maxTokens) || 5,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Discovery failed');
      setDiscoveryResult(data);
    } catch (err: any) {
      setDiscoveryError(err.message || 'Failed to communicate with endpoint');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) { setFormError('Endpoint Name is required'); return; }
    if (!effectiveBaseUrl) { setFormError('Please enter a Base URL for this provider'); return; }

    setSaving(true);
    try {
      const payload: Partial<ApiTarget> = {
        id: editingTarget?.id,
        name: name.trim(),
        type: 'openai',
        provider,
        enabled,
        baseUrl: effectiveBaseUrl,
        url: effectiveBaseUrl,
        apiKey: apiKey.trim(),
        autoDiscoverModels: true,
        testPrompt: testPrompt.trim() || 'ping',
        maxTokens: Number(maxTokens) || 5,
        weizeRouterPortalId: weizeRouterPortalId.trim() || undefined,
        weizeRouterBaseUrl: weizeRouterBaseUrl.trim() || undefined,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save endpoint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start p-4 pt-[calc(env(safe-area-inset-top,0px)+2rem)] bg-black/60 backdrop-blur-md overflow-y-auto">
      <div className="theme-bg-card theme-border border rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-8 theme-text-main transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border theme-bg-subtle">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 theme-bg-input border theme-border rounded-xl">
              <Cpu className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-base font-extrabold theme-text-main">
                {editingTarget ? 'Configure LLM Endpoint' : 'Add New LLM Endpoint'}
              </h2>
              <p className="text-xs theme-text-muted font-medium">
                Set up health diagnostics for OpenAI / vLLM / LLM inference backends
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl theme-text-muted hover:theme-text-main hover:theme-bg-subtle transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs">
          {/* Name */}
          <div>
            <label className="block font-bold theme-text-main mb-1">Endpoint Name *</label>
            <input
              ref={firstInputRef}
              type="text"
              placeholder="e.g., vLLM Llama-3 Node, WeizeRouter"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 theme-text-main placeholder:theme-text-muted focus:outline-none focus:border-indigo-500 font-medium"
              required
            />
          </div>

          {/* Provider Selection */}
          <div className="border-t theme-border pt-4">
            <label className="block font-bold theme-text-main mb-2">Provider *</label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`px-3 py-2.5 rounded-xl border-2 font-semibold text-xs transition ${
                    provider === p.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 theme-text-main'
                      : 'theme-border theme-bg-input theme-text-muted hover:border-indigo-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {activePreset?.notes && (
              <div className="mt-2 flex items-start space-x-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-800 dark:text-blue-300">{activePreset.notes}</p>
              </div>
            )}
          </div>

          {/* Base URL + Discover */}
          <div className="space-y-4">
            <div>
              <label className="block font-bold theme-text-main mb-1">
                {activePreset?.editableBaseUrl ? 'Base URL *' : `Base URL (${activePreset?.label})`}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="http://localhost:11434/v1 or https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 theme-text-main font-mono placeholder:theme-text-muted focus:outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={handleLiveDiscover}
                  disabled={isDiscovering}
                  className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center space-x-1.5 flex-shrink-0 transition disabled:opacity-50"
                >
                  <Zap className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                  <span>{isDiscovering ? 'Discovering...' : 'Live Discover'}</span>
                </button>
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block font-bold theme-text-main mb-1">API Authorization Key (Optional)</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full theme-bg-input border theme-border rounded-xl pl-3.5 pr-10 py-2 theme-text-main font-mono placeholder:theme-text-muted focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 theme-text-muted hover:theme-text-main"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold theme-text-main mb-1">Test Prompt</label>
                <input
                  type="text"
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3 py-2 theme-text-main font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block font-bold theme-text-main mb-1">Max Tokens</label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full theme-bg-input border theme-border rounded-xl px-3 py-2 theme-text-main font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* WeizeRouter Token Portal (per-endpoint) */}
            <div className="border-t theme-border pt-4">
              <label className="block font-bold theme-text-main mb-2">WeizeRouter Token Portal (Opsional)</label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold theme-text-main mb-1">Portal ID</label>
                  <input
                    type="text"
                    placeholder="df9670a96396c0034d46a806becb5670..."
                    value={weizeRouterPortalId}
                    onChange={(e) => setWeizeRouterPortalId(e.target.value)}
                    className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main font-mono placeholder:theme-text-muted focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold theme-text-main mb-1">Base URL</label>
                  <input
                    type="text"
                    placeholder="https://weizerouter.web.id"
                    value={weizeRouterBaseUrl}
                    onChange={(e) => setWeizeRouterBaseUrl(e.target.value)}
                    className="w-full theme-bg-input border theme-border rounded-xl px-3.5 py-2.5 text-xs theme-text-main font-mono placeholder:theme-text-muted focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] theme-text-muted mt-1">Kosongkan untuk pakai default global di Settings.</p>
                </div>
              </div>
            </div>

            {/* Discovery Results */}
            {discoveryResult && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 font-bold">
                  <span>Discovery Successful: {discoveryResult.discoveredModels?.length || discoveryResult.modelResults?.length || 0} Models Found</span>
                </div>
                {(discoveryResult.discoveredModels || discoveryResult.modelResults) && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(discoveryResult.discoveredModels || discoveryResult.modelResults).filter((m: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.modelId === m.modelId) === i).map((m: any) => (
                      <div key={m.modelId} className="flex items-center justify-between text-[11px] theme-bg-subtle px-2 py-1 rounded-md border theme-border font-mono">
                        <span className="theme-text-main truncate font-semibold">{m.modelId}</span>
                        <span className={`font-bold uppercase ${m.status === 'operational' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {m.status} ({m.latencyMs}ms)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {discoveryError && (
              <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-300 font-mono flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <span>{discoveryError}</span>
              </div>
            )}
          </div>

          {formError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-semibold">
              {formError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 border-t theme-border pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-semibold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50">
              {saving ? 'Saving...' : editingTarget ? 'Update Endpoint' : 'Add Endpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
