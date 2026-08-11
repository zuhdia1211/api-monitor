import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ApiTarget, ModelTestResult, getModelStatusMeta, isSettledStatus } from '../types';

import {
  Cpu,
  CheckCircle2,
  XCircle,
  Play,
  MessageSquare,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Filter,
  Search,
  X,
  TimerOff,
} from 'lucide-react';


interface FlatModel {
  targetId: string;
  targetName: string;
  modelId: string;
  status: string;
  latencyMs: number;
  httpStatus: number;
  responseSnippet?: string;
  errorMessage?: string;
  testedAt: string;
}

interface ModelMonitorProps {
  targets: ApiTarget[];
  onOpenChat: (targetId: string, targetName: string, modelId: string) => void;
}

type SortField = 'target' | 'model' | 'status' | 'latency' | 'lastTest';
type SortOrder = 'asc' | 'desc';

/**
 * Timeouts get their own bucket rather than being lumped in with errors: a
 * model that ran out of budget usually just needs a longer one, which is a
 * very different action from a model that is genuinely broken.
 */
type StatusFilter = 'all' | 'operational' | 'timeout' | 'error';


const ColumnFilter: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}> = ({ value, onChange, placeholder, options }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); if (!open) setSearch(''); }}
        className={`p-0.5 rounded transition ${value ? 'text-indigo-500' : 'theme-text-muted hover:theme-text-main'}`}
        title="Filter column"
      >
        <Filter className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 theme-bg-card border theme-border rounded-xl shadow-xl p-2 min-w-[220px] max-w-[300px]" onClick={(e) => e.stopPropagation()}>
          {/* Search input */}
          <div className="flex items-center space-x-1.5 mb-1.5 border-b theme-border pb-1.5">
            <Search className="w-3 h-3 theme-text-muted flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-[11px] theme-text-main placeholder:theme-text-muted focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="theme-text-muted hover:theme-text-main flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-0.5">
            {/* Show "All" only when search is empty */}
            {!search && (
              <button
                onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
                className={`block w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium transition ${!value ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold' : 'theme-text-main hover:theme-bg-subtle'}`}
              >
                All
              </button>
            )}

            {/* Filtered list */}
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); setSearch(''); }}
                className={`block w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-medium truncate transition ${value === opt ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-bold' : 'theme-text-main hover:theme-bg-subtle'}`}
              >
                {opt}
              </button>
            ))}

            {filteredOptions.length === 0 && (
              <div className="px-2 py-2 text-[11px] theme-text-muted text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const ModelMonitor: React.FC<ModelMonitorProps> = ({ targets, onOpenChat }) => {
  const [endpointFilter, setEndpointFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [sortField, setSortField] = useState<SortField>('status');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [testingModels, setTestingModels] = useState<Set<string>>(new Set());
  const [liveResults, setLiveResults] = useState<Record<string, ModelTestResult>>({});

  const flatModels: FlatModel[] = [];
  for (const t of targets) {
    if (t.type !== 'openai' || !t.lastCheckResult?.modelResults) continue;
    const seen = new Set<string>();
    for (const m of t.lastCheckResult.modelResults) {
      if (seen.has(m.modelId)) continue;
      seen.add(m.modelId);
      const key = `${t.id}:${m.modelId}`;
      flatModels.push({
        targetId: t.id,
        targetName: t.name,
        modelId: m.modelId,
        status: liveResults[key]?.status || m.status,
        latencyMs: liveResults[key]?.latencyMs ?? m.latencyMs,
        httpStatus: liveResults[key]?.httpStatus ?? m.httpStatus,
        responseSnippet: liveResults[key]?.responseSnippet || m.responseSnippet,
        errorMessage: liveResults[key]?.errorMessage || m.errorMessage,
        testedAt: liveResults[key]?.testedAt || m.testedAt,
      });
    }
  }

  const endpointNames = useMemo(() => {
    const names = new Set<string>();
    flatModels.forEach((m) => names.add(m.targetName));
    return Array.from(names).sort();
  }, [flatModels]);

  const modelNames = useMemo(() => {
    const names = new Set<string>();
    flatModels.forEach((m) => names.add(m.modelId));
    return Array.from(names).sort();
  }, [flatModels]);

  const filtered = flatModels.filter((m) => {
    const matchesEndpoint = !endpointFilter || m.targetName === endpointFilter;
    const matchesModel = !modelFilter || m.modelId === modelFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'operational' && m.status === 'operational') ||
      (statusFilter === 'timeout' && m.status === 'timeout') ||
      // "Error" means genuinely failed — models still in flight and models that
      // merely ran out of budget each have their own place to live.
      (statusFilter === 'error' &&
        m.status !== 'operational' &&
        m.status !== 'timeout' &&
        isSettledStatus(m.status));
    return matchesEndpoint && matchesModel && matchesStatus;

  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: any, bVal: any;
    if (sortField === 'target') { aVal = a.targetName.toLowerCase(); bVal = b.targetName.toLowerCase(); }
    else if (sortField === 'model') { aVal = a.modelId.toLowerCase(); bVal = b.modelId.toLowerCase(); }
    else if (sortField === 'status') {
      // Still-running models sort to the top so the rows that are about to
      // change stay in view instead of jumping around as they settle.
      const order: Record<string, number> = {
        testing: 0, operational: 1, timeout: 2, error: 3, auth_failed: 4, unreachable: 5,
      };
      aVal = order[a.status] ?? 6; bVal = order[b.status] ?? 6;
    }

    else if (sortField === 'latency') { aVal = a.latencyMs; bVal = b.latencyMs; }
    else if (sortField === 'lastTest') { aVal = new Date(a.testedAt).getTime(); bVal = new Date(b.testedAt).getTime(); }
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('asc'); }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 theme-text-muted" />;
    return sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />;
  };

  const handleTestModel = async (targetId: string, modelId: string) => {
    const key = `${targetId}:${modelId}`;
    setTestingModels((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(`/api/targets/${targetId}/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      const result = await res.json();
      setLiveResults((prev) => ({ ...prev, [key]: result }));
    } catch {
      // ignore
    } finally {
      setTestingModels((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const opCount = flatModels.filter((m) => m.status === 'operational').length;
  const timeoutCount = flatModels.filter((m) => m.status === 'timeout').length;
  const errCount = flatModels.filter(
    (m) => m.status !== 'operational' && m.status !== 'timeout' && isSettledStatus(m.status)
  ).length;
  const runningCount = flatModels.filter((m) => !isSettledStatus(m.status)).length;

  const hasActiveFilters = Boolean(endpointFilter || modelFilter) || statusFilter !== 'all';


  const clearFilters = () => {
    setEndpointFilter('');
    setModelFilter('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* Single Header Row: Title + Stats + Filters */}
      <div className="theme-bg-card border theme-border rounded-2xl p-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-200 dark:border-indigo-900 rounded-xl">
              <Cpu className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold theme-text-main flex items-center gap-2">
                Model Health Matrix
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md theme-bg-subtle theme-text-muted border theme-border">
                  {flatModels.length} Models
                </span>
                {runningCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-800">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {runningCount} testing
                  </span>
                )}
              </h2>

              <p className="text-[11px] theme-text-muted font-medium">
                Per-model health status across all OpenAI-compatible endpoints
              </p>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="theme-bg-subtle p-1 border theme-border rounded-xl flex items-center text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                statusFilter === 'all'
                  ? 'theme-bg-card theme-text-main shadow-sm border theme-border'
                  : 'theme-text-muted hover:theme-text-main'
              }`}
            >
              All ({flatModels.length})
            </button>
            <button
              onClick={() => setStatusFilter('operational')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${
                statusFilter === 'operational'
                  ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : 'theme-text-muted hover:text-emerald-500'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Operational ({opCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('timeout')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${
                statusFilter === 'timeout'
                  ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                  : 'theme-text-muted hover:text-amber-500'
              }`}
              title="Models that ran out of their per-model time budget"
            >
              <TimerOff className="w-3.5 h-3.5 text-amber-500" />
              <span>Timeout ({timeoutCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${
                statusFilter === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                  : 'theme-text-muted hover:text-rose-500'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Error ({errCount})</span>
            </button>

          </div>
        </div>
      </div>

      {/* Table — header and its filters stay mounted even when nothing matches,
          otherwise an over-narrow filter would hide the controls needed to undo it. */}
      <div className="theme-bg-card border theme-border rounded-2xl shadow-sm transition-colors">
          {/* Column Headers — outside scroll, overflow visible for dropdowns */}
          <div className="relative z-20 overflow-visible">
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="theme-bg-subtle border-b theme-border theme-text-muted font-mono text-[11px] uppercase tracking-wider select-none rounded-t-2xl">
                  <th className="p-3 rounded-tl-2xl">
                    <div className="flex items-center space-x-1.5">
                      <span className="cursor-pointer hover:theme-text-main" onClick={() => handleSort('target')}>Endpoint</span>
                      {renderSortIcon('target')}
                      <ColumnFilter value={endpointFilter} onChange={setEndpointFilter} placeholder="Filter..." options={endpointNames} />
                    </div>
                  </th>
                  <th className="p-3">
                    <div className="flex items-center space-x-1.5">
                      <span className="cursor-pointer hover:theme-text-main" onClick={() => handleSort('model')}>Model</span>
                      {renderSortIcon('model')}
                      <ColumnFilter value={modelFilter} onChange={setModelFilter} placeholder="Search model..." options={modelNames} />
                    </div>
                  </th>
                  <th className="p-3 cursor-pointer hover:theme-text-main" onClick={() => handleSort('status')}>
                    <div className="flex items-center space-x-1.5"><span>Status</span>{renderSortIcon('status')}</div>
                  </th>
                  <th className="p-3 cursor-pointer hover:theme-text-main" onClick={() => handleSort('latency')}>
                    <div className="flex items-center space-x-1.5"><span>Latency</span>{renderSortIcon('latency')}</div>
                  </th>
                  <th className="p-3">Response</th>
                  <th className="p-3 cursor-pointer hover:theme-text-main" onClick={() => handleSort('lastTest')}>
                    <div className="flex items-center space-x-1.5"><span>Tested</span>{renderSortIcon('lastTest')}</div>
                  </th>
                  <th className="p-3 text-center rounded-tr-2xl">Actions</th>
                </tr>
              </thead>
            </table>
          </div>

          {/* Body — the page itself scrolls (fixed header + scrollable main),
              so no nested height cap: every model row stays reachable. */}
          <div>
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <tbody className="divide-y theme-border">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <Cpu className="w-10 h-10 theme-text-muted mx-auto mb-3" />
                      <h3 className="text-base font-bold theme-text-main">No Models Found</h3>
                      <p className="text-xs theme-text-muted mt-1 font-medium">
                        {flatModels.length === 0
                          ? 'Add an OpenAI-compatible endpoint and run a check to discover models.'
                          : 'No models match your current filter.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={clearFilters}
                          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold theme-bg-subtle theme-text-main border theme-border hover:opacity-80 transition"
                        >
                          <X className="w-3 h-3" />
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {sorted.map((m) => {
                  const key = `${m.targetId}:${m.modelId}`;
                  // A row is live either because this user clicked Ping on it,
                  // or because the endpoint-wide check has not reached it yet.
                  const isTesting = testingModels.has(key) || !isSettledStatus(m.status);
                  const meta = getModelStatusMeta(isTesting ? 'testing' : m.status);


                  return (
                    <tr key={key} className="hover:theme-bg-subtle transition">
                      <td className="p-3">
                        <span className="font-bold theme-text-main text-xs block truncate">{m.targetName}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <Cpu className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                          <span className="font-mono font-bold theme-text-main text-xs truncate block">{m.modelId}</span>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border uppercase ${meta.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${isTesting ? 'animate-ping' : ''}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono font-semibold theme-text-main text-xs">
                        {/* A model that hasn't answered yet has no latency to report,
                            and printing "0 ms" would read like an instant response. */}
                        {isTesting ? <span className="theme-text-muted">—</span> : `${m.latencyMs} ms`}
                      </td>

                      <td className="p-3 w-[20%]">
                        {m.responseSnippet ? (
                          <div className="overflow-x-auto max-w-full">
                            <span className="text-[11px] theme-text-sub font-mono whitespace-nowrap block">"{m.responseSnippet}"</span>
                          </div>
                        ) : m.errorMessage ? (
                          <div className="overflow-x-auto max-w-full">
                            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-mono whitespace-nowrap block" title={m.errorMessage}>
                              {m.errorMessage}
                            </span>
                          </div>
                        ) : (
                          <span className="theme-text-muted text-[11px]">—</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono theme-text-muted text-[11px]">
                        {new Date(m.testedAt).toLocaleTimeString()}
                      </td>
                      <td className="p-3 whitespace-nowrap text-center space-x-1">
                        <button
                          onClick={() => handleTestModel(m.targetId, m.modelId)}
                          disabled={isTesting}
                          title="Ping Test Model"
                          className="p-1.5 rounded-lg text-cyan-600 dark:text-cyan-400 hover:theme-bg-subtle transition disabled:opacity-50 inline-flex"
                        >
                          {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onOpenChat(m.targetId, m.targetName, m.modelId)}
                          title="Chat Reasoning Test"
                          className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:theme-bg-subtle transition inline-flex"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
};
