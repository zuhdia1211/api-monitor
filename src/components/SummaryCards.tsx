import React from 'react';
import { SummaryMetrics } from '../types';
import { Activity, Cpu, CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck } from 'lucide-react';

interface SummaryCardsProps {
  metrics: SummaryMetrics | null;
  loading: boolean;
  variant: 'models' | 'endpoints';
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ metrics, loading, variant }) => {
  if (loading && !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="theme-bg-card border theme-border rounded-2xl p-4 animate-pulse h-28" />
        ))}
      </div>
    );
  }

  const m = metrics || {
    totalTargets: 0,
    activeTargets: 0,
    healthyCount: 0,
    degradedCount: 0,
    downCount: 0,
    totalModelsDiscovered: 0,
    totalModelsOperational: 0,
    totalModelsFailing: 0,
    overallUptimePercent: 0,
    averageLatencyMs: 0,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {variant === 'models' ? (
        <>
          {/* Models: Discovered */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-indigo-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">LLM Models</span>
              <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold theme-text-main font-mono tracking-tight">{m.totalModelsDiscovered}</span>
              <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 theme-bg-subtle border theme-border px-2 py-0.5 rounded-lg">
                {m.totalModelsOperational} Verified
              </span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">
              {m.totalModelsFailing > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">{m.totalModelsFailing} Failures</span>
              ) : 'Auto-Discovered & Verified'}
            </p>
          </div>

          {/* Models: Operational */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-emerald-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Operational</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">{m.totalModelsOperational}</span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">Models passing health checks</p>
          </div>

          {/* Models: Failing */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-rose-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Failing</span>
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 font-mono tracking-tight">{m.totalModelsFailing}</span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">Error / timeout / unreachable</p>
          </div>

          {/* Models: Avg Latency */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-amber-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Avg Latency</span>
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold theme-text-main font-mono tracking-tight">
                {m.averageLatencyMs} <span className="text-xs theme-text-muted font-normal">ms</span>
              </span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">Average Response Speed</p>
          </div>
        </>
      ) : (
        <>
          {/* Endpoints: Total Monitored */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-cyan-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Endpoints</span>
              <Activity className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold theme-text-main font-mono tracking-tight">{m.totalTargets}</span>
              <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400 theme-bg-subtle border theme-border px-2 py-0.5 rounded-lg">
                {m.activeTargets} Active
              </span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">LLM / AI Endpoint Nodes</p>
          </div>

          {/* Endpoints: Uptime */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-emerald-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Overall Uptime</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${m.overallUptimePercent >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {m.overallUptimePercent}%
              </span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">Historical Execution SLA</p>
          </div>

          {/* Endpoints: Status Distribution */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-slate-400 dark:border-t-slate-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Status</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-center justify-between gap-1 text-xs">
              <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 theme-bg-subtle px-2 py-1 rounded-lg border theme-border font-mono font-bold">
                <CheckCircle2 className="w-3 h-3" />
                <span>{m.healthyCount}</span>
              </div>
              <div className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 theme-bg-subtle px-2 py-1 rounded-lg border theme-border font-mono font-bold">
                <AlertTriangle className="w-3 h-3" />
                <span>{m.degradedCount}</span>
              </div>
              <div className="flex items-center space-x-1 text-rose-600 dark:text-rose-400 theme-bg-subtle px-2 py-1 rounded-lg border theme-border font-mono font-bold">
                <XCircle className="w-3 h-3" />
                <span>{m.downCount}</span>
              </div>
            </div>
            <p className="text-[11px] theme-text-muted mt-2 text-center font-medium">
              {m.downCount > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold">{m.downCount} Offline</span>
              ) : m.degradedCount > 0 ? (
                <span className="text-amber-600 dark:text-amber-400 font-bold">{m.degradedCount} Degraded</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">All Nominal</span>
              )}
            </p>
          </div>

          {/* Endpoints: Avg Latency */}
          <div className="theme-bg-card border theme-border border-t-2 border-t-amber-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
            <div className="flex items-center justify-between theme-text-muted mb-2">
              <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Avg Latency</span>
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl sm:text-3xl font-extrabold theme-text-main font-mono tracking-tight">
                {m.averageLatencyMs} <span className="text-xs theme-text-muted font-normal">ms</span>
              </span>
            </div>
            <p className="text-[11px] theme-text-muted font-medium mt-1">Average Response Speed</p>
          </div>
        </>
      )}
    </div>
  );
};
