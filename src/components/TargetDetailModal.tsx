import React, { useState, useEffect } from 'react';
import { ApiTarget, HealthCheckResult, getModelStatusMeta, isSettledStatus } from '../types';

import { X, Cpu, Clock, CheckCircle2, AlertTriangle, XCircle, Code, BarChart3, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { TokenUsageLedger } from './TokenUsageLedger';

interface TargetDetailModalProps {
  target: ApiTarget | null;
  onClose: () => void;
  onRunCheck: (id: string) => Promise<void>;
  isCheckInFlight?: boolean;
}

export const TargetDetailModal: React.FC<TargetDetailModalProps> = ({ target, onClose, onRunCheck, isCheckInFlight = false }) => {
  const [logs, setLogs] = useState<HealthCheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'logs'>('overview');

  const fetchLogs = async () => {
    if (!target) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?targetId=${target.id}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (target) {
      fetchLogs();
    }
  }, [target]);

  if (!target) return null;

  const handleTriggerCheck = async () => {
    setChecking(true);
    try {
      await onRunCheck(target.id);
      await fetchLogs();
    } finally {
      setChecking(false);
    }
  };

  const chartData = [...logs].reverse().map((log) => ({
    time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    latency: log.latencyMs,
    status: log.overallStatus,
  }));

  const lastCheck = logs[0] || target.lastCheckResult;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start p-4 pt-[calc(env(safe-area-inset-top,0px)+2rem)] bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="theme-bg-card border theme-border rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden theme-text-main my-8 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b theme-border theme-bg-subtle">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 theme-bg-input border theme-border rounded-xl">
              <Cpu className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold theme-text-main">{target.name}</h2>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md theme-bg-subtle theme-text-muted border theme-border">
                  OpenAI / LLM
                </span>
              </div>
              <p className="text-xs theme-text-muted font-mono mt-0.5 truncate max-w-lg">
                {target.baseUrl || target.url}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleTriggerCheck}
              disabled={checking || isCheckInFlight}
              className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking || isCheckInFlight ? 'animate-spin' : ''}`} />
              <span>{isCheckInFlight ? 'Running...' : checking ? 'Testing...' : 'Check Now'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 theme-text-muted hover:theme-text-main rounded-xl hover:theme-bg-subtle transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-6 border-b theme-border theme-bg-subtle text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'overview'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent theme-text-muted hover:theme-text-main'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Metrics &amp; Latency</span>
          </button>

          <button
              onClick={() => setActiveTab('models')}
              className={`px-4 py-3 font-bold border-b-2 transition flex items-center space-x-1.5 ${
                activeTab === 'models'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent theme-text-muted hover:theme-text-main'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Discovered Models ({lastCheck?.discoveredModelsCount || 0})</span>
            </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-3 font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'logs'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent theme-text-muted hover:theme-text-main'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Raw Execution Logs ({logs.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 text-xs">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Uptime History Bar Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold theme-text-sub">Recent Checks Uptime Grid (Last 30 Checks)</span>
                  <span className="theme-text-muted font-mono text-[11px]">
                    Uptime: <strong className="text-emerald-600 dark:text-emerald-400">{target.uptimePercent || 100}%</strong>
                  </span>
                </div>
                <div className="grid grid-cols-15 sm:grid-cols-30 gap-1 theme-bg-subtle p-3 rounded-xl border theme-border">
                  {logs.length === 0 ? (
                    <span className="theme-text-muted col-span-full text-center py-2">No check history recorded yet</span>
                  ) : (
                    logs.map((log) => {
                      const bg =
                        log.overallStatus === 'healthy'
                          ? 'bg-emerald-500'
                          : log.overallStatus === 'degraded'
                          ? 'bg-amber-500'
                          : 'bg-rose-500';
                      return (
                        <div
                          key={log.id}
                          title={`${new Date(log.timestamp).toLocaleTimeString()}: ${log.overallStatus.toUpperCase()} (${log.latencyMs}ms)`}
                          className={`h-7 rounded ${bg} opacity-90 hover:opacity-100 transition cursor-pointer`}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* Response Time Chart */}
              <div>
                <span className="font-semibold theme-text-sub block mb-3">Latency Performance (ms)</span>
                <div className="theme-bg-subtle border theme-border rounded-xl p-4 h-60">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="[&>line]:stroke-[var(--border-color)]" stroke="#e5e7eb" />
                        <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} unit="ms" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border-color)',
                            borderRadius: '12px',
                            fontSize: '12px',
                            color: 'var(--text-main)',
                          }}
                          itemStyle={{ color: '#38bdf8' }}
                        />
                        <Line type="monotone" dataKey="latency" stroke="#38bdf8" strokeWidth={2} dot={{ fill: '#38bdf8', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center theme-text-muted">
                      No latency data recorded yet
                    </div>
                  )}
                </div>
              </div>

              {/* Token Usage Ledger — WeizeRouter */}
              <TokenUsageLedger targetId={target.id} />

            </div>
          )}

          {activeTab === 'models' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between theme-text-sub font-semibold">
                <span>Discovered Models Status Matrix</span>
                <span className="text-[11px] theme-text-muted">
                  Auto-Tested via <code className="text-indigo-600 dark:text-indigo-400">POST /v1/chat/completions</code>
                </span>
              </div>

              {!lastCheck?.modelResults || lastCheck.modelResults.length === 0 ? (
                <div className="p-8 text-center theme-text-muted theme-bg-subtle rounded-xl border theme-border">
                  No model results available yet. Run a check to discover models.
                </div>
              ) : (
                <div className="space-y-3">
                  {lastCheck.modelResults.filter((m, i, arr) => arr.findIndex((x) => x.modelId === m.modelId) === i).map((m) => (
                    <div
                      key={m.modelId}
                      className="theme-bg-subtle border theme-border rounded-xl p-4 space-y-2 hover:opacity-90 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-4 h-4 text-indigo-500" />
                          <span className="font-mono font-bold theme-text-main text-sm">{m.modelId}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="font-mono theme-text-muted">
                            {isSettledStatus(m.status) ? `${m.latencyMs} ms` : '—'}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono border ${
                              getModelStatusMeta(m.status).badge
                            }`}
                          >
                            {getModelStatusMeta(m.status).label}
                          </span>

                        </div>
                      </div>

                      {m.responseSnippet && (
                        <div className="theme-bg-card p-2.5 rounded-lg border theme-border theme-text-sub font-mono text-[11px]">
                          <span className="theme-text-muted font-semibold block mb-0.5">Completion Output Payload:</span>
                          "{m.responseSnippet}"
                        </div>
                      )}

                      {m.errorMessage && (
                        <div className="bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/80 text-rose-700 dark:text-rose-300 font-mono text-[11px]">
                          <span className="text-rose-600 dark:text-rose-400 font-semibold block mb-0.5">Error Detail:</span>
                          {m.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              <span className="font-semibold theme-text-sub block">Historical Request Logs</span>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="theme-bg-subtle border theme-border rounded-xl p-3 font-mono space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="theme-text-muted">{new Date(log.timestamp).toLocaleString()}</span>
                    <div className="flex items-center space-x-2">
                      <span className="theme-text-sub">{log.latencyMs}ms</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded uppercase ${
                          log.overallStatus === 'healthy'
                            ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {log.overallStatus}
                      </span>
                    </div>
                  </div>

                  {log.errorMessage && (
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/60 rounded border border-rose-200 dark:border-rose-900 text-[10px] text-rose-700 dark:text-rose-300">
                      {log.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
