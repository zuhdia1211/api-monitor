import React, { useState } from 'react';
import { ApiTarget, getProviderLabel, getModelStatusMeta, isSettledStatus } from '../types';
import {
  Play,
  Cpu,
  Loader2,

  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
  Sliders,
  Square,
  PauseCircle,
} from 'lucide-react';



interface TargetCardProps {
  target: ApiTarget;
  onCheckNow: (id: string) => void;
  onCancelCheck: (id: string) => void;
  onInspect: (target: ApiTarget) => void;
  onDelete: (id: string) => void;
  onEdit: (target: ApiTarget) => void;
  isChecking: boolean;
}

export const TargetCard: React.FC<TargetCardProps> = ({
  target,
  onCheckNow,
  onCancelCheck,
  onInspect,
  onDelete,
  onEdit,
  isChecking,
}) => {

  const [expandedModels, setExpandedModels] = useState(true);

  const lastResult = target.lastCheckResult;
  const status = lastResult?.overallStatus || 'unknown';

  const statusColors = {
    healthy: {
      border: 'theme-border hover:border-emerald-500/50',
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800',
      dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
      label: 'Healthy',
      accentLine: 'bg-emerald-500',
    },
    degraded: {
      border: 'theme-border hover:border-amber-500/50',
      badgeBg: 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800',
      dot: 'bg-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
      label: 'Degraded',
      accentLine: 'bg-amber-500',
    },
    down: {
      border: 'theme-border hover:border-rose-500/50',
      badgeBg: 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800',
      dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
      label: 'Down',
      accentLine: 'bg-rose-500',
    },
    unknown: {
      border: 'theme-border',
      badgeBg: 'theme-bg-subtle theme-text-muted theme-border',
      dot: 'bg-slate-400',
      label: 'Pending',
      accentLine: 'bg-slate-400',
    },
  };

  const style = statusColors[status];
  // A disabled target is skipped by the scheduler, so its metrics are stale.
  const isPaused = target.enabled === false;
  const providerLabel = getProviderLabel(target.provider);

  const formattedCheckTime = target.lastCheckedAt
    ? new Date(target.lastCheckedAt).toLocaleTimeString()
    : 'Never';

  // Live progress while models are still being probed one by one.
  const progress = target.checkProgress;
  const progressPercent =
    progress && progress.totalModels > 0
      ? Math.round((progress.completedModels / progress.totalModels) * 100)
      : 0;

  return (
    <div
      className={`theme-bg-card border rounded-2xl p-5 shadow-sm transition-all duration-200 ${style.border} relative group overflow-hidden ${
        isPaused ? 'opacity-60' : ''
      }`}
    >
      {/* Top Left Geometric Status Indicator Strip — greyed out while paused. */}
      <div className={`absolute top-0 left-0 w-1.5 h-full ${isPaused ? 'bg-slate-400' : style.accentLine}`} />

      <div className="pl-2">
        {/* Top Card Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2.5 theme-bg-subtle border theme-border rounded-xl flex-shrink-0">
              <Cpu className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold theme-text-main text-base truncate">{target.name}</h3>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-lg theme-bg-subtle theme-text-main border theme-border">
                  {providerLabel}
                </span>
                {isPaused && (
                  <span
                    title="Auto-checks are disabled for this target"
                    className="flex items-center gap-1 text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-lg theme-bg-subtle theme-text-muted border theme-border"
                  >
                    <PauseCircle className="w-3 h-3" />
                    Paused
                  </span>
                )}
              </div>
              <p className="text-xs theme-text-muted font-mono truncate max-w-md mt-0.5">
                {target.baseUrl || target.url}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold border ${style.badgeBg}`}
            >
              <span className={`w-2 h-2 rounded-full ${style.dot} ${isChecking ? 'animate-ping' : ''}`} />
              <span>{isChecking ? 'Testing...' : style.label}</span>
            </div>
          </div>
        </div>

        {/* Metrics Row Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 theme-bg-subtle rounded-xl p-3 border theme-border mb-4 text-xs">
          <div>
            <span className="theme-text-muted block text-[10px] font-mono uppercase font-semibold">Latency</span>
            <span className="font-mono font-bold theme-text-main">
              {lastResult?.latencyMs !== undefined ? `${lastResult.latencyMs} ms` : '—'}
            </span>
          </div>

          <div>
            <span className="theme-text-muted block text-[10px] font-mono uppercase font-semibold">Avg Latency</span>
            <span className="font-mono font-bold theme-text-main">
              {target.avgLatencyMs !== undefined ? `${Math.round(target.avgLatencyMs)} ms` : '—'}
            </span>
          </div>

          <div>
            <span className="theme-text-muted block text-[10px] font-mono uppercase font-semibold">Uptime</span>
            <span
              className={`font-mono font-bold ${
                (target.uptimePercent || 100) >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {target.uptimePercent !== undefined ? `${target.uptimePercent}%` : '100%'}
            </span>
          </div>

          <div>
            <span className="theme-text-muted block text-[10px] font-mono uppercase font-semibold">Last Check</span>
            <span className="font-mono theme-text-main">{formattedCheckTime}</span>
          </div>
        </div>

        {/* Live per-model progress bar while a check is running */}
        {progress && progress.phase !== 'done' && (
          <div className="mb-4 theme-bg-subtle border theme-border rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-bold theme-text-main">
                Testing models {progress.completedModels}/{progress.totalModels}
              </span>
              <span className="theme-text-muted">{progressPercent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full theme-bg-card overflow-hidden border theme-border">
              <div
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {progress.currentModelIds.length > 0 && (
              <p className="text-[10px] font-mono theme-text-muted truncate">
                Now testing: {progress.currentModelIds.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Error Banner if overall status is down or degraded */}
        {lastResult?.errorMessage && (
          <div className="mb-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-bold block text-rose-900 dark:text-rose-200">Issue Detected:</span>
              <span className="font-mono text-[11px] break-words">{lastResult.errorMessage}</span>
            </div>
          </div>
        )}

        {/* OpenAI Multi-Model Section */}
        {target.type === 'openai' && lastResult?.modelResults && lastResult.modelResults.length > 0 && (
          <div className="mb-4 theme-bg-subtle border theme-border rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedModels(!expandedModels)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold theme-text-main theme-bg-subtle hover:opacity-80 transition border-b theme-border"
            >
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <span className="font-bold theme-text-main">
                  Discovered Models ({lastResult.modelResults.length})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-bold">
                  {lastResult.modelResults.filter((m) => m.status === 'operational').length} Operational
                </span>
              </div>
              <div className="flex items-center space-x-1 theme-text-muted font-mono text-[10px]">
                <span className="uppercase tracking-wider">{expandedModels ? 'Hide' : 'Show'}</span>
                {expandedModels ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {expandedModels && (
              <div className="divide-y theme-border text-xs">
                {lastResult.modelResults.filter((model, i, arr) => arr.findIndex((m) => m.modelId === model.modelId) === i).map((model) => {
                  const isOp = model.status === 'operational';
                  const pending = !isSettledStatus(model.status);
                  const meta = getModelStatusMeta(model.status);
                  return (
                    <div key={model.modelId} className="p-3 hover:theme-bg-subtle transition space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          {pending ? (
                            <Loader2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0 animate-spin" />
                          ) : isOp ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                          )}
                          <span className="font-mono font-bold theme-text-main truncate">{model.modelId}</span>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className="font-mono text-[11px] theme-text-muted">
                            {pending ? '—' : `${model.latencyMs}ms`}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase font-mono border ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                      </div>


                      {model.responseSnippet && (
                        <p className="text-[11px] theme-text-main font-mono theme-bg-card px-2.5 py-1.5 rounded-lg border theme-border truncate">
                          <span className="theme-text-muted font-semibold">Output: </span>
                          "{model.responseSnippet}"
                        </p>
                      )}
                      {model.errorMessage && (
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 font-mono bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 break-words">
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">Error: </span>
                          {model.errorMessage}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Card Action Footer */}
        <div className="flex items-center justify-between pt-2 border-t theme-border text-xs">
          <div className="flex items-center space-x-2">
            {isChecking ? (
              <button
                onClick={() => onCancelCheck(target.id)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition"
              >
                <Square className="w-3 h-3" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={() => onCheckNow(target.id)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition"
              >
                <Play className="w-3 h-3 text-cyan-500" />
                <span>Test Now</span>
              </button>
            )}

            <button
              onClick={() => onInspect(target)}

              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold theme-bg-subtle hover:opacity-80 theme-text-main border theme-border transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
              <span>Analytics &amp; Logs</span>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => onEdit(target)}
              title="Edit Target Configuration"
              className="p-1.5 rounded-lg theme-text-muted hover:theme-text-main hover:theme-bg-subtle transition"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(target.id)}
              title="Delete Target"
              className="p-1.5 rounded-lg theme-text-muted hover:text-rose-500 hover:theme-bg-subtle transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
