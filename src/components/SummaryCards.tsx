import React from 'react';
import { SummaryMetrics } from '../types';
import { Activity, Cpu, CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck } from 'lucide-react';

interface SummaryCardsProps {
  metrics: SummaryMetrics | null;
  loading: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ metrics, loading }) => {
  if (loading && !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-8">
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
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mb-8">
      {/* 1. Overall Monitored Targets */}
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

      {/* 2. Discovered Models */}
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
            <span className="text-rose-600 dark:text-rose-400 font-semibold">{m.totalModelsFailing} Model Test Failures</span>
          ) : (
            'Auto-Discovered &amp; Verified'
          )}
        </p>
      </div>

      {/* 3. Overall Uptime */}
      <div className="theme-bg-card border theme-border border-t-2 border-t-emerald-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
        <div className="flex items-center justify-between theme-text-muted mb-2">
          <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Overall Uptime</span>
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${m.overallUptimePercent >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {m.overallUptimePercent}%
          </span>
          <span className="text-[10px] font-mono font-medium theme-text-muted uppercase">Rolling</span>
        </div>
        <p className="text-[11px] theme-text-muted font-medium mt-1">Historical Execution SLA</p>
      </div>

      {/* 4. Average Latency */}
      <div className="theme-bg-card border theme-border border-t-2 border-t-amber-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition relative overflow-hidden group">
        <div className="flex items-center justify-between theme-text-muted mb-2">
          <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Avg Latency</span>
          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl sm:text-3xl font-extrabold theme-text-main font-mono tracking-tight">
            {m.averageLatencyMs} <span className="text-xs theme-text-muted font-normal">ms</span>
          </span>
          <span className="text-[10px] font-mono theme-text-muted uppercase">TTFB</span>
        </div>
        <p className="text-[11px] theme-text-muted font-medium mt-1">Average Response Speed</p>
      </div>

      {/* 5. Health Status Distribution */}
      <div className="theme-bg-card border theme-border border-t-2 border-t-slate-400 dark:border-t-slate-700 rounded-2xl p-4 shadow-sm hover:shadow-md transition col-span-2 md:col-span-1">
        <div className="flex items-center justify-between theme-text-muted mb-2">
          <span className="text-[10px] font-mono tracking-wider uppercase font-semibold theme-text-muted">Status Rollup</span>
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
            <span className="text-rose-600 dark:text-rose-400 font-bold">{m.downCount} Endpoints Offline</span>
          ) : m.degradedCount > 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-bold">{m.degradedCount} Endpoints Degraded</span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">All Endpoints Nominal</span>
          )}
        </p>
      </div>
    </div>
  );
};
